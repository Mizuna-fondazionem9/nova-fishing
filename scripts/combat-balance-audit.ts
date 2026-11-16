/** Repeatable effort audit, independent of the recommendation table and player luck. */
import { SPECIES_BY_ID, Rng, gearOf, zeroLevels, ROD_KEYS, fightStats, makeCombatParams,
  simulateBot, replayCombat, BOTS, priceOf, bulkOf, type BiomeId, type Specimen } from '../packages/shared/src/index';

const cases: [string, BiomeId, number, number][] = [
  ['sardine', 'coastal', 1, 0], ['bar', 'coastal', 3, 8],
  ['hareng', 'polar', 3, 8], ['hareng', 'polar', 3, 10],
  ['cabillaud', 'polar', 3, 8], ['cabillaud', 'polar', 3, 10],
  ['sardine', 'coastal', 8, 8], ['poisson_hachette', 'deep', 15, 25],
  ['requin_tigre', 'tropical', 3, 10], ['leviathan', 'mystic', 20, 50],
];
for (const [id, biome, regionalLevel, level] of cases) {
  const sp = SPECIES_BY_ID[id];
  if (!sp) throw new Error(`Unknown species: ${id}`);
  const up = zeroLevels();
  for (const key of ROD_KEYS) up[key] = level;
  for (const skill of ['moyen', 'expert'] as const) {
    const wins: { hits: number; seconds: number }[] = [];
    const before: { hits: number; seconds: number }[] = [];
    let value = 0, bulk = 0;
    for (let i = 0; i < 200; i++) {
      const rng = new Rng(4700 + i * 997);
      const len = sp.lmin + (sp.lmax - sp.lmin) * Math.pow(rng.next(), 1.5);
      const spec: Specimen = { sp: id, uid: `audit-${i}`, at: 0, value: 0,
        len, kg: sp.kgMax * Math.pow(len / sp.lmax, 3), size: 0, color: 0,
        tough: false, lvl: regionalLevel, biome };
      value += priceOf(spec); bulk += bulkOf(spec.kg);
      const stats = fightStats(sp, spec);
      const params = makeCombatParams(stats, gearOf(up).rod, 8300 + i * 61);
      const oldParams = { ...params, stamina: stats.stamina };
      const oldResult = simulateBot(oldParams, BOTS[skill], new Rng(2100 + i * 67));
      if (oldResult.win) {
        const replay = replayCombat(oldParams, oldResult.taps, Math.round(oldResult.seconds * 60));
        before.push({ hits: replay.hits + replay.crits, seconds: oldResult.seconds });
      }
      const result = simulateBot(params, BOTS[skill], new Rng(2100 + i * 67));
      const replay = replayCombat(params, result.taps, Math.round(result.seconds * 60));
      if (result.win) wins.push({ hits: replay.hits + replay.crits, seconds: result.seconds });
    }
    const summary = (items: typeof wins) => ({ winPercent: items.length / 2,
      hits: items.length ? +(items.reduce((n, w) => n + w.hits, 0) / items.length).toFixed(1) : null,
      seconds: items.length ? +(items.reduce((n, w) => n + w.seconds, 0) / items.length).toFixed(1) : null });
    console.log(JSON.stringify({ id, biome, regionalLevel, level, skill, before: summary(before), after: summary(wins),
      value: Math.round(value / 200), fullHold33: Math.round(value / bulk * 33) }));
  }
}
