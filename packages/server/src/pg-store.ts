// Stockage PostgreSQL. Tout vit dans un schéma dédié ; les migrations .sql numérotées sont appliquées au démarrage.
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Save } from '../../shared/src/index';
import type { Hydrate, PlayerRow, RewardEvent, RewardStatus, Store, Tx, PublicPlayerSummary } from './store';

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  release(): void;
}
interface PgPool {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  on(event: 'error', cb: (e: Error) => void): void;
}

/** Requêtes SQL, regroupées ici pour pouvoir être vérifiées telles quelles (scripts/check-sql.sh). `%S` = schéma. */
export const SQL = {
  upsertPlayer:
    'INSERT INTO %S.players (id, discord_id, name, avatar, save) VALUES ($1, $2, $3, $4, $5::jsonb) ' +
    'ON CONFLICT (discord_id) DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar, updated_at = now() ' +
    'RETURNING id, discord_id, name, avatar, save',
  getPlayer: 'SELECT id, discord_id, name, avatar, save FROM %S.players WHERE id = $1',
  lockSave: 'SELECT discord_id, save FROM %S.players WHERE id = $1 FOR UPDATE',
  writeSave: 'UPDATE %S.players SET save = $2::jsonb, updated_at = now() WHERE id = $1',
  addReward:
    'INSERT INTO %S.reward_events (id, discord_id, reward_key, type, payload) VALUES ($1, $2, $3, $4, $5::jsonb) ' +
    'ON CONFLICT (discord_id, reward_key) DO NOTHING',
  createSession: 'INSERT INTO %S.sessions (token_hash, player_id, expires_at) VALUES ($1, $2, to_timestamp($3::double precision / 1000))',
  listPublicPlayers: `SELECT id, name, avatar, COALESCE((save->>'coins')::numeric,0) AS coins,
    COALESCE((save->'stats'->>'caught')::numeric,0) AS caught,
    jsonb_array_length(COALESCE(save->'aquarium','[]'::jsonb)) AS aquarium_count
    FROM %S.players WHERE position(lower($3::text) in lower(name)) > 0
    ORDER BY coins DESC, id ASC LIMIT $1 OFFSET $2`,
  getSession: 'SELECT player_id, (extract(epoch FROM expires_at) * 1000)::bigint AS expires_at FROM %S.sessions WHERE token_hash = $1 AND expires_at > now()',
  deleteSession: 'DELETE FROM %S.sessions WHERE token_hash = $1',
  purgeSessions: 'DELETE FROM %S.sessions WHERE expires_at <= now()',
  listRewards:
    'SELECT id, discord_id, reward_key, type, payload, sync_status, (extract(epoch FROM created_at) * 1000)::bigint AS created_at, ' +
    '(extract(epoch FROM synced_at) * 1000)::bigint AS synced_at FROM %S.reward_events WHERE sync_status = $1 ORDER BY created_at, id LIMIT $2',
  markRewards:
    "UPDATE %S.reward_events SET sync_status = $2::text, synced_at = CASE WHEN $2::text = 'synced' THEN now() ELSE synced_at END WHERE id = ANY($1::uuid[])",
};

export function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const c of [join(here, 'migrations'), join(here, '..', 'migrations')]) if (existsSync(c)) return c;
  throw new Error('Dossier des migrations introuvable.');
}

export class PgStore implements Store {
  private pool!: PgPool;
  private q: Record<keyof typeof SQL, string>;
  private purge: NodeJS.Timeout | null = null;

  constructor(private url: string, private schema: string, private ssl: boolean, private hydrate: Hydrate, private log: (m: string) => void = console.log) {
    this.q = Object.fromEntries(Object.entries(SQL).map(([k, v]) => [k, v.replaceAll('%S', `"${schema}"`)])) as Record<keyof typeof SQL, string>;
  }

  async init(): Promise<void> {
    const pg = (await import('pg')).default;
    this.pool = new pg.Pool({
      connectionString: this.url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: this.ssl ? { rejectUnauthorized: false } : undefined,
    }) as unknown as PgPool;
    this.pool.on('error', (e) => this.log(`PostgreSQL (connexion inactive) : ${e.message}`));
    await this.migrate();
    await this.pool.query(this.q.purgeSessions);
    this.purge = setInterval(() => void this.pool.query(this.q.purgeSessions).catch(() => undefined), 3600_000);
    this.purge.unref();
  }

