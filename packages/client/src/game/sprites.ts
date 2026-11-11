// Pixel art 100 % programmatique : aucun fichier image, aucun asset tiers.
// Tout est dessiné une fois dans de petits canvas puis réutilisé (cache).
import { hash2, type Species, type Silhouette } from '../../../shared/src/index';

export type Spr = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): [Spr, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const shade = (hex: string, f: number): string => {
  const [r, g, b] = rgb(hex);
  return f <= 1 ? toHex(r * f, g * f, b * f) : toHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
};
export const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

/** Grille de pixels avec contour automatique. */
class Grid {
  d: (string | null)[];
  constructor(public w: number, public h: number) {
    this.d = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }
  get(x: number, y: number): string | null {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null;
  }
  /** Assombrit les pixels de bord : contour intérieur, la silhouette ne grossit pas. */
  outline(f = 0.5): this {
    const src = this.d.slice();
    const at = (x: number, y: number): string | null => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = at(x, y);
        if (c && c.length === 7 && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1))) this.d[y * this.w + x] = shade(c, f);
      }
    return this;
  }
  toCanvas(): Spr {
    const [c, ctx] = makeCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const v = this.d[y * this.w + x];
        if (v) {
          ctx.fillStyle = v;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    return c;
  }
}

/** Sprite à partir d'un dessin en caractères : une lettre = une couleur. */
function ascii(rows: string[], pal: Record<string, string>): Spr {
  const g = new Grid(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] && g.set(x, y, pal[ch])));
  return g.toCanvas();
}

// ---------------------------------------------------------------------------
// Illustrations d'espèces (vue de profil) : bestiaire, aquarium, écran de capture
// ---------------------------------------------------------------------------

interface Prof {
  L: number; H: number; nose: number; peak: number; tailW: number;
  tail: 'fork' | 'lunate' | 'round' | 'shark';
  dorsal: [number, number, number];
  bill?: number;
  W?: number;
}
const PROF: Record<string, Prof> = {
  slim: { L: 32, H: 4.5, nose: 0.6, peak: 0.3, tailW: 0.25, tail: 'fork', dorsal: [0.4, 0.55, 3] },
  fusi: { L: 32, H: 7, nose: 0.6, peak: 0.35, tailW: 0.22, tail: 'fork', dorsal: [0.3, 0.6, 4] },
  deep: { L: 26, H: 10, nose: 0.75, peak: 0.42, tailW: 0.2, tail: 'round', dorsal: [0.2, 0.75, 3] },
  tuna: { L: 38, H: 9, nose: 0.55, peak: 0.36, tailW: 0.1, tail: 'lunate', dorsal: [0.3, 0.44, 5] },
  bill: { L: 36, H: 7, nose: 0.5, peak: 0.3, tailW: 0.12, tail: 'lunate', dorsal: [0.14, 0.55, 7], bill: 11 },
  shark: { L: 44, H: 7, nose: 0.45, peak: 0.3, tailW: 0.16, tail: 'shark', dorsal: [0.34, 0.5, 7] },
  whale: { L: 62, H: 11, nose: 0.3, peak: 0.25, tailW: 0.14, tail: 'shark', dorsal: [0.5, 0.62, 6], W: 84 },
};

function variantColors(sp: Species, color: number): [string, string, string] {
  if (color === 1) return ['#f4efe6', '#ffffff', '#f2b8c0'];
  if (color === 2) return ['#2c2c36', '#4c4c5a', '#15151a'];
  if (color === 3) return ['#e8b830', '#fff2a8', '#b07a10'];
  return sp.colors;
}

