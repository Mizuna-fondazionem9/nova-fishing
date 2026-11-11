import type { Adventure } from './adventure';
// Sauvegarde d'un joueur et opérations de jeu PURES (aucun accès réseau ni base ici).
// Le serveur charge la sauvegarde sous verrou, applique une de ces opérations, puis réécrit.
import { hashN, Rng } from './rng';
import { startPort, nearestPort, BIOME_IDS, BIOMES, type BiomeId } from './world';
import { SPECIES, SPECIES_BY_ID, type Species } from './species';
import { bulkOf, priceOf, type Specimen } from './fish';
import { gearOf, gearTier, upgradeCost, zeroLevels, NETS, UPGRADE_BY_KEY, type Levels, type UpgradeKey } from './gear';

export const SAVE_VERSION = 3;

export interface BestiaryEntry {
  n: number;
  maxLen: number;
  maxKg: number;
  first: number;
  biomes: BiomeId[];
  /** Variantes conservées même après vente ; absent dans les anciennes sauvegardes. */
  variants?: Pick<Specimen, "color" | "size" | "tough">[];
}

export interface Stats {
  caught: number;
  escaped: number;
  sold: number;
  earned: number;
  dist: number;
  wrecks: number;
  crits: number;
  legend: number;
  myth: number;
  maxKg: number;
  /** Meilleur rapport difficulté du poisson / niveau de la canne jamais capturé. */
  underdog: number;
  biomes: BiomeId[];
  ports: string[];
  netted: number;
}

export interface DailyState {
  day: string;
  prog: Record<string, number>;
  done: string[];
}

export interface Save {
  adventure?: Adventure;
  kit?: string;
  vessel?: string;
  vessels?: string[];
  paint?: number;
  paints?: number[];
  boatSize?: number;
  cat?: { port: string; at: number; sequence: number };
  treasures?: string[];
  v: number;
  x: number;
  y: number;
  lastPort: string;
  coins: number;
  hull: number;
  up: Levels;
  net: number;
  cargo: Specimen[];
  aquarium: Specimen[];
  bestiary: Record<string, BestiaryEntry>;
  stats: Stats;
  trophies: Record<string, number>;
  daily: DailyState;
  /** Ombres déjà résolues (capturées ou enfuies) pour le créneau en cours. */
  consumed: string[];
  netProgress: number;
  netAt: number;
  syncAt: number;
  createdAt: number;
}

export function newSave(seed: number, now: number): Save {
  const p = startPort(seed);
  const up = zeroLevels();
  return {
    kit:'standard',vessel:'skiff',vessels:['skiff'],paint:0,paints:[0],boatSize:1,treasures:[],
    v: SAVE_VERSION, x: p.x + 0.5, y: p.y + 0.5, lastPort: p.id, coins: 40, hull: gearOf(up).hullMax, up, net: 0,
    cargo: [], aquarium: [], bestiary: {},
    stats: { caught: 0, escaped: 0, sold: 0, earned: 0, dist: 0, wrecks: 0, crits: 0, legend: 0, myth: 0, maxKg: 0, underdog: 0, biomes: [], ports: [p.id], netted: 0 },
    trophies: {}, daily: { day: '', prog: {}, done: [] }, consumed: [], netProgress: 0, netAt: 0, syncAt: now, createdAt: now,
  };
}

/** Complète une sauvegarde ancienne ou partielle avec les valeurs par défaut (compatibilité ascendante). */
export function migrateSave(raw: unknown, seed: number, now: number): Save {
  const base = newSave(seed, now);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Save>;
  const s: Save = { ...base, ...r, up: { ...base.up, ...(r.up ?? {}) }, stats: { ...base.stats, ...(r.stats ?? {}) }, daily: { ...base.daily, ...(r.daily ?? {}) } };
  s.v = SAVE_VERSION;
  s.cargo = (s.cargo ?? []).filter((c) => SPECIES_BY_ID[c.sp]);
  s.aquarium = (s.aquarium ?? []).filter((c) => SPECIES_BY_ID[c.sp]);
  return s;
}

export type Op<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const cargoBulk = (s: Save): number => s.cargo.reduce((a, c) => a + bulkOf(c.kg), 0);
export const holdFree = (s: Save): number => gearOf(s.up,s.vessel,s.kit).hold - cargoBulk(s);

// ---------- Défis du jour (renouvelés chaque jour, récompense bornée) ----------

export interface Challenge {
  id: string;
  kind: 'catch' | 'rare' | 'sell' | 'weight';
  biome?: BiomeId;
  goal: number;
  reward: number;
  label: string;
}

