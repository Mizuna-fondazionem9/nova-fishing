import guide from './rod-guide.json';
import { type Levels, NETS, effectiveUpgradeLevel, MAX_LEVEL } from './gear';
import { SPECIES } from './species';
import { encounterTier } from './fish';
import { type BiomeId } from './world';
export const FISHING_SECTORS = [
  { name: 'Proche du départ', max: 3, min: 1 },
  { name: 'Au large', max: 8, min: 4 },
  { name: 'Eaux lointaines', max: 15, min: 9 },
  { name: 'Eaux extrêmes', max: 30, min: 16 },
] as const;
export const fishingSector = (level: number) => FISHING_SECTORS.find(s => level <= s.max) ?? { name: 'Au-delà des cartes', min: 31, max: Infinity };
export const ROD_KEYS = ['rodPower','rodRes','line','reel','recovery','precision'] as const;
/** Display rating only: arithmetic mean of the six rod upgrade levels. */
export function rodStars(up: Levels): number {
  const sum = ROD_KEYS.reduce((n, key) => n + Math.max(0, Math.min(MAX_LEVEL, up[key] ?? 0)), 0);
  return Math.round(sum / ROD_KEYS.length * 10) / 10;
}
export function fishingAdvice(up: Levels, biome: BiomeId, level: number, skill: 'debutant' | 'moyen' = 'moyen') {
  const sector = fishingSector(level), row = guide.rows.find(r => r.biome === biome && r.min === sector.min);
  const target = row?.[skill] ?? null;
  const stars = rodStars(up);
  const state = target === null ? 'hard' : stars >= target ? 'ready' : stars >= target * .65 ? 'careful' : 'hard';
  return { sector: sector.name, target, stars, state,
    title: state === 'ready' ? 'Adapté' : state === 'careful' ? 'Exigeant' : 'Déconseillé' };
}
/** Same eligibility rule for actual net hauls and the interface. */
export function eligibleNetSpecies(netIndex: number, up: Levels, biome: BiomeId, level: number) {
  const net = NETS[netIndex];
  if (!net) return [];
  const limit = net.maxTier + effectiveUpgradeLevel(up.nets ?? 0) * .12;
  return SPECIES.filter(sp => sp.sil === 'small' && sp.rarity <= 1 && sp.biomes.includes(biome) && encounterTier(sp, level, biome) <= limit);
}
export function netFishingProfile(netIndex: number, up: Levels, biome: BiomeId, level: number, full = false) {
  if (!NETS[netIndex]) return { state: 'none', title: 'Aucun filet' };
  if (full) return { state: 'careful', title: 'Cale pleine' };
  const candidates = SPECIES.filter(sp => sp.sil === 'small' && sp.rarity <= 1 && sp.biomes.includes(biome));
  const eligible = eligibleNetSpecies(netIndex, up, biome, level);
  if (!candidates.length) return { state: 'hard', title: 'Aucune prise de filet ici' };
  if (!eligible.length) return { state: 'hard', title: 'Trop faible ici' };
  if (eligible.length < candidates.length) return { state: 'careful', title: 'Prises limitées' };
  return { state: 'ready', title: 'Adapté à ces eaux' };
}
