// Améliorations du bateau, de la canne et de l'aquarium.
// Principe : effets à rendement décroissant, coûts polynomiaux (jamais exponentiels), niveau plafonné.

export type UpgradeKey =
  | 'speed' | 'accel' | 'hull' | 'hold' | 'nets' | 'repair'
  | 'rodPower' | 'rodRes' | 'reel' | 'line' | 'recovery' | 'precision'
  | 'aquarium';

export interface UpgradeDef {
  key: UpgradeKey;
  group: 'boat' | 'rod' | 'aquarium';
  name: string;
  desc: string;
  cost0: number;
  max: number;
  effect: (level: number) => number;
  fmt: (value: number) => string;
}

const sat = (n: number, k: number): number => n / (n + k); // 0 -> 0, infini -> 1
const f1 = (v: number): string => (Math.round(v * 10) / 10).toString().replace('.', ',');
const pct = (v: number): string => `+${Math.round(v * 100)} %`;

export const MAX_LEVEL = 200;

export const UPGRADES: UpgradeDef[] = [
  { key: 'speed', group: 'boat', name: 'Voilure', desc: 'Vitesse maximale du bateau.', cost0: 80, max: MAX_LEVEL, effect: (n) => 4.6 * (1 + 1.6 * sat(n, 25)), fmt: (v) => `${f1(v)} tuiles/s` },
  { key: 'accel', group: 'boat', name: 'Gréement', desc: 'Accélération et freinage.', cost0: 50, max: MAX_LEVEL, effect: (n) => 3 * (1 + 2 * sat(n, 15)), fmt: (v) => `${f1(v)} tuiles/s²` },
  { key: 'hull', group: 'boat', name: 'Coque', desc: 'Points de coque : encaisse les attaques.', cost0: 60, max: MAX_LEVEL, effect: (n) => Math.round(100 + 22 * Math.pow(n, 0.8)), fmt: (v) => `${v} PC` },
  { key: 'hold', group: 'boat', name: 'Cale', desc: 'Capacité de stockage, en unités d’encombrement.', cost0: 70, max: MAX_LEVEL, effect: (n) => Math.round(20 + 5 * Math.pow(n, 0.85)), fmt: (v) => `${v} unités` },
  { key: 'nets', group: 'boat', name: 'Maillage des filets', desc: 'Rendement des filets (nécessite un filet).', cost0: 90, max: MAX_LEVEL, effect: (n) => 1 + 1.5 * sat(n, 20), fmt: (v) => `×${f1(v)}` },
  { key: 'repair', group: 'boat', name: 'Atelier de bord', desc: 'Réduit le prix des réparations.', cost0: 40, max: MAX_LEVEL, effect: (n) => 2 * (1 - 0.7 * sat(n, 15)), fmt: (v) => `${f1(v)} or / PC` },
  { key: 'rodPower', group: 'rod', name: 'Puissance de la canne', desc: 'Fatigue infligée au poisson à chaque coup réussi.', cost0: 60, max: MAX_LEVEL, effect: (n) => 10 * (1 + 0.18 * Math.pow(n, 0.7)), fmt: f1 },
  { key: 'rodRes', group: 'rod', name: 'Résistance de la canne', desc: 'Réduit l’usure de la ligne face aux poissons puissants.', cost0: 60, max: MAX_LEVEL, effect: (n) => 10 * (1 + 0.3 * Math.pow(n, 0.8)), fmt: f1 },
  { key: 'line', group: 'rod', name: 'Solidité de la ligne', desc: 'Résistance initiale de la ligne.', cost0: 50, max: MAX_LEVEL, effect: (n) => Math.round(100 * (1 + 0.16 * Math.pow(n, 0.75))), fmt: (v) => `${v}` },
  { key: 'reel', group: 'rod', name: 'Moulinet', desc: 'Amortit la tension des erreurs et allonge un peu le ferrage.', cost0: 45, max: MAX_LEVEL, effect: (n) => 1 + 1.2 * sat(n, 18), fmt: (v) => `×${f1(v)}` },
  { key: 'recovery', group: 'rod', name: 'Récupération', desc: 'Bonus de fatigue sur les coups réussis à la suite.', cost0: 55, max: MAX_LEVEL, effect: (n) => sat(n, 20), fmt: pct },
  { key: 'precision', group: 'rod', name: 'Guides de précision', desc: 'Élargit la zone de réussite ; pour les crabes, agrandit les cibles et allonge le délai parfait.', cost0: 70, max: MAX_LEVEL, effect: (n) => 0.25 * sat(n, 15), fmt: pct },
  { key: 'aquarium', group: 'aquarium', name: 'Bassins d’aquarium', desc: 'Nombre d’emplacements d’exposition.', cost0: 150, max: 30, effect: (n) => 4 + 2 * n, fmt: (v) => `${v} places` },
];