export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function dailyChallenges(day: string, discovered: number): Challenge[] {
  const rng = new Rng(hashN(...day.split('-').map(Number), 4242));
  const reward = (m: number): number => Math.round((120 + 30 * discovered) * m);
  const biome = rng.pick(['coastal', 'temperate', 'coastal', 'tropical', 'reef'] as BiomeId[]);
  const n1 = rng.int(4, 8);
  const n2 = rng.int(2, 4);
  const v = rng.int(2, 6) * 100;
  const kg = rng.int(2, 6) * 5;
  const all: Challenge[] = [
    { id: 'c1', kind: 'catch', goal: n1, reward: reward(1), label: `Capturer ${n1} poissons` },
    rng.chance(0.5)
      ? { id: 'c2', kind: 'rare', goal: n2, reward: reward(1.5), label: `Capturer ${n2} poissons peu communs ou mieux` }
      : { id: 'c2', kind: 'weight', goal: kg, reward: reward(1.3), label: `Remonter ${kg} kg de poisson` },
    rng.chance(0.5)
      ? { id: 'c3', kind: 'sell', goal: v, reward: reward(1.2), label: `Vendre pour ${v} pièces de poisson` }
      : { id: 'c3', kind: 'catch', biome, goal: 3, reward: reward(1.4), label: `Capturer 3 poissons en « ${biomeLabel(biome)} »` },
  ];
  return all;
}
const biomeLabel = (b: BiomeId): string => BIOMES[b].name;

type DailyEvent = { kind: 'catch'; sp: Species; kg: number; biome: BiomeId } | { kind: 'sell'; gain: number };

/** Fait progresser les défis du jour. Renvoie les défis terminés à l'instant (la récompense est créditée ici). */
export function bumpDaily(s: Save, ev: DailyEvent, now: number): Challenge[] {
  const day = dayKey(now);
  if (s.daily.day !== day) s.daily = { day, prog: {}, done: [] };
  const finished: Challenge[] = [];
  for (const c of dailyChallenges(day, Object.keys(s.bestiary).length)) {
    if (s.daily.done.includes(c.id)) continue;
    let add = 0;
    if (ev.kind === 'catch') {
      if (c.kind === 'catch' && (!c.biome || c.biome === ev.biome)) add = 1;
      if (c.kind === 'rare' && ev.sp.rarity >= 1) add = 1;
      if (c.kind === 'weight') add = ev.kg;
    } else if (c.kind === 'sell') add = ev.gain;
    if (!add) continue;
    const p = (s.daily.prog[c.id] ?? 0) + add;
    s.daily.prog[c.id] = Math.round(p * 100) / 100;
    if (p >= c.goal) {
      s.daily.done.push(c.id);
      s.coins += c.reward;
      finished.push(c);
    }
  }
  return finished;
}

// ---------- Trophées ----------

