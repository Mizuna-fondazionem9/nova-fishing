// Cœur du gameplay : scénario de touche puis combat à la jauge.
// Le combat est une simulation DÉTERMINISTE à pas fixe (60 Hz) : le client la joue en direct,
// le serveur la rejoue à partir de la liste des appuis pour décider lui-même du résultat.
import { Rng } from './rng';
import type { Species, BiteStyle, CursorProfile } from './species';
import type { FightStats } from './fish';
import type { RodStats } from './gear';

export const TICK_HZ = 60;
export const MAX_COMBAT_TICKS = 240 * TICK_HZ;

// ---------- Touche ----------

export type BiteKind = 'approach' | 'nibble' | 'feint' | 'bite' | 'leave';
export interface BiteEvent {
  /** Millisecondes depuis l'arrivée du bouchon dans l'eau. */
  t: number;
  kind: BiteKind;
}
export interface BiteScript {
  events: BiteEvent[];
  /** Durée de la fenêtre de ferrage (ms) après la vraie morsure. */
  window: number;
  biteAt: number | null;
  end: number;
}

const BITE: Record<BiteStyle, { wait: [number, number]; nibbles: [number, number]; feints: [number, number]; ignore: number; window: number }> = {
  franc: { wait: [1.5, 4], nibbles: [0, 1], feints: [0, 0], ignore: 0.05, window: 900 },
  prudent: { wait: [3, 6.5], nibbles: [1, 3], feints: [0, 1], ignore: 0.2, window: 800 },
  joueur: { wait: [2, 4.5], nibbles: [0, 1], feints: [2, 3], ignore: 0.1, window: 680 },
  vorace: { wait: [0.8, 2.2], nibbles: [0, 0], feints: [0, 0], ignore: 0.03, window: 560 },
  timide: { wait: [4.5, 8], nibbles: [1, 2], feints: [0, 1], ignore: 0.3, window: 1000 },
};

export function makeBiteScript(rng: Rng, sp: Species, reel: number): BiteScript {
  const st = BITE[sp.bite];
  let t = rng.range(st.wait[0], st.wait[1]) * 1000;
  const events: BiteEvent[] = [{ t: Math.round(t), kind: 'approach' }];
  if (rng.chance(st.ignore)) {
    if (rng.chance(0.5)) {
      t += rng.range(900, 1800);
      events.push({ t: Math.round(t), kind: 'nibble' });
    }
    t += rng.range(1500, 3000);
    events.push({ t: Math.round(t), kind: 'leave' });
    return { events, window: 0, biteAt: null, end: Math.round(t) };
  }
  const pre: BiteKind[] = [];
  for (let i = rng.int(st.nibbles[0], st.nibbles[1]); i > 0; i--) pre.push('nibble');
  for (let i = rng.int(st.feints[0], st.feints[1]); i > 0; i--) pre.push('feint');
  for (let i = pre.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pre[i], pre[j]] = [pre[j], pre[i]];
  }
  for (const kind of pre) {
    t += rng.range(900, 2200);
    events.push({ t: Math.round(t), kind });
  }
  t += rng.range(1100, 2600);
  const biteAt = Math.round(t);
  events.push({ t: biteAt, kind: 'bite' });
  // Le moulinet allonge un peu la fenêtre (au plus +22 %), les espèces difficiles la raccourcissent.
  const window = Math.round(Math.max(380, st.window - sp.tier * 8) * (1 + 0.1 * (reel - 1)));
  return { events, window, biteAt, end: biteAt + window + 1200 };
}

export type HookVerdict = 'ok' | 'early' | 'late' | 'none';
export function judgeHook(script: BiteScript, elapsedMs: number): HookVerdict {
  if (script.biteAt === null) return 'none';
  if (elapsedMs < script.biteAt) return 'early';
  if (elapsedMs > script.biteAt + script.window) return 'late';
  return 'ok';
}

// ---------- Combat ----------