function paintBody(g: Grid, sp: Species, cols: [string, string, string], iris: boolean, x: number, y: number, yn: number, u: number): void {
  let [main, belly, accent] = cols;
  if (iris) {
    const hues = ['#ff6b8b', '#ffb05c', '#ffe96b', '#7be08a', '#5cc8ff', '#a98bff'];
    main = hues[Math.floor(u * 11.99) % 6];
    belly = shade(main, 1.5);
    accent = '#ffffff';
  }
  let c = yn < -0.4 ? shade(main, 0.78) : yn > 0.35 ? belly : main;
  if (sp.pattern === 'stripes' && yn < 0.3 && Math.floor(u * 14) % 2 === 0) c = mix(c, accent, 0.65);
  if (sp.pattern === 'spots' && hash2(7, x, y) % 9 === 0) c = accent;
  if (sp.pattern === 'bands' && ((u > 0.2 && u < 0.29) || (u > 0.5 && u < 0.6) || (u > 0.82 && u < 0.9))) c = yn > 0.35 ? shade(belly, 0.95) : mix(belly, accent, 0.15);
  g.set(x, y, c);
}

function profileFish(sp: Species, cols: [string, string, string], iris: boolean, frame: number, p: Prof): Spr {
  const W = p.W ?? 56;
  const Hh = 36;
  const g = new Grid(W, Hh);
  const cy = 18;
  const tailLen = p.tail === 'lunate' ? 7 : p.tail === 'shark' ? 9 : 6;
  const x1 = W - 3 - (p.bill ?? 0); // museau
  const x0 = x1 - p.L;
  const hh = (u: number): number =>
    u < p.peak ? p.H * Math.pow(Math.sin((u / p.peak) * Math.PI * 0.5), p.nose) : p.H * (p.tailW + (1 - p.tailW) * Math.pow(Math.cos(((u - p.peak) / (1 - p.peak)) * Math.PI * 0.5), 1.2));
  const [main, , accent] = cols;
  const fin = iris ? '#e9e2ff' : shade(mix(main, accent, 0.5), 0.8);
  const bend = frame % 2 ? 1 : 0;
  // Queue
  const ph = Math.max(1, hh(1));
  for (let d = 1; d <= tailLen; d++) {
    const t = d / tailLen;
    let top = ph + d * 0.9;
    let bot = top;
    let notch = d > tailLen * 0.45 ? (d - tailLen * 0.45) * 0.9 : -1;
    if (p.tail === 'lunate') {
      top = bot = ph + d * 1.35;
      notch = d > 2 ? top - 2.2 : -1;
    } else if (p.tail === 'round') {
      top = bot = ph + Math.sin(t * Math.PI * 0.85) * tailLen * 0.55 + 1;
      notch = -1;
    } else if (p.tail === 'shark') {
      top = ph + d * 1.25;
      bot = ph + d * 0.55;
      notch = d > 3 ? Math.min(top, bot) - 1.5 : -1;
    }
    for (let y = -Math.round(top); y <= Math.round(bot); y++) {
      if (notch >= 0 && Math.abs(y) < notch) continue;
      g.set(x0 - d, cy + y + (d > tailLen / 2 ? bend : 0), fin);
    }
  }
  // Corps
  for (let x = x0; x <= x1; x++) {
    const u = 1 - (x - x0) / p.L;
    const h = hh(u);
    const r = Math.max(0.6, h);
    for (let y = -Math.round(h); y <= Math.round(h); y++) paintBody(g, sp, cols, iris, x, cy + y, y / r, u);
    // Nageoire dorsale et anale
    const [d0, d1, dh] = p.dorsal;
    if (u >= d0 && u <= d1) {
      const k = (u - d0) / (d1 - d0);
      const fh = p.tail === 'shark' || sp.shape === 'tuna' ? dh * (1 - k) : dh * Math.sin(Math.PI * (0.25 + 0.75 * k));
      for (let y = 1; y <= Math.round(fh); y++) g.set(x, cy - Math.round(h) - y, fin);
    }
    if (u > 0.62 && u < 0.76 && p.H > 5) for (let y = 1; y <= 2; y++) g.set(x, cy + Math.round(h) + y, fin);
  }
  // Rostre
  if (p.bill) for (let i = 1; i <= p.bill; i++) g.set(x1 + i, cy - (i > p.bill * 0.6 ? 1 : 0), shade(main, 0.7));
  // Nageoire pectorale, ouïe, œil
  const ux = (u: number): number => Math.round(x0 + (1 - u) * p.L);
  const px = ux(0.3);
  const pl = p.tail === 'shark' ? 6 : 3;
  for (let i = 0; i < pl; i++) for (let j = 0; j <= i * 0.6; j++) g.set(px - i, cy + Math.round(p.H * 0.35) + i - j + (p.tail === 'shark' ? Math.round(p.H * 0.6) : 0), fin);
  const gx = ux(0.24);
  const slits = p.tail === 'shark' ? 3 : 1;
  for (let s = 0; s < slits; s++) for (let y = -2; y <= 2; y++) g.set(gx - s * 2, cy + y, shade(main, 0.62));
  const ex = ux(0.11);
  const ey = cy - Math.round(hh(0.11) * 0.3);
  if (p.H >= 6 && p.tail !== 'shark') {
    g.set(ex, ey, '#ffffff'); g.set(ex + 1, ey, '#ffffff'); g.set(ex, ey + 1, '#ffffff');
    g.set(ex + 1, ey + 1, '#10131a');
  } else g.set(ex, ey, '#10131a');
  return g.outline(0.5).toCanvas();
}