  /** Applique les migrations manquantes, chacune dans sa transaction, sous verrou consultatif (plusieurs instances possibles). */
  private async migrate(): Promise<void> {
    const s = `"${this.schema}"`;
    const c = await this.pool.connect();
    try {
      await c.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
      await c.query(`CREATE TABLE IF NOT EXISTS ${s}.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      const dir = migrationsDir();
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
        await c.query('BEGIN');
        try {
          await c.query('SELECT pg_advisory_xact_lock(778899001)');
          const done = await c.query(`SELECT 1 FROM ${s}.schema_migrations WHERE name = $1`, [file]);
          if (!done.rows.length) {
            await c.query(`SET LOCAL search_path TO ${s}`);
            await c.query(readFileSync(join(dir, file), 'utf8'));
            await c.query(`INSERT INTO ${s}.schema_migrations (name) VALUES ($1)`, [file]);
            this.log(`Migration appliquée : ${file}`);
          }
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK');
          throw new Error(`Migration ${file} en échec : ${(e as Error).message}`);
        }
      }
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    if (this.purge) clearInterval(this.purge);
    await this.pool?.end();
  }

  async health(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private row(r: any): PlayerRow {
    return { id: r.id, discordId: r.discord_id, name: r.name, avatar: r.avatar, save: this.hydrate(r.save) };
  }

  async upsertPlayer(discordId: string, name: string, avatar: string | null, makeSave: () => Save): Promise<PlayerRow> {
    const r = await this.pool.query(this.q.upsertPlayer, [randomUUID(), discordId, name, avatar, JSON.stringify(makeSave())]);
    return this.row(r.rows[0]);
  }

  async listPublicPlayers(limit:number, offset:number, search:string): Promise<PublicPlayerSummary[]> {
    const r = await this.pool.query(this.q.listPublicPlayers,[limit,offset,search]);
    return r.rows.map(p=>({id:p.id,name:p.name,avatar:p.avatar,coins:Number(p.coins),caught:Number(p.caught),aquariumCount:Number(p.aquarium_count)}));
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const r = await this.pool.query(this.q.getPlayer, [id]);
    return r.rows.length ? this.row(r.rows[0]) : null;
  }

  async withSave<T>(playerId: string, fn: (save: Save, tx: Tx) => T): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query(this.q.lockSave, [playerId]); // FOR UPDATE : sérialise les opérations d'un même joueur
      if (!r.rows.length) throw new Error('Joueur introuvable.');
      const save = this.hydrate(r.rows[0].save);
      const rewards: [string, string, unknown][] = [];
      const out = fn(save, { reward: (key, type, payload) => rewards.push([key, type, payload]) });
      await c.query(this.q.writeSave, [playerId, JSON.stringify(save)]);
      for (const [key, type, payload] of rewards)
        await c.query(this.q.addReward, [randomUUID(), r.rows[0].discord_id, key, type, JSON.stringify(payload ?? {})]);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async createSession(tokenHash: string, playerId: string, expiresAt: number): Promise<void> {
    await this.pool.query(this.q.createSession, [tokenHash, playerId, expiresAt]);
  }
  async getSession(tokenHash: string): Promise<{ playerId: string; expiresAt: number } | null> {
    const r = await this.pool.query(this.q.getSession, [tokenHash]);
    return r.rows.length ? { playerId: r.rows[0].player_id, expiresAt: Number(r.rows[0].expires_at) } : null;
  }
  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query(this.q.deleteSession, [tokenHash]);
  }

  async listRewards(status: RewardStatus, limit: number): Promise<RewardEvent[]> {
    const r = await this.pool.query(this.q.listRewards, [status, limit]);
    return r.rows.map((x) => ({
      id: x.id, discordId: x.discord_id, key: x.reward_key, type: x.type, payload: x.payload, status: x.sync_status,
      createdAt: Number(x.created_at), syncedAt: x.synced_at === null ? null : Number(x.synced_at),
    }));
  }
  async markRewards(ids: string[], status: RewardStatus): Promise<number> {
    const r = await this.pool.query(this.q.markRewards, [ids, status]);
    return r.rowCount ?? 0;
  }
}