export interface Trophy {
  id: string;
  name: string;
  desc: string;
  test: (s: Save) => boolean;
}
const discovered = (s: Save): number => Object.keys(s.bestiary).length;
export const TROPHIES: Trophy[] = [
  { id: 'premiere_prise', name: 'Première prise', desc: 'Capturer un premier poisson.', test: (s) => s.stats.caught >= 1 },
  { id: 'pecheur_10', name: 'Mousse', desc: 'Capturer 10 poissons.', test: (s) => s.stats.caught >= 10 },
  { id: 'pecheur_100', name: 'Matelot', desc: 'Capturer 100 poissons.', test: (s) => s.stats.caught >= 100 },
  { id: 'pecheur_1000', name: 'Vieux loup de mer', desc: 'Capturer 1 000 poissons.', test: (s) => s.stats.caught >= 1000 },
  { id: 'explorateur_3', name: 'Cabotage', desc: 'Découvrir 3 biomes.', test: (s) => s.stats.biomes.length >= 3 },
  { id: 'explorateur_8', name: 'Tour du monde', desc: 'Découvrir tous les biomes.', test: (s) => s.stats.biomes.length >= BIOME_IDS.length },
  { id: 'poids_50', name: 'Belle pièce', desc: 'Capturer un poisson de 50 kg ou plus.', test: (s) => s.stats.maxKg >= 50 },
  { id: 'poids_500', name: 'Monstre marin', desc: 'Capturer un poisson de 500 kg ou plus.', test: (s) => s.stats.maxKg >= 500 },
  { id: 'poids_5000', name: 'Titan', desc: 'Capturer une créature de 5 tonnes ou plus.', test: (s) => s.stats.maxKg >= 5000 },
  { id: 'legende', name: 'Légende vivante', desc: 'Capturer un poisson légendaire.', test: (s) => s.stats.legend >= 1 },
  { id: 'mythe', name: 'Briseur de mythes', desc: 'Capturer une créature mythique.', test: (s) => s.stats.myth >= 1 },
  { id: 'david', name: 'David', desc: 'Capturer un poisson deux fois plus fort que sa canne.', test: (s) => s.stats.underdog >= 2 },
  { id: 'goliath', name: 'Contre Goliath', desc: 'Capturer un poisson trois fois plus fort que sa canne.', test: (s) => s.stats.underdog >= 3 },
  { id: 'distance_5k', name: 'Au large', desc: 'Parcourir 5 000 tuiles.', test: (s) => s.stats.dist >= 5000 },
  { id: 'distance_50k', name: 'Long-courrier', desc: 'Parcourir 50 000 tuiles.', test: (s) => s.stats.dist >= 50000 },
  { id: 'distance_500k', name: 'Circumnavigateur', desc: 'Parcourir 500 000 tuiles.', test: (s) => s.stats.dist >= 500000 },
  { id: 'bestiaire_10', name: 'Naturaliste', desc: 'Découvrir 10 espèces.', test: (s) => discovered(s) >= 10 },
  { id: 'bestiaire_30', name: 'Ichtyologue', desc: 'Découvrir 30 espèces.', test: (s) => discovered(s) >= 30 },
  { id: 'bestiaire_complet', name: 'Encyclopédie des mers', desc: 'Découvrir toutes les espèces.', test: (s) => discovered(s) >= SPECIES.length },
  { id: 'fortune_10k', name: 'Bon commerçant', desc: 'Gagner 10 000 pièces en vendant du poisson.', test: (s) => s.stats.earned >= 10000 },
  { id: 'fortune_1m', name: 'Armateur', desc: 'Gagner 1 000 000 de pièces en vendant du poisson.', test: (s) => s.stats.earned >= 1000000 },
  { id: 'naufrage', name: 'Naufragé', desc: 'Survivre à un naufrage.', test: (s) => s.stats.wrecks >= 1 },
];

/** Débloque les trophées dont la condition est remplie. Renvoie les nouveaux. */
export function evalTrophies(s: Save, now: number): Trophy[] {
  const out: Trophy[] = [];
  for (const t of TROPHIES)
    if (!s.trophies[t.id] && t.test(s)) {
      s.trophies[t.id] = now;
      out.push(t);
    }
  return out;
}

// ---------- Capture ----------

export interface CatchOutcome {
  stored: boolean;
  record: boolean;
  first: boolean;
}

export function applyCatch(s: Save, spec: Specimen, crits: number, now: number): CatchOutcome {
  const sp = SPECIES_BY_ID[spec.sp];
  const prev = s.bestiary[sp.id];
  const first = !prev;
  const record = !!prev && spec.kg > prev.maxKg;
  const e: BestiaryEntry = prev ?? { n: 0, maxLen: 0, maxKg: 0, first: now, biomes: [] };
  e.variants ??= [];
  // Récupère aussi les prises encore présentes des anciennes sauvegardes.
  for (const f of [...s.cargo, ...s.aquarium, spec]) {
    if (f.sp === spec.sp && !e.variants.some(v => v.color === f.color && v.size === f.size && v.tough === f.tough))
      e.variants.push({ color: f.color, size: f.size, tough: f.tough });
  }
  e.n++;
  e.maxLen = Math.max(e.maxLen, spec.len);
  e.maxKg = Math.max(e.maxKg, spec.kg);
  if (!e.biomes.includes(spec.biome)) e.biomes.push(spec.biome);
  s.bestiary[sp.id] = e;
  s.stats.caught++;
  s.stats.crits += crits;
  s.stats.maxKg = Math.max(s.stats.maxKg, spec.kg);
  if (sp.rarity === 4) s.stats.legend++;
  if (sp.rarity === 5) s.stats.myth++;
  s.stats.underdog = Math.max(s.stats.underdog, Math.round((sp.tier / gearTier(gearOf(s.up,s.vessel,s.kit).rod)) * 100) / 100);
  const stored = bulkOf(spec.kg) <= holdFree(s);
  if (stored) s.cargo.push(spec);
  return { stored, record, first };
}

export function noteBiome(s: Save, biome: BiomeId): void {
  if (!s.stats.biomes.includes(biome)) s.stats.biomes.push(biome);
}

// ---------- Port : vente, améliorations, réparations, aquarium ----------

