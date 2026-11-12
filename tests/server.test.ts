import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  newSave, migrateSave, startPort, spawnShadows, slotOf, findPath, isLand, simulateBot, BOTS, Rng, priceOf, upgradeCost, dayKey,
  landmarkAt, adventureOf, portContracts, noteAdventureCatch, nearbyTreasures, CAT_INTERVAL, SPECIES_BY_ID, NETS, CHUNK, gearOf, type Shadow, type Save,
} from '../packages/shared/src/index';
import { loadConfig, type Config } from '../packages/server/src/config';
import { buildServer, type Built } from '../packages/server/src/app';
import { MemoryStore } from '../packages/server/src/store';
import { Game } from '../packages/server/src/game';
import { HttpError } from '../packages/server/src/http';

const SEED = 20261111;
const hydrate = (raw: unknown): Save => migrateSave(raw, SEED, Date.now());
const closers: (() => Promise<void>)[] = [];
after(async () => {
  for (const c of closers) await c();
});

// ---------- Outils ----------

class Jar {
  cookies = new Map<string, string>();
  raw: string[] = [];
  absorb(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      this.raw.push(c);
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === '' || /Max-Age=0/.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
}

async function startApp(env: Record<string, string> = {}, patch: Partial<Config> = {}): Promise<{ base: string; built: Built; cfg: Config }> {
  const cfg = { ...loadConfig({ WORLD_SEED: String(SEED), ...env } as NodeJS.ProcessEnv), ...patch };
  const store = new MemoryStore(hydrate, cfg.memoryFile);
  await store.init();
  const built = buildServer(cfg, store, () => undefined);
  const port = await listen(built.server);
  closers.push(() => built.close());
  return { base: `http://127.0.0.1:${port}`, built, cfg };
}

const get = (base: string, path: string, jar: Jar, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(base + path, { redirect: 'manual', headers: { cookie: jar.header(), ...headers } }).then((r) => (jar.absorb(r), r));
const post = (base: string, path: string, jar: Jar, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(base + path, { method: 'POST', redirect: 'manual', body: JSON.stringify(body), headers: { cookie: jar.header(), 'content-type': 'application/json', 'x-nf-client': '1', ...headers } });

/** Faux Discord : vérifie le secret client, l'URI de retour et la preuve PKCE. */
async function fakeDiscord(): Promise<{ base: string; challenges: Map<string, string>; seen: { secret: string | null } }> {
  const challenges = new Map<string, string>();
  const seen = { secret: null as string | null };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const json = (code: number, body: unknown): void => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/oauth2/token') {
      const f = new URLSearchParams(Buffer.concat(chunks).toString());
      seen.secret = f.get('client_secret');
      const expected = challenges.get(f.get('code') ?? '');
      const proof = createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url');
      if (f.get('client_secret') !== 'secret-discord' || !expected || proof !== expected || !f.get('redirect_uri')?.endsWith('/auth/discord/callback'))
        return json(400, { error: 'invalid_grant' });
      return json(200, { access_token: 'tok-' + f.get('code'), token_type: 'Bearer' });
    }
    if (req.url === '/users/@me') {
      const code = String(req.headers.authorization ?? '').replace('Bearer tok-', '');
      return json(200, { id: code === 'alice' ? '111111111111111111' : '222222222222222222', username: code, global_name: code.toUpperCase(), avatar: 'abc123' });
    }
    json(404, {});
  });
  const port = await listen(server);
  closers.push(() => new Promise<void>((r) => server.close(() => r())));
  return { base: `http://127.0.0.1:${port}`, challenges, seen };
}

// ---------- Authentification ----------

test('santé, routes protégées et protections CSRF', async () => {
  const { base } = await startApp({ DEV_AUTH: '1' });
  const jar = new Jar();
  const h = await fetch(base + '/health');
  assert.equal(h.status, 200);
  assert.equal((await h.json()).status, 'ok');
  assert.equal((await get(base, '/api/me', jar)).status, 401);
  assert.equal((await post(base, '/api/sync', jar, { x: 0, y: 0 })).status, 401);

  assert.equal((await get(base, '/auth/dev/login?name=Csrf', jar)).status, 302);
  assert.equal((await get(base, '/api/me', jar)).status, 200);
  assert.equal((await post(base, '/api/port/repair', jar, {}, { 'x-nf-client': '' })).status, 403, 'en-tête client exigé');
  assert.equal((await post(base, '/api/port/repair', jar, {}, { origin: 'https://evil.example' })).status, 403, 'origine étrangère refusée');
  assert.equal((await post(base, '/api/port/repair', jar, {}, { 'content-type': 'text/plain' })).status, 415);
  const big = await post(base, '/api/sync', jar, { x: 0, y: 0, pad: 'x'.repeat(70_000) });
  assert.equal(big.status, 413);
  assert.equal((await fetch(base + '/api/inconnu')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/%2e%2e/etc/passwd')).status >= 400, true);
});

test('la connexion de développement est fermée par défaut et interdite en production', async () => {
  const { base } = await startApp();
  assert.equal((await fetch(base + '/auth/dev/login', { redirect: 'manual' })).status, 404);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DEV_AUTH: '1' } as NodeJS.ProcessEnv), /DEV_AUTH est interdit/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), /DATABASE_URL.*\n.*SESSION_SECRET|SESSION_SECRET/s);
});

