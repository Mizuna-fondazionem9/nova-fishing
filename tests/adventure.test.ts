import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSave,
  migrateSave,
  adventureOf,
  portContracts,
  adventurePortOp,
  contractProgress,
  noteAdventureCatch,
  discoverPoint,
  pointOp,
  chartOp,
  gearOf,
  newAdventure,
  landmarkAt,
  nearbyLandmarks,
  landmarkById,
  isLand,
  ventHot,
  dayKey,
  rollSpecimen,
  SPECIES_BY_ID,
  Rng,
  pickSpecies,
  collectionProgress,
  COLLECTIONS,
  type Landmark,
  type Specimen,
} from '../packages/shared/src/index';
const seed = 20261111,
  now = Date.UTC(2026, 10, 12, 12),
  port = '0:0';
const make = () => {
  const s = newSave(seed, now);
  s.coins = 50000;
  return s;
};
const p = (kind: Landmark['kind'], id = '1:1'): Landmark => ({
  id,
  kind,
  x: 400,
  y: 400,
  name: 'Test',
  text: 'Un lieu remarquable.',
  biome: kind === 'vent' ? 'volcanic' : 'coastal',
});
const fish = (sp = 'sardine', kg = 0.2, uid = 'f'): Specimen => ({
  sp,
  kg,
  uid,
  len: 15,
  size: 0,
  color: 0,
  tough: false,
  lvl: 1,
  value: 5,
  at: now,
  biome: 'coastal',
});