export interface CombatParams {
  seed: number;
  mode?: 'crab';
  crabPrecision?: number;
  profile: CursorProfile;
  /** Vitesse du curseur en longueurs de jauge par seconde. */
  speed: number;
  /** Largeur de la zone de réussite (0..1) et part centrale critique. */
  zone: number;
  crit: number;
  stamina: number;
  line: number;
  /** Usure passive de la ligne par seconde. */
  drain: number;
  missTension: number;
  hit: number;
  critMult: number;
  combo: number;
  aggr: number;
}

export function makeCombatParams(f: FightStats, rod: RodStats, seed: number): CombatParams {
  // Usure passive : croît avec la puissance du poisson, freinée par la résistance de la canne.
  const drain = (0.677 * Math.pow(f.power, 0.9)) / Math.pow(rod.resistance, 0.4);
  return {
    seed: seed >>> 0,
    profile: f.profile,
    speed: f.speed,
    zone: Math.min(0.3, f.zone * (1 + rod.precision)),
    crit: 0.3,
    stamina: f.stamina,
    line: rod.line,
    // L'usure minimale garantit qu'aucun combat ne dépasse ~2 minutes.
    drain: Math.max(drain, rod.line / 110),
    missTension: (4 + f.power * 0.9) / rod.reel,
    hit: rod.power,
    critMult: 1.75,
    combo: rod.recovery,
    aggr: f.aggr,
  };
}

export type TapResult = 'crit' | 'hit' | 'miss' | 'locked';
// Anti-rebond : 3 ticks (50 ms), imperceptible. Il n'absorbe que les doubles déclenchements matériels
// (toucher + clic simulé) ; il ne bloque jamais un appui volontaire.
const LOCK_TICKS = 3;
// Juste après un coup réussi la zone se déplace : pendant 6 ticks (0,1 s), un appui qui tomberait à côté
// est ignoré sans pénalité (double-clic involontaire). Un appui DANS la nouvelle zone compte normalement.
const GRACE_TICKS = 6;

export class Combat {
  targetX = 0.5;
  targetY = 0.5;
  targetAt = 0;
  targetId = 0;
  get targetRadius(): number { return 0.095 + Math.min(0.25, Math.max(0, this.p.crabPrecision ?? 0)) * 0.08; }
  get perfectMs(): number { return 340 * (1 + 2 * Math.min(0.25, Math.max(0, this.p.crabPrecision ?? 0))); }
  private crabTarget(initial = false): void {
    this.targetX = 0.14 + this.rng.next() * 0.72;
    this.targetY = 0.14 + this.rng.next() * 0.72;
    this.targetAt = this.tick + (initial ? 0 : Math.round(12 + this.rng.next() * 18));
    this.targetId++;
  }
  tick = 0;
  phase: number;
  pos = 0;
  zoneC = 0.5;
  fish: number;
  line: number;
  state: 'run' | 'win' | 'lose' = 'run';
  lock = 0;
  comboN = 0;
  /** Coups critiques enchaînés (remis à zéro par un coup simple ou raté). Sert aux effets, pas au calcul. */
  streak = 0;
  private grace = 0;
  /** Ticks restants de « rush » du poisson (curseur plus rapide, ligne qui s'use plus vite). */
  rush = 0;
  /** Vrai pendant la demi-seconde qui précède un rush : l'interface l'annonce. */
  warn = false;
  crits = 0;
  hits = 0;
  misses = 0;
  last: TapResult | null = null;
  private nextRush: number;
  private erraticMul = 1;
  private erraticLeft = 0;
  private rng: Rng;

  constructor(public readonly p: CombatParams) {
    this.rng = new Rng(p.seed);
    this.phase = this.rng.next() * 2;
    this.pos = this.phase < 1 ? this.phase : 2 - this.phase;
    this.fish = p.stamina;
    this.line = p.line;
    this.zoneC = this.newZone();
    this.nextRush = this.rushDelay();
    if (p.mode === 'crab') this.crabTarget(true);
  }

