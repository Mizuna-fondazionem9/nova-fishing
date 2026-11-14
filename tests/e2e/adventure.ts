// Parcours visuel des nouveautés, exclusivement sur un serveur local et un joueur factice.
// npm run build && npm run test:e2e:adventure
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  newSave,
  migrateSave,
  newAdventure,
  landmarkAt,
  rollSpecimen,
  Rng,
  SPECIES_BY_ID,
  startPort,
} from '../../packages/shared/src/index';
import { buildServer } from '../../packages/server/src/app';
import { MemoryStore } from '../../packages/server/src/store';
import { loadConfig } from '../../packages/server/src/config';
import { hashToken } from '../../packages/server/src/auth';

const seed = 20261111,
  base = 'http://127.0.0.1:4321',
  shots = 'tests/e2e/shots';
const store = new MemoryStore((raw) => migrateSave(raw, seed, Date.now()));
await store.init();
const name = 'Explorateur',
  discordId = String(
    BigInt('0x' + hashToken('dev:' + name).slice(0, 14)) + 10n ** 17n,
  );
const player = await store.upsertPlayer(discordId, name, null, () =>
  newSave(seed, Date.now()),
);
let wreck: ReturnType<typeof landmarkAt> = null;
for (let cy = -6; cy <= 6 && !wreck; cy++)
  for (let cx = -6; cx <= 6 && !wreck; cx++) {
    const p = landmarkAt(seed, cx, cy);
    if (p?.kind === 'wreck') wreck = p;
  }
assert.ok(wreck);
await store.withSave(player.id, (s) => {
  s.coins = 50000;
  s.adventure = newAdventure();
  s.adventure.reputation['0:0'] = 80;
  s.adventure.rewards = ['shells'];
  s.aquarium = [
    rollSpecimen(
      new Rng(2),
      SPECIES_BY_ID.sardine,
      1,
      'coastal',
      Date.now(),
      'showcase-fish',
    ),
  ];
});
const cfg = loadConfig({
  NODE_ENV: 'development',
  DEV_AUTH: '1',
  PUBLIC_URL: base,
  WORLD_SEED: String(seed),
  CLIENT_DIR: resolve('dist/client'),
} as NodeJS.ProcessEnv);
const built = buildServer(cfg, store, () => {});
await new Promise<void>((r) => built.server.listen(4321, '127.0.0.1', r));
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const chrome =
    process.env.CHROME ??
    [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ].find(existsSync);
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  mkdirSync(shots, { recursive: true });
  await page.goto(base + '/auth/dev/login?name=' + name);
  await page.getByTestId('port').waitFor();
  // Le mode discret masque le HUD et reste réversible sur ordinateur et mobile.
  for (const viewport of [{width:1280,height:850},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', {name:'Masquer l’interface',exact:true}).click();
    assert.equal(await page.getByRole('navigation', {name:'Carnet de bord'}).isVisible(), false);
    assert.equal(await page.locator('.hud .card.tl').isVisible(), false);
    assert.equal(await page.locator('canvas.world').isVisible(), true);
    await page.getByRole('button', {name:'Afficher l’interface',exact:true}).click();
    await page.getByTestId('port').waitFor();
  }
  await page.setViewportSize({width:1280,height:850});
  await page.getByTestId('port').click();
  await page.getByRole('tab', { name: 'Préparation', exact: true }).click();
  await page.getByRole('button',{name:'Contrats et réputation → Journal de bord'}).click();
  await page
    .getByRole('button', { name: 'Accepter', exact: true })
    .first()
    .click();
  await page.getByText('1 / 3 en cours',{exact:true}).waitFor();
  await page.screenshot({ path: shots + '/captaincy-desktop.png' });
  await page.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.getByTestId('port').click();
  await page.getByRole('tab',{name:'Préparation',exact:true}).click();
  await page
    .locator('.uprow')
    .filter({ hasText: 'Montage de précision' })
    .getByRole('button')
    .click();
  await page
    .locator('.uprow')
    .filter({ hasText: 'Montage de précision' })
    .getByRole('button', { name: 'Équipé' })
    .waitFor();
  assert.equal((await store.getPlayer(player.id))!.save.kit, 'river');
  const bait = page
    .locator('.contract-card')
    .filter({ hasText: 'Appât scintillant' });
  await bait.getByRole('button', { name: /Acheter/ }).click();
  await bait.getByRole('button', { name: 'Utiliser', exact: true }).click();
  await bait
    .getByRole('button', { name: 'Sélectionné', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Aquarium', exact: true })
    .click();
  await page.locator('summary').filter({hasText:'Décors et collections'}).click();
  await page
    .getByRole('textbox', { name: 'Nom de l’aquarium' })
    .fill('Les Jardins de Nova');
  await page.getByRole('button', { name: 'Renommer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Les Jardins de Nova' }).waitFor();
  await page
    .getByRole('button', { name: 'Jardin de nacre', exact: true })
    .click();
  await page.locator('.nova-aquarium').waitFor();
  await page.screenshot({ path: shots + '/aquarium-desktop.png' });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  // Position de test enregistrée directement dans le stockage local, jamais via une route de triche.
  await store.withSave(player.id, (s) => {
    s.x = wreck!.x;
    s.y = wreck!.y;
  });
  await page.reload();
  await page
    .getByRole('button', { name: 'Explorer · ' + wreck.name, exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Explorer · ' + wreck.name, exact: true })
    .click();
  await page.getByRole('button', { name: 'Cabine', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cabine', exact: true })
    .isDisabled()
    .then(async (disabled) => {
      if (!disabled)
        await page
          .getByRole('button', { name: 'Cabine', exact: true })
          .waitFor();
    });
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __nf: { getState(): { save: { adventure: { fragments: number } } } };
        }
      ).__nf.getState().save.adventure.fragments >= 1,
  );
  await page.screenshot({ path: shots + '/wreck-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: shots + '/wreck-mobile.png' });
  assert.ok(
    await page
      .getByRole('button', { name: 'Cabine', exact: true })
      .isDisabled(),
  );
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.screenshot({ path: shots + '/journal-mobile.png' });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  const ancient = rollSpecimen(
    new Rng(5),
    SPECIES_BY_ID.dunkleosteus,
    1,
    'coastal',
    Date.now(),
    'ancient-fixture',
  );
  await page.evaluate((spec) => {
    (
      window as unknown as { __nf: { setState(patch: unknown): void } }
    ).__nf.setState({
      result: { outcome: 'win', specimen: spec, stored: true, first: true },
    });
  }, ancient);
  await page.locator('.rare-capture').waitFor();
  await page.screenshot({ path: shots + '/rare-mobile.png' });
  assert.equal(errors.length, 0, errors.join('\n'));
  await context.close();
  console.log(
    'Contrats, équipements, appâts, aquarium, épave et rendu mobile : parcours terminé.',
  );
} finally {
  await browser?.close();
  await built.close();
}
