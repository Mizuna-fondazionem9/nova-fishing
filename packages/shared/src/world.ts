// Monde procédural : tout est une fonction pure de (seed, coordonnées).
// Rien n'est stocké : un chunk déchargé se régénère à l'identique.
import { rand2, vnoise, fbm, clamp, hashN } from './rng';

export const TILE = 16; // pixels d'art par tuile
export const CHUNK = 32; // tuiles par côté de chunk
export const CELL = 160; // tuiles par côté de « cellule de port » (un port garanti par cellule)

export type BiomeId = 'coastal' | 'tropical' | 'reef' | 'temperate' | 'polar' | 'deep' | 'abyss' | 'mystic' | 'volcanic' | 'crystal' | 'spectral' | 'river';
export const BIOME_IDS: BiomeId[] = ['coastal', 'tropical', 'reef', 'temperate', 'polar', 'deep', 'abyss', 'mystic', 'volcanic', 'crystal', 'spectral', 'river'];

export const BIOMES: Record<BiomeId, { name: string; danger: number; desc: string }> = {
  river: { name: 'Rivières insulaires', danger: 0.05, desc: 'Bras d’eau douce au milieu de grandes îles.' },
  volcanic: { name: 'Océan volcanique', danger: 0.75, desc: 'Eaux rouges chargées de cendres et de braises.' },
  crystal: { name: 'Mer de cristal', danger: 0.5, desc: 'Reflets turquoise et récifs de quartz lumineux.' },
  spectral: { name: 'Mer spectrale', danger: 0.95, desc: 'Des eaux vertes où dansent des lueurs fantômes.' },
  coastal: { name: 'Eaux côtières', danger: 0, desc: 'Hauts-fonds calmes près des îles.' },
  tropical: { name: 'Mer tropicale', danger: 0.2, desc: 'Eaux chaudes et grands pélagiques.' },
  reef: { name: 'Récifs coralliens', danger: 0.1, desc: 'Labyrinthes de corail grouillants de vie.' },
  temperate: { name: 'Océan tempéré', danger: 0.15, desc: 'Le grand large, poissonneux et changeant.' },
  polar: { name: 'Eaux polaires', danger: 0.4, desc: 'Mers glacées et prédateurs patients.' },
  deep: { name: 'Océan profond', danger: 0.6, desc: 'Le bleu sombre où la lumière se perd.' },
  abyss: { name: 'Fosses abyssales', danger: 0.9, desc: 'Failles sans fond, créatures sans soleil.' },
  mystic: { name: 'Eaux mystérieuses', danger: 1, desc: 'Au-delà des cartes. Rien n’y est ordinaire.' },
};

export interface Port {
  id: string;
  cx: number;
  cy: number;
  /** Tuile du quai (eau) où accoste le bateau. */
  x: number;
  y: number;
  /** Centre et rayon de l'îlot. */
  ix: number;
  iy: number;
  r: number;
  name: string;
}

export interface Tile {
  land: boolean;
  /** Hauteur : > 0 terre, <= 0 eau. */
  h: number;
  /** 0 au rivage, 1 loin de toute terre. */
  shore: number;
  /** Profondeur normalisée 0..1. */
  depth: number;
  /** Température 0 (polaire) .. 1 (tropicale). */
  temp: number;
  biome: BiomeId;
  /** Niveau régional : croît avec l'éloignement du port de départ. */
  level: number;
}

const LAND_T = 0.678;
const PORT_MARGIN = 34;

function baseHeight(seed: number, x: number, y: number): number {
  const n = fbm(seed + 11, x / 46, y / 46, 4);
  const arch = fbm(seed + 12, x / 190, y / 190, 2);
  return n + (arch - 0.5) * 0.22 - LAND_T;
}

/** Hauteur en tenant compte d'un îlot de port donné (creuse un anneau d'eau autour). */
function heightWithPort(seed: number, x: number, y: number, ix: number, iy: number, r: number): number {
  let hn = baseHeight(seed, x, y);
  const d = Math.hypot(x - ix, y - iy);
  if (d > r + 12) return hn;
  hn = Math.min(hn, -0.03 - (r + 12 - d) * 0.004);
  const wob = (vnoise(seed + 24, x / 3.1, y / 3.1) - 0.5) * 2.4;
  const hb = (r - d - wob) / 26;
  return Math.max(hn, hb);
}

