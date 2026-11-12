// Abstraction du stockage. Deux implémentations :
//  - MemoryStore : développement et tests (optionnellement persistée dans un fichier JSON) ;
//  - PgStore (pg-store.ts) : PostgreSQL, utilisée en production.
import { randomUUID } from 'node:crypto';
import { promises as fs, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Save } from '../../shared/src/index';

export interface PlayerRow {
  id: string;
  discordId: string;
  name: string;
  avatar: string | null;
  save: Save;
}

export interface PublicPlayerSummary {
  id: string;
  name: string;
  avatar: string | null;
  coins: number;
  caught: number;
  aquariumCount: number;
}

export function publicSummary(p: PlayerRow): PublicPlayerSummary {
  return { id:p.id, name:p.name, avatar:p.avatar, coins:p.save.coins,
    caught:p.save.stats.caught, aquariumCount:p.save.aquarium.length };
}

export type RewardStatus = 'pending' | 'synced' | 'failed';
export interface RewardEvent {
  id: string;
  discordId: string;
  key: string;
  type: string;
  payload: unknown;
  status: RewardStatus;
  createdAt: number;
  syncedAt: number | null;
}

/** Accès offert à une opération pendant qu'elle détient le verrou sur la sauvegarde. */
export interface Tx {
  /** Enregistre une récompense dans la même transaction. Un doublon (même joueur, même clé) est ignoré. */
  reward(key: string, type: string, payload: unknown): void;
}

export interface Store {
  init(): Promise<void>;
  close(): Promise<void>;
  health(): Promise<boolean>;
  upsertPlayer(discordId: string, name: string, avatar: string | null, makeSave: () => Save): Promise<PlayerRow>;
  getPlayer(id: string): Promise<PlayerRow | null>;
  listPublicPlayers(limit:number, offset:number, search:string): Promise<PublicPlayerSummary[]>;
  /**
   * Charge la sauvegarde sous verrou exclusif, applique `fn` (synchrone), puis écrit le résultat.
   * Si `fn` lève une exception, rien n'est écrit. Deux appels concurrents pour un même joueur s'exécutent l'un après l'autre.
   */
  withSave<T>(playerId: string, fn: (save: Save, tx: Tx) => T): Promise<T>;
  createSession(tokenHash: string, playerId: string, expiresAt: number): Promise<void>;
  getSession(tokenHash: string): Promise<{ playerId: string; expiresAt: number } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  listRewards(status: RewardStatus, limit: number): Promise<RewardEvent[]>;
  markRewards(ids: string[], status: RewardStatus): Promise<number>;
}

export type Hydrate = (raw: unknown) => Save;

interface Snapshot {
  players: PlayerRow[];
  sessions: [string, { playerId: string; expiresAt: number }][];
  rewards: RewardEvent[];
}

export class MemoryStore implements Store {
  private players = new Map<string, PlayerRow>();
  private byDiscord = new Map<string, string>();
  private sessions = new Map<string, { playerId: string; expiresAt: number }>();
  private rewards: RewardEvent[] = [];
  private locks = new Map<string, Promise<unknown>>();
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private hydrate: Hydrate, private file: string | null = null) {}

  async init(): Promise<void> {
    if (!this.file) return;
    try {
      const snap = JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot;
      for (const p of snap.players) {
        this.players.set(p.id, { ...p, save: this.hydrate(p.save) });
        this.byDiscord.set(p.discordId, p.id);
      }
      this.sessions = new Map(snap.sessions);
      this.rewards = snap.rewards;
    } catch {
      /* pas encore de fichier : on démarre à vide */
    }
  }

  private touch(): void {
    if (!this.file || this.timer) return;
    this.dirty = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 150);
  }

  private snapshot(): string {
    const snap: Snapshot = { players: [...this.players.values()], sessions: [...this.sessions], rewards: this.rewards };
    return JSON.stringify(snap);
  }

  private async flush(): Promise<void> {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, this.snapshot());
  }

  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, this.snapshot());
    }
  }

  async health(): Promise<boolean> {
    return true;
  }

  async upsertPlayer(discordId: string, name: string, avatar: string | null, makeSave: () => Save): Promise<PlayerRow> {
    const id = this.byDiscord.get(discordId);
    if (id) {
      const p = this.players.get(id)!;
      p.name = name;
      p.avatar = avatar;
      this.touch();
      return structuredClone(p);
    }
    const p: PlayerRow = { id: randomUUID(), discordId, name, avatar, save: makeSave() };
    this.players.set(p.id, p);
    this.byDiscord.set(discordId, p.id);
    this.touch();
    return structuredClone(p);
  }

  async listPublicPlayers(limit:number, offset:number, search:string): Promise<PublicPlayerSummary[]> {
    return [...this.players.values()].filter(p=>p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b)=>b.save.coins-a.save.coins || a.id.localeCompare(b.id))
      .slice(offset,offset+limit).map(publicSummary);
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const p = this.players.get(id);
    return p ? structuredClone(p) : null;
  }

  withSave<T>(playerId: string, fn: (save: Save, tx: Tx) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const p = this.players.get(playerId);
      if (!p) throw new Error('Joueur introuvable.');
      const work = structuredClone(p.save); // copie de travail : rien n'est validé si fn échoue
      const pending: RewardEvent[] = [];
      const out = fn(work, {
        reward: (key, type, payload) =>
          pending.push({ id: randomUUID(), discordId: p.discordId, key, type, payload, status: 'pending', createdAt: Date.now(), syncedAt: null }),
      });
      p.save = work;
      for (const r of pending) if (!this.rewards.some((x) => x.discordId === r.discordId && x.key === r.key)) this.rewards.push(r);
      this.touch();
      return out;
    };
    const prev = this.locks.get(playerId) ?? Promise.resolve();
    const next = prev.then(run, run);
    const tail = next.catch(() => undefined);
    this.locks.set(playerId, tail);
    void tail.then(() => {
      if (this.locks.get(playerId) === tail) this.locks.delete(playerId);
    });
    return next;
  }

  async createSession(tokenHash: string, playerId: string, expiresAt: number): Promise<void> {
    this.sessions.set(tokenHash, { playerId, expiresAt });
    this.touch();
  }
  async getSession(tokenHash: string): Promise<{ playerId: string; expiresAt: number } | null> {
    const s = this.sessions.get(tokenHash);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return s;
  }
  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    this.touch();
  }

  async listRewards(status: RewardStatus, limit: number): Promise<RewardEvent[]> {
    return this.rewards.filter((r) => r.status === status).slice(0, limit).map((r) => ({ ...r }));
  }
  async markRewards(ids: string[], status: RewardStatus): Promise<number> {
    let n = 0;
    for (const r of this.rewards)
      if (ids.includes(r.id)) {
        r.status = status;
        if (status === 'synced') r.syncedAt = Date.now();
        n++;
      }
    this.touch();
    return n;
  }
}
