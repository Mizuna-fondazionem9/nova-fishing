// Spécimens (individus), variantes procédurales, prix, statistiques de combat et apparition des ombres.
import { Rng, hashN, clamp } from './rng';
import { CHUNK, tileAt, timeOfDay, weatherAt, type BiomeId, type Tile, type TimeOfDay, type Weather } from './world';
import { SPECIES, SPECIES_BY_ID, RARITY_WEIGHT, type Species, type Silhouette, type CursorProfile, type Focus } from './species';

export interface Specimen {
  uid: string;
  sp: string;
  /** Longueur en cm, poids en kg. */
  len: number;
  kg: number;
  /** 0 normal, 1 grand, 2 géant, 3 record. */
  size: number;
  /** 0 normal, 1 albinos, 2 mélanique, 3 doré, 4 irisé. */
  color: number;
  tough: boolean;
  lvl: number;
  value: number;
  at: number;
  biome: BiomeId;
}

export const SIZE_NAMES = ['', 'Grand', 'Géant', 'Record'];
export const COLOR_NAMES = ['', 'Albinos', 'Mélanique', 'Doré', 'Irisé'];
const SIZE_VALUE = [1, 1.25, 1.8, 3];
const COLOR_VALUE = [1, 1.5, 1.5, 3, 6];

/** Bonus régional borné (logarithmique) : niveau 1 -> 0,08 ; 12 -> 0,69 ; 60 -> 1,79. */
export const regionBonus = (lvl: number): number => Math.log(1 + Math.max(0, lvl) / 12);

/** Encombrement en cale : racine du poids, borné. 0,2 kg -> 1 ; 25 kg -> 5 ; 400 kg -> 20 ; plafond 40. */
export const bulkOf = (kg: number): number => clamp(Math.ceil(Math.sqrt(kg)), 1, 40);

export function priceOf(s: Pick<Specimen, 'sp' | 'kg' | 'size' | 'color' | 'tough' | 'lvl'>): number {
  const sp = SPECIES_BY_ID[s.sp];
  if (!sp) return 0;
  const avgLen = sp.lmin + (sp.lmax - sp.lmin) * 0.4;
  const avgKg = sp.kgMax * Math.pow(avgLen / sp.lmax, 3);
  const weightF = clamp(Math.pow(s.kg / avgKg, 0.55), 0.4, 6);
  const price = sp.value * weightF * SIZE_VALUE[s.size] * COLOR_VALUE[s.color] * (s.tough ? 1.3 : 1) * (1 + 0.35 * regionBonus(s.lvl));
  return Math.max(1, Math.round(price));
}

export function rollSpecimen(rng: Rng, sp: Species, lvl: number, biome: BiomeId, now: number, uid: string): Specimen {
  const boost = 1 + regionBonus(lvl);
  const r = rng.next();
  const size = r < 0.0008 * boost ? 3 : r < 0.008 * boost ? 2 : r < 0.05 * boost ? 1 : 0;
  let len = sp.lmin + (sp.lmax - sp.lmin) * Math.pow(rng.next(), 1.5);
  if (size === 1) len = sp.lmax * (1.02 + 0.13 * rng.next());
  if (size === 2) len = sp.lmax * (1.15 + 0.15 * rng.next());
  if (size === 3) len = sp.lmax * (1.32 + 0.18 * rng.next());
  const kg = sp.kgMax * Math.pow(len / sp.lmax, 3) * rng.range(0.9, 1.1);
  const c = rng.next();
  const color = c < 0.001 ? 4 : c < 0.005 ? 3 : c < 0.015 ? 2 : c < 0.025 ? 1 : 0;
  const tough = rng.chance(0.06 + 0.02 * regionBonus(lvl));
  const spec: Specimen = {
    uid, sp: sp.id, len: Math.round(len * 10) / 10, kg: Math.max(0.001, Math.round(kg * 1000) / 1000),
    size, color, tough, lvl: Math.round(lvl * 10) / 10, value: 0, at: now, biome,
  };
  spec.value = priceOf(spec);
  return spec;
}

export interface FightStats {
  stamina: number;
  power: number;
  speed: number;
  zone: number;
  aggr: number;
  profile: CursorProfile;
}

/** Statistiques de combat d'un individu. Le niveau régional renforce surtout le « point fort » de l'espèce. */
export function fightStats(sp: Species, spec: Pick<Specimen, 'len' | 'tough' | 'lvl'>): FightStats {
  const bonus = regionBonus(spec.lvl);
  const sizeF = clamp(spec.len / ((sp.lmin + sp.lmax) / 2), 0.6, 2.2);
  const f = (k: Focus): number => 1 + (sp.focus === k ? 0.5 : 0.15) * bonus;
  return {
    stamina: 84 * Math.pow(sp.tier, 0.8) * sp.stam * Math.pow(sizeF, 0.8) * (spec.tough ? 1.35 : 1) * f('endurant'),
    power: 6.5 * Math.pow(sp.tier, 0.92) * sp.pow * Math.pow(sizeF, 0.5) * (spec.tough ? 1.15 : 1) * f('puissant'),
    speed: Math.min(2.6, (0.6 + 0.1 * Math.pow(sp.tier, 0.62)) * sp.spd * Math.sqrt(f('vif'))),
    zone: clamp((0.25 - 0.0035 * sp.tier) / Math.sqrt(f('ruse')), 0.1, 0.25),
    aggr: sp.aggr,
    profile: sp.profile,
  };
}