function eelFish(sp: Species, cols: [string, string, string], iris: boolean, frame: number, serpent: boolean): Spr {
  const W = serpent ? 84 : 56;
  const g = new Grid(W, 36);
  const L = W - 8;
  const fin = shade(cols[2], 0.9);
  for (let i = 0; i <= L; i++) {
    const u = 1 - i / L; // 0 = tête
    const x = 4 + i;
    const cyy = 18 + Math.sin(u * Math.PI * (serpent ? 3.2 : 2.2) + frame * 1.2) * (serpent ? 5 : 3.5) * Math.min(1, u * 3 + 0.15);
    const h = (serpent ? 4.5 : 3) * (u < 0.12 ? 0.7 + u * 3.5 : 1 - Math.max(0, u - 0.55) * 1.6);
    const r = Math.max(0.8, h);
    for (let y = -Math.round(h); y <= Math.round(h); y++) paintBody(g, sp, cols, iris, x, Math.round(cyy) + y, y / r, u);
    if (u > 0.15 && (serpent ? i % 4 < 2 : true)) g.set(x, Math.round(cyy) - Math.round(h) - 1, fin);
    if (serpent && u > 0.2 && i % 4 === 0) g.set(x, Math.round(cyy) - Math.round(h) - 2, fin);
    if (u < 0.08 && u > 0.05) g.set(x, Math.round(cyy) - 1, '#10131a');
    if (serpent && u < 0.035) g.set(x + 1, Math.round(cyy) + 2, '#ffffff');
  }
  return g.outline(0.5).toCanvas();
}

