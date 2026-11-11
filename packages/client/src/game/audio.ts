// Sons synthétisés avec WebAudio : aucun fichier audio. Désactivable dans les paramètres.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: GainNode | null = null;
let enabled = true;

export function setSound(on: boolean): void {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.05);
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
  master.gain.value = enabled ? 0.5 : 0;
  master.connect(ctx.destination);
  // Ambiance : bruit filtré qui « respire » comme la houle.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(2);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  ambient = ctx.createGain();
  ambient.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.03;
  lfo.connect(lfoGain).connect(ambient.gain);
  src.connect(lp).connect(ambient).connect(master);
  src.start();
  lfo.start();
}

function noiseBuffer(seconds: number): AudioBuffer {
  const b = ctx!.createBuffer(1, Math.floor(ctx!.sampleRate * seconds), ctx!.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Pluie et orage renforcent l'ambiance. */
export function setAmbience(level: number): void {
  if (ambient && ctx) ambient.gain.setTargetAtTime(0.05 + level * 0.1, ctx.currentTime, 1);
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.12, delay = 0, slide = 0): void {
  if (!ctx || !master || !enabled) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, vol = 0.2, type: BiquadFilterType = 'bandpass'): void {
  if (!ctx || !master || !enabled) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

export type Sfx = 'click' | 'cast' | 'splash' | 'nibble' | 'bite' | 'hit' | 'crit' | 'miss' | 'win' | 'lose' | 'coin' | 'alarm' | 'crash' | 'thunder' | 'port';

export function sfx(name: Sfx): void {
  switch (name) {
    case 'click': return tone(660, 0.05, 'square', 0.06);
    case 'cast': return noise(0.25, 2400, 0.08, 'highpass');
    case 'splash': noise(0.3, 900, 0.22); return tone(220, 0.12, 'sine', 0.1, 0, -120);
    case 'nibble': return tone(520, 0.06, 'sine', 0.09);
    case 'bite': tone(880, 0.09, 'square', 0.14); tone(1320, 0.14, 'square', 0.14, 0.09); return noise(0.25, 700, 0.2);
    case 'hit': return tone(520, 0.08, 'triangle', 0.16, 0, 160);
    case 'crit': tone(780, 0.07, 'square', 0.13); return tone(1170, 0.12, 'square', 0.13, 0.06);
    case 'miss': tone(140, 0.18, 'sawtooth', 0.14, 0, -60); return noise(0.12, 300, 0.12);
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.11, i * 0.1)); return;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, i * 0.14)); return;
    case 'coin': tone(988, 0.06, 'square', 0.1); return tone(1319, 0.16, 'square', 0.1, 0.06);
    case 'alarm': tone(300, 0.16, 'sawtooth', 0.12); return tone(300, 0.16, 'sawtooth', 0.12, 0.22);
    case 'crash': noise(0.45, 220, 0.4, 'lowpass'); return tone(90, 0.3, 'sawtooth', 0.2, 0, -40);
    case 'thunder': return noise(1.6, 140, 0.35, 'lowpass');
    case 'port': tone(392, 0.12, 'triangle', 0.1); return tone(523, 0.2, 'triangle', 0.1, 0.12);
  }
}