function weightOf(sp: Species, tile: Tile, tod: TimeOfDay, weather: Weather): number {
  if (!sp.biomes.includes(tile.biome)) return 0;
  if (tile.depth < sp.dmin - 0.05 || tile.depth > sp.dmax + 0.05) return 0;
  let w = RARITY_WEIGHT[sp.rarity] * (sp.ancient ? 0.18 : 1);
  if (sp.rarity >= 2) w *= 1 + 0.6 * regionBonus(tile.level);
  if (sp.prefs.time) w *= sp.prefs.time === tod ? 2.5 : 0.35;
  if (sp.prefs.weather) w *= sp.prefs.weather === weather ? 2.5 : 0.5;
  return w;
}

/** Tire une espèce pour une tuile. Si `sil` est fourni, seules les espèces de cette silhouette sont candidates. */
export function pickSpecies(rng: Rng, tile: Tile, tod: TimeOfDay, weather: Weather, sil?: Silhouette, excludeCrabs = false): Species | null {
  const items: Species[] = [];
  const weights: number[] = [];
  for (const sp of SPECIES) {
    if (sil && sp.sil !== sil) continue;
    if (excludeCrabs && sp.sil === 'crab') continue;
    const w = weightOf(sp, tile, tod, weather);
    if (w > 0) {
      items.push(sp);
      weights.push(w);
    }
  }
  return items.length ? rng.weighted(items, weights) : null;
}

// --- Ombres : ce que le joueur voit dans l'eau ---

/** Les ombres d'un chunk sont redistribuées à chaque créneau de 5 minutes. */
export const SLOT_MS = 5 * 60 * 1000;
export const slotOf = (ms: number): number => Math.floor(ms / SLOT_MS);

export interface Shadow {
  key: string;
  cx: number;
  cy: number;
  slot: number;
  idx: number;
  x: number;
  y: number;
  sil: Silhouette;
  size: number;
  seed: number;
  school: number;
  biome: BiomeId;
  depth: number;
}

export const shadowKey = (cx: number, cy: number, slot: number, idx: number): string => `${cx},${cy},${slot},${idx}`;

/**
 * Ombres d'un chunk pour un créneau donné. Fonction pure : le client les affiche,
 * le serveur les recalcule pour vérifier qu'un lancer vise une ombre qui existe vraiment.
 * Seule la SILHOUETTE est publique : l'espèce exacte est tirée côté serveur avec un sel secret.
 */
function rawShadows(seed: number, cx: number, cy: number, slot: number): Shadow[] {
  const out: Shadow[] = [];
  const base = hashN(seed, cx, cy, slot);
  const n = 2 + (base % 4);
  const ms = slot * SLOT_MS;
  for (let i = 0; i < n; i++) {
    const rng = new Rng(hashN(base, i, 991));
    const x = cx * CHUNK + 1 + rng.next() * (CHUNK - 2);
    const y = cy * CHUNK + 1 + rng.next() * (CHUNK - 2);
    const t = tileAt(seed, Math.floor(x), Math.floor(y));
    if (t.land || t.shore < 0.12) continue;
    const sp = pickSpecies(rng, t, timeOfDay(ms), weatherAt(seed, ms, x, y));
    if (!sp) continue;
    out.push({
      key: shadowKey(cx, cy, slot, i), cx, cy, slot, idx: i, x, y, sil: sp.sil,
      size: rng.next(), seed: rng.int(1, 1_000_000_000), school: sp.sil === 'small' ? rng.int(1, 5) : 1,
      biome: t.biome, depth: t.depth,
    });
  }
  return out;
}

/** Un minimum de 22 tuiles entre crabes, y compris aux frontières des chunks.
 * Priorité déterministe : même verdict sur le client et le serveur, sans état partagé.
 * Les candidats écartés deviennent des poissons : on conserve le nombre d'ombres.
 */
export const CRAB_SPACING = 22;
export function spawnShadows(seed: number, cx: number, cy: number, slot: number): Shadow[] {
  const raw = rawShadows(seed,cx,cy,slot);
  if (!raw.some(s => s.sil === 'crab')) return raw;
  const neighbors: Shadow[] = [];
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++)
    neighbors.push(...rawShadows(seed,cx+dx,cy+dy,slot).filter(s => s.sil === 'crab'));
  const priority = (s: Shadow) => hashN(seed,s.cx,s.cy,slot,s.idx,717);
  return raw.flatMap(s => {
    if (s.sil !== 'crab' || !neighbors.some(o => o.key !== s.key && Math.hypot(o.x-s.x,o.y-s.y)<CRAB_SPACING &&
        (priority(o)<priority(s) || (priority(o)===priority(s) && o.key<s.key)))) return [s];
    const rng = new Rng(hashN(seed,s.cx,s.cy,slot,s.idx,818));
    const tile = tileAt(seed,Math.floor(s.x),Math.floor(s.y));
    const sp = pickSpecies(rng,tile,timeOfDay(slot*SLOT_MS),weatherAt(seed,slot*SLOT_MS,s.x,s.y),undefined,true);
    return sp ? [{...s,sil:sp.sil,school:sp.sil==='small' ? rng.int(1,5) : 1}] : [];
  });
}

/** Côté serveur : espèce réelle d'une ombre, parmi celles qui partagent sa silhouette. */
export function speciesForShadow(secret: Rng, seed: number, sh: Shadow): { sp: Species; tile: Tile } | null {
  const tile = tileAt(seed, Math.floor(sh.x), Math.floor(sh.y));
  const ms = sh.slot * SLOT_MS;
  const sp = pickSpecies(secret, tile, timeOfDay(ms), weatherAt(seed, ms, sh.x, sh.y), sh.sil);
  return sp ? { sp, tile } : null;
}