test('contrats : livraison réelle, consommation exacte et récompense unique', () => {
  const s = make(),
    board = portContracts(seed, port, now),
    c = board[0],
    a = adventureOf(s);
  assert.deepEqual(board, portContracts(seed, port, now));
  assert.ok(adventurePortOp(s, 'accept', c.id, port, now, seed).ok);
  assert.equal(adventurePortOp(s, 'complete', c.id, port, now, seed).ok, false);
  s.cargo = [
    fish(c.species, 0.2, 'a'),
    fish(c.species, 0.2, 'b'),
    fish(c.species, 0.2, 'c'),
    fish('bar', 1, 'd'),
  ];
  const before = s.coins;
  assert.ok(adventurePortOp(s, 'complete', c.id, port, now, seed).ok);
  assert.equal(s.coins, before + c.reward);
  assert.equal(s.cargo.length, 1);
  assert.equal(s.cargo[0].sp, 'bar');
  assert.equal(a.reputation[port], c.rep);
  assert.equal(adventurePortOp(s, 'complete', c.id, port, now, seed).ok, false);
});
test('contrats : photo manuelle après acceptation, découvertes nouvelles, expiration et limite globale', () => {
  const s = make(),
    a = adventureOf(s),
    photo = portContracts(seed, port, now)[1],
    explore = portContracts(seed, port, now)[2];
  discoverPoint(s, p('wreck', '9:9'), now - 1000);
  assert.ok(adventurePortOp(s, 'accept', photo.id, port, now, seed).ok);
  assert.ok(adventurePortOp(s, 'accept', explore.id, port, now, seed).ok);
  noteAdventureCatch(s, fish('bar', 3), now - 1);
  assert.equal(a.active[0].progress, 0);
  noteAdventureCatch(s, fish('bar', 3), now + 1);
  assert.equal(a.active[0].progress, 3);
  assert.equal(contractProgress(s, a.active[1]), 0);
  discoverPoint(s, p('wreck', '10:9'), now);
  discoverPoint(s, p('wreck', '11:9'), now);
  assert.equal(contractProgress(s, a.active[1]), 2);
  assert.equal(
    adventurePortOp(s, 'complete', photo.id, '1:1', now, seed).ok,
    false,
  );
  assert.ok(adventurePortOp(s, 'complete', photo.id, port, now, seed).ok);
  const next = now + 86400000;
  assert.equal(
    adventurePortOp(s, 'complete', explore.id, port, next, seed).ok,
    false,
  );
  a.completed = Array.from({ length: 6 }, (_, i) => `${dayKey(next)}:${i}:0:1`);
  assert.equal(
    adventurePortOp(
      s,
      'accept',
      portContracts(seed, port, next)[0].id,
      port,
      next,
      seed,
    ).ok,
    false,
  );
});
test('réputation : distinction et appâts ne se débloquent qu’une seule fois', () => {
  const s = make(),
    a = adventureOf(s);
  a.reputation[port] = 90;
  const c = portContracts(seed, port, now)[1];
  adventurePortOp(s, 'accept', c.id, port, now, seed);
  noteAdventureCatch(s, fish('bar', 3), now + 1);
  assert.ok(adventurePortOp(s, 'complete', c.id, port, now + 1, seed).ok);
  assert.ok(a.rewards.includes('harbor'));
  assert.equal(a.baits.glimmer, 3);
  adventurePortOp(s, 'complete', c.id, port, now + 2, seed);
  assert.equal(a.baits.glimmer, 3);
});
test('matériel : achat permanent, compromis et conservation des montages au changement de bateau', () => {
  const s = make(),
    a = adventureOf(s),
    base = gearOf(s.up, s.vessel);
  assert.ok(adventurePortOp(s, 'kit', 'river', port, now, seed).ok);
  const after = s.coins;
  adventurePortOp(s, 'kit', 'river', port, now, seed);
  assert.equal(s.coins, after);
  assert.ok(gearOf(s.up, s.vessel, s.kit).rod.precision > base.rod.precision);
  assert.ok(gearOf(s.up, s.vessel, s.kit).rod.power < base.rod.power);
  assert.ok(adventurePortOp(s, 'kit', 'abyss', port, now, seed).ok);
  assert.ok(gearOf(s.up, s.vessel, s.kit).rod.resistance > base.rod.resistance);
  s.cargo = Array.from({ length: 20 }, (_, i) =>
    fish('sardine', 0.1, String(i)),
  );
  assert.equal(adventurePortOp(s, 'kit', 'cage', port, now, seed).ok, false);
  assert.equal(s.kit, 'abyss');
  assert.ok(a.kits.includes('abyss'));
});
test('appâts : réserve bornée et sélection contrôlée', () => {
  const s = make(),
    a = adventureOf(s);
  const before = s.coins;
  assert.ok(adventurePortOp(s, 'bait-buy', 'glimmer', port, now, seed).ok);
  assert.equal(s.coins, before - 60);
  assert.ok(adventurePortOp(s, 'bait-select', 'glimmer', port, now, seed).ok);
  assert.equal(a.bait, 'glimmer');
  a.baits.glimmer = 20;
  assert.equal(
    adventurePortOp(s, 'bait-buy', 'glimmer', port, now, seed).ok,
    false,
  );
  assert.equal(
    adventurePortOp(s, 'bait-select', '__proto__', port, now, seed).ok,
    false,
  );
});
test('épaves : découverte unique, compartiments distincts, renouvellement et plafond journalier', () => {
  const s = make(),
    a = adventureOf(s),
    wreck = p('wreck');
  discoverPoint(s, wreck, now);
  const coins = s.coins;
  assert.deepEqual(discoverPoint(s, wreck, now), []);
  assert.equal(s.coins, coins);
  assert.ok(pointOp(s, wreck, 'loot', '0', now, seed).ok);
  const earned = s.coins;
  assert.equal(pointOp(s, wreck, 'loot', '0', now, seed).ok, false);
  assert.equal(s.coins, earned);
  assert.equal(a.fragments, 1);
  for (const id of ['2:1', '3:1'])
    for (let i = 0; i < 3; i++)
      pointOp(s, p('wreck', id), 'loot', String(i), now, seed);
  assert.equal(a.lootCount, 6);
  assert.equal(pointOp(s, p('wreck', '4:1'), 'loot', '0', now, seed).ok, false);
  assert.ok(pointOp(s, wreck, 'loot', '0', now + 86400000, seed).ok);
  assert.equal(a.lootCount, 1);
});
test('sanctuaires : trois sites différents, histoire persistante et décor final', () => {
  const s = make(),
    a = adventureOf(s);
  for (let i = 0; i < 3; i++) {
    const site = p('sanctuary', `${i}:2`);
    discoverPoint(s, site, now);
    assert.ok(pointOp(s, site, 'decipher', '', now, seed).ok);
    assert.equal(pointOp(s, site, 'decipher', '', now, seed).ok, false);
  }
  assert.equal(a.story, 3);
  assert.equal(a.storySites.length, 3);
  assert.ok(
    adventurePortOp(s, 'aquarium-theme', 'ancient', port, now, seed).ok,
  );
});
test('sources : poussée de chaleur bloquante, prélèvement quotidien pendant l’accalmie', () => {
  const s = make(),
    point = p('vent');
  let hot = now,
    cool = now;
  while (!ventHot(point, hot)) hot += 1000;
  while (ventHot(point, cool)) cool += 1000;
  assert.equal(pointOp(s, point, 'sample', '', hot, seed).ok, false);
  assert.ok(pointOp(s, point, 'sample', '', cool, seed).ok);
  assert.equal(pointOp(s, point, 'sample', '', cool, seed).ok, false);
});
test('lagons : casier requis, deux prises, capacité et repos du site', () => {
  const s = make(),
    point = p('lagoon');
  assert.equal(pointOp(s, point, 'trap', '', now, seed).ok, false);
  s.kit = 'cage';
  assert.ok(pointOp(s, point, 'trap', '', now, seed).ok);
  assert.equal(s.cargo.length, 2);
  assert.equal(pointOp(s, point, 'trap', '', now, seed).ok, false);
  assert.ok(s.cargo.every((f) => f.value > 0));
});
test('aquarium : collections exigées, décors permanents et aucun revenu passif', () => {
  const s = make(),
    a = adventureOf(s),
    before = s.coins;
  assert.equal(
    adventurePortOp(s, 'aquarium-theme', 'coral', port, now, seed).ok,
    false,
  );
  for (const id of ['moule', 'palourde', 'huitre', 'coquille_saint_jacques'])
    s.bestiary[id] = {
      n: 1,
      maxKg: 1,
      maxLen: 1,
      first: now,
      biomes: ['coastal'],
    };
  assert.ok(adventurePortOp(s, 'collection', 'shells', port, now, seed).ok);
  assert.ok(adventurePortOp(s, 'aquarium-theme', 'coral', port, now, seed).ok);
  assert.equal(
    adventurePortOp(s, 'collection', 'shells', port, now, seed).ok,
    false,
  );
  assert.equal(s.coins, before);
  assert.equal(
    adventurePortOp(s, 'featured', 'absent', port, now, seed).ok,
    false,
  );
  assert.equal(
    adventurePortOp(s, 'aquarium-name', 'x'.repeat(31), port, now, seed).ok,
    false,
  );
  assert.ok(
    adventurePortOp(s, 'aquarium-name', 'Le Jardin de Nova', port, now, seed)
      .ok,
  );
  const restored = migrateSave(JSON.parse(JSON.stringify(s)), seed, now);
  assert.equal(restored.adventure?.aquarium.name, 'Le Jardin de Nova');
  assert.deepEqual(migrateSave({ v: 2, coins: 25 }, seed, now).coins, 25);
});
test('lieux : stables, sur l’eau, éloignés des quais ; les cartes ne sont pas consommées deux fois', () => {
  const found: Landmark[] = [];
  for (let cy = -12; cy <= 12; cy++)
    for (let cx = -12; cx <= 12; cx++) {
      const p = landmarkAt(seed, cx, cy);
      if (p) found.push(p);
    }
  for (const kind of ['wreck', 'sanctuary', 'lagoon', 'vent'])
    assert.ok(
      found.some((p) => p.kind === kind),
      `type absent : ${kind}`,
    );
  for (const p of found.slice(0, 30)) {
    assert.deepEqual(landmarkById(seed, p.id), p);
    assert.ok(!isLand(seed, Math.floor(p.x), Math.floor(p.y)));
    assert.ok(nearbyLandmarks(seed, p.x, p.y).some((v) => v.id === p.id));
  }
  const s = make(),
    a = adventureOf(s);
  a.fragments = 6;
  assert.ok(chartOp(s, seed).ok);
  assert.equal(a.fragments, 3);
  assert.ok(a.chart);
  assert.equal(chartOp(s, seed).ok, false);
  assert.equal(a.fragments, 3);
});

