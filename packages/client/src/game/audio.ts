// Sons synthétisés avec WebAudio : aucun fichier audio. Désactivable dans les réglages.
//
// Parti pris sonore : doux et feutré. Uniquement des ondes sinus et triangle, des attaques
// progressives (jamais de « clic » sec), des fins qui s'éteignent lentement, et un filtre
// général qui coupe les aigus agressifs.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: GainNode | null = null;
let noiseData: AudioBuffer | null = null;
let enabled = true;

const VOLUME = 0.45;

export function setSound(on: boolean): void {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? VOLUME : 0, ctx.currentTime, 0.05);
}

/** À appeler sur un geste de l'utilisateur (règle des navigateurs). */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? VOLUME : 0;
  // Filtre général : arrondit tous les sons du jeu.
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 4200;
  soften.Q.value = 0.3;
  master.connect(soften).connect(ctx.destination);

  // Deux secondes de bruit, générées une fois et réutilisées par tous les sons « d'eau ».
  noiseData = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseData.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Ambiance : bruit filtré qui « respire » comme la houle.
  const src = ctx.createBufferSource();
  src.buffer = noiseData;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  ambient = ctx.createGain();
  ambient.gain.value = 0.045;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.025;
  lfo.connect(lfoGain).connect(ambient.gain);
  src.connect(lp).connect(ambient).connect(master);
  src.start();
  lfo.start();
}

/** Pluie et orage renforcent l'ambiance. */
export function setAmbience(level: number): void {
  if (ambient && ctx) ambient.gain.setTargetAtTime(0.045 + level * 0.08, ctx.currentTime, 1);
}

interface NoteOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  /** Glissement de hauteur sur la durée de la note, en Hz (négatif = descend). */
  slide?: number;
  attack?: number;
}

/** Une note douce : montée progressive, puis extinction lente. */
function note(freq: number, dur: number, o: NoteOpts = {}): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const attack = o.attack ?? 0.012;
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
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * (2 - dur - 0.05));
  src.stop(t + dur + 0.03);
}

/** Petite cloche : une fondamentale et son octave, plus discrète. */
function bell(freq: number, dur: number, vol: number, delay = 0): void {
  note(freq, dur, { vol, delay });
  note(freq * 2, dur * 0.6, { vol: vol * 0.3, delay });
}

// Gamme pentatonique majeure : chaque coup critique enchaîné monte d'un degré, toujours juste à l'oreille.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const CRIT_BASE = 587.33; // ré

/**
 * Coup critique. `streak` = nombre de critiques enchaînés (1 pour le premier).
 * La cloche monte d'un degré à chaque coup ; à partir de 3 s'ajoute une quinte, à partir de 5 un scintillement.
 */
function crit(streak: number): void {
  const step = PENTA[Math.min(Math.max(streak, 1), PENTA.length) - 1];
  const f = CRIT_BASE * Math.pow(2, step / 12);
  const lift = Math.min(streak, 6);
  bell(f, 0.32 + lift * 0.03, 0.075 + lift * 0.006);
  if (streak >= 3) note(f * 1.5, 0.3, { vol: 0.035, delay: 0.05 });
  if (streak >= 5) {
    note(f * 2, 0.4, { vol: 0.03, delay: 0.1 });
    note(f * 3, 0.5, { type: 'triangle', vol: 0.014, delay: 0.16 });
  }
}

export type Sfx = 'click' | 'cast' | 'splash' | 'nibble' | 'bite' | 'hit' | 'crit' | 'miss' | 'win' | 'lose' | 'coin' | 'alarm' | 'crash' | 'thunder' | 'port';

/** Joue un son. `level` ne sert qu'à 'crit' : longueur de la série de coups critiques en cours. */
export function sfx(name: Sfx, level = 1): void {
  switch (name) {
    case 'click':
      return note(520, 0.07, { vol: 0.035 });
    case 'cast':
      return wash(0.32, 1300, 0.05, 'bandpass', 0.09);
    case 'splash':
      wash(0.38, 750, 0.11, 'lowpass', 0.01);
      return note(190, 0.2, { vol: 0.06, slide: -80 });
    case 'nibble':
      return note(440, 0.1, { vol: 0.045, slide: -40 });
    case 'bite':
      // Signal de jeu : doit rester net, mais sans agresser. Deux cloches montantes et un remous.
      bell(659, 0.24, 0.085);
      bell(880, 0.34, 0.09, 0.1);
      return wash(0.3, 600, 0.09, 'lowpass', 0.01);
    case 'hit':
      note(392, 0.14, { vol: 0.08, slide: 60 });
      return wash(0.08, 900, 0.03, 'bandpass', 0.005);
    case 'crit':
      return crit(level);
    case 'miss':
      note(150, 0.24, { vol: 0.1, slide: -55 });
      return wash(0.16, 240, 0.05);
    case 'win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.55, 0.06, i * 0.13));
      return;
    case 'lose':
      note(392, 0.5, { vol: 0.065 });
      return note(293.66, 0.7, { vol: 0.065, delay: 0.22 });
    case 'coin':
      bell(880, 0.22, 0.05);
      return bell(1174.66, 0.34, 0.05, 0.08);
    case 'alarm':
      note(220, 0.28, { type: 'triangle', vol: 0.09, attack: 0.03 });
      return note(220, 0.28, { type: 'triangle', vol: 0.09, attack: 0.03, delay: 0.34 });
    case 'crash':
      wash(0.55, 190, 0.26, 'lowpass', 0.01);
      return note(72, 0.42, { vol: 0.15, slide: -28 });
    case 'thunder':
      return wash(1.9, 120, 0.2, 'lowpass', 0.15);
    case 'port':
      [392, 493.88, 587.33].forEach((f, i) => note(f, 0.45, { vol: 0.045, delay: i * 0.07, attack: 0.03 }));
      return;
  }
}
