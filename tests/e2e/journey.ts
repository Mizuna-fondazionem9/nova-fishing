// Parcours complet dans un vrai Chrome, contre le serveur construit (dist/), stockage mémoire + fichier.
// Connexion → navigation → repérage → lancer → ferrage → combat → capture → port → vente → aquarium
// → amélioration → bestiaire → déconnexion / reconnexion → redémarrage du serveur → écran tactile.
//
// Usage : npm run test:e2e        (CHROME=/chemin/vers/chrome pour choisir le navigateur)
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';

const PORT = 4311;
const URL = `http://localhost:${PORT}`;
const SHOTS = 'tests/e2e/shots';
const store = join(mkdtempSync(join(tmpdir(), 'nf-e2e-')), 'store.json');
const chrome = process.env.CHROME ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const step = (m: string): void => console.log(`  ✓ ${m}`);

let server: ChildProcess | null = null;
async function startServer(): Promise<void> {
  server = spawn('node', ['dist/server/index.js'], { env: { ...process.env, PORT: String(PORT), DEV_AUTH: '1', MEMORY_STORE_FILE: store, NODE_ENV: 'development' }, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Le serveur ne démarre pas');
}
async function stopServer(): Promise<void> {
  const s = server;
  if (!s) return;
  server = null;
  await new Promise<void>((r) => {
    s.once('exit', () => r());
    s.kill('SIGTERM');
  });
}

interface Snap { coins: number; cargo: number; aquarium: number; species: number; upSum: number; caught: number; x: number; y: number }
const snap = (p: Page): Promise<Snap> =>
  p.evaluate(() => {
    const s = (window as any).__nf.getState().save;
    return { coins: s.coins, cargo: s.cargo.length, aquarium: s.aquarium.length, species: Object.keys(s.bestiary).length, upSum: Object.values(s.up as Record<string, number>).reduce((a, b) => a + b, 0), caught: s.stats.caught, x: s.x, y: s.y };
  });

async function login(p: Page, name: string): Promise<void> {
  await p.goto(URL);
  await p.waitForSelector('.login');
  await p.fill('.dev input', name);
  await p.click('.dev button');
  await p.waitForSelector('.hud', { timeout: 20_000 });
  await p.waitForFunction(() => !!(window as any).__nf?.getState().hud);
}

/** Clique dans le monde aux coordonnées (tuiles) données si elles sont à l'écran ; sinon fixe le cap par le moteur. */
async function sailTo(p: Page, x: number, y: number): Promise<void> {
  const pt = await p.evaluate(([wx, wy]) => {
    const g = (window as any).__nf.game;
    const z = g.zoom;
    const sx = (wx * 16 - Math.round(g.cam.x - g.vw / 2)) * z;
    const sy = (wy * 16 - Math.round(g.cam.y - g.vh / 2)) * z;
    const free = sx > 240 && sy > 170 && sx < innerWidth - 240 && sy < innerHeight - 170; // hors des panneaux du HUD
    if (!free) g.goTo(wx, wy);
    return free ? { sx, sy } : null;
  }, [x, y]);
  if (pt) await p.mouse.click(pt.sx, pt.sy);
}

/** Un point de mer libre à l'écran : ni terre, ni ombre (toucher une ombre lance la ligne), ni sous le HUD. */
async function freeSeaPoint(p: Page, tiles: number): Promise<{ sx: number; sy: number }> {
  const pt = await p.evaluate((dist) => {
    const g = (window as any).__nf.game;
    const z = g.zoom;
    const mx = Math.min(240, innerWidth * 0.2);
    for (let i = 0; i < 16; i++) {
      const a = Math.PI / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35;
      const wx = g.boat.x + Math.cos(a) * dist;
      const wy = g.boat.y + Math.sin(a) * dist;
      const sx = (wx * 16 - Math.round(g.cam.x - g.vw / 2)) * z;
      const sy = (wy * 16 - Math.round(g.cam.y - g.vh / 2)) * z;
      if (sx < mx || sx > innerWidth - mx || sy < 200 || sy > innerHeight - 180) continue;
      if (g.terrain.blocked(Math.floor(wx), Math.floor(wy))) continue;
      if (g.activeViews().some((v: any) => Math.hypot(v.x - wx, v.y - wy) < 3.5)) continue;
      return { sx, sy };
    }
    return null;
  }, tiles);
  assert.ok(pt, 'aucun point de mer libre à l’écran');
  return pt;
}

const waitStopped = (p: Page): Promise<unknown> =>
  p.waitForFunction(() => {
    const g = (window as any).__nf.game;
    return g.boat.path.length === 0 && g.boat.speed < 0.05;
  }, null, { timeout: 90_000 });

/** Va pêcher une ombre de petit poisson. Renvoie vrai si le poisson est capturé. */
async function fishOnce(p: Page, tried: Set<string>): Promise<string> {
  // Repérage : l'ombre « petit poisson » la plus proche pas encore tentée.
  const target = await p.evaluate((skip) => {
    const g = (window as any).__nf.game;
    const d = (v: any): number => Math.hypot(v.sh.x - g.boat.x, v.sh.y - g.boat.y) + (v.sh.sil === 'small' ? 0 : 1000);
    const ok = g.activeViews().filter((v: any) => !skip.includes(v.sh.key) && v.sh.sil !== 'shark' && v.sh.sil !== 'giant' && v.sh.sil !== 'massive');
    ok.sort((x: any, y: any) => d(x) - d(y));
    return ok.length ? { key: ok[0].sh.key, x: ok[0].sh.x, y: ok[0].sh.y } : null;
  }, [...tried]);
  assert.ok(target, 'aucune ombre à proximité');
  tried.add(target.key);
  // Approche : on s'arrête à ~4,5 tuiles de l'ombre.
  const a = await p.evaluate(([tx, ty]) => {
    const g = (window as any).__nf.game;
    const ang = Math.atan2(g.boat.y - ty, g.boat.x - tx);
    return { x: tx + Math.cos(ang) * 4.5, y: ty + Math.sin(ang) * 4.5 };
  }, [target.x, target.y]);
  await sailTo(p, a.x, a.y);
  await p.waitForTimeout(300);
  await waitStopped(p);
  // Lancer : un vrai clic sur l'ombre quand elle est dégagée du HUD, sinon le lancer du moteur sur cette ombre.
  const pos = await p.evaluate((key) => {
    const g = (window as any).__nf.game;
    const v = g.activeViews().find((w: any) => w.sh.key === key);
    if (!v || Math.hypot(v.sh.x - g.boat.x, v.sh.y - g.boat.y) > 8) return null;
    const z = g.zoom;
    const sx = (v.x * 16 - Math.round(g.cam.x - g.vw / 2)) * z;
    const sy = (v.y * 16 - Math.round(g.cam.y - g.vh / 2)) * z;
    return { sx, sy, free: sx > 240 && sy > 170 && sx < innerWidth - 240 && sy < innerHeight - 170 };
  }, target.key);
  if (!pos) return 'ombre hors de portée';
  if (pos.free) await p.mouse.click(pos.sx, pos.sy);
  await p.waitForTimeout(250);
  const started = await p.evaluate((key) => {
    const g = (window as any).__nf.game;
    if (g.fish) return g.fish.target.sh.key === key || true;
    const v = g.activeViews().find((w: any) => w.sh.key === key);
    if (!v) return false;
    void g.cast(v);
    return true;
  }, target.key);
  if (!started) return 'lancer impossible';
  // Attente : on ne ferre QUE sur la vraie morsure.
  const bitten = await p
    .waitForFunction(() => {
      const st = (window as any).__nf.getState().fishing;
      return st === 'bitten' || st === null;
    }, null, { timeout: 40_000, polling: 30 })
    .then(() => p.evaluate(() => (window as any).__nf.getState().fishing === 'bitten'));
  if (!bitten) return 'le poisson a ignoré l’appât';
  await p.waitForTimeout(140); // temps de réaction humain
  await p.keyboard.press('Space');
  const fighting = await p
    .waitForFunction(() => {
      const st = (window as any).__nf.getState().fishing;
      return st === 'fight' || st === 'countdown' || st === null;
    }, null, { timeout: 10_000, polling: 30 })
    .then(() => p.evaluate(() => (window as any).__nf.getState().fishing !== null));
  if (!fighting) return 'ferrage manqué';
  if (tried.size === 1) {
    await p.waitForTimeout(1700);
    await p.screenshot({ path: `${SHOTS}/combat.png` });
  }
  // Combat : un « joueur » dans la page appuie sur Espace quand le curseur est au centre de la zone.
  await p.evaluate(() => {
    const loop = (): void => {
      const nf = (window as any).__nf;
      const f = nf.game.fish;
      if (!f || nf.getState().result) return;
      const c = f.combat;
      if (nf.getState().fishing === 'fight' && c && c.lock === 0 && Math.abs(c.pos - c.zoneC) < c.p.zone * 0.2)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await p.waitForSelector('.modal.result', { timeout: 150_000 });
  const win = await p.evaluate(() => (window as any).__nf.getState().result?.outcome === 'win');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${SHOTS}/resultat-${tried.size}.png` });
  await p.click('.modal.result button.big');
  await p.waitForSelector('.modal.result', { state: 'detached' });
  return win ? 'capture' : 'échappé pendant le combat';
}

async function main(): Promise<void> {
  assert.ok(chrome, 'Chrome introuvable (définir CHROME=/chemin/vers/chrome)');
  mkdirSync(SHOTS, { recursive: true });
  execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
  await startServer();
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // tsx annote les fonctions nommées avec __name : on fournit ce petit utilitaire à la page.
    await ctx.addInitScript('window.__name = (f) => f');
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const name = `E2E${Date.now() % 100000}`;

    await login(p, name);
    const s0 = await snap(p);
    assert.equal(s0.coins, 40);
    assert.ok(await p.evaluate(() => (window as any).__nf.getState().hud.port?.name === 'Port-Nova'), 'le joueur doit arriver au port de départ');
    step('connexion et arrivée à Port-Nova');
    await p.screenshot({ path: `${SHOTS}/01-port.png` });

    // Navigation : un vrai clic dans la mer déplace le bateau.
    const sea = await freeSeaPoint(p, 8);
    await p.mouse.click(sea.sx, sea.sy);
    await p.waitForFunction(() => (window as any).__nf.game.boat.speed > 0.5, null, { timeout: 5000 });
    await waitStopped(p);
    const moved = await p.evaluate(() => (window as any).__nf.game.boat);
    assert.ok(Math.hypot(moved.x - s0.x, moved.y - s0.y) > 3, 'le bateau doit avoir navigué');
    step('navigation au clic (accélération, cap, arrêt)');

    // Pêche : jusqu'à 3 poissons en cale.
    const tried = new Set<string>();
    let attempts = 0;
    while ((await snap(p)).cargo < 3) {
      assert.ok(++attempts <= 14, 'trop de tentatives de pêche sans 3 captures');
      console.log(`    tentative ${attempts} : ${await fishOnce(p, tried)}`);
    }
    const s1 = await snap(p);
    assert.equal(s1.cargo, 3);
    assert.ok(s1.species >= 1 && s1.caught === 3);
    step(`repérage, lancer, feintes, ferrage, combat : 3 captures en ${attempts} tentatives`);

    // Retour au port.
    const port = await p.evaluate(() => {
      const g = (window as any).__nf.game;
      return g.portsNear(g.boat.x, g.boat.y).sort((a: any, b: any) => Math.hypot(a.x - g.boat.x, a.y - g.boat.y) - Math.hypot(b.x - g.boat.x, b.y - g.boat.y))[0];
    });
    await sailTo(p, port.x + 0.5, port.y + 0.5);
    await p.waitForSelector('[data-testid=port]', { timeout: 120_000 });
    await p.click('[data-testid=port]');
    await p.waitForSelector('.modal');
    step(`retour au port (${port.name})`);

    // Aquarium : garder un poisson. Vente : vendre le reste.
    await p.click('[data-testid=keep]');
    await p.waitForFunction(() => (window as any).__nf.getState().save.aquarium.length === 1);
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/02-criee.png` });
    await p.click('[data-testid=sell-all]');
    await p.waitForFunction(() => (window as any).__nf.getState().save.cargo.length === 0);
    const s2 = await snap(p);
    assert.ok(s2.coins > s1.coins, 'la vente doit rapporter des pièces');
    assert.equal(s2.aquarium, 1);
    step(`un poisson gardé en aquarium, deux vendus (+${s2.coins - s1.coins} pièces)`);

    // Amélioration : la première abordable de l'atelier de pêche.
    await p.click('.tabs button:nth-child(3)');
    const btn = p.locator('.uprow button:not([disabled])').first();
    await btn.waitFor({ timeout: 5000 });
    await btn.click();
    await p.waitForFunction((prev) => Object.values((window as any).__nf.getState().save.up as Record<string, number>).reduce((a, b) => a + b, 0) > prev, s2.upSum);
    const s3 = await snap(p);
    assert.ok(s3.coins < s2.coins && s3.upSum === s2.upSum + 1);
    step(`amélioration achetée (-${s2.coins - s3.coins} pièces)`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/03-atelier.png` });
    await p.click('.modal header button');

    // Bestiaire et aquarium.
    await p.click('.nav button:nth-child(2)');
    await p.waitForSelector('.spcard:not(.unknown)');
    assert.ok((await p.locator('.spcard.unknown').count()) > 50, 'les espèces inconnues restent masquées');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/04-bestiaire.png` });
    await p.click('.spcard:not(.unknown)');
    await p.waitForSelector('table.facts');
    await p.keyboard.press('Escape');
    await p.click('.nav button:nth-child(3)');
    await p.waitForSelector('.tank .swim canvas');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${SHOTS}/05-aquarium.png` });
    await p.keyboard.press('Escape');
    step('bestiaire (fiche découverte, inconnues masquées) et aquarium animé');

    // Déconnexion puis reconnexion.
    await p.click('.nav button:nth-child(6)');
    await p.click('[data-testid=logout]');
    await p.waitForSelector('.login');
    assert.equal((await ctx.request.get(`${URL}/api/me`)).status(), 401, 'la session doit être fermée');
    await login(p, name);
    assert.deepEqual({ ...(await snap(p)), x: 0, y: 0 }, { ...s3, x: 0, y: 0 });
    step('déconnexion puis reconnexion : progression retrouvée');

    // Redémarrage du serveur.
    await stopServer();
    await startServer();
    await p.goto(URL);
    await p.waitForSelector('.hud', { timeout: 20_000 }); // la session elle-même survit au redémarrage
    assert.deepEqual({ ...(await snap(p)), x: 0, y: 0 }, { ...s3, x: 0, y: 0 });
    step('redémarrage du serveur : session et progression retrouvées');
    assert.deepEqual(errors, [], 'aucune erreur JavaScript pendant le parcours');

    // Téléphone : écran tactile étroit.
    const mob = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await mob.addInitScript('window.__name = (f) => f');
    const m = await mob.newPage();
    await login(m, name + 'm');
    const seaM = await freeSeaPoint(m, 5);
    await m.touchscreen.tap(seaM.sx, seaM.sy);
    await m.waitForFunction(() => (window as any).__nf.game.boat.speed > 0.5, null, { timeout: 5000 });
    await m.waitForTimeout(1500);
    await m.screenshot({ path: `${SHOTS}/06-mobile.png` });
    await m.tap('.nav button:nth-child(4)');
    await m.waitForSelector('.trophies');
    await m.waitForTimeout(400);
    await m.screenshot({ path: `${SHOTS}/07-mobile-trophees.png` });
    step('téléphone : navigation au toucher et menus');
    console.log('\nParcours complet : OK');
  } finally {
    await browser.close();
    await stopServer();
  }
}

main().catch(async (e) => {
  console.error('\nÉCHEC du parcours :', e);
  await stopServer();
  process.exit(1);
});