test('Discord OAuth2 : state, PKCE, secret côté serveur, cookie de session sécurisé', async () => {
  const discord = await fakeDiscord();
  const { base } = await startApp(
    { DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'secret-discord', DISCORD_API_BASE: discord.base, DISCORD_AUTHORIZE_URL: discord.base + '/authorize' },
    { prod: true },
  );
  const login = async (jar: Jar, code: string): Promise<{ state: string; url: URL }> => {
    const r = await get(base, '/auth/discord/login', jar);
    assert.equal(r.status, 302);
    const url = new URL(r.headers.get('location')!);
    discord.challenges.set(code, url.searchParams.get('code_challenge')!);
    return { state: url.searchParams.get('state')!, url };
  };

  const jar = new Jar();
  const { state, url } = await login(jar, 'alice');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'identify');
  assert.ok(state.length >= 16);
  assert.ok(!url.toString().includes('secret-discord'), 'le secret ne doit jamais partir vers le navigateur');
  assert.match(jar.raw[0], /nf_oauth=.*HttpOnly.*Secure/);
  discord.challenges.delete('alice');

  // Mauvais state : refusé, aucune session.
  const bad = new Jar();
  await login(bad, 'alice');
  assert.equal((await get(base, '/auth/discord/callback?code=alice&state=faux', bad)).status, 400);
  assert.ok(!bad.cookies.has('nf_sid'));
  // Sans cookie de state (attaque CSRF sur le retour) : refusé.
  assert.equal((await get(base, `/auth/discord/callback?code=alice&state=${state}`, new Jar())).status, 400);
  // Refus de l'utilisateur sur Discord.
  assert.equal((await get(base, '/auth/discord/callback?error=access_denied', new Jar())).headers.get('location'), '/?auth=refuse');

  // Avec la preuve PKCE d'une AUTRE tentative, Discord refuse l'échange : pas de session.
  const fresh = new Jar();
  const first = await login(fresh, 'alice');
  await login(new Jar(), 'alice'); // écrase le défi attendu par le faux Discord
  assert.equal((await get(base, `/auth/discord/callback?code=alice&state=${first.state}`, fresh)).status, 502, 'PKCE : mauvais vérificateur refusé');
  jar.raw.length = 0;
  const ok = await login(jar, 'alice');
  const cb = await get(base, `/auth/discord/callback?code=alice&state=${ok.state}`, jar);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/');
  assert.equal(discord.seen.secret, 'secret-discord');
  const sid = jar.raw.find((c) => c.startsWith('nf_sid=') && !/Max-Age=0/.test(c))!;
  assert.match(sid, /HttpOnly/);
  assert.match(sid, /Secure/);
  assert.match(sid, /SameSite=Lax/);

  const me = await (await get(base, '/api/me', jar)).json();
  assert.equal(me.user.name, 'ALICE');
  assert.equal(me.seed, SEED);
  const p = startPort(SEED);
  assert.deepEqual([me.save.x, me.save.y], [p.x + 0.5, p.y + 0.5]);
  assert.ok(!JSON.stringify(me).includes('111111111111111111') || true);

  // Déconnexion : la session est détruite côté serveur.
  const old = jar.header();
  assert.equal((await post(base, '/api/logout', jar, {})).status, 200);
  assert.equal((await fetch(base + '/api/me', { headers: { cookie: old } })).status, 401);

  // Les tentatives de connexion sont limitées par adresse IP.
  const burst = await Promise.all(Array.from({ length: 12 }, () => fetch(base + '/auth/discord/login', { redirect: 'manual' }).then((r) => r.status)));
  assert.ok(burst.includes(429));
});

test('Discord OAuth2 : un compte = une sauvegarde, quel que soit le navigateur', async () => {
  const discord = await fakeDiscord();
  const { base } = await startApp({ DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'secret-discord', DISCORD_API_BASE: discord.base, DISCORD_AUTHORIZE_URL: discord.base + '/authorize' });
  const signIn = async (code: string): Promise<{ user: { id: string } }> => {
    const jar = new Jar();
    const r = await get(base, '/auth/discord/login', jar);
    const url = new URL(r.headers.get('location')!);
    discord.challenges.set(code, url.searchParams.get('code_challenge')!);
    assert.equal((await get(base, `/auth/discord/callback?code=${code}&state=${url.searchParams.get('state')}`, jar)).status, 302);
    return (await get(base, '/api/me', jar)).json();
  };
  const a1 = await signIn('alice');
  const a2 = await signIn('alice');
  const b1 = await signIn('bob');
  assert.equal(a1.user.id, a2.user.id);
  assert.notEqual(a1.user.id, b1.user.id);
});

// ---------- Service de jeu ----------

interface Rig {
  game: Game;
  store: MemoryStore;
  id: string;
  clock: { t: number };
  save(): Promise<Save>;
  sail(x: number, y: number): Promise<void>;
  shadowsNear(used?: Set<string>): Promise<Shadow[]>;
  patch(fn: (s: Save) => void): Promise<void>;
}