function rayFish(sp: Species, cols: [string, string, string], iris: boolean, frame: number, flat: boolean): Spr {
  const g = new Grid(56, 36);
  const cx = flat ? 30 : 34;
  const cy = 18;
  const rx = flat ? 16 : 13;
  const ry = flat ? 8 : 14 - (frame % 2);
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const inside = flat ? (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 : Math.abs(x) / rx + Math.abs(y) / ry <= 1 + (x > 0 ? 0.12 : 0);
      if (!inside) continue;
      const edge = flat ? (x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.72 : Math.abs(x) / rx + Math.abs(y) / ry > 0.82;
      paintBody(g, sp, cols, iris, cx + x, cy + y, edge ? 0.6 : -0.1, 0.5 - x / (2 * rx));
    }
  if (!flat) for (let i = 0; i < 16; i++) g.set(cx - rx - i, cy + Math.round(Math.sin(i * 0.5 + frame) * 1.2), shade(cols[0], 0.7));
  else for (let i = 1; i <= 5; i++) for (let y = -i + 1; y < i; y++) g.set(cx - rx - i + 1, cy + y, shade(cols[0], 0.8));
  g.set(cx + rx - 5, cy - 3, '#10131a');
  g.set(cx + rx - 5, cy + (flat ? -1 : 3), '#10131a');
  return g.outline(0.55).toCanvas();
}

function cephFish(sp: Species, cols: [string, string, string], iris: boolean, frame: number, squid: boolean): Spr {
  const g = new Grid(56, 36);
  const [main, belly, accent] = cols;
  if (squid) {
    // Manteau pointu à gauche, bras à droite
    for (let i = 0; i <= 26; i++) {
      const h = Math.min(6, 1 + i * 0.3);
      for (let y = -Math.round(h); y <= Math.round(h); y++) paintBody(g, sp, cols, iris, 8 + i, 18 + y, y / Math.max(1, h), 1 - i / 26);
      if (i < 9) for (let y = 0; y <= 4 - Math.abs(i - 4); y++) { g.set(8 + i, 18 - Math.round(h) - y, shade(main, 0.85)); g.set(8 + i, 18 + Math.round(h) + y, shade(main, 0.85)); }
    }
    for (let a = 0; a < 6; a++)
      for (let i = 0; i < (a === 0 || a === 5 ? 17 : 11); i++) g.set(35 + i, 18 + (a - 2.5) * 1.6 + Math.sin(i * 0.5 + a + frame * 1.3) * 1.3, a % 2 ? belly : main);
    g.set(32, 15, '#ffffff'); g.set(33, 15, '#10131a');
  } else {
    // Tête en dôme et huit bras
    for (let y = -8; y <= 6; y++)
      for (let x = -9; x <= 9; x++) if ((x * x) / 81 + (y * y) / (y < 0 ? 64 : 36) <= 1) paintBody(g, sp, cols, iris, 28 + x, 13 + y, y / 8, 0.5 - x / 18);
    for (let a = 0; a < 8; a++) {
      const bx = 20 + a * 2.3;
      for (let i = 0; i < 14; i++) {
        const x = bx + (a - 3.5) * i * 0.28 + Math.sin(i * 0.55 + a * 1.7 + frame * 1.4) * 1.5;
        g.set(x, 19 + i, i % 3 === 2 ? belly : main);
        if (i < 9) g.set(x + 1, 19 + i, shade(main, 0.85));
      }
    }
    g.set(24, 13, '#ffffff'); g.set(25, 13, '#10131a'); g.set(31, 13, '#ffffff'); g.set(32, 13, '#10131a');
    if (sp.id === 'poulpe_dumbo') for (let i = 0; i < 5; i++) { g.set(18 - i, 7 + i * 0.5 - (frame % 2), accent); g.set(38 + i, 7 + i * 0.5 - (frame % 2), accent); }
  }
  return g.outline(0.5).toCanvas();
}

function roundFish(sp: Species, cols: [string, string, string], iris: boolean, frame: number, moon: boolean): Spr {
  const g = new Grid(56, 36);
  const [main, , accent] = cols;
  const cx = 30;
  const cy = 18;
  const rx = moon ? 12 : 11;
  const ry = moon ? 9 : 8;
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
      if (moon && x < -rx + 3) continue;
      paintBody(g, sp, cols, iris, cx + x, cy + y, y / ry, 0.5 - x / (2 * rx));
    }
  const fin = shade(main, 0.75);
  if (moon) {
    for (let i = 0; i < 8; i++) for (let x = 0; x <= 5 - i * 0.6; x++) { g.set(cx - 5 + x - (frame % 2), cy - ry - i, fin); g.set(cx - 5 + x + (frame % 2), cy + ry + i, fin); }
    g.set(cx + rx - 3, cy - 2, '#ffffff'); g.set(cx + rx - 2, cy - 2, '#10131a');
    g.set(cx + rx, cy + 1, '#10131a');
  } else {
    // Baudroie : gueule, dents, leurre lumineux
    for (let i = 0; i < 6; i++) for (let y = -i; y <= i; y++) g.set(cx - rx - i, cy + y + (frame % 2), fin);
    for (let x = 2; x <= rx; x++) g.set(cx + x, cy + 2, '#10131a');
    for (let x = 3; x <= rx; x += 2) { g.set(cx + x, cy + 1, '#ffffff'); g.set(cx + x + 1, cy + 3, '#ffffff'); }
    g.set(cx + 5, cy - 3, '#ffffff'); g.set(cx + 6, cy - 3, '#10131a');
    for (let i = 0; i < 7; i++) g.set(cx + 2 + i, cy - ry - Math.round(Math.sin((i / 6) * Math.PI) * 5), shade(main, 1.3));
    g.set(cx + 9, cy - ry + 1, accent); g.set(cx + 10, cy - ry + 1, '#ffffff'); g.set(cx + 9, cy - ry + 2, accent);
  }
  return g.outline(0.5).toCanvas();
}

