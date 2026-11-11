// Sons synthétisés avec WebAudio : aucun fichier audio. Désactivable dans les réglages.
//
// Parti pris sonore : présent mais jamais agressif. Des attaques nettes sans « clic », des timbres
// de cloche et de métal plutôt que des bips, et un coup critique percussif qui monte d'un demi-ton
// à chaque coup enchaîné.

let ctx: BaseAudioContext | null = null;
let master: GainNode | null = null;
let ambient: GainNode | null = null;
let noiseData: AudioBuffer | null = null;
let enabled = true;

const VOLUME = 1;

export function setSound(on: boolean): void {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? VOLUME : 0, ctx.currentTime, 0.05);
}

/** À appeler sur un geste de l'utilisateur (règle des navigateurs). */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended' && 'resume' in ctx) void (ctx as AudioContext).resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? VOLUME : 0;
  // Filtre général très léger : il ne retire que l'extrême aigu, sans étouffer.
  const tame = ctx.createBiquadFilter();
  tame.type = 'lowpass';
  tame.frequency.value = 9500;
  tame.Q.value = 0.3;
  master.connect(tame).connect(ctx.destination);

  // Deux secondes de bruit, générées une fois et réutilisées par tous les sons « d'eau » et de grelot.
  noiseData = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseData.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Ambiance : bruit filtré qui « respire » comme la houle. (Pas en rendu hors ligne : sert aux mesures.)
  if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseData;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  ambient = ctx.createGain();
  ambient.gain.value = 0.04;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.022;
  lfo.connect(lfoGain).connect(ambient.gain);
  src.connect(lp).connect(ambient).connect(master);
  src.start();
  lfo.start();
}

/** Pluie et orage renforcent l'ambiance. */
export function setAmbience(level: number): void {
  if (ambient && ctx) ambient.gain.setTargetAtTime(0.04 + level * 0.07, ctx.currentTime, 1);
}

interface NoteOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  /** Glissement de hauteur sur la durée de la note, en Hz (négatif = descend). */
  slide?: number;
  attack?: number;
}

/** Une note : montée courte (jamais instantanée, pour éviter le « clic »), puis extinction. */
function note(freq: number, dur: number, o: NoteOpts = {}): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const attack = Math.min(o.attack ?? 0.008, dur * 0.5);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.07, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Un souffle de bruit filtré : éclaboussure, vent, grondement. */
function wash(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', attack = 0.02, delay = 0): void {
  if (!ctx || !master || !enabled || !noiseData) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseData;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * (2 - dur - 0.05));
  src.stop(t + dur + 0.03);
}

/** Grelot : une bande de bruit médium dont le volume vibre vite, comme une bille dans une bombe qu'on secoue. */
function rattle(dur: number, freq: number, vol: number, rate: number, delay = 0): void {
  if (!ctx || !master || !enabled || !noiseData) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseData;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const trem = ctx.createGain();
  trem.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = rate;
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(trem.gain);
  src.connect(f).connect(env).connect(trem).connect(master);
  src.start(t, Math.random() * (2 - dur - 0.05));
  src.stop(t + dur + 0.03);
  lfo.start(t);
  lfo.stop(t + dur + 0.03);
}

/** Cloche : fondamentale, octave en triangle (présence) et un partiel aigu bref (éclat). */
function bell(freq: number, dur: number, vol: number, delay = 0): void {
  note(freq, dur, { vol, delay });
  note(freq * 2, dur * 0.6, { type: 'triangle', vol: vol * 0.35, delay });
  note(freq * 3.01, dur * 0.3, { vol: vol * 0.12, delay });
}

const semitones = (n: number): number => Math.pow(2, n / 12);
const STRIKE_BASE = 147; // ré grave : la note du premier coup

/**
 * Frappe métallique du combat. `power` 0 = coup simple ; 1, 2, 3... = longueur de la série de critiques.
 * Chaque critique enchaîné monte d'un demi-ton (une octave au plus), devient un peu plus court et plus brillant.
 * Composition : un coup sourd, un corps métallique (partiels non harmoniques), un grelot et un tintement aigu.
 */