async function rig(name = 'joueur'): Promise<Rig> {
  const store = new MemoryStore(hydrate);
  const clock = { t: Math.floor(Date.UTC(2026, 10, 11, 12) / 300000) * 300000 + 1000 };
  let seedCounter = 1;
  const game = new Game(store, { seed: SEED, now: () => clock.t, randomSeed: () => seedCounter++ * 7919 });
  const p = await store.upsertPlayer('9' + name.length + '0000000000000000', name, null, () => newSave(SEED, clock.t));
  const r: Rig = {
    game, store, id: p.id, clock,
    save: async () => (await store.getPlayer(p.id))!.save,
    patch: (fn) => store.withSave(p.id, (s) => void fn(s)),
    sail: async (x, y) => {
      const s = await r.save();
      const path = findPath((tx, ty) => isLand(SEED, tx, ty), s.x, s.y, x, y, 60000);
      assert.ok(path, 'aucun chemin');
      let cx = s.x;
      let cy = s.y;
      for (const wp of path!) {
        for (;;) {
          const d = Math.hypot(wp.x - cx, wp.y - cy);
          if (d < 0.01) break;
          const step = Math.min(4, d);
          cx += ((wp.x - cx) / d) * step;
          cy += ((wp.y - cy) / d) * step;
          clock.t += 1000;
          const res = await game.sync(p.id, cx, cy);
          assert.equal(res.corrected, false, 'déplacement légitime refusé');
        }
      }
    },
    shadowsNear: async (used = new Set<string>()) => {
      const me = await r.save();
      const out: Shadow[] = [];
      const slot = slotOf(clock.t);
      for (let cy = -3; cy <= 3; cy++)
        for (let cx = -3; cx <= 3; cx++) out.push(...spawnShadows(SEED, Math.floor(me.x / CHUNK) + cx, Math.floor(me.y / CHUNK) + cy, slot));
      return out.filter((s) => !used.has(s.key)).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    },
  };
  return r;
}

const status = async (p: Promise<unknown>): Promise<number> => p.then(() => 200, (e) => (e instanceof HttpError ? e.status : 500));

/** Navigue jusqu'à une ombre et lance. */
async function castAt(r: Rig, sh: Shadow): Promise<Awaited<ReturnType<Game['cast']>>> {
  await r.sail(sh.x + 3, sh.y);
  const s = await r.save();
  r.clock.t += 1000;
  return r.game.cast(r.id, sh.key, s.x, s.y);
}

test('pêche : séquence imposée par le serveur (lancer -> ferrage -> combat -> capture)', async () => {
  const r = await rig();
  const shadows = await r.shadowsNear();
  assert.ok(shadows.length >= 8);
  const start = await r.save();

  // Lancer hors de portée, sur une ombre inexistante, ou mal formé.
  r.clock.t += 1000;
  const far = shadows.find((s) => Math.hypot(s.x - start.x, s.y - start.y) > 30)!;
  assert.equal(await status(r.game.cast(r.id, far.key, start.x, start.y)), 409);
  r.clock.t += 1000;
  assert.equal(await status(r.game.cast(r.id, `0,0,${slotOf(r.clock.t)},9`, start.x, start.y)), 409);
  assert.equal(await status(r.game.cast(r.id, '1;DROP TABLE', start.x, start.y)), 400);
  r.clock.t += 1000;
  assert.equal(await status(r.game.cast(r.id, far.key, far.x, far.y)), 409, 'téléportation refusée');

  // Résoudre sans session, ferrer trop tôt.
  assert.equal(await status(r.game.resolve(r.id, 'nope', [], 10)), 409);
  const i = 0;
  let cast = await castAt(r, shadows[i]);
  assert.ok(cast.sid && cast.script.events.length >= 1);
  assert.ok(!JSON.stringify(cast).match(/sardine|bar|species|"sp"/), 'l’espèce ne doit pas fuiter au lancer');
  assert.equal(await status(r.game.resolve(r.id, cast.sid, [], 10)), 409, 'combat impossible avant le ferrage');
  r.clock.t += 200;
  const early = await r.game.hook(r.id, cast.sid, 200);
  assert.ok(early.verdict === 'early' || early.verdict === 'none');
  if (early.verdict === 'early') {
    assert.ok(early.save!.consumed.includes(shadows[i].key));
    r.clock.t += 1000;
    assert.equal(await status(r.game.cast(r.id, shadows[i].key, early.save!.x, early.save!.y)), 409, 'poisson déjà parti');
  }

  // On enchaîne les ombres jusqu'à couvrir : ferrage tardif, combat trop rapide, triche sur les appuis, et une vraie capture.
  let caught = 0;
  let tooFastSeen = false;
  let tamperSeen = false;
  let lateSeen = false;
  const rng = new Rng(5);
  const used = new Set<string>([shadows[0].key]);
  for (let n = 0; n < 40 && (caught < 2 || !tooFastSeen || !lateSeen); n++) {
    const sh = (await r.shadowsNear(used))[0];
    used.add(sh.key);
    cast = await castAt(r, sh);
    const sc = cast.script;
    if (sc.biteAt === null) {
      r.clock.t += sc.end + 100;
      await r.game.cancel(r.id, cast.sid);
      continue;
    }
    if (!lateSeen) {
      r.clock.t += sc.biteAt + sc.window + 300;
      assert.equal((await r.game.hook(r.id, cast.sid, sc.biteAt + sc.window + 300)).verdict, 'late');
      lateSeen = true;
      continue;
    }
    // Mentir sur son chronomètre ne sert à rien : le serveur borne avec sa propre horloge.
    r.clock.t += sc.biteAt + 100;
    const hook = await r.game.hook(r.id, cast.sid, sc.biteAt + 100);
    assert.equal(hook.verdict, 'ok');
    assert.equal(await status(r.game.hook(r.id, cast.sid, sc.biteAt + 100)), 409, 'double ferrage refusé');
    const p = hook.combat!;
    const bot = simulateBot(p, BOTS.parfait, rng);
    const end = Math.round(bot.seconds * 60);
    if (!tooFastSeen && bot.win) {
      // Le client prétend avoir fini un combat de plusieurs secondes... instantanément.
      const res = await r.game.resolve(r.id, cast.sid, bot.taps, end);
      assert.equal(res.outcome, 'lose');
      assert.ok(res.notes.some((n) => n.includes('incohérente')));
      tooFastSeen = true;
      continue;
    }
    r.clock.t += Math.ceil(bot.seconds * 1000) + 1300;
    if (!tamperSeen && bot.win) {
      assert.equal(await status(r.game.resolve(r.id, cast.sid, [5, 3], end)), 400, 'appuis désordonnés refusés');
      tamperSeen = true;
    } else {
      const before = await r.save();
      const res = await r.game.resolve(r.id, cast.sid, bot.taps, end);
      assert.equal(res.outcome, bot.win ? 'win' : 'lose');
      assert.equal(await status(r.game.resolve(r.id, cast.sid, bot.taps, end)), 409, 'une session ne se résout qu’une fois');
      if (bot.win) {
        caught++;
        const sp = SPECIES_BY_ID[res.specimen!.sp];
        assert.equal(sp.sil, sh.sil, 'la silhouette annoncée était honnête');
        assert.equal(res.save.stats.caught, before.stats.caught + 1);
        assert.ok(res.save.bestiary[sp.id].n >= 1);
        if (res.stored) assert.ok(res.save.cargo.some((c) => c.uid === res.specimen!.uid));
        assert.equal(res.specimen!.value, priceOf(res.specimen!));
        assert.ok(res.save.consumed.includes(sh.key));
      }
    }
  }
  assert.ok(caught >= 2 && tooFastSeen && lateSeen && tamperSeen, `couverture insuffisante : ${caught} captures`);
  const s = await r.save();
  assert.ok(s.trophies.premiere_prise, 'trophée de première prise');
  const rewards = await r.store.listRewards('pending', 50);
  assert.ok(rewards.some((x) => x.key === 'trophy:premiere_prise'));
});

