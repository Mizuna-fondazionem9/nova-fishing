// Sons synthétisés avec WebAudio : aucun fichier audio. Désactivable dans les réglages.
//
// Parti pris sonore : musical et gratifiant. Les coups du combat sont joués sur un instrument à
// lames (type marimba / glockenspiel) accordé en ré majeur. Chaque coup critique enchaîné joue la
// note suivante d'une gamme qui monte : une série devient une petite mélodie, avec de plus en plus
// d'harmonie, et un accord égrené tous les 5 coups. Un écho léger donne de l'ampleur.

let ctx: BaseAudioContext | null = null;
let master: GainNode | null = null;
let echo: GainNode | null = null;
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
    if (ctx.state === 'suspended' && 'resume' in ctx && !document.hidden) void (ctx as AudioContext).resume();
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

  // Écho : une répétition douce et assourdie, qui s'éteint en trois ou quatre rebonds.
  echo = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.19;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2600;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.36;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  echo.connect(delay).connect(damp).connect(wet).connect(master);
  damp.connect(feedback).connect(delay);

  // Deux secondes de bruit, générées une fois et réutilisées par tous les sons « d'eau ».
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

/** Coupe tout le son quand le jeu passe en arrière-plan (changement d'application, onglet caché), le rétablit au retour. */
export function pauseAudio(paused: boolean): void {
  if (!ctx || !('suspend' in ctx)) return;
  const ac = ctx as AudioContext;
  if (paused) void ac.suspend();
  else if (ac.state !== 'running') void ac.resume();
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
  /** Part du son envoyée dans l'écho (0 = aucun). */
  echo?: number;
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
  if (o.echo && echo) {
    const send = ctx.createGain();
    send.gain.value = o.echo;
    g.connect(send).connect(echo);
  }
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Un souffle de bruit filtré : éclaboussure, vent, grondement, scintillement. */
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

/** Cloche : fondamentale, octave en triangle (présence) et un partiel aigu bref (éclat). */
function bell(freq: number, dur: number, vol: number, delay = 0, echoSend = 0): void {
  note(freq, dur, { vol, delay, echo: echoSend });
  note(freq * 2, dur * 0.6, { type: 'triangle', vol: vol * 0.35, delay });
  note(freq * 3.01, dur * 0.3, { vol: vol * 0.12, delay });
}

/** Lame frappée (marimba / glockenspiel) : attaque franche, corps rond, harmoniques qui s'éteignent vite. */
function mallet(freq: number, dur: number, vol: number, delay = 0, echoSend = 0.5): void {
  note(freq, dur, { vol, delay, attack: 0.003, echo: echoSend });
  note(freq * 2, dur * 0.55, { vol: vol * 0.42, delay, attack: 0.003, echo: echoSend * 0.5 });
  note(freq * 3, dur * 0.3, { vol: vol * 0.2, delay, attack: 0.003 });
  note(freq * 4.02, dur * 0.18, { type: 'triangle', vol: vol * 0.1, delay, attack: 0.002 });
}

const semitones = (n: number): number => Math.pow(2, n / 12);
const RE = 293.66; // ré : la tonique du jeu

// La mélodie des séries : la gamme pentatonique de ré majeur, sur deux octaves et demie.
// Chaque critique enchaîné joue la marche suivante. Aucune fausse note possible : toutes sonnent bien ensemble.
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
// Une fois en haut, la série tourne sur les trois dernières marches au lieu de monter dans le suraigu.
const TOP = [28, 31, 26];

function ladder(streak: number): number {
  const i = Math.max(streak, 1) - 1;
  return i < LADDER.length ? LADDER[i] : TOP[(i - LADDER.length) % TOP.length];
}

/**
 * Coup critique. `streak` = nombre de critiques enchaînés (1 pour le premier).
 * - la note monte d'une marche à chaque coup ;
 * - à partir de 2, une quinte l'accompagne ; à partir de 4, l'octave scintille au-dessus ;
 * - tous les 5 coups, un accord égrené et un souffle brillant saluent la série.
 * Le tout repose sur un coup sourd, pour la sensation d'impact.
 */
function crit(streak: number): void {
  const f = RE * semitones(ladder(streak));
  const lift = Math.min(Math.max(streak, 1) - 1, 8);
  const vol = 0.17 + lift * 0.008;
  // Impact.
  note(120, 0.16, { vol: 0.17, attack: 0.003, slide: -55 });
  wash(0.05, 5200, 0.035, 'highpass', 0.002);
  // La note de la mélodie.
  mallet(f, 0.75, vol);
  // L'harmonie s'épaissit avec la série.
  if (streak >= 2) mallet(f * 1.5, 0.55, vol * 0.3, 0.012, 0.3);
  if (streak >= 4) note(f * 2, 0.6, { vol: vol * 0.28, delay: 0.07, attack: 0.004, echo: 0.6 });
  if (streak >= 7) note(f * 4, 0.45, { type: 'triangle', vol: 0.022, delay: 0.13, echo: 0.6 });
  // Palier : accord de ré majeur égrené vers l'aigu, puis un souffle brillant.
  if (streak >= 5 && streak % 5 === 0) {
    [0, 4, 7, 12, 16].forEach((st, i) => mallet(f * semitones(st), 0.6, 0.085, 0.11 + i * 0.055, 0.6));
    wash(0.55, 6000, 0.045, 'highpass', 0.05, 0.12);
  }
}

/** Coup simple : la même lame, une octave plus bas, sèche et sans harmonie. On entend la différence avec un critique. */
function hit(): void {
  note(110, 0.14, { vol: 0.14, attack: 0.003, slide: -50 });
  mallet(RE / 2, 0.38, 0.15, 0, 0.2);
  wash(0.04, 3000, 0.025, 'highpass', 0.002);
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
      bell(880, 0.45, 0.2, 0.1, 0.4);
      return wash(0.32, 1100, 0.16, 'lowpass', 0.008);
    case 'hit':
      return hit();
    case 'crit':
      return crit(Math.max(1, level));
    case 'miss':
      // La série se brise : deux notes qui retombent, et un choc mat.
      mallet(RE * semitones(-5), 0.3, 0.1, 0, 0.2);
      mallet(RE * semitones(-9), 0.42, 0.1, 0.09, 0.2);
      note(140, 0.26, { type: 'triangle', vol: 0.12, slide: -60 });
      return wash(0.18, 420, 0.08);
    case 'win':
      // Capture : la gamme remonte et se pose sur l'accord.
      [0, 4, 7, 12].forEach((st, i) => mallet(RE * semitones(st), 0.6, 0.13, i * 0.11, 0.5));
      [12, 16, 19].forEach((st) => mallet(RE * semitones(st), 1.1, 0.1, 0.5, 0.6));
      return wash(0.7, 6000, 0.04, 'highpass', 0.06, 0.5);
    case 'lose':
      mallet(RE * semitones(3), 0.5, 0.12, 0, 0.4);
      return mallet(RE * semitones(-2), 0.8, 0.12, 0.22, 0.4);
    case 'coin':
      bell(987.77, 0.22, 0.125, 0, 0.3);
      return bell(1318.5, 0.4, 0.125, 0.08, 0.4);
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
      [0, 4, 7].forEach((st, i) => mallet(RE * semitones(st), 0.6, 0.085, i * 0.08, 0.4));
      return;
  }
}