function seahorse(cols: [string, string, string]): Spr {
  return ascii(
    [
      '.....aAa.....', '....aMMMa....', '...MMMoMMmmm.', '...MMMMMMmmmm', '....MMMM.....', '....MMMB.....', '...aMMBB.....', '..aMMMBB.....',
      '..aMMMBB.....', '...MMMBB.....', '....MMBB.....', '....MMMB.....', '.....MMM.....', '.....MMM.....', '......MM.....', '......MM.....',
      '.....MM......', '....MM...M...', '....MM..MM...', '.....MMMM....',
    ],
    { M: cols[0], m: shade(cols[0], 0.8), B: cols[1], a: cols[2], A: shade(cols[2], 1.3), o: '#10131a' },
  );
}

const fishCache = new Map<string, Spr>();

/** Illustration d'une espèce. `color` = variante (0 normal, 1 albinos, 2 mélanique, 3 doré, 4 irisé). */
export function fishSprite(sp: Species, color = 0, frame = 0): Spr {
  const key = `${sp.id}:${color}:${frame % 2}`;
  let s = fishCache.get(key);
  if (s) return s;
  const cols = variantColors(sp, color);
  const iris = color === 4;
  switch (sp.shape) {
    case 'eel': s = eelFish(sp, cols, iris, frame, false); break;
    case 'serpent': s = eelFish(sp, cols, iris, frame, true); break;
    case 'ray': s = rayFish(sp, cols, iris, frame, false); break;
    case 'flat': s = rayFish(sp, cols, iris, frame, true); break;
    case 'octo': s = cephFish(sp, cols, iris, frame, false); break;
    case 'squid': s = cephFish(sp, cols, iris, frame, true); break;
    case 'moon': s = roundFish(sp, cols, iris, frame, true); break;
    case 'angler': s = roundFish(sp, cols, iris, frame, false); break;
    case 'seahorse': s = seahorse(cols); break;
    default: s = profileFish(sp, cols, iris, frame, PROF[sp.shape] ?? PROF.fusi);
  }
  fishCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// Ombres dans l'eau (vue du dessus) : seule la silhouette est lisible
// ---------------------------------------------------------------------------

export const SHADOW_FRAMES = 8;
const shadowCache = new Map<string, Spr[]>();
const SH: Record<Silhouette, { L: number; W: number; amp: number; size: number }> = {
  small: { L: 9, W: 1.7, amp: 1.4, size: 14 },
  long: { L: 24, W: 1.5, amp: 2.6, size: 30 },
  massive: { L: 18, W: 4.6, amp: 1.6, size: 26 },
  shark: { L: 30, W: 4, amp: 2.2, size: 40 },
  ray: { L: 16, W: 10, amp: 0, size: 40 },
  cephalo: { L: 10, W: 3.6, amp: 0, size: 30 },
  giant: { L: 64, W: 10, amp: 3, size: 80 },
};

export function shadowFrames(kind: Silhouette): Spr[] {
  let frames = shadowCache.get(kind);
  if (frames) return frames;
  frames = [];
  const p = SH[kind];
  const col = '#06182b';
  for (let f = 0; f < SHADOW_FRAMES; f++) {
    const ph = (f / SHADOW_FRAMES) * Math.PI * 2;
    const g = new Grid(p.size, p.size);
    const c = p.size / 2;
    const x1 = c + p.L / 2; // tête à droite
    if (kind === 'ray') {
      const span = p.W * (0.86 + 0.14 * Math.sin(ph));
      for (let i = 0; i <= p.L; i++) {
        const u = i / p.L;
        const w = u < 0.45 ? (span * u) / 0.45 : span * (1 - (u - 0.45) / 0.55);
        for (let y = -Math.round(w); y <= Math.round(w); y++) g.set(x1 - i, c + y, col);
      }
      for (let i = 0; i < 13; i++) g.set(x1 - p.L - i, c + Math.sin(i * 0.5 + ph) * 1.2, col);
    } else if (kind === 'cephalo') {
      const pulse = 1 + 0.18 * Math.sin(ph);
      for (let i = 0; i <= p.L; i++) {
        const w = p.W * Math.sin((i / p.L) * Math.PI) ** 0.7 / pulse;
        for (let y = -Math.round(w); y <= Math.round(w); y++) g.set(x1 - i, c + y, col);
      }
      for (let a = 0; a < 5; a++) for (let i = 0; i < 11 * pulse; i++) g.set(x1 - p.L - i, c + (a - 2) * 1.3 + Math.sin(i * 0.6 + a + ph) * 1.1, col);
    } else {
      for (let i = 0; i <= p.L; i++) {
        const u = i / p.L;
        const off = p.amp * Math.pow(u, 1.6) * Math.sin(ph - u * 3.2);
        let w = p.W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.85);
        if (u > 0.88) w = Math.max(w, p.W * 0.55 * ((u - 0.88) / 0.12)); // nageoire caudale
        for (let y = -Math.round(w); y <= Math.round(w); y++) g.set(x1 - i, c + off + y, col);
        if ((kind === 'shark' || kind === 'giant') && u > 0.28 && u < 0.42) {
          const fl = ((u - 0.28) / 0.14) * p.W * 1.9;
          for (let y = Math.round(w); y <= Math.round(w + fl); y++) { g.set(x1 - i, c + off + y, col); g.set(x1 - i, c + off - y, col); }
        }
      }
    }
    frames.push(g.toCanvas());
  }
  shadowCache.set(kind, frames);
  return frames;
}