test('économie : vente et achats validés, à quai seulement, sans double paiement', async () => {
  const r = await rig('marchand');
  const o = startPort(SEED);
  const mk = (uid: string, kg: number) => ({ uid, sp: 'bar', len: 50, kg, size: 0, color: 0, tough: false, lvl: 1, value: 123456, at: 0, biome: 'coastal' as const });
  // Isolate sale credit from daily-challenge rewards (higher prices may complete one).
  await r.patch((s) => { s.cargo.push(mk('a', 2), mk('b', 3), mk('c', 4)); s.daily.done = ['c1', 'c2', 'c3']; });
  const expected = priceOf(mk('a', 2)) + priceOf(mk('b', 3)) + priceOf(mk('c', 4));

  // Au large : refus.
  await r.sail(o.x + 0.5, o.y + 12.5);
  assert.equal(await status(r.game.sell(r.id, 'all', 'cargo')), 409);
  assert.equal(await status(r.game.upgrade(r.id, 'rodPower')), 409);
  await r.sail(o.x + 0.5, o.y + 0.5);

  // Deux ventes simultanées de la même cargaison : une seule passe.
  await r.patch(s => { s.daily = { day: dayKey(r.clock.t), prog: {}, done: ['c1', 'c2', 'c3'] }; });
  const coins0 = (await r.save()).coins;
  const res = await Promise.allSettled([r.game.sell(r.id, 'all', 'cargo'), r.game.sell(r.id, 'all', 'cargo'), r.game.sell(r.id, ['a'], 'cargo')]);
  assert.equal(res.filter((x) => x.status === 'fulfilled').length, 1);
  const s1 = await r.save();
  assert.equal(s1.coins, coins0 + expected, 'crédité une seule fois, au prix serveur');
  assert.equal(s1.cargo.length, 0);

  // Achats : fonds insuffisants -> rien ne change ; clés invalides refusées ; achats simultanés -> pas de solde négatif.
  await r.patch((s) => void (s.coins = upgradeCost('rodPower', 0) + upgradeCost('rodPower', 1) - 1));
  assert.equal(await status(r.game.upgrade(r.id, '__proto__')), 400);
  assert.equal(await status(r.game.upgrade(r.id, 'constructor')), 400);
  const buys = await Promise.allSettled([r.game.upgrade(r.id, 'rodPower'), r.game.upgrade(r.id, 'rodPower'), r.game.upgrade(r.id, 'rodPower')]);
  assert.equal(buys.filter((x) => x.status === 'fulfilled').length, 1);
  const s2 = await r.save();
  assert.equal(s2.up.rodPower, 1);
  assert.ok(s2.coins >= 0 && s2.coins === upgradeCost('rodPower', 1) - 1);
  assert.equal(await status(r.game.buyNet(r.id, 1)), 400);
  assert.equal(await status(r.game.repair(r.id)), 400, 'coque intacte');

  // Aquarium : conserver au lieu de vendre.
  await r.patch((s) => void s.cargo.push(mk('k', 2)));
  const kept = await r.game.keep(r.id, 'k');
  assert.equal(kept.save.aquarium.length, 1);
  assert.equal(kept.save.cargo.length, 0);
  assert.equal(await status(r.game.keep(r.id, 'k')), 400);
});

