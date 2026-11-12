import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  newSave,
  migrateSave,
  rollSpecimen,
  Rng,
  SPECIES_BY_ID,
  newAdventure,
} from '../packages/shared/src/index';
import { MemoryStore } from '../packages/server/src/store';
import { buildServer } from '../packages/server/src/app';
import { loadConfig } from '../packages/server/src/config';

const seed = 20261111;
async function fixture() {
  const store = new MemoryStore((raw) => migrateSave(raw, seed, 0));
  await store.init();
  const p = await store.upsertPlayer(
    'private-discord-id',
    '<img src=x onerror=alert(1)>',
    null,
    () => newSave(seed, 0),
  );
  await store.withSave(p.id, (s) => {
    s.coins = 98765;
    s.stats.caught = 42;
    s.stats.crits = 100;
    s.stats.maxKg = 120;
    s.bestiary.bar = {
      n: 42,
      maxLen: 30,
      maxKg: 120,
      first: 1,
      biomes: ['coastal'],
    };
    const fish = rollSpecimen(
      new Rng(1),
      SPECIES_BY_ID.bar,
      1,
      'coastal',
      0,
      'private-fish-uid',
    );
    fish.color = 7;
    fish.trait = 'armored';
    s.aquarium = [fish];
    s.cargo = [{ ...fish, uid: 'private-cargo-uid' }];
    s.adventure = newAdventure();
    s.adventure.aquarium = {
      name: '<script>test</script>',
      theme: 'aurora',
      featured: fish.uid,
    };
  });
  const built = buildServer(
    loadConfig({
      PUBLIC_URL: 'http://localhost/fishing',
      WORLD_SEED: String(seed),
    } as NodeJS.ProcessEnv),
    store,
    () => {},
  );
  await new Promise<void>((r) => built.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(built.server.address() as AddressInfo).port}/fishing`;
  return { store, p, base, built };
}
test('classement public : fortune actuelle, recherche littérale, pagination et données limitées', async () => {
  const { store, base, built } = await fixture();
  try {
    for (let i = 0; i < 26; i++) {
      const p = await store.upsertPlayer(
        'fake-' + i,
        'Pêcheur ' + i,
        null,
        () => newSave(seed, 0),
      );
      await store.withSave(p.id, (s) => {
        s.coins = 5000 - i;
        s.stats.caught = 1000;
      });
    }
    const res = await fetch(base + '/api/public/leaderboard');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.players.length, 24);
    assert.equal(data.hasMore, true);
    assert.equal(data.players[0].coins, 98765);
    assert.equal(data.players[0].aquariumCount, 1);
    assert.deepEqual(
      Object.keys(data.players[0]).sort(),
      ['id', 'name', 'avatar', 'coins', 'caught', 'aquariumCount'].sort(),
    );
    const page = await (
      await fetch(base + '/api/public/leaderboard?offset=24')
    ).json();
    assert.equal(page.players.length, 3);
    assert.equal(page.hasMore, false);
    assert.ok(
      page.players.every(
        (p: { id: string }) =>
          !data.players.some((a: { id: string }) => p.id === a.id),
      ),
    );
    const search = await (
      await fetch(
        base + '/api/public/leaderboard?q=' + encodeURIComponent('pÊCHEUR 25'),
      )
    ).json();
    assert.equal(search.ranked, false);
    assert.equal(search.players.length, 1);
    assert.equal(search.players[0].name, 'Pêcheur 25');
    const literal = await (
      await fetch(base + '/api/public/leaderboard?q=%25')
    ).json();
    assert.equal(literal.players.length, 0);
    await store.withSave(data.players[0].id, (s) => {
      s.coins = 0;
    });
    const updated = await (
      await fetch(base + '/api/public/leaderboard')
    ).json();
    assert.equal(updated.players[0].coins, 5000);
  } finally {
    await built.close();
  }
});
test('profil public : aquarium, variantes et statistiques sans identifiants Discord ni sauvegarde privée', async () => {
  const { p, store, base, built } = await fixture();
  try {
    const before = await store.getPlayer(p.id);
    const res = await fetch(base + '/api/public/profile?id=' + p.id);
    assert.equal(res.status, 200);
    const profile = await res.json();
    assert.equal(profile.coins, 98765);
    assert.equal(profile.stats.species, 1);
    assert.equal(profile.aquarium.name, '<script>test</script>');
    assert.equal(profile.aquarium.theme, 'aurora');
    assert.equal(profile.aquarium.fish[0].featured, true);
    assert.equal(profile.aquarium.fish[0].trait, 'armored');
    assert.equal(profile.aquarium.fish[0].color, 7);
    for (const key of [
      'save',
      'discordId',
      'cargo',
      'x',
      'y',
      'up',
      'lastPort',
    ])
      assert.equal(key in profile, false);
    const text = JSON.stringify(profile);
    assert.ok(!text.includes('private-'));
    assert.equal('uid' in profile.aquarium.fish[0], false);
    assert.deepEqual(
      await store.getPlayer(p.id),
      before,
      'la visite ne modifie pas le joueur',
    );
    await store.withSave(p.id, (s) => {
      s.aquarium = [];
      delete s.adventure;
    });
    const empty = await (
      await fetch(base + '/api/public/profile?id=' + p.id)
    ).json();
    assert.deepEqual(empty.aquarium.fish, []);
    assert.equal(empty.aquarium.theme, 'sand');
  } finally {
    await built.close();
  }
});
test('API publique : erreurs bornées, profil absent et préfixe /fishing', async () => {
  const { base, built } = await fixture();
  try {
    for (const offset of ['-1', '2.5', 'Infinity', 'abc', '10001'])
      assert.equal(
        (await fetch(base + '/api/public/leaderboard?offset=' + offset)).status,
        400,
      );
    assert.equal(
      (await fetch(base + '/api/public/leaderboard?q=' + 'a'.repeat(81)))
        .status,
      400,
    );
    assert.equal(
      (await fetch(base + '/api/public/profile?id=invalid')).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          base + '/api/public/profile?id=00000000-0000-0000-0000-000000000000',
        )
      ).status,
      404,
    );
    assert.equal(
      (await fetch(base + '/api/me')).status,
      401,
      'le jeu reste privé',
    );
  } finally {
    await built.close();
  }
});
