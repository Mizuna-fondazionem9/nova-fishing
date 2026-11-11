import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Combat, replayCombat, makeCombatParams, gearOf, SPECIES, BIOME_IDS, fightStats, zeroLevels, spawnShadows, CRAB_SPACING, type CombatTap } from '../packages/shared/src/index';
const crab = SPECIES.find(s => s.id === 'crabe_coastal_a')!;
const params = (precision = 0) => ({ ...makeCombatParams(fightStats(crab, { len: 15, tough: false, lvl: 1 }), gearOf(zeroLevels()).rod, 42), mode: 'crab' as const, crabPrecision: precision, aggr: 0 });
const wait = (c: Combat, tick: number) => { while (c.tick < tick && c.state === 'run') c.step(); };

test('trois crabes spécifiques dans chacun des onze biomes, avec silhouettes distinctes', () => {
  assert.equal(SPECIES.filter(s => s.sil === 'crab').length, 33);
  for (const biome of BIOME_IDS) assert.equal(SPECIES.filter(s => s.sil === 'crab' && s.biomes.includes(biome)).length, 3);
});
test('parfait à 280 ms, coup normal après, cible plus grande et délai plus long avec précision', () => {
  const c = new Combat(params());
  assert.equal(c.perfectMs, 280);
  wait(c, 16); assert.equal(c.tap(c.targetX, c.targetY), 'crit');
  const d = new Combat(params());
  wait(d, 18); assert.equal(d.tap(d.targetX,d.targetY), 'hit');
  const upgraded = new Combat(params(0.25));
  assert.ok(upgraded.targetRadius > d.targetRadius);
  assert.ok(upgraded.perfectMs > d.perfectMs);
  wait(upgraded, 23); assert.equal(upgraded.tap(upgraded.targetX,upgraded.targetY), 'crit');
});
test('rater le cercle et laisser expirer la cible pénalisent la ligne et brisent le combo', () => {
  const c = new Combat(params());
  assert.equal(c.tap(0,0), 'miss'); assert.equal(c.misses,1);
  const d = new Combat(params()); d.streak = 8;
  wait(d, 67); assert.equal(d.misses,1); assert.equal(d.streak,0);
  assert.ok(d.line < d.p.line);
  assert.equal(d.tap(d.targetX,d.targetY), 'locked');
  assert.equal(new Combat(params()).tap(), 'locked');
});
test('les coordonnées et délais sont rejoués par le serveur, sans récompense sur une cible inventée', () => {
  const p = params(); const c = new Combat(p); const taps: CombatTap[] = [];
  while (c.state === 'run') {
    wait(c, Math.max(c.tick, c.targetAt) + 8);
    if (c.state !== 'run') break;
    taps.push({ tick:c.tick, x:c.targetX, y:c.targetY });
    c.tap(c.targetX,c.targetY);
  }
  assert.equal(c.state,'win');
  const r = replayCombat(p, taps, c.tick);
  assert.equal(r.state,'win'); assert.equal(r.crits,c.crits);
  const fake = replayCombat(p, taps.map(t => ({ ...(t as {tick:number;x:number;y:number}), x:0,y:0 })),c.tick);
  assert.notEqual(fake.state,'win');
});


test('les crabes sont espacés de part et d’autre des frontières de chunks', () => {
  let seen = 0;
  for (const seed of [20261111, 42, 710]) {
    const shadows = [];
    for (let cy=-3;cy<=3;cy++) for (let cx=-3;cx<=3;cx++) shadows.push(...spawnShadows(seed,cx,cy,50));
    const crabs = shadows.filter(s => s.sil === 'crab');
    seen += crabs.length;
    for (let i=0;i<crabs.length;i++) for (let j=i+1;j<crabs.length;j++)
      assert.ok(Math.hypot(crabs[i].x-crabs[j].x,crabs[i].y-crabs[j].y)>=CRAB_SPACING);
    assert.deepEqual(spawnShadows(seed,0,0,50),spawnShadows(seed,0,0,50));
  }
  assert.ok(seen > 0, 'l’espacement ne supprime pas tous les crabes');
});
test('les crabes retrouvent l’usure normale, sans supprimer les pénalités', () => {
  const p = params();
  const c = new Combat(p), fish = new Combat({...p,mode:undefined});
  wait(c,30); wait(fish,30);
  assert.equal(c.line, fish.line);
  const before = c.line;
  assert.equal(c.tap(0,0),'miss');
  assert.ok(c.line < before);
});