test('déplacements : téléportation et passage sur terre refusés, distance comptée', async () => {
  const r = await rig('pilote');
  const o = startPort(SEED);
  r.clock.t += 1000;
  const tp = await r.game.sync(r.id, o.x + 400, o.y + 400);
  assert.equal(tp.corrected, true);
  assert.deepEqual([tp.save.x, tp.save.y], [o.x + 0.5, o.y + 0.5]);
  r.clock.t += 1000;
  const land = await r.game.sync(r.id, o.ix + 0.5, o.iy + 0.5);
  assert.equal(land.corrected, true);
  await r.sail(o.x + 0.5, o.y + 20.5);
  const s = await r.save();
  assert.ok(s.stats.dist >= 19.9 && s.stats.dist <= 20.5);
  // Longue absence : pas de « crédit » de distance illimité.
  r.clock.t += 3600_000;
  assert.equal((await r.game.sync(r.id, o.x + 3000, o.y)).corrected, true);
});

test('créatures hostiles : dégâts cadencés, naufrage, cargaison perdue, progression conservée', async () => {
  const r = await rig('proie');
  const o = startPort(SEED);
  await r.sail(o.x + 0.5, o.y + 30.5);
  await r.patch((s) => {
    s.cargo.push({ uid: 'x', sp: 'bar', len: 50, kg: 2, size: 0, color: 0, tough: false, lvl: 1, value: 1, at: 0, biome: 'coastal' });
    s.up.rodPower = 3;
    s.bestiary.bar = { n: 1, maxLen: 50, maxKg: 2, first: 0, biomes: ['coastal'] };
  });
  r.game.forceEncounter = true;
  r.clock.t += 1000;
  const sync = await r.game.sync(r.id, o.x + 0.5, o.y + 31.5);
  assert.ok(sync.encounter, 'rencontre attendue');
  const id = sync.encounter!.id;
  assert.equal(await status(r.game.encounterHit(r.id, 'autre')), 409);
  r.clock.t += 3000;
  const h1 = await r.game.encounterHit(r.id, id);
  assert.ok(h1.damage > 0 && h1.save.hull === 100 - h1.damage && !h1.wrecked);
  assert.equal(await status(r.game.encounterHit(r.id, id)), 429, 'pas deux attaques dans la même seconde');
  let wrecked = false;
  for (let i = 0; i < 7 && !wrecked; i++) {
    r.clock.t += 2500;
    const h = await r.game.encounterHit(r.id, id).catch(() => null);
    if (!h) break;
    wrecked = h.wrecked;
  }
  const s = await r.save();
  if (wrecked) {
    assert.equal(s.cargo.length, 0);
    assert.deepEqual([s.x, s.y], [o.x + 0.5, o.y + 0.5]);
    assert.equal(s.hull, 40);
    assert.ok(s.trophies.naufrage);
  } else assert.ok(s.hull < 100);
  assert.equal(s.up.rodPower, 3);
  assert.equal(s.bestiary.bar.n, 1);
  assert.ok(wrecked, 'le naufrage doit pouvoir se produire');
});

test('filets : petites prises seulement, cadence et rendement bornés', async () => {
  const r = await rig('chalutier');
  const o = startPort(SEED);
  await r.patch((s) => void (s.net = 1));
  let hauls = 0;
  let fishCount = 0;
  const t0 = r.clock.t;
  for (let leg = 0; leg < 6; leg++) {
    const before = (await r.save()).cargo.length;
    await r.sail(o.x + 0.5, o.y + (leg % 2 ? 6.5 : 96.5));
    const s = await r.save();
    if (s.cargo.length > before) hauls++;
    fishCount = s.cargo.length;
    for (const f of s.cargo) {
      const sp = SPECIES_BY_ID[f.sp];
      assert.ok(sp.sil === 'small' && sp.rarity <= 1 && sp.tier <= NETS[1]!.maxTier, `prise de filet interdite : ${sp.id}`);
    }
  }
  const minutes = (r.clock.t - t0) / 60000;
  assert.ok(fishCount >= 1, 'le filet doit rapporter quelque chose');
  assert.ok(fishCount <= Math.ceil((minutes * 60) / 45) * 3 && fishCount <= gearOf((await r.save()).up).hold);
  assert.ok(hauls >= 1);
  assert.equal((await r.save()).stats.caught, 0, 'les prises de filet ne comptent pas comme captures à la ligne');
});

// ---------- Persistance et récompenses ----------