// ---------------------------------------------------------------------------
// Bateau (vue du dessus, proue à droite) — trois allures selon le niveau de coque
// ---------------------------------------------------------------------------

const boatCache = new Map<number, Spr>();
export function boatSprite(tier: number): Spr {
  let s = boatCache.get(tier);
  if (s) return s;
  const L = [26, 31, 37][tier];
  const W = [5.5, 6.5, 7.5][tier];
  const size = L + 6;
  const g = new Grid(size, size);
  const c = Math.floor(size / 2);
  const x0 = c - Math.floor(L / 2);
  const hull = ['#8a5a2b', '#7a4a2a', '#5f4a3a'][tier];
  const deck = ['#d2a264', '#c99a5b', '#b98f5e'][tier];
  const trim = ['#c8402f', '#2f6fc8', '#e0b030'][tier];
  for (let i = 0; i <= L; i++) {
    const u = i / L;
    const w = u < 0.55 ? W * (0.72 + 0.28 * Math.min(1, u * 5)) : W * Math.pow(Math.cos(((u - 0.55) / 0.45) * Math.PI * 0.5), 0.75);
    for (let y = -Math.round(w); y <= Math.round(w); y++) {
      const edge = Math.abs(y) > w - 1.4;
      g.set(x0 + i, c + y, edge ? (Math.abs(y) > w - 0.6 ? hull : trim) : i % 4 === 0 ? shade(deck, 0.88) : deck);
    }
  }
  // Cabine
  const cab0 = x0 + Math.round(L * 0.14);
  const cab1 = x0 + Math.round(L * 0.4);
  for (let x = cab0; x <= cab1; x++) for (let y = -Math.round(W * 0.55); y <= Math.round(W * 0.55); y++) g.set(x, c + y, x === cab0 || x === cab1 || Math.abs(y) === Math.round(W * 0.55) ? '#e8e2d4' : y < 0 ? '#f6f1e6' : '#ddd6c6');
  g.set(cab1 - 1, c - 1, '#6fc3e8'); g.set(cab1 - 1, c + 1, '#6fc3e8');
  // Mât(s) et voile vue de dessus
  const masts = tier === 2 ? [0.55, 0.78] : [0.6];
  for (const m of masts) {
    const mx = x0 + Math.round(L * m);
    for (let y = -Math.round(W * 1.15); y <= Math.round(W * 1.15); y++) { g.set(mx, c + y, '#fbfaf4'); g.set(mx + 1, c + y, Math.abs(y) % 3 === 0 ? '#d9d6ca' : '#f0eee4'); }
    g.set(mx, c, '#5a3a1c'); g.set(mx + 1, c, '#5a3a1c');
  }
  s = g.outline(0.45).toCanvas();
  boatCache.set(tier, s);
  return s;
}