test('lagons : bonus de couleur réel et borné ; appât rare conserve la silhouette', () => {
  let normal = 0,
    lagoon = 0,
    rare = 0,
    boosted = 0;
  const sp = SPECIES_BY_ID.sardine,
    tile = {
      land: false,
      h: -0.3,
      shore: 1,
      depth: 0.4,
      temp: 0.5,
      level: 1,
      biome: 'temperate' as const,
    };
  for (let i = 1; i <= 10000; i++) {
    if (rollSpecimen(new Rng(i), sp, 1, 'coastal', now, 'a').color > 0)
      normal++;
    if (rollSpecimen(new Rng(i), sp, 1, 'coastal', now, 'a', 2).color > 0)
      lagoon++;
    const a = pickSpecies(new Rng(i), tile, 'jour', 'clair', 'long');
    const b = pickSpecies(
      new Rng(i),
      tile,
      'jour',
      'clair',
      'long',
      false,
      'glimmer',
    );
    if (a?.rarity! >= 2) rare++;
    if (b?.rarity! >= 2) boosted++;
    assert.equal(b?.sil, 'long');
  }
  assert.ok(lagoon > normal * 1.6);
  assert.ok(boosted > rare);
  assert.deepEqual(
    rollSpecimen(new Rng(4), sp, 1, 'coastal', now, 'a', 100),
    rollSpecimen(new Rng(4), sp, 1, 'coastal', now, 'a', 2),
  );
});

test('collection de couleurs : les anciennes variantes conservées comptent sans recapture', () => {
  const s = make();
  s.bestiary.sardine = {
    n: 1,
    maxKg: 0.2,
    maxLen: 15,
    first: now,
    biomes: ['coastal'],
  };
  s.aquarium = [{ ...fish('sardine'), color: 3 }];
  assert.equal(collectionProgress(s, 'rainbow'), 1);
});