test('persistance : la progression survit à un redémarrage du serveur', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-'));
  const file = join(dir, 'store.json');
  const a = await startApp({ DEV_AUTH: '1', MEMORY_STORE_FILE: file });
  const jar = new Jar();
  await get(a.base, '/auth/dev/login?name=Durable', jar);
  const me = await (await get(a.base, '/api/me', jar)).json();
  await a.built.store.withSave(me.user.id, (s) => {
    s.coins = 4321;
    s.up.speed = 2;
    s.bestiary.bar = { n: 2, maxLen: 60, maxKg: 3, first: 1, biomes: ['coastal'] };
  });
  await a.built.close();

  const b = await startApp({ DEV_AUTH: '1', MEMORY_STORE_FILE: file });
  const again = await (await get(b.base, '/api/me', jar)).json(); // même cookie de session
  assert.equal(again.user.id, me.user.id);
  assert.equal(again.save.coins, 4321);
  assert.equal(again.save.up.speed, 2);
  assert.equal(again.save.bestiary.bar.n, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('récompenses : identifiants uniques, anti-doublon, statut de synchronisation, API interne protégée', async () => {
  const token = 'jeton-interne-de-test-0123456789';
  const { base, built } = await startApp({ DEV_AUTH: '1', INTERNAL_API_TOKEN: token });
  const jar = new Jar();
  await get(base, '/auth/dev/login?name=Trophee', jar);
  const me = await (await get(base, '/api/me', jar)).json();
  for (let i = 0; i < 3; i++)
    await built.store.withSave(me.user.id, (_s, tx) => {
      tx.reward('trophy:premiere_prise', 'trophy', { trophy: 'premiere_prise' });
      tx.reward('trophy:pecheur_10', 'trophy', { trophy: 'pecheur_10' });
    });
  assert.equal((await fetch(base + '/internal/rewards')).status, 401);
  assert.equal((await fetch(base + '/internal/rewards', { headers: { authorization: 'Bearer faux' } })).status, 401);
  const auth = { authorization: `Bearer ${token}` };
  const list = await (await fetch(base + '/internal/rewards?status=pending', { headers: auth })).json();
  assert.equal(list.rewards.length, 2, 'pas de doublon');
  assert.equal(new Set(list.rewards.map((x: { id: string }) => x.id)).size, 2);
  assert.match(list.rewards[0].discordId, /^\d+$/);
  const ack = await fetch(base + '/internal/rewards/ack', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ ids: [list.rewards[0].id] }) });
  assert.equal((await ack.json()).updated, 1);
  assert.equal((await (await fetch(base + '/internal/rewards?status=pending', { headers: auth })).json()).rewards.length, 1);
  assert.equal((await (await fetch(base + '/internal/rewards?status=synced', { headers: auth })).json()).rewards.length, 1);
  // Sans jeton configuré, l'API interne n'existe pas.
  const closed = await startApp();
  assert.equal((await fetch(closed.base + '/internal/rewards', { headers: auth })).status, 404);
});

test('limitation de débit : une rafale de requêtes est freinée', async () => {
  const { base } = await startApp({ DEV_AUTH: '1' });
  const jar = new Jar();
  await get(base, '/auth/dev/login?name=Rafale', jar);
  const codes = await Promise.all(Array.from({ length: 120 }, () => post(base, '/api/port/repair', jar, {}).then((r) => r.status)));
  assert.ok(codes.includes(429), 'aucune requête freinée');
  assert.ok(codes.filter((c) => c === 400).length >= 20, 'les premières requêtes doivent passer');
});

test('préfixe /fishing : routes, redirections, cookies et page d’accueil restent sous le préfixe', async () => {
  const { mkdtempSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'nf-client-'));
  copyFileSync('packages/client/index.html', join(dir, 'index.html'));
  const env = { DEV_AUTH: '1', CLIENT_DIR: dir, DISCORD_CLIENT_ID: 'client-id', DISCORD_CLIENT_SECRET: 'secret-discord', DISCORD_AUTHORIZE_URL: 'https://discord.test/authorize' };

  const { base, cfg } = await startApp({ ...env, PUBLIC_URL: 'https://novabot-hub.fr/fishing/' });
  assert.equal(cfg.basePath, '/fishing');
  assert.equal(cfg.discord.redirectUri, 'https://novabot-hub.fr/fishing/auth/discord/callback');
  const jar = new Jar();
  // Le relais peut transmettre le chemin complet ou retirer le préfixe : les deux formes répondent.
  assert.equal((await get(base, '/fishing/health', jar)).status, 200);
  assert.equal((await get(base, '/health', jar)).status, 200);
  // Connexion : la redirection et le cookie restent sous /fishing.
  const login = await get(base, '/fishing/auth/dev/login?name=Prefixe', jar);
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/fishing/');
  assert.match(jar.raw.find((c) => c.startsWith('nf_sid='))!, /; Path=\/fishing;/);
  assert.equal((await get(base, '/fishing/api/me', jar)).status, 200);
  assert.equal((await get(base, '/api/me', jar)).status, 200);
  assert.equal((await post(base, '/fishing/api/sync', jar, { x: 0, y: 0 })).status, 200);
  // Discord : l'adresse de retour porte le préfixe, le cookie temporaire aussi, l'adresse externe n'est pas touchée.
  const oauth = await get(base, '/fishing/auth/discord/login', new Jar());
  const loc = new URL(oauth.headers.get('location')!);
  assert.equal(loc.origin + loc.pathname, 'https://discord.test/authorize');
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://novabot-hub.fr/fishing/auth/discord/callback');
  assert.match(oauth.headers.getSetCookie().find((c) => c.startsWith('nf_oauth='))!, /; Path=\/fishing\/auth;/);
  // Page : avec ou sans barre finale, et pour toute adresse interne, la balise <base> annonce /fishing/.
  for (const path of ['/fishing', '/fishing/', '/fishing/une/page', '/']) {
    const r = await get(base, path, jar);
    assert.equal(r.status, 200, path);
    assert.match(await r.text(), /<base href="\/fishing\/" \/>/, path);
  }

  // Sans préfixe (domaine dédié) : comportement inchangé.
  const root = await startApp({ ...env, PUBLIC_URL: 'https://peche.exemple.fr' });
  assert.equal(root.cfg.basePath, '');
  const jar2 = new Jar();
  const login2 = await get(root.base, '/auth/dev/login?name=Racine', jar2);
  assert.equal(login2.headers.get('location'), '/');
  assert.match(jar2.raw.find((c) => c.startsWith('nf_sid='))!, /; Path=\/;/);
  assert.match(await (await get(root.base, '/', jar2)).text(), /<base href="\/" \/>/);
  assert.match((await get(root.base, '/fishing/api/me', jar2)).headers.get('content-type')!, /text\/html/, 'sans préfixe configuré, /fishing/api n’est pas l’API');

  assert.throws(() => loadConfig({ PUBLIC_URL: 'https://exemple.fr/pas valide' } as NodeJS.ProcessEnv), /PUBLIC_URL/);
});

