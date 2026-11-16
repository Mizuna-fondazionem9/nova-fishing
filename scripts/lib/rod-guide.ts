import {
  SPECIES, Rng, ROD_KEYS, zeroLevels, gearOf, fightStats, makeCombatParams,
  simulateBot, replayCombat, BOTS, isPredatorSpecies, type BiomeId,
} from '../../packages/shared/src/index';

export const GUIDE_TARGET = 0.8;
export const GUIDE_SAMPLES = 40;
export const GUIDE_MAX_SECONDS = 25;
export const GUIDE_MAX_HITS = 12;

/** Normal-sized, unmodified fish only; all ordinary species must meet the target. */
export function guidePool(biome: BiomeId) {
  return SPECIES.filter(sp => sp.biomes.includes(biome) && sp.rarity <= 1 &&
    sp.sil !== 'crab' && !sp.ancient && !isPredatorSpecies(sp));
}

export function evaluateRodLevel(biome: BiomeId, regionalLevel: number, level: number, skill: 'debutant' | 'moyen') {
  const up = zeroLevels();
  for (const key of ROD_KEYS) up[key] = level;
  const rod = gearOf(up).rod;
  return guidePool(biome).map(sp => {
    let comfortable = 0;
    for (let i = 0; i < GUIDE_SAMPLES; i++) {
      const rng = new Rng(9100 + i * 997 + sp.id.length * 17);
      const spec = { len: sp.lmin + (sp.lmax - sp.lmin) * Math.pow(rng.next(), 1.5),
        lvl: regionalLevel, biome, tough: false };
      const params = makeCombatParams(fightStats(sp, spec), rod, 11000 + i * 61);
      const result = simulateBot(params, BOTS[skill], new Rng(7000 + i * 67));
      if (!result.win || result.seconds > GUIDE_MAX_SECONDS) continue;
      const replay = replayCombat(params, result.taps, Math.round(result.seconds * 60));
      if (replay.hits + replay.crits <= GUIDE_MAX_HITS) comfortable++;
    }
    return { species: sp.id, comfortableRate: comfortable / GUIDE_SAMPLES };
  });
}

export function isComfortable(results: ReturnType<typeof evaluateRodLevel>): boolean {
  return results.length > 0 && results.every(r => r.comfortableRate >= GUIDE_TARGET);
}