function strike(power: number): void {
  const step = Math.min(Math.max(power, 1), 13) - 1;
  const k = semitones(step);
  const f0 = STRIKE_BASE * k;
  const lift = Math.min(step, 8);
  const dur = 0.68 * (1 - 0.025 * lift);
  const gain = 1 + 0.03 * lift;
  const crit = power >= 1;

  // 1. Le coup : une basse courte qui descend.
  note(f0, dur * 0.9, { vol: (crit ? 0.2 : 0.14) * gain, attack: 0.004, slide: -f0 * 0.25 });
  note(f0 * 2.02, dur * 0.5, { vol: 0.07, attack: 0.004 });
  // 2. Le grelot médium.
  rattle(dur * (crit ? 0.85 : 0.45), 1500 * Math.sqrt(k), (crit ? 0.075 : 0.045) * gain, 34 + step * 2);
  // 3. Le tic d'attaque.
  wash(0.04, 3500, crit ? 0.06 : 0.035, 'highpass', 0.002);
  if (!crit) return;
  // 4. Le corps métallique : rapports de fréquence d'une barre de métal, donc ni accord ni mélodie.
  note(f0 * 2.76, dur * 0.8, { vol: 0.06 * gain, attack: 0.004 });
  note(f0 * 5.4, dur * 0.6, { vol: 0.05 * gain, attack: 0.004 });
  note(f0 * 8.93, dur * 0.45, { vol: 0.035 * gain, attack: 0.004 });
  // 5. Le tintement aigu, qui enfle puis s'éteint.
  note(f0 * 16, dur, { vol: 0.05 * gain, attack: 0.05 });
  // Paliers : tous les 5 critiques d'affilée, une courte cascade montante salue la série.
  if (power >= 5 && power % 5 === 0) [4, 7, 12].forEach((st, i) => bell(f0 * 4 * semitones(st), 0.3, 0.05, 0.1 + i * 0.07));
}

export type Sfx = 'click' | 'cast' | 'splash' | 'nibble' | 'bite' | 'hit' | 'crit' | 'miss' | 'win' | 'lose' | 'coin' | 'alarm' | 'crash' | 'thunder' | 'port';

/** Joue un son. `level` ne sert qu'à 'crit' : longueur de la série de coups critiques en cours. */
export function sfx(name: Sfx, level = 1): void {
  switch (name) {
    case 'click':
      return note(620, 0.08, { type: 'triangle', vol: 0.08 });
    case 'cast':
      return wash(0.34, 2000, 0.11, 'bandpass', 0.08);
    case 'splash':
      wash(0.45, 1400, 0.22, 'lowpass', 0.008);
      wash(0.2, 3200, 0.06, 'highpass', 0.005);
      return note(200, 0.22, { vol: 0.11, slide: -90 });
    case 'nibble':
      return note(480, 0.12, { type: 'triangle', vol: 0.12, slide: -50 });
    case 'bite':
      // Signal de jeu : net et reconnaissable. Deux cloches montantes et un remous.
      bell(659.25, 0.3, 0.18);
      bell(880, 0.45, 0.2, 0.1);
      return wash(0.32, 1100, 0.16, 'lowpass', 0.008);
    case 'hit':
      return strike(0);
    case 'crit':
      return strike(Math.max(1, level));
    case 'miss':
      note(150, 0.28, { type: 'triangle', vol: 0.15, slide: -60 });
      return wash(0.18, 420, 0.09);
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.6, 0.12, i * 0.12));
      return;
    case 'lose':
      note(392, 0.5, { type: 'triangle', vol: 0.12 });
      return note(293.66, 0.7, { type: 'triangle', vol: 0.12, delay: 0.22 });
    case 'coin':
      bell(987.77, 0.22, 0.125);
      return bell(1318.5, 0.4, 0.125, 0.08);
    case 'alarm':
      for (const delay of [0, 0.34]) {
        note(240, 0.3, { type: 'triangle', vol: 0.15, attack: 0.02, delay });
        note(480, 0.22, { vol: 0.045, attack: 0.02, delay });
      }
      return;
    case 'crash':
      wash(0.6, 320, 0.5, 'lowpass', 0.008);
      return note(72, 0.45, { type: 'triangle', vol: 0.26, slide: -28 });
    case 'thunder':
      return wash(1.9, 220, 0.8, 'lowpass', 0.12);
    case 'port':
      [392, 493.88, 587.33].forEach((f, i) => note(f, 0.5, { type: 'triangle', vol: 0.075, delay: i * 0.07, attack: 0.02 }));
      return;
  }
}