// ---------------------------------------------------------------------------
// Décors et objets
// ---------------------------------------------------------------------------

const G1 = '#5fb04a';
const G2 = '#3f8a3a';
const TR = '#7a5230';
const SHD = 'rgba(20,40,30,0.28)';

export interface Decor {
  palm: Spr; pine: Spr; snowPine: Spr; bush: Spr; rock: Spr; snowRock: Spr; coralA: Spr; coralB: Spr; weed: Spr; ice: Spr;
  hut: Spr; lighthouse: Spr; pier: Spr; bobber: Spr; alert: Spr; flag: Spr; fin: Spr;
}
let decor: Decor | null = null;

/**
 * Oublie toutes les images en mémoire : elles seront redessinées à la demande.
 * Nécessaire au retour d'arrière-plan sur téléphone, où le navigateur peut avoir vidé les images mises de côté.
 */
export function resetSprites(): void {
  fishCache.clear();
  shadowCache.clear();
  boatCache.clear();
  decor = null;
}

export function getDecor(): Decor {
  if (decor) return decor;
  const pineRows = ['.....d.....', '....dDd....', '....DDD....', '...dDDDd...', '...DDDDD...', '..dDDDDDd..', '...DDDDD...', '..dDDDDDd..', '.dDDDDDDDd.', '..DDDDDDD..', '.dDDDDDDDd.', 'dDDDDDDDDDd', '.....t.....', '.....t.....', '....sts....', '...sssss...'];
  decor = {
    palm: ascii(
      ['....gGg......', '..gGGGGg.gg..', '.gGGgGGGGGGg.', 'gGg.gGGGg.GGg', 'Gg..GGtGG..gG', 'g...GgtgG...g', '....g.t.g....', '......t......', '......tt.....', '.......t.....', '.......t.....', '......tt.....', '......t......', '.....ttt.....', '....sssss....', '.....sss.....'],
      { g: G1, G: G2, t: TR, s: SHD },
    ),
    pine: ascii(pineRows, { d: '#3f7f4a', D: '#2c5f3a', t: TR, s: SHD }),
    snowPine: ascii(pineRows, { d: '#f2f7fa', D: '#3a6a5a', t: TR, s: 'rgba(60,80,110,0.25)' }),
    bush: ascii(['..gGg...', '.gGGGGg.', 'gGGgGGGg', 'GGGGGGgG', '.sGGGGs.', '..ssss..'], { g: G1, G: G2, s: SHD }),
    rock: ascii(['..rRr...', '.rRRRRr.', 'rRRrRRRr', 'RRRRRRdR', 'dRRRRRdd', '.dddddd.'], { r: '#a9adb3', R: '#8a8f96', d: '#666b72' }),
    snowRock: ascii(['..www...', '.wwwwRr.', 'rwwrRRRr', 'RRRRRRdR', 'dRRRRRdd', '.dddddd.'], { w: '#f4f8fb', r: '#a9adb3', R: '#8a8f96', d: '#666b72' }),
    coralA: ascii(['.p..p.p.', 'pPp.pPp.', '.PpPpP..', '..PPP.p.', '.pPPPpP.', '..PPPP..', '...PP...'], { p: '#ff9db5', P: '#e0607f' }),
    coralB: ascii(['o..o..o.', 'oOoOo.O.', '.OOOOoO.', '..OOOOO.', '..oOOO..', '...OO...'], { o: '#ffc27a', O: '#e88a3a' }),
    weed: ascii(['.g...', 'g.g..', '.gg..', '..g.g', '.gg.g', '.g.g.', '.ggg.', '..g..'], { g: '#2f7a5a' }),
    ice: ascii(['..wwwww...', '.wwWWWwww.', 'wwWWWWWWww', 'bwwWWWWwwb', '.bbwwwwbb.', '...bbbb...'], { w: '#f2fafe', W: '#ffffff', b: '#a8cfe4' }),
    hut: ascii(
      ['.......rrrrrr.......', '.....rrRRRRRRrr.....', '...rrRRRRRRRRRRrr...', '.rrRRRRRRRRRRRRRRrr.', 'rRRRRRRRRRRRRRRRRRRr', '.wwwwwwwwwwwwwwwwww.', '.wWWWWWWWWWWWWWWWWw.', '.wWWbbWWWWWWWWbbWWw.', '.wWWbbWWWddWWWbbWWw.', '.wWWWWWWWddWWWWWWWw.', '.wWWWWWWWddWWWWWWWw.', '.wwwwwwwwddwwwwwwww.', '..ssssssssssssssss..'],
      { r: '#b5482f', R: '#d0603f', w: '#b9a98a', W: '#efe4c8', b: '#5fb3d9', d: '#6a4424', s: SHD },
    ),
    lighthouse: ascii(
      ['...yyyy...', '..yYYYYy..', '..kkkkkk..', '..kLLLLk..', '..kLLLLk..', '.kkkkkkkk.', '..wwwwww..', '..wwwwww..', '..rrrrrr..', '..rrrrrr..', '..wwwwww..', '..wwwwww..', '..rrrrrr..', '..rrrrrr..', '.wwwwwwww.', '.wwwwwwww.', '.rrrrrrrr.', '.rrrrrrrr.', '.wwwddwww.', '.wwwddwww.', 'gggggggggg', '.ssssssss.'],
      { y: '#c8402f', Y: '#e0553f', k: '#2a2f3a', L: '#ffe98a', w: '#f6f3ea', r: '#c8402f', d: '#5a3a1c', g: '#8a8f96', s: SHD },
    ),
    pier: ascii(Array.from({ length: 34 }, (_, y) => (y % 4 === 3 ? 'kPPPPPPPPPPk' : y % 8 === 0 ? 'KppppppppppK' : 'kppppppppppk')), { p: '#c99a5b', P: '#a57a42', k: '#6a4424', K: '#3b2616' }),
    bobber: ascii(['..k..', '.rrr.', 'rrrrr', 'wwwww', '.www.'], { k: '#2a2f3a', r: '#e0402f', w: '#ffffff' }),
    alert: ascii(['.yyy.', '.yyy.', '.yyy.', '.yyy.', '.yyy.', '.....', '.yyy.', '.yyy.'], { y: '#ffe14a' }),
    flag: ascii(['kvvvv', 'kvVvv', 'kvvvv', 'k....', 'k....', 'k....'], { k: '#3b2616', v: '#8f5cf0', V: '#ffffff' }),
    fin: ascii(['....g....', '...gGg...', '..gGGGg..', '..gGGGGg.', '.gGGGGGGg', 'gGGGGGGGG'], { g: '#5a6470', G: '#3d4650' }),
  };
  return decor;
}