export function opSell(s: Save, uids: string[] | 'all', from: 'cargo' | 'aquarium' = 'cargo'): Op<{ gain: number; count: number }> {
  const list = from === 'cargo' ? s.cargo : s.aquarium;
  const wanted = uids === 'all' ? null : new Set(uids);
  if (wanted && wanted.size !== (uids as string[]).length) return fail('Sélection invalide.');
  const sold = list.filter((c) => !wanted || wanted.has(c.uid));
  if (wanted && sold.length !== wanted.size) return fail('Un des poissons n’est plus dans la cale.');
  if (!sold.length) return fail('Rien à vendre.');
  // Le prix est TOUJOURS recalculé à partir du spécimen stocké côté serveur.
  const gain = sold.reduce((a, c) => a + priceOf(c), 0);
  const keep = list.filter((c) => wanted && !wanted.has(c.uid));
  if (from === 'cargo') s.cargo = keep;
  else s.aquarium = keep;
  s.coins += gain;
  s.stats.sold += sold.length;
  s.stats.earned += gain;
  return { ok: true, gain, count: sold.length };
}

export function opUpgrade(s: Save, key: UpgradeKey): Op<{ cost: number; level: number }> {
  const def = UPGRADE_BY_KEY[key];
  if (!def) return fail('Amélioration inconnue.');
  const level = s.up[key] ?? 0;
  if (level >= def.max) return fail('Niveau maximal atteint.');
  if (key === 'nets' && s.net === 0) return fail('Achetez d’abord un filet.');
  const cost = upgradeCost(key, level);
  if (s.coins < cost) return fail('Pas assez de pièces.');
  const hullBefore = gearOf(s.up,s.vessel,s.kit).hullMax;
  s.coins -= cost;
  s.up[key] = level + 1;
  if (key === 'hull') s.hull += gearOf(s.up,s.vessel,s.kit).hullMax - hullBefore;
  return { ok: true, cost, level: level + 1 };
}

export function opBuyNet(s: Save, tier: number): Op<{ cost: number }> {
  const def = Number.isInteger(tier) ? NETS[tier] : null;
  if (!def) return fail('Filet inconnu.');
  if (tier <= s.net) return fail('Vous possédez déjà ce filet ou mieux.');
  if (tier !== s.net + 1) return fail('Achetez d’abord le filet précédent.');
  if (s.coins < def.price) return fail('Pas assez de pièces.');
  s.coins -= def.price;
  s.net = tier;
  return { ok: true, cost: def.price };
}

export function opRepair(s: Save): Op<{ cost: number; repaired: number }> {
  const g = gearOf(s.up,s.vessel,s.kit);
  const missing = Math.max(0, g.hullMax - s.hull);
  if (missing <= 0) return fail('La coque est intacte.');
  const affordable = Math.floor(s.coins / g.repairCost);
  const repaired = Math.min(missing, affordable);
  if (repaired <= 0) return fail('Pas assez de pièces.');
  const cost = Math.ceil(repaired * g.repairCost);
  s.coins -= Math.min(cost, s.coins);
  s.hull = Math.min(g.hullMax, s.hull + repaired);
  return { ok: true, cost, repaired };
}

export function opKeep(s: Save, uid: string): Op {
  const i = s.cargo.findIndex((c) => c.uid === uid);
  if (i < 0) return fail('Ce poisson n’est pas dans la cale.');
  if (s.aquarium.length >= gearOf(s.up,s.vessel,s.kit).aquarium) return fail('L’aquarium est plein.');
  s.aquarium.push(s.cargo.splice(i, 1)[0]);
  return { ok: true };
}

export function opRelease(s: Save, uid: string, from: 'cargo' | 'aquarium'): Op {
  const list = from === 'cargo' ? s.cargo : s.aquarium;
  const i = list.findIndex((c) => c.uid === uid);
  if (i < 0) return fail('Poisson introuvable.');
  list.splice(i, 1);
  return { ok: true };
}

// ---------- Coque et naufrage ----------

/** Naufrage : cargaison perdue, retour au port le plus proche. Améliorations, bestiaire et aquarium conservés. */
export function applyShipwreck(s: Save, seed: number): void {
  const p = nearestPort(seed, s.x, s.y);
  s.cargo = [];
  s.x = p.x + 0.5;
  s.y = p.y + 0.5;
  s.lastPort = p.id;
  s.hull = Math.round(gearOf(s.up,s.vessel,s.kit).hullMax * 0.4);
  s.stats.wrecks++;
  s.netProgress = 0;
}

export function applyDamage(s: Save, dmg: number, seed: number): { wrecked: boolean } {
  s.hull = Math.max(0, s.hull - Math.max(0, dmg));
  if (s.hull > 0) return { wrecked: false };
  applyShipwreck(s, seed);
  return { wrecked: true };
}