  private rushDelay(): number {
    if (this.p.aggr <= 0.05) return 1e9;
    return Math.round(((4 + this.rng.next() * 4) / (0.4 + this.p.aggr)) * TICK_HZ);
  }

  private newZone(): number {
    const m = this.p.zone / 2 + 0.04;
    let c = 0.5;
    for (let i = 0; i < 4; i++) {
      c = m + this.rng.next() * (1 - 2 * m);
      if (Math.abs(c - this.pos) > 0.18) break;
    }
    return c;
  }

  /** Multiplicateur de vitesse instantané selon le profil de curseur. */
  speedMul(): number {
    let m = 1;
    if (this.p.profile === 'accel') m = 0.55 + 0.9 * (this.phase % 1);
    else if (this.p.profile === 'oscillating') m = 1 + 0.45 * Math.sin(((this.tick / TICK_HZ) * 2 * Math.PI) / 1.7);
    else if (this.p.profile === 'erratic') m = this.erraticMul;
    return this.rush > 0 ? m * 1.4 : m;
  }

  step(): void {
    if (this.state !== 'run') return;
    this.tick++;
    if (this.p.mode === 'crab' && this.tick > this.targetAt + 66) {
      this.misses++; this.streak = 0; this.comboN = 0;
      this.line -= this.p.missTension;
      this.last = 'miss';
      this.crabTarget();
    }
    if (this.lock > 0) this.lock--;
    if (this.grace > 0) this.grace--;
    if (this.p.profile === 'erratic' && --this.erraticLeft <= 0) {
      this.erraticMul = this.rng.pick([0.6, 1, 1.45]);
      this.erraticLeft = Math.round((0.9 + this.rng.next() * 0.8) * TICK_HZ);
    }
    if (this.rush > 0) this.rush--;
    else if (--this.nextRush <= 0) {
      this.rush = Math.round((1.2 + this.rng.next()) * TICK_HZ);
      this.nextRush = this.rushDelay();
    }
    this.warn = this.rush === 0 && this.nextRush <= TICK_HZ / 2;
    this.phase = (this.phase + (this.p.speed * this.speedMul()) / TICK_HZ) % 2;
    this.pos = this.phase < 1 ? this.phase : 2 - this.phase;
    this.line -= (this.p.drain * (this.p.mode === 'crab' ? 0.7 : this.rush > 0 ? 1.8 : 1)) / TICK_HZ;
    if (this.line <= 0 || this.tick >= MAX_COMBAT_TICKS) {
      this.line = 0;
      this.state = 'lose';
    }
  }

  tap(x?: number, y?: number): TapResult {
    if (this.state !== 'run' || this.lock > 0) return 'locked';
    const crab = this.p.mode === 'crab';
    if (crab && (this.tick < this.targetAt || !Number.isFinite(x) || !Number.isFinite(y))) return 'locked';
    const d = crab ? (Math.hypot(x! - this.targetX, y! - this.targetY) <= this.targetRadius ? 0 : 1) : Math.abs(this.pos - this.zoneC);
    if (!crab && d > this.p.zone / 2 && this.grace > 0) return 'locked';
    this.lock = LOCK_TICKS;
    let res: TapResult;
    if (d <= this.p.zone / 2) {
      const crit = crab ? (this.tick - this.targetAt) * 1000 / TICK_HZ <= this.perfectMs : d <= (this.p.zone * this.p.crit) / 2;
      res = crit ? 'crit' : 'hit';
      if (crit) this.crits++;
      else this.hits++;
      this.streak = crit ? this.streak + 1 : 0;
      this.grace = GRACE_TICKS;
      this.comboN++;
      const combo = 1 + this.p.combo * 0.06 * Math.min(this.comboN - 1, 5);
      this.fish -= this.p.hit * (crit ? this.p.critMult : 1) * combo;
      this.zoneC = this.newZone();
      if (crab) this.crabTarget();
      if (this.fish <= 0) {
        this.fish = 0;
        this.state = 'win';
      }
    } else {
      res = 'miss';
      this.misses++;
      this.comboN = 0;
      this.streak = 0;
      this.line -= this.p.missTension;
      if (this.line <= 0) {
        this.line = 0;
        this.state = 'lose';
      }
    }
    this.last = res;
    return res;
  }
}