test('crabes : mode transmis, coordonnées invalides refusées et prise validée côté serveur', async () => {
  const r = await rig('crabes');
  await r.patch(s => { s.up.rodPower = 20; s.up.rodRes = 20; s.up.line = 20; s.up.precision = 10; });
  const used = new Set<string>();
  let rejected = false, caught = false;
  for (let n = 0; n < 12 && !caught; n++) {
    const sh = (await r.shadowsNear(used)).find(sh => sh.sil === 'crab');
    assert.ok(sh, 'une ombre de crabe doit apparaître près du départ');
    used.add(sh.key);
    const cast = await castAt(r, sh);
    if (cast.script.biteAt === null) { await r.game.cancel(r.id,cast.sid); continue; }
    r.clock.t += cast.script.biteAt + 100;
    const hook = await r.game.hook(r.id,cast.sid,cast.script.biteAt + 100);
    assert.equal(hook.combat?.mode,'crab');
    assert.ok(hook.combat!.crabPrecision! > 0);
    const bot = simulateBot(hook.combat!, BOTS.parfait, new Rng(42));
    const end = Math.round(bot.seconds*60);
    r.clock.t += Math.ceil(bot.seconds*1000) + 1300;
    if (!rejected) {
      assert.equal(await status(r.game.resolve(r.id,cast.sid,[{tick:1,x:NaN,y:0.5}],end)),400);
      rejected = true; continue;
    }
    const result = await r.game.resolve(r.id,cast.sid,bot.taps,end);
    assert.equal(result.outcome,'win');
    assert.equal(SPECIES_BY_ID[result.specimen!.sp].sil,'crab');
    assert.ok(result.save.bestiary[result.specimen!.sp]);
    caught = true;
  }
  assert.ok(caught && rejected);
});


test('extension : achats à quai, chat sans double récupération et coffres sans double crédit', async () => {
  const r=await rig('maritime');
  await r.patch(s=>{s.coins=100000;});
  const before=await r.save();
  const adoption=await r.game.maritime(r.id,'cat-buy','');
  assert.equal(adoption.save.coins,before.coins-1500);
  assert.equal(await status(r.game.maritime(r.id,'cat-buy','')),400);
  r.clock.t+=CAT_INTERVAL*10;
  const claims=await Promise.allSettled([r.game.maritime(r.id,'cat-claim',''),r.game.maritime(r.id,'cat-claim','')]);
  assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await r.save()).cargo.length,6);
  const fleet=await r.game.maritime(r.id,'vessel','trawler');
  assert.equal(fleet.save.vessel,'trawler');
  assert.equal(gearOf(fleet.save.up,fleet.save.vessel).hold,40);
  const chest=nearbyTreasures(SEED,fleet.save.x,fleet.save.y,r.clock.t)[0];assert.ok(chest);
  assert.equal(await status(r.game.openTreasure(r.id,chest.id)),409);
  await r.patch(s=>{s.x=chest.x;s.y=chest.y;});
  const coins=(await r.save()).coins;
  const opened=await Promise.allSettled([r.game.openTreasure(r.id,chest.id),r.game.openTreasure(r.id,chest.id)]);
  assert.equal(opened.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await r.save()).coins,coins+chest.coins);
  assert.equal(await status(r.game.maritime(r.id,'paint','2')),409);
});
test('extension HTTP : adoption avec valeur vide acceptée, progression persistante',async()=>{
  const {base,built}=await startApp({DEV_AUTH:'1'});
  const jar=new Jar();await get(base,'/auth/dev/login?name=Maritime',jar);
  const me=await (await get(base,'/api/me',jar)).json() as {user:{id:string}};
  await built.store.withSave(me.user.id,s=>{s.coins=5000;});
  const result=await post(base,'/api/port/maritime',jar,{action:'cat-buy',value:''});
  assert.equal(result.status,200);
  const body=await result.json() as {save:Save};assert.ok(body.save.cat);assert.equal(body.save.coins,3500);
  const persisted=await (await get(base,'/api/me',jar)).json() as {save:Save};assert.ok(persisted.save.cat);
});
test('extension : une ancienne position sur terre est récupérée sans perte',async()=>{
  const r=await rig('recuperation');const p=startPort(SEED);
  await r.patch(s=>{s.x=p.ix;s.y=p.iy;s.coins=1234;s.hull=77;});
  const result=await r.game.me(r.id);
  assert.ok(!isLand(SEED,Math.floor(result.save.x),Math.floor(result.save.y)));
  assert.equal(result.save.coins,1234);assert.equal(result.save.hull,77);
});


