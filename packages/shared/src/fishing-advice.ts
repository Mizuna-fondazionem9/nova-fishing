import guide from './rod-guide.json';
import { type Levels, UPGRADE_BY_KEY } from './gear';
import { type BiomeId } from './world';
export const FISHING_SECTORS = [
  { name: 'Proche du départ', max: 3, min: 1 },
  { name: 'Au large', max: 8, min: 4 },
  { name: 'Eaux lointaines', max: 15, min: 9 },
  { name: 'Eaux extrêmes', max: 30, min: 16 },
] as const;
export const fishingSector = (level: number) => FISHING_SECTORS.find(s => level <= s.max) ?? { name: 'Au-delà des cartes', min: 31, max: Infinity };
export const ROD_KEYS = ['rodPower','rodRes','line','reel','recovery','precision'] as const;
export function fishingAdvice(up: Levels, biome: BiomeId, level: number, skill: 'debutant' | 'moyen' = 'debutant') {
  const sector = fishingSector(level), row = guide.rows.find(r => r.biome === biome && r.min === sector.min);
  const target = row?.[skill] ?? null;
  const weakest = ROD_KEYS.reduce((a,b) => up[a] <= up[b] ? a : b);
  const minimum = up[weakest] ?? 0;
  const state = target === null ? 'hard' : minimum >= target ? 'ready' : minimum >= target * .65 ? 'careful' : 'hard';
  return { sector: sector.name, target, weakest: UPGRADE_BY_KEY[weakest].name, minimum, state,
    title: state === 'ready' ? 'Bonne zone pour ton matériel' : state === 'careful' ? 'Possible, mais les erreurs coûteront cher' : 'Une zone à garder pour plus tard' };
}