export const UPGRADE_BY_KEY = Object.fromEntries(UPGRADES.map((u) => [u.key, u])) as Record<UpgradeKey, UpgradeDef>;
export const UPGRADE_KEYS = UPGRADES.map((u) => u.key);

/** Prix pour passer de `level` à `level + 1`. Polynomial : ~n^1,85, sans risque de dépassement. */
export function upgradeCost(key: UpgradeKey, level: number): number {
  const d = UPGRADE_BY_KEY[key];
  return Math.round(d.cost0 * Math.pow(level + 1, 1.85) * (1 + level / 40));
}

export interface RodStats {
  power: number;
  resistance: number;
  line: number;
  reel: number;
  recovery: number;
  precision: number;
}

export interface Gear {
  speed: number;
  accel: number;
  hullMax: number;
  hold: number;
  netEff: number;
  repairCost: number;
  aquarium: number;
  rod: RodStats;
}

export type Levels = Record<UpgradeKey, number>;
export const zeroLevels = (): Levels => Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 0])) as Levels;

export const VESSELS = [
  {id:'skiff',name:'Barque Nova',price:0,speed:1,hold:1,hull:1,desc:'Polyvalente et légère.'},
  {id:'cutter',name:'Cotre rapide',price:2500,speed:1.18,hold:0.85,hull:0.9,desc:'Plus rapide, mais moins de cale et une coque légère.'},
  {id:'sailboat',name:'Grand voilier',price:8000,speed:1.05,hold:1.35,hull:0.95,desc:'Une grande cale et une bonne allure, coque un peu plus fragile.'},
  {id:'trawler',name:'Bateau de pêche',price:25000,speed:0.78,hold:2,hull:1.4,desc:'Double stockage et coque robuste, vitesse réduite.'},
] as const;
export const PAINTS = ['#e4d3a1','#b15f50','#5792aa','#658d66','#9c78b9','#343d55'];

export function gearOf(up: Levels, vessel = 'skiff'): Gear {
  const model = VESSELS.find(v=>v.id===vessel) ?? VESSELS[0];
  const e = (k: UpgradeKey): number => UPGRADE_BY_KEY[k].effect(up[k] ?? 0);
  return {
    speed: e('speed')*model.speed,
    accel: e('accel'),
    hullMax: Math.round(e('hull')*model.hull),
    hold: Math.max(1,Math.round(e('hold')*model.hold)),
    netEff: e('nets'),
    repairCost: e('repair'),
    aquarium: e('aquarium'),
    rod: { power: e('rodPower'), resistance: e('rodRes'), line: e('line'), reel: e('reel'), recovery: e('recovery'), precision: e('precision') },
  };
}

/** Niveau de difficulté qu'une canne affronte « à armes égales » (pression = 1). */
export const gearTier = (rod: RodStats): number => Math.pow(rod.resistance / 6.5, 1 / 0.92);

export interface NetDef {
  name: string;
  desc: string;
  price: number;
  /** Difficulté maximale des poissons capturables. */
  maxTier: number;
  yield: number;
}
/** Index 0 = pas de filet. Les filets ne prennent que de petits poissons communs ou peu communs. */
export const NETS: (NetDef | null)[] = [
  null,
  { name: 'Filet simple', desc: 'Ramasse le menu fretin en route.', price: 600, maxTier: 2.2, yield: 1 },
  { name: 'Filet renforcé', desc: 'Mailles solides, prises plus variées.', price: 6000, maxTier: 3.6, yield: 1.6 },
  { name: 'Chalut', desc: 'Le haut de gamme de la pêche en route.', price: 40000, maxTier: 5.5, yield: 2.4 },
];
export const NET_COOLDOWN_MS = 45_000;
/** Distance « utile » à parcourir (en tuiles) entre deux relevés de filet. */
export const NET_DISTANCE = 140;