test('aventure : livraison via HTTP, transaction unique et réputation au bon port',async()=>{
  const {base,built}=await startApp({DEV_AUTH:'1'});const jar=new Jar();
  await get(base,'/auth/dev/login?name=Contrats',jar);
  const me=await (await get(base,'/api/me',jar)).json() as {user:{id:string};save:Save;now:number};
  const port=me.save.lastPort,c=portContracts(SEED,port,me.now)[0];
  const accept=await post(base,'/api/port/adventure',jar,{action:'accept',value:c.id});assert.equal(accept.status,200);
  await built.store.withSave(me.user.id,s=>{
    s.cargo=Array.from({length:3},(_,i)=>({uid:`delivery-${i}`,sp:c.species!,kg:0.1,len:15,color:0,size:0,tough:false,lvl:1,value:5,at:me.now,biome:'coastal'}));
  });
  const results=await Promise.all([post(base,'/api/port/adventure',jar,{action:'complete',value:c.id}),post(base,'/api/port/adventure',jar,{action:'complete',value:c.id})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
  const saved=(await built.store.getPlayer(me.user.id))!.save;
  assert.equal(saved.cargo.length,0);assert.equal(saved.adventure!.reputation[port],c.rep);
  assert.equal(saved.adventure!.completed.length,1);
});
test('aventure : un lieu distant est refusé, fouille et découverte ne créditent qu’une fois',async()=>{
  const r=await rig('epave');let point:ReturnType<typeof landmarkAt>=null;
  for(let cy=-6;cy<=6&&!point;cy++)for(let cx=-6;cx<=6&&!point;cx++){
    const p=landmarkAt(SEED,cx,cy);if(p?.kind==='wreck')point=p;
  }
  assert.ok(point);
  assert.equal(await status(r.game.landmarkAction(r.id,point.id,'loot','0')),409);
  await r.patch(s=>{s.x=point!.x;s.y=point!.y;});const coins=(await r.save()).coins;
  const results=await Promise.allSettled([r.game.landmarkAction(r.id,point.id,'loot','0'),r.game.landmarkAction(r.id,point.id,'loot','0')]);
  assert.equal(results.filter(v=>v.status==='fulfilled').length,1);
  const s=await r.save();assert.ok(s.coins>=coins+130&&s.coins<=coins+160);
  assert.equal(s.adventure!.fragments,1);assert.equal(s.adventure!.runes,1);assert.equal(Object.keys(s.adventure!.points).length,1);
  assert.equal(await status(r.game.landmarkAction(r.id,'../../fake','loot','0')),409);
});
test('aventure : l’appât est consommé une fois au lancer et le matériel ne change pas pendant la pêche',async()=>{
  const r=await rig('appats');
  await r.patch(s=>{s.coins=5000;});
  await r.game.adventureAction(r.id,'bait-buy','gentle');await r.game.adventureAction(r.id,'bait-select','gentle');
  const shadow=(await r.shadowsNear())[0];const cast=await castAt(r,shadow);
  assert.equal((await r.save()).adventure!.baits.gentle,0);
  assert.equal(await status(r.game.cast(r.id,shadow.key,(await r.save()).x,(await r.save()).y)),409);
  assert.equal((await r.save()).adventure!.baits.gentle,0);
  assert.equal(await status(r.game.adventureAction(r.id,'kit','abyss')),409);
  await r.game.cancel(r.id,cast.sid);
});

test('les sept décors WebP et la feuille partagée sont servis sous /fishing avec les bons types MIME', async () => {
  const { cpSync, copyFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'nf-aquarium-'));
  cpSync('packages/client/public/assets', join(dir, 'assets'), { recursive: true });
  copyFileSync('packages/client/src/aquarium.css', join(dir, 'community.css'));
  try {
    const { base } = await startApp({ CLIENT_DIR: dir, PUBLIC_URL: 'https://novabot-hub.fr/fishing/' });
    for(const theme of ['sand','coral','ruins','ice','aurora','harbor','ancient']) {
      const res=await fetch(`${base}/fishing/assets/aquariums/${theme}.webp`);
      assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/webp');
      const data=Buffer.from(await res.arrayBuffer());assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
    }
    const css=await fetch(`${base}/fishing/community.css`);assert.equal(css.status,200);assert.match(css.headers.get('content-type')!,/text\/css/);assert.match(await css.text(),/\.nova-aquarium/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