const SYL_A = ['Ker', 'Mor', 'Lan', 'Tre', 'Pen', 'Ros', 'Bel', 'Sol', 'Val', 'Cor', 'Nor', 'Sal', 'Mar', 'Bri', 'Gal', 'Ys', 'Tor', 'Fal'];
const SYL_B = ['a', 'e', 'i', 'o', 'an', 'en', 'ou', 'ar', 'el', 'is'];
const SYL_C = ['vik', 'mer', 'dor', 'lune', 'gat', 'nec', 'zel', 'rade', 'mont', 'bay', 'houle', 'cap', 'ven', 'drac'];

const portCache = new Map<string, Port>();

function computePort(seed: number, cx: number, cy: number): Port {
  let best = { px: 0, py: 0, open: -1 };
  for (let k = 0; k < 8; k++) {
    const px = Math.floor(cx * CELL + PORT_MARGIN + rand2(seed + 21 + k * 7, cx, cy) * (CELL - 2 * PORT_MARGIN));
    const py = Math.floor(cy * CELL + PORT_MARGIN + rand2(seed + 22 + k * 7, cx, cy) * (CELL - 2 * PORT_MARGIN));
    let open = 0;
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      for (const d of [22, 36]) if (baseHeight(seed, px + Math.cos(ang) * d, py + Math.sin(ang) * d) < -0.02) open++;
    }
    if (open > best.open) best = { px, py, open };
    if (open === 16) break;
  }
  const r = 5.5 + rand2(seed + 23, cx, cy) * 3;
  const { px, py } = best;
  let ty = py + 1;
  while (ty < py + 30 && heightWithPort(seed, px, ty, px, py, r) > 0) ty++;
  const h = hashN(seed, cx, cy, 77);
  const name =
    cx === 0 && cy === 0
      ? 'Port-Nova'
      : 'Port-' + SYL_A[h % SYL_A.length] + SYL_B[(h >>> 8) % SYL_B.length] + SYL_C[(h >>> 16) % SYL_C.length];
  return { id: `${cx}:${cy}`, cx, cy, x: px, y: ty + 1, ix: px, iy: py, r, name };
}

export function getPort(seed: number, cx: number, cy: number): Port {
  const key = `${seed}:${cx}:${cy}`;
  let p = portCache.get(key);
  if (!p) {
    if (portCache.size > 5000) portCache.clear();
    p = computePort(seed, cx, cy);
    portCache.set(key, p);
  }
  return p;
}

export function portById(seed: number, id: string): Port | null {
  const m = /^(-?\d+):(-?\d+)$/.exec(id);
  return m ? getPort(seed, Number(m[1]), Number(m[2])) : null;
}

/** Port de départ : celui de la cellule (0, 0). */
export const startPort = (seed: number): Port => getPort(seed, 0, 0);

/** Grandes îles rares, éloignées du départ. Les ports existants gardent leur bassin. */
export function islandFeature(seed: number, x: number, y: number): { h: number; river: boolean } | null {
  const cell = 480, cx = Math.floor(x/cell), cy = Math.floor(y/cell);
  if (rand2(seed+310,cx,cy) > 0.22) return null;
  const ix = cx*cell+240+(rand2(seed+311,cx,cy)-0.5)*80;
  const iy = cy*cell+240+(rand2(seed+312,cx,cy)-0.5)*80;
  const start = startPort(seed);
  if (Math.hypot(ix-start.x,iy-start.y)<1200) return null;
  const radius = 48+rand2(seed+313,cx,cy)*20;
  const dx = x-ix, dy = y-iy;
  const d = Math.hypot(dx,dy/0.8);
  if (d > radius+14) return null;
  const port = getPort(seed,Math.floor(x/CELL),Math.floor(y/CELL));
  if (Math.hypot(x-port.ix,y-port.iy)<port.r+18) return null;
  const channel = iy+Math.sin(dx/24)*7;
  const river = Math.abs(y-channel)<4.2 && Math.abs(dx)<radius+14;
  return { h: river ? -0.1 : (radius-d)/45, river };
}

export function heightAt(seed: number, x: number, y: number): number {
  const p = getPort(seed, Math.floor(x / CELL), Math.floor(y / CELL));
  const base = heightWithPort(seed,x,y,p.ix,p.iy,p.r);
  const feature = islandFeature(seed,x,y);
  return feature ? (feature.river ? feature.h : Math.max(base,feature.h)) : base;
}

export const isLand = (seed: number, tx: number, ty: number): boolean => heightAt(seed, tx, ty) > 0;

export function levelAt(seed: number, x: number, y: number): number {
  const o = startPort(seed);
  return 1 + Math.pow(Math.hypot(x - o.x, y - o.y) / 260, 0.8);
}