export type CombatTap = number | { tick: number; x: number; y: number };
export interface ReplayResult {
  state: 'run' | 'win' | 'lose';
  tick: number;
  crits: number;
  hits: number;
  misses: number;
}

/** Rejoue un combat à partir des ticks d'appui (triés). C'est le verdict du serveur. */
export function replayCombat(p: CombatParams, taps: readonly CombatTap[], endTick: number): ReplayResult {
  const c = new Combat(p);
  const max = Math.min(Math.max(0, endTick), MAX_COMBAT_TICKS);
  let i = 0;
  const tickOf = (t: CombatTap) => typeof t === 'number' ? t : t.tick;
  for (;;) {
    while (i < taps.length && tickOf(taps[i]) <= c.tick) {
      const t = taps[i];
      if (tickOf(t) === c.tick) {
        if (typeof t === 'number') c.tap(); else c.tap(t.x, t.y);
      }
      i++;
    }
    if (c.state !== 'run' || c.tick >= max) break;
    c.step();
  }
  return { state: c.state, tick: c.tick, crits: c.crits, hits: c.hits, misses: c.misses };
}

// ---------- Joueurs simulés (tests d'équilibrage) ----------

export interface BotSkill {
  /** Erreur de synchronisation (écart-type, secondes). */
  sigma: number;
  /** Probabilité de tenter sa chance à chaque passage du curseur. */
  attend: number;
  /** Temps de réaction après un appui (ticks). */
  react: number;
}
export const BOTS: Record<'debutant' | 'moyen' | 'expert' | 'parfait', BotSkill> = {
  debutant: { sigma: 0.11, attend: 0.65, react: 32 },
  moyen: { sigma: 0.07, attend: 0.8, react: 24 },
  expert: { sigma: 0.025, attend: 0.95, react: 10 },
  parfait: { sigma: 0, attend: 1, react: 0 },
};

export function simulateBot(p: CombatParams, skill: BotSkill, rng: Rng): { win: boolean; seconds: number; taps: CombatTap[] } {
  const c = new Combat(p);
  const taps: CombatTap[] = [];
  let react = 0;
  let err = 0;
  const resample = (): void => {
    err = rng.gauss() * skill.sigma * p.speed * c.speedMul();
  };
  resample();
  if (p.mode === 'crab') {
    let attempted = -1;
    while (c.state === 'run') {
      c.step();
      const reaction = Math.max(1, skill.react + Math.round(Math.abs(rng.gauss()) * skill.sigma * 60));
      if (c.tick >= c.targetAt + reaction && attempted !== c.targetId && c.state === 'run') {
        attempted = c.targetId;
        if (!rng.chance(skill.attend)) continue;
        const x = c.targetX + rng.gauss() * skill.sigma;
        const y = c.targetY + rng.gauss() * skill.sigma;
        const tap = { tick:c.tick,x,y };
        taps.push(tap); c.tap(x,y);
      }
    }
    return { win:c.state === 'win', seconds:c.tick/TICK_HZ, taps };
  }
  while (c.state === 'run') {
    const prev = c.pos;
    c.step();
    if (react > 0) react--;
    const target = c.zoneC + err;
    if ((prev - target) * (c.pos - target) <= 0 && c.lock === 0 && react === 0) {
      if (rng.chance(skill.attend)) {
        taps.push(c.tick);
        c.tap();
        react = skill.react;
      }
      resample();
    }
  }
  return { win: c.state === 'win', seconds: c.tick / TICK_HZ, taps };
}
