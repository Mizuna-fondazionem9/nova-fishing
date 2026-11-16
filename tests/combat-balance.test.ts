import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, SPECIES_BY_ID, Rng, ROD_KEYS, zeroLevels, gearOf, fightStats,
  makeCombatParams, simulateBot, replayCombat, BOTS, isPredatorSpecies,
} from '../packages/shared/src/index';
import guide from '../packages/shared/src/rod-guide.json';
import { evaluateRodLevel, isComfortable } from '../scripts/lib/rod-guide';

test('level 8–10 gear makes normal polar catches short, including with an unupgraded reel', () => {
  for (const level of [8, 9, 10]) for (const id of ['hareng', 'cabillaud']) {
    const sp = SPECIES_BY_ID[id], up = zeroLevels();
    for (const key of ROD_KEYS) up[key] = level;
    up.reel = 0; // Specialised rods must not require a low-priority upgrade.
    let wins = 0, hits = 0, seconds = 0, oldHits = 0;
    for (let i = 0; i < 120; i++) {
      const rng = new Rng(4700 + i * 997);
      const stats = fightStats(sp, { len: sp.lmin + (sp.lmax - sp.lmin) * rng.next() ** 1.5,
        lvl: 3, biome: 'polar', tough: false });
      const params = makeCombatParams(stats, gearOf(up).rod, 8300 + i * 61);
      const result = simulateBot(params, BOTS.moyen, new Rng(2100 + i * 67));
      const replay = replayCombat(params, result.taps, Math.round(result.seconds * 60));
      assert.equal(replay.state === 'win', result.win);
      if (result.win) { wins++; hits += replay.hits + replay.crits; seconds += result.seconds; }
      const oldParams = { ...params, stamina: stats.stamina };
      const old = simulateBot(oldParams, BOTS.moyen, new Rng(2100 + i * 67));
      const oldReplay = replayCombat(oldParams, old.taps, Math.round(old.seconds * 60));
      oldHits += oldReplay.hits + oldReplay.crits;
    }
    assert.ok(wins / 120 >= 0.9, `${id}, gear ${level}: ${wins}/120 wins`);
    assert.ok(hits / wins <= 9, `${id}, gear ${level}: ${hits / wins} hits`);
    assert.ok(seconds / wins <= 12, `${id}, gear ${level}: ${seconds / wins}s`);
    assert.ok(hits / wins < oldHits / 120 * 0.8, 'routine catches should require materially fewer inputs');
  }
});

test('routine relief preserves progression and distinctive catches', () => {
  const sp = SPECIES_BY_ID.hareng, up = zeroLevels();
  for (const key of ROD_KEYS) up[key] = 10;
  const normal = { len: 25, lvl: 3, biome: 'polar' as const, tough: false };
  const ordinary = makeCombatParams(fightStats(sp, normal), gearOf(up).rod, 12);
  const armored = makeCombatParams(fightStats(sp, { ...normal, trait: 'armored' }), gearOf(up).rod, 12);
  const giant = makeCombatParams(fightStats(sp, { ...normal, len: sp.lmax * 1.5 }), gearOf(up).rod, 12);
  assert.ok(armored.stamina > ordinary.stamina);
  assert.ok(giant.stamina > ordinary.stamina * 1.5);
  const distant = fightStats(SPECIES_BY_ID.poisson_hachette, { len: 7, lvl: 14, biome: 'deep', tough: false });
  const undergeared = makeCombatParams(distant, gearOf(zeroLevels()).rod, 12);
  assert.equal(undergeared.stamina, distant.stamina);
  for (const species of SPECIES.filter(s => s.rarity >= 2 || s.ancient || s.sil === 'crab' || isPredatorSpecies(s))) {
    const stats = fightStats(species, { len: (species.lmin + species.lmax) / 2, lvl: 3, tough: false });
    const params = makeCombatParams(stats, gearOf(up).rod, 12);
    assert.equal(params.stamina, stats.stamina, species.id);
  }
});

test('every published recommendation meets the success, duration and hit budget per species', () => {
  for (const row of guide.rows) for (const skill of ['debutant', 'moyen'] as const) {
    const level = row[skill];
    if (level === null) continue;
    const results = evaluateRodLevel(row.biome as Parameters<typeof evaluateRodLevel>[0], row.max, level, skill);
    assert.ok(isComfortable(results), `${row.biome}, ${row.max}, ${skill}, gear ${level}: ${JSON.stringify(results)}`);
  }
});