export function tileAt(seed: number, tx: number, ty: number): Tile {
  const h = heightAt(seed, tx, ty);
  const o = startPort(seed);
  const dist = Math.hypot(tx - o.x, ty - o.y);
  const level = 1 + Math.pow(dist / 260, 0.8);
  // Zone d'apprentissage : autour du port de départ, climat tempéré et faibles profondeurs.
  const nearT = clamp((dist - 150) / 500, 0, 1);
  const nearD = clamp(dist / 450, 0, 1);
  const temp = 0.5 + (clamp((fbm(seed + 15, tx / 380, ty / 380, 2) - 0.5) * 2.4 + 0.5, 0, 1) - 0.5) * nearT;
  if (h > 0) return { land: true, h, shore: 0, depth: 0, temp, biome: 'coastal', level };

  if (islandFeature(seed,tx,ty)?.river) return {land:false,h,shore:1,depth:0.22,temp,biome:'river',level};
  const shore = clamp(-h / 0.17, 0, 1);
  const basin = clamp((fbm(seed + 13, tx / 240, ty / 240, 3) - 0.5) * 3 + 0.5, 0, 1);
  const depth = shore * (0.3 + 0.7 * basin) * (0.35 + 0.65 * nearD);

  let biome: BiomeId;
  const warm = temp > 0.66;
  const cold = temp < 0.22;
  if (dist > 1800 && fbm(seed + 16, tx / 260, ty / 260, 2) > 0.64) biome = 'mystic';
  else if (dist > 600 && depth > 0.6 && 1 - Math.abs(fbm(seed + 14, tx / 150, ty / 150, 2) - 0.5) * 2 > 0.9) biome = 'abyss';
  else if (cold && depth <= 0.82) biome = 'polar';
  else if (depth > 0.62) biome = 'deep';
  else if (warm && shore < 0.55 && vnoise(seed + 17, tx / 9, ty / 9) > 0.35) biome = 'reef';
  else if (depth < 0.28 || shore < 0.4) biome = 'coastal';
  else if (warm) biome = 'tropical';
  else biome = 'temperate';
  // Ajouter des provinces marines sans déplacer terres, ports ni zone de départ.
  if (dist > 900 && shore > 0.4 && fbm(seed+141,tx/210,ty/210,2)>0.59) {
    const realm = vnoise(seed+142,tx/430,ty/430);
    biome = realm < 0.36 ? 'volcanic' : realm > 0.64 ? 'spectral' : 'crystal';
  }
  return { land: false, h, shore, depth, temp, biome, level };
}

export function nearestPort(seed: number, x: number, y: number): Port {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = getPort(seed, cx, cy);
  let bd = Math.hypot(best.x - x, best.y - y);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const p = getPort(seed, cx + dx, cy + dy);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  return best;
}

export const PORT_RANGE = 5;

/** Port à portée d'accostage, ou null. */
export function portInRange(seed: number, x: number, y: number): Port | null {
  const p = nearestPort(seed, x, y);
  return Math.hypot(p.x + 0.5 - x, p.y + 0.5 - y) <= PORT_RANGE ? p : null;
}

/** Profondeur affichée en mètres (purement indicatif). */
export const depthMeters = (depth: number): number => Math.round(3 + Math.pow(depth, 2.2) * 6000);

// --- Temps et météo (déterministes : dérivés de l'horloge et du seed) ---

export const DAY_MS = 24 * 60 * 1000;
export type TimeOfDay = 'aube' | 'jour' | 'crepuscule' | 'nuit';

export function timeOfDay(ms: number): TimeOfDay {
  const p = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  return p < 0.08 ? 'aube' : p < 0.55 ? 'jour' : p < 0.63 ? 'crepuscule' : 'nuit';
}

/** Luminosité 0 (nuit noire) .. 1 (plein jour), en transitions douces. */
export function daylight(ms: number): number {
  const p = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  if (p < 0.08) return p / 0.08;
  if (p < 0.55) return 1;
  if (p < 0.63) return 1 - (p - 0.55) / 0.08;
  return 0;
}

export type Weather = 'clair' | 'brume' | 'pluie' | 'orage';
export const WEATHER_MS = 3 * 60 * 1000;

export function weatherAt(seed: number, ms: number, x: number, y: number): Weather {
  const bucket = Math.floor(ms / WEATHER_MS);
  const region = hashN(Math.floor(x / 400), Math.floor(y / 400));
  const r = rand2(seed + 31, bucket, region);
  return r < 0.55 ? 'clair' : r < 0.7 ? 'brume' : r < 0.9 ? 'pluie' : 'orage';
}
