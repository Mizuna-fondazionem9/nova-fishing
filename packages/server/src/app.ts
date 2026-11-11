// Assemblage : routes HTTP -> authentification -> service de jeu.
import { createServer as createHttpServer, type Server } from 'node:http';
import { newSave, migrateSave } from '../../shared/src/index';
import type { Config } from './config';
import { App, HttpError, HANDLED, RateLimiter, num, str, type Ctx } from './http';
import { Auth, safeEqual } from './auth';
import { Game } from './game';
import { MemoryStore, type Store, type RewardStatus } from './store';
import { PgStore } from './pg-store';

export function makeStore(cfg: Config, log: (m: string) => void = console.log): Store {
  const hydrate = (raw: unknown) => migrateSave(raw, cfg.worldSeed, Date.now());
  if (cfg.databaseUrl) return new PgStore(cfg.databaseUrl, cfg.dbSchema, cfg.databaseSsl, hydrate, log);
  log('ATTENTION : DATABASE_URL absent, stockage en mémoire' + (cfg.memoryFile ? ` (fichier ${cfg.memoryFile})` : ' (perdu au redémarrage)'));
  return new MemoryStore(hydrate, cfg.memoryFile);
}

export interface Built {
  server: Server;
  game: Game;
  store: Store;
  close(): Promise<void>;
}

export function buildServer(cfg: Config, store: Store, log: (m: string) => void = console.log): Built {
  const app = new App({ prod: cfg.prod, staticDir: cfg.clientDir || null, frameAncestors: cfg.frameAncestors, origin: new URL(cfg.publicUrl).origin, basePath: cfg.basePath, log });
  const game = new Game(store, { seed: cfg.worldSeed });
  const auth = new Auth(cfg, store, () => newSave(cfg.worldSeed, Date.now()));
  const authLimiter = new RateLimiter(10, 0.2); // connexions : 10 d'affilée puis 1 toutes les 5 s par IP
  const playerLimiter = new RateLimiter(30, 8); // actions de jeu, par joueur

  /** Route protégée : session obligatoire + limitation par joueur. */
  const api = (path: string, fn: (id: string, ctx: Ctx) => unknown): void =>
    app.post(path, async (ctx) => {
      const id = await auth.require(ctx);
      if (!playerLimiter.take(id)) throw new HttpError(429, 'Trop de requêtes, ralentissez.');
      return fn(id, ctx);
    });

  app.get('/health', async (ctx) => {
    const ok = await store.health();
    ctx.res.statusCode = ok ? 200 : 503;
    return { status: ok ? 'ok' : 'db_down', uptime: Math.round(process.uptime()) };
  });

  // --- Authentification ---
  const limited = (ctx: Ctx): void => {
    if (!authLimiter.take(ctx.ip)) throw new HttpError(429, 'Trop de tentatives de connexion.');
  };
  app.get('/auth/discord/login', (ctx) => {
    limited(ctx);
    auth.login(ctx);
    return HANDLED;
  });
  app.get('/auth/discord/callback', async (ctx) => {
    limited(ctx);
    await auth.callback(ctx);
    return HANDLED;
  });
  app.get('/auth/dev/login', async (ctx) => {
    await auth.devLogin(ctx);
    return HANDLED;
  });
  app.get('/api/config', () => ({ devAuth: cfg.devAuth && !cfg.prod, discord: !!cfg.discord.clientId }));
  app.get('/api/me', async (ctx) => game.me(await auth.require(ctx)));
  app.post('/api/logout', async (ctx) => {
    await auth.logout(ctx);
    return { ok: true };
  });

  // --- Jeu ---
  api('/api/sync', (id, { body }) => game.sync(id, num(body.x, 'x'), num(body.y, 'y')));
  api('/api/fishing/cast', (id, { body }) => game.cast(id, str(body.shadow, 'shadow', 40), num(body.x, 'x'), num(body.y, 'y')));
  api('/api/fishing/hook', (id, { body }) => game.hook(id, str(body.sid, 'sid', 40), num(body.elapsed, 'elapsed', 0, 120_000)));
  api('/api/fishing/cancel', (id, { body }) => game.cancel(id, str(body.sid, 'sid', 40)));
  api('/api/fishing/resolve', (id, { body }) => game.resolve(id, str(body.sid, 'sid', 40), body.taps, body.end));
  api('/api/encounter/hit', (id, { body }) => game.encounterHit(id, str(body.id, 'id', 40)));
  api('/api/encounter/end', (id, { body }) => game.encounterEnd(id, str(body.id, 'id', 40)));

  const from = (v: unknown): 'cargo' | 'aquarium' => (v === 'aquarium' ? 'aquarium' : 'cargo');
  api('/api/port/sell', (id, { body }) => {
    if (body.uids === 'all') return game.sell(id, 'all', from(body.from));
    if (!Array.isArray(body.uids) || !body.uids.length || body.uids.length > 500 || body.uids.some((u) => typeof u !== 'string' || u.length > 40))
      throw new HttpError(400, 'Sélection invalide.');
    return game.sell(id, body.uids as string[], from(body.from));
  });
  api('/api/port/upgrade', (id, { body }) => game.upgrade(id, str(body.key, 'key', 20)));
  api('/api/port/buy-net', (id, { body }) => game.buyNet(id, num(body.tier, 'tier', 1, 10)));
  api('/api/port/repair', (id) => game.repair(id));
  api('/api/port/keep', (id, { body }) => game.keep(id, str(body.uid, 'uid', 40)));
  api('/api/release', (id, { body }) => game.release(id, str(body.uid, 'uid', 40), from(body.from)));

  // --- Module de récompenses : API interne pour NovaBot (désactivée tant que INTERNAL_API_TOKEN n'est pas défini) ---
  const internal = (ctx: Ctx): void => {
    const h = String(ctx.req.headers.authorization ?? '');
    if (!cfg.internalToken) throw new HttpError(404, 'Route inconnue.');
    if (!h.startsWith('Bearer ') || !safeEqual(h.slice(7), cfg.internalToken)) throw new HttpError(401, 'Jeton interne invalide.');
  };
  const STATUSES: RewardStatus[] = ['pending', 'synced', 'failed'];
  app.get('/internal/rewards', async (ctx) => {
    internal(ctx);
    const status = (ctx.url.searchParams.get('status') ?? 'pending') as RewardStatus;
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Statut invalide.');
    const limit = Math.min(200, Math.max(1, Number(ctx.url.searchParams.get('limit') ?? 50) || 50));
    return { rewards: await store.listRewards(status, limit) };
  });
  app.post('/internal/rewards/ack', async (ctx) => {
    internal(ctx);
    const { ids, status } = ctx.body;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((i) => typeof i !== 'string' || !/^[0-9a-f-]{36}$/.test(i)))
      throw new HttpError(400, 'Liste d’identifiants invalide.');
    const st = (status ?? 'synced') as RewardStatus;
    if (!STATUSES.includes(st)) throw new HttpError(400, 'Statut invalide.');
    return { updated: await store.markRewards(ids as string[], st) };
  });

  const server = createHttpServer((req, res) => void app.handle(req, res));
  server.requestTimeout = 30_000;
  const sweeper = setInterval(() => game.sweep(), 60_000);
  sweeper.unref();
  return {
    server, game, store,
    close: async () => {
      clearInterval(sweeper);
      await new Promise<void>((r) => server.close(() => r()));
      await store.close();
    },
  };
}
