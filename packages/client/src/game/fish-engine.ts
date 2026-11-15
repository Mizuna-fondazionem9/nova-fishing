// Moteur d'illustration des espèces : couleurs, motifs et « poisson de profil » paramétrable.
// Module pur (aucun accès au navigateur) : chaque dessin est une grille de pixels comparable en test.
// Convention : l'animal regarde vers la droite ; deux images (0 et 1) pour la nage.
import { hash2, type Species } from '../../../shared/src/index';
import { Grid, shade, mix } from './pix';

export const GW = 168;
export const GH = 112;
export const CY = 56;

// ---------------------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------------------

/** Référence de couleur : un index de la palette de l'espèce, ou une couleur « #rrggbb » fixe. */
export type C = number | string;
export interface Cols { m: string; b: string; a: string; iris: boolean }

const WHITE = '#f6f4ea';
const BLACK = '#1b1b26';
const HUES = ['#ff6b8b', '#ffb05c', '#ffe96b', '#7be08a', '#5cc8ff', '#a98bff'];

/** Robes rares : 0 = robe naturelle de l'espèce, 1 à 7 = variantes de couleur. */
export function variantColors(sp: Species, color: number): [string, string, string] {
  if (color === 1) return ['#f4efe6', '#ffffff', '#f2b8c0'];
  if (color === 2) return ['#2c2c36', '#4c4c5a', '#15151a'];
  if (color === 3) return ['#e8b830', '#fff2a8', '#b07a10'];
  if (color === 4) return ['#8bc5d1', '#f4dfef', '#7964a2'];
  if (color === 5) return ['#bd7c58', '#f2cf9e', '#754c4b'];
  if (color === 6) return ['#588ec6', '#c6e9f2', '#3d4f91'];
  if (color === 7) return ['#d1c9d7', '#fff4df', '#9a9ab3'];
  return sp.colors;
}
export function makeCols(sp: Species, color: number): Cols {
  const [m, b, a] = variantColors(sp, color);
  return { m, b, a, iris: color === 4 };
}
/**
 * 0 principale · 1 claire (ventre) · 2 accent · 3 sombre · 4 blanc · 5 noir · 6 principale+accent
 * 7 claire ombrée · 8 principale éclaircie · 9 nageoire · 10 accent éclairci · 11 accent sombre.
 */
export function pick(c: Cols, i: C | undefined, def: C = 0): string {
  const v = i ?? def;
  if (typeof v === 'string') return v;
  switch (v) {
    case 1: return c.b;
    case 2: return c.a;
    case 3: return shade(c.m, 0.5);
    case 4: return WHITE;
    case 5: return BLACK;
    case 6: return mix(c.m, c.a, 0.5);
    case 7: return shade(c.b, 0.8);
    case 8: return shade(c.m, 1.35);
    case 9: return shade(mix(c.m, c.a, 0.4), 0.84);
    case 10: return shade(c.a, 1.4);
    case 11: return shade(c.a, 0.6);
    default: return c.m;
  }
}
const irisHue = (t: number): string => HUES[Math.floor(Math.max(0, Math.min(0.999, t)) * 11.99) % 6];

/** Bruit lissé entre 0 et 1 (taches, marbrures). */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (a: number, b: number): number => hash2(seed, a + 4096, b + 4096) / 4294967296;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const bot = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}
export const seedOf = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
};

// ---------------------------------------------------------------------------
// Motifs : appliqués pixel par pixel sur le corps, en coordonnées (t = long du corps, yn = dos -1 … ventre +1)
// ---------------------------------------------------------------------------

export type Pat =
  | ['bars', number, C, number?, number?, number?, number?]   // nombre, couleur, profondeur yn, t0, t1, largeur (0..1)
  | ['wavy', C, number?]                                      // vermiculures du dos, limite yn
  | ['hs', number[], C, number?, number?]                     // lignes horizontales aux niveaux yn, t0, t1
  | ['spots', number, C, number?, number?, number?, number?]  // 1 pixel sur n, couleur, yn0, yn1, t0, t1
  | ['dots', number, C, number?, number?, number?]            // pas, couleur, taille, yn0, yn1
  | ['blotch', number, number, C, number?, number?, number?]  // échelle, seuil, couleur, yn0, yn1, décalage de graine
  | ['band', number, number, C, C?]                           // t0, t1, couleur, liseré
  | ['zone', number, number, number, number, C, number?]      // t0, t1, yn0, yn1, couleur, dosage
  | ['grad', C, number, number, number?]                      // dégradé le long du corps
  | ['vgrad', C, number, number, number?]                     // dégradé vertical
  | ['scales', C, number?]                                    // écailles, dosage
  | ['glow', number, number, C, number?, number?]             // photophores : niveau yn, pas, couleur, t0, t1
  | ['stars', number, C]                                      // étoiles : 1 sur n
  | ['facet', C, number?, number?]                            // reflets en biais : période, dosage
  | ['cracks', C, number?, number?]                           // fissures : échelle, largeur
  | ['ghost', C, number?]                                     // trame translucide
  | ['ribs', C]                                               // arête et côtes visibles par transparence
  | ['plates', number, C]                                     // cuirasse osseuse jusqu'à t
  | ['runes', C];                                             // glyphes

export interface PatCtx { cols: Cols; seed: number; L: number }

export function applyPat(p: Pat, cur: string, t: number, yn: number, x: number, y: number, k: PatCtx): string {
  const col = (c: C): string => pick(k.cols, c);
  switch (p[0]) {
    case 'bars': {
      const [, n, c, depth = 1, t0 = 0.2, t1 = 0.94, w = 0.5] = p;
      if (t < t0 || t > t1 || yn > depth) return cur;
      const v = ((t - t0) / (t1 - t0)) * n;
      const taper = depth < 1 ? 1 - 0.6 * Math.max(0, (yn + 1) / (depth + 1)) : 1;
      return v - Math.floor(v) < w * taper ? mix(cur, col(c), 0.78) : cur;
    }
    case 'wavy': {
      const [, c, lim = 0] = p;
      return yn < lim && Math.sin(x * 1.05 + Math.sin(y * 0.9) * 1.6) > 0.25 ? mix(cur, col(c), 0.8) : cur;
    }
    case 'hs': {
      const [, levels, c, t0 = 0.16, t1 = 0.97] = p;
      if (t < t0 || t > t1) return cur;
      for (const lv of levels) if (Math.abs(yn - lv) < 0.5 / Math.max(2, k.L * 0.12)) return col(c);
      return cur;
    }
    case 'spots': {
      const [, n, c, y0 = -1, y1 = 1, t0 = 0, t1 = 1] = p;
      return yn >= y0 && yn <= y1 && t >= t0 && t <= t1 && hash2(k.seed + 7, x, y) % n === 0 ? col(c) : cur;
    }
    case 'dots': {
      const [, sp, c, size = 1, y0 = -1, y1 = 1] = p;
      if (yn < y0 || yn > y1) return cur;
      const row = Math.floor(y / sp), ox = (row % 2) * Math.floor(sp / 2);
      return (x + ox) % sp < size && y % sp < size ? col(c) : cur;
    }
    case 'blotch': {
      const [, sc, thr, c, y0 = -1, y1 = 1, so = 0] = p;
      return yn >= y0 && yn <= y1 && vnoise(x / sc, y / sc, k.seed + so) > thr ? col(c) : cur;
    }
    case 'band': {
      const [, t0, t1, c, edge] = p;
      if (t < t0 || t > t1) return cur;
      const e = 1.2 / k.L;
      return edge !== undefined && (t < t0 + e || t > t1 - e) ? col(edge) : col(c);
    }
    case 'zone': {
      const [, t0, t1, y0, y1, c, amt = 1] = p;
      return t >= t0 && t <= t1 && yn >= y0 && yn <= y1 ? mix(cur, col(c), amt) : cur;
    }
    case 'grad': {
      const [, c, t0, t1, amt = 1] = p;
      return mix(cur, col(c), Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) * amt);
    }
    case 'vgrad': {
      const [, c, y0, y1, amt = 1] = p;
      return mix(cur, col(c), Math.max(0, Math.min(1, (yn - y0) / (y1 - y0))) * amt);
    }
    case 'scales': {
      const [, c, amt = 0.3] = p;
      return y % 2 === 0 && (x + (Math.floor(y / 2) % 2) * 2) % 4 === 0 && yn < 0.55 ? mix(cur, col(c), amt) : cur;
    }
    case 'glow': {
      const [, lv, sp, c, t0 = 0.15, t1 = 0.92] = p;
      return t >= t0 && t <= t1 && Math.abs(yn - lv) < 0.5 / Math.max(2, k.L * 0.1) && x % sp === 0 ? col(c) : cur;
    }
    case 'stars': {
      const [, n, c] = p;
      const h = hash2(k.seed + 31, x, y);
      if (h % n === 0) return col(c);
      // Branches des plus grosses étoiles.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const hn = hash2(k.seed + 31, x + dx, y + dy);
        if (hn % n === 0 && (hn >>> 8) % 3 === 0) return mix(cur, col(c), 0.55);
      }
      return cur;
    }
    case 'facet': {
      const [, c, per = 7, amt = 0.55] = p;
      return (x + y * 2 + k.seed) % per === 0 && yn < 0.6 ? mix(cur, col(c), amt) : cur;
    }
    case 'cracks': {
      const [, c, sc = 5, w = 0.045] = p;
      return Math.abs(vnoise(x / sc, y / sc, k.seed + 3) - 0.5) < w ? col(c) : cur;
    }
    case 'ghost': {
      const [, c, amt = 0.5] = p;
      return (x + y) % 2 === 0 && yn > -0.6 && yn < 0.7 ? mix(cur, col(c), amt) : cur;
    }
    case 'ribs': {
      const [, c] = p;
      if (t < 0.24 || t > 0.9) return cur;
      if (Math.abs(yn + 0.05) < 0.5 / Math.max(2, k.L * 0.1)) return col(c);
      return x % 3 === 0 && yn > -0.6 && yn < 0.55 ? mix(cur, col(c), 0.7) : cur;
    }
    case 'plates': {
      const [, t1, c] = p;
      if (t > t1) return cur;
      const base = mix(cur, col(c), 0.7);
      return x % 5 === 0 || Math.abs(yn - 0.05) < 0.07 || t > t1 - 1.2 / k.L ? shade(base, 0.72) : base;
    }
    case 'runes': {
      const [, c] = p;
      if (yn < -0.55 || yn > 0.5) return cur;
      for (let r = 0; r < 4; r++) {
        const gx = Math.round(k.L * (0.3 + r * 0.16)), lx = Math.round(t * k.L) - gx, ly = Math.round(yn * 4);
        if (lx < 0 || lx > 2 || ly < -2 || ly > 2) continue;
        const glyph = [0b111101111, 0b010111010, 0b101010101, 0b110011110][(r + k.seed) % 4];
        if ((glyph >> ((ly + 2) % 3) * 3 + lx) & 1) return col(c);
      }
      return cur;
    }
  }
}

/** Teinte de base d'un flanc : dos sombre, reflet, flanc, ventre clair. `bl` = hauteur où commence le ventre. */
export function flank(cols: Cols, t: number, yn: number, bl: number): string {
  const m = cols.iris ? irisHue(t) : cols.m;
  const belly = cols.iris ? shade(m, 1.5) : cols.b;
  if (yn > bl) return yn > 0.82 && bl < 0.8 ? shade(belly, 0.92) : belly;
  if (yn > bl - 0.3) return mix(m, belly, 0.45);
  if (yn < -0.62) return shade(m, 0.72);
  if (yn < -0.3 && yn > -0.5 && t > 0.12 && t < 0.72) return mix(m, '#ffffff', 0.14);
  return m;
}

/** Œil : taille 1 (2×2) à 4 (5×5). `ring` = couleur de l'iris. */
export function drawEye(g: Grid, x: number, y: number, size: number, ring: string = WHITE): void {
  if (size <= 0) return;
  if (size === 1) {
    g.set(x - 1, y - 1, ring); g.set(x, y - 1, ring); g.set(x - 1, y, ring); g.set(x, y, BLACK);
  } else if (size === 2) {
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1]]) g.set(x + dx, y + dy, ring);
    g.set(x, y, BLACK); g.set(x + 1, y, BLACK);
  } else {
    const r = size === 3 ? 1.5 : 2;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const px = dx + (size === 3 ? 0.5 : 0), py = dy + (size === 3 ? 0.5 : 0);
        if (px * px + py * py <= r * r + 0.6) g.set(x + dx, y + dy, px * px + py * py <= (size === 3 ? 0.6 : 1.1) ? BLACK : ring);
      }
    g.set(x - (size === 3 ? 1 : 1), y - 1, WHITE);
  }
}

// ---------------------------------------------------------------------------
// Poisson de profil
// ---------------------------------------------------------------------------

export type FinKind = 'tri' | 'sail' | 'round' | 'low' | 'spine' | 'falc' | 'lobe' | 'fila' | 'lets' | 'rag' | 'back';
/** Nageoire posée sur le dos ou le ventre entre a et b (0 = museau, 1 = queue), hauteur h en pixels. */
export interface Fin { a: number; b: number; h: number; k?: FinKind; lean?: number; c?: C; tip?: C }
export type TailKind = 'fork' | 'lunate' | 'round' | 'trunc' | 'point' | 'shark' | 'lyre' | 'fan' | 'lobed' | 'whip' | 'fluke';
export type Mouth = number | ['gape', number, number, boolean?] | ['beak', C] | ['down', number?] | ['lips', C];

export interface FishSpec {
  /** Longueur du corps (museau → base de la queue), demi-hauteurs du dos et du ventre, en pixels. */
  L: number; T: number; B: number;
  /** Position du point le plus haut (dos) et le plus bas (ventre), 0..1. */
  pk?: number; pkB?: number;
  /** Rondeur du museau côté dos / ventre : petit = tête ronde, grand = museau effilé. */
  nose?: number; noseB?: number;
  /** Demi-épaisseur de la base de la queue (pixels) et vitesse d'affinement. */
  ped?: number; tp?: number;
  /** Bosse du dos / du ventre : [position, demi-largeur, hauteur en pixels]. */
  hump?: [number, number, number];
  sag?: [number, number, number];
  arch?: number;
  /** Corps ondulant (anguilles, serpents) : amplitude et longueur d'onde en pixels. */
  wave?: [number, number];
  tail?: [TailKind, number, number] | null;
  tc?: C;
  d?: Fin[];
  an?: Fin[];
  /** Pelviennes : [position, longueur, couleur]. */
  pel?: [number, number, C?];
  /** Pectorale : genre, position, longueur, couleur. */
  pec?: ['in' | 'low' | 'wing' | 'fan' | 'paddle', number, number, C?];
  /** Œil : recul depuis le museau (px), hauteur (-1..1), taille, couleur de l'iris. */
  eye?: [number, number, number, C?];
  mouth?: Mouth;
  /** Mâchoire inférieure avancée (pixels). */
  jaw?: number;
  /** Rostre : longueur du haut, longueur du bas, épaisseur à la base, couleur. */
  bill?: [number, number?, number?, C?];
  /** Barbillons : nombre, longueur. */
  barb?: [number, number];
  /** 0 = rien, 1 = opercule, n ≥ 2 = fentes branchiales. */
  gill?: number;
  /** Leurre : recul, hauteur, avancée, couleur. */
  lure?: [number, number, number, C?];
  /** Hauteur du ventre clair (-1..1) ; 2 = pas de ventre clair. */
  bl?: number;
  fc?: C;
  pat?: Pat[];
  /** Retouche propre à l'espèce, après le corps et avant le contour. */
  post?: (k: Kit) => void;
}

/** Ce qu'une retouche peut utiliser : la grille, les couleurs et la géométrie du corps. */
export interface Kit {
  g: Grid; cols: Cols; frame: number; seed: number; xs: number; L: number;
  /** Colonne x, dos, ventre et axe pour une position t (0..1). */
  X(t: number): number; top(t: number): number; bot(t: number): number; mid(t: number): number;
  col(c: C): string;
  /** Pixel posé après le contour (détails fins qui doivent rester vifs). */
  after(x: number, y: number, c: string): void;
}

const FIN_SHAPE: Record<FinKind, (s: number, i: number) => number> = {
  tri: (s) => (s < 0.28 ? s / 0.28 : Math.pow(1 - (s - 0.28) / 0.72, 0.85)),
  sail: (s, i) => Math.min(1, s * 9) * (0.74 + 0.26 * Math.sin(s * Math.PI)) * Math.min(1, (1 - s) * 5) - (i % 4 === 3 ? 0.08 : 0),
  round: (s) => Math.pow(Math.sin(Math.PI * s), 0.55),
  low: (s) => Math.min(1, s * 6, (1 - s) * 6),
  spine: (s, i) => (i % 2 === 0 ? 1 : 0.5) * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.04)), 0.4) * (1 - 0.3 * s),
  falc: (s) => (s < 0.78 ? Math.pow(s / 0.78, 1.15) : 1 - ((s - 0.78) / 0.22) * 0.92),
  lobe: (s) => Math.pow(Math.sin(Math.PI * Math.pow(s, 0.6)), 0.8),
  fila: (s) => (s < 0.14 ? 1 : 0.34 * Math.pow(1 - s, 0.6) + 0.06),
  lets: (_s, i) => (i % 3 === 0 ? 1 : 0),
  rag: (s, i) => Math.min(1, s * 7, (1 - s) * 5) * (0.45 + 0.55 * (((i * 7919) % 5) / 4)),
  back: (s) => Math.pow(s, 0.75) * Math.min(1, (1 - s) * 7),
};

export function drawFish(f: FishSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const L = f.L;
  const billLen = f.bill ? Math.max(f.bill[0], f.bill[1] ?? 0) : 0;
  const xs = GW - 6 - billLen - (f.jaw ?? 0);
  const pk = f.pk ?? 0.34, pkB = f.pkB ?? pk, nose = f.nose ?? 0.7, noseB = f.noseB ?? nose;
  const ped = f.ped ?? Math.max(1, Math.min(f.T, f.B) * 0.22), tp = f.tp ?? 1.2;
  const sw = frame % 2 && !f.wave ? 1 + L / 32 : 0;
  const wave = (t: number): number => (f.wave ? f.wave[0] * Math.min(1, t * 3.2) * Math.sin((2 * Math.PI * t * L) / f.wave[1] + (frame % 2 ? 1.25 : 0)) : 0);
  const prof = (t: number, H: number, p: number, n: number): number => {
    const pe = Math.min(1, ped / H);
    return t < p ? H * Math.pow(Math.sin((t / p) * Math.PI * 0.5), n) : H * (pe + (1 - pe) * Math.pow(Math.cos(((t - p) / (1 - p)) * Math.PI * 0.5), tp));
  };
  const bump = (b: [number, number, number] | undefined, t: number): number => (b ? b[2] * Math.exp(-(((t - b[0]) / b[1]) ** 2)) : 0);
  const topH = (t: number): number => prof(t, f.T, pk, nose) + bump(f.hump, t);
  const botH = (t: number): number => prof(t, f.B, pkB, noseB) + bump(f.sag, t);
  const axis = (t: number): number => CY + (f.arch ?? 0) * (2 * t - 1) ** 2 + sw * Math.pow(Math.max(0, (t - 0.45) / 0.55), 1.6) + wave(t);

  const X: number[] = [], M: number[] = [], YT: number[] = [], YB: number[] = [];
  for (let i = 0; i <= L; i++) {
    const t = i / L;
    X.push(xs - i); M.push(axis(t)); YT.push(Math.round(axis(t) - topH(t))); YB.push(Math.round(axis(t) + botH(t)));
  }
  const at = (t: number): number => Math.max(0, Math.min(L, Math.round(t * L)));
  const col = (c: C): string => pick(cols, c);
  const afterList: [number, number, string][] = [];
  const kit: Kit = {
    g, cols, frame, seed, xs, L,
    X: (t) => X[at(t)], top: (t) => YT[at(t)], bot: (t) => YB[at(t)], mid: (t) => Math.round(M[at(t)]),
    col, after: (x, y, c) => { afterList.push([Math.round(x), Math.round(y), c]); },
  };
  const finCol = pick(cols, f.fc, 9);

  // --- Queue ---
  if (f.tail) {
    const [kind, s, w] = f.tail;
    const x0 = xs - L, yc = (YT[L] + YB[L]) / 2 + (frame % 2 ? 0.6 : 0), ph = Math.max(0.8, (YB[L] - YT[L]) / 2);
    const tcol = pick(cols, f.tc, f.fc ?? 9);
    const flat = kind === 'shark' || kind === 'fluke';
    const put = (x: number, y: number, yy: number): void => {
      g.set(x, y, flat ? (yy < -ph ? shade(tcol, 0.88) : tcol) : Math.abs(Math.round(yy)) % 2 === 0 ? tcol : shade(tcol, 0.86));
    };
    for (let dd = 0; dd <= s * 2; dd++) {
      const d = dd / 2, u = d / s, x = Math.round(x0 - d);
      if (kind === 'shark') {
        // Queue hétérocerque : grand lobe supérieur, petit lobe inférieur.
        const up = ph + w * u, th = Math.max(2.4, (ph * 1.5 + 1.5) * (1 - u * 0.6));
        for (let yy = -up; yy <= -up + th; yy += 0.5) put(x, Math.round(yc + yy), yy);
        if (u <= 0.6) {
          const dn = ph + 0.6 * w * (u / 0.6), th2 = Math.max(2, (ph * 1.3 + 1.5) * (1 - (u / 0.6) * 0.6));
          for (let yy = dn - th2; yy <= dn; yy += 0.5) put(x, Math.round(yc + yy), yy);
        }
        if (u <= 0.3) for (let yy = -ph - 1; yy <= ph + 1; yy += 0.5) put(x, Math.round(yc + yy), yy);
        continue;
      }
      if (kind === 'whip') { put(x, Math.round(yc + Math.sin(d * 0.45 + (frame % 2)) * 0.7), 0); continue; }
      let ext = ph, notch = 0;
      if (kind === 'fork') { ext = ph + (w - ph) * Math.pow(u, 0.75); notch = u > 0.3 ? (ext - 1.2) * Math.pow((u - 0.3) / 0.7, 0.9) : 0; }
      else if (kind === 'lunate') { ext = ph + (w - ph) * Math.pow(u, 0.55); notch = u > 0.16 ? Math.max(0, ext - (2.6 - 1.4 * u)) : 0; }
      else if (kind === 'lyre') { ext = ph + (w - ph) * Math.pow(u, 0.45); notch = u > 0.2 ? Math.max(0, ext - Math.max(1, 2.2 * (1 - u) + 0.8)) : 0; }
      else if (kind === 'round') ext = u < 0.6 ? ph + (w - ph) * Math.pow(u / 0.6, 0.7) : w * Math.sqrt(Math.max(0, 1 - ((u - 0.6) / 0.4) ** 2));
      else if (kind === 'trunc') ext = ph + (w - ph) * Math.pow(u, 0.6);
      else if (kind === 'point') ext = u < 0.4 ? ph + (w - ph) * (u / 0.4) : w * (1 - (u - 0.4) / 0.6) + 0.3;
      else if (kind === 'fan') ext = Math.max(ph * (1 - u), w * Math.pow(Math.sin(Math.min(1, u * 1.12) * Math.PI * 0.5), 0.55));
      else if (kind === 'lobed') ext = u < 0.62 ? ph + (w - ph) * Math.pow(u / 0.62, 0.6) : u < 0.74 ? w * 0.9 : w * 0.34 * Math.sqrt(Math.max(0, 1 - ((u - 0.74) / 0.26) ** 2)) + 0.4;
      else if (kind === 'fluke') { ext = ph + (w - ph) * Math.pow(u, 0.9); notch = u > 0.6 ? ext * 0.8 * ((u - 0.6) / 0.4) : 0; }
      for (let yy = -ext; yy <= ext; yy += 0.5) {
        if (notch > 0 && Math.abs(yy) < notch) continue;
        if (kind === 'fan' && u > 0.8 && Math.abs(Math.round(yy)) % 3 === 0) continue;
        put(x, Math.round(yc + yy), yy);
      }
    }
  }

  // --- Nageoires dorsales et anales ---
  const drawFin = (fin: Fin, side: -1 | 1): void => {
    const ia = at(fin.a), ib = at(fin.b), n = Math.max(1, ib - ia);
    const fcol = pick(cols, fin.c, f.fc ?? 9), f2 = shade(fcol, 0.84), tipc = fin.tip !== undefined ? pick(cols, fin.tip) : null;
    const shape = FIN_SHAPE[fin.k ?? 'tri'];
    for (let i = ia; i <= ib; i++) {
      const hpx = Math.round(fin.h * Math.max(0, shape((i - ia) / n, i - ia)));
      if (hpx <= 0) continue;
      const base = side < 0 ? YT[i] : YB[i];
      for (let j = -2; j <= hpx; j++) {
        const x = X[i] - Math.round((fin.lean ?? 0) * Math.max(0, j));
        const c = tipc && j > hpx - Math.max(2, fin.h * 0.3) ? tipc : fin.k === 'spine' && (i - ia) % 2 === 0 ? shade(fcol, 0.7) : (i - ia) % 2 ? f2 : fcol;
        g.set(x, base + side * j, c);
        if (fin.lean) g.under(x - 1, base + side * j, c);
      }
    }
  };
  for (const fin of f.d ?? []) drawFin(fin, -1);
  for (const fin of f.an ?? []) drawFin(fin, 1);

  // --- Pelviennes et pectorale saillante (sous le corps) ---
  if (f.pel) {
    const [t, n, c] = f.pel;
    const i = at(t), x = X[i], y = YB[i] - 1;
    g.poly([[x, y], [x - n * 0.95, y + n * 0.62], [x - n * 0.5, y]], pick(cols, c, f.fc ?? 9));
  }
  if (f.pec && (f.pec[0] === 'low' || f.pec[0] === 'paddle')) {
    const [kind, t, n, c] = f.pec;
    const i = at(t), x = X[i], y = YB[i] - 2;
    if (kind === 'low') g.poly([[x, y], [x - n * 0.42, y], [x - n * 1.0, y + n * 0.66], [x - n * 0.82, y + n * 0.7]], pick(cols, c, 3));
    else g.poly([[x, y], [x - n * 0.5, y], [x - n * 0.95, y + n * 0.5], [x - n * 0.75, y + n * 0.74], [x - n * 0.3, y + n * 0.5]], pick(cols, c, 3));
  }

  // --- Corps ---
  const pctx: PatCtx = { cols, seed, L };
  const bl = f.bl ?? 0.3;
  for (let i = 0; i <= L; i++) {
    const t = i / L, m = M[i];
    for (let y = YT[i]; y <= YB[i]; y++) {
      const yn = y < m ? (y - m) / Math.max(0.5, m - YT[i]) : (y - m) / Math.max(0.5, YB[i] - m);
      let c = flank(cols, t, yn, bl);
      if (f.pat) for (const p of f.pat) c = applyPat(p, c, t, yn, X[i], y, pctx);
      g.set(X[i], y, c);
    }
  }

  // --- Tête ---
  const gill = f.gill ?? 1;
  const eye = f.eye ?? [Math.max(3, Math.min(8, Math.round(L * 0.13))), -0.3, L >= 40 ? 2 : 1];
  if (gill === 1) {
    const gi = Math.min(L, Math.round(eye[0] * 2.1 + 2));
    for (let y = YT[gi] + 2; y <= YB[gi] - 1; y++) {
      const yn = (y - M[gi]) / Math.max(1, YB[gi] - YT[gi]);
      const x = X[gi] - Math.round(1.5 * (1 - (yn * 2) ** 2));
      const cur = g.get(x, y);
      if (cur && Math.abs(yn) < 0.36) g.set(x, y, shade(cur, 0.8));
    }
  } else if (gill >= 2) {
    const gi = Math.round(eye[0] * 2 + 3);
    for (let n = 0; n < gill; n++) {
      const i = Math.min(L, gi + n * 2);
      for (let y = Math.round(M[i]) - 1; y <= Math.round(M[i]) + 2; y++) { const cur = g.get(X[i], y); if (cur) g.set(X[i], y, shade(cur, 0.68)); }
    }
  }
  const my = Math.round(M[0]) + 1;
  const mouth = f.mouth ?? Math.max(2, Math.min(4, Math.round(L * 0.07)));
  if (typeof mouth === 'number') {
    for (let j = 0; j <= mouth; j++) { const x = xs - j, y = my + Math.floor(j / 3); const cur = g.get(x, y); if (cur) g.set(x, y, shade(cur, 0.5)); }
  } else if (mouth[0] === 'gape') {
    const [, len, open, teeth] = mouth;
    for (let j = 0; j <= len; j++) {
      const half = (open * (1 - j / len)) / 2, yu = my - Math.round(half), yl = my + Math.round(half);
      for (let y = yu; y <= yl; y++) g.set(xs - j, y, j > len - 2 ? shade(cols.m, 0.35) : null);
      if (teeth && j >= 1 && j < len - 1 && j % 2 === 1) { kit.after(xs - j, yu, WHITE); kit.after(xs - j, yl, WHITE); }
    }
  } else if (mouth[0] === 'beak') {
    for (let j = 0; j <= 2; j++) for (let y = my - 2; y <= my + 1; y++) g.tint(xs - j, y, y === my ? shade(col(mouth[1]), 0.6) : col(mouth[1]));
  } else if (mouth[0] === 'down') {
    const len = mouth[1] ?? 3;
    for (let j = 2; j < 2 + len; j++) { const y = YB[Math.min(L, j)]; const cur = g.get(xs - j, y); if (cur) g.set(xs - j, y, shade(cur, 0.5)); }
  } else if (mouth[0] === 'lips') {
    for (const dy of [-1, 1]) { g.set(xs + 1, my + dy - 1, col(mouth[1])); g.set(xs, my + dy - 1, col(mouth[1])); }
    g.tint(xs, my - 1, shade(col(mouth[1]), 0.5)); g.tint(xs - 1, my - 1, shade(col(mouth[1]), 0.5));
  }
  if (f.jaw) for (let j = 1; j <= f.jaw; j++) { g.set(xs + j, my + 1, cols.b); if (j < f.jaw) g.set(xs + j, my, mix(cols.m, cols.b, 0.5)); }
  if (f.bill) {
    const [up, low = 0, th = 1, bc] = f.bill;
    const c = pick(cols, bc, 3);
    // Posé après le contour : un trait d'un pixel doit garder sa couleur pour rester lisible sur fond sombre.
    for (let j = 1; j <= up; j++) for (let k = 0; k < (j < up * 0.45 ? th : 1); k++) kit.after(xs + j, my - 1 - k, k ? shade(c, 0.8) : c);
    for (let j = 1; j <= low; j++) kit.after(xs + j, my + (th > 1 && j < low * 0.3 ? 1 : 0) + (up ? 1 : 0), shade(c, 0.85));
  }
  {
    const ei = Math.min(L, eye[0]);
    const ey = Math.round(Math.max(YT[ei] + 1.5, Math.min(YB[ei] - 1.5, M[ei] + eye[1] * (eye[1] < 0 ? M[ei] - YT[ei] : YB[ei] - M[ei]))));
    drawEye(g, X[ei], ey, eye[2], eye[3] !== undefined ? col(eye[3]) : undefined);
  }

  // --- Pectorales posées sur le flanc ---
  if (f.pec && f.pec[0] !== 'low' && f.pec[0] !== 'paddle') {
    const [kind, t, n, c] = f.pec;
    const i = at(t), x = X[i], y = Math.round(M[i] + (YB[i] - M[i]) * 0.3);
    const pc = pick(cols, c, f.fc ?? 9);
    if (kind === 'in') {
      for (let j = 0; j < n; j++) for (let r = 0; r <= Math.min(j, n - 1 - j, 2); r++) g.set(x - j, y + r + Math.floor(j / 3), r === 0 ? shade(pc, 0.7) : pc);
    } else if (kind === 'wing') {
      g.poly([[x, y - 1], [x - n, y - n * 0.42], [x - n * 0.86, y + 1.5], [x - 2, y + 1.5]], (px, py) => ((px + py) % 2 ? pc : shade(pc, 0.86)));
    } else {
      // Éventail : rayons rayonnant vers l'arrière et le bas.
      for (let r = 0; r <= n; r++) {
        const a = Math.PI * (0.62 + 0.62 * (r / n));
        const len = n * (0.75 + 0.25 * Math.sin((r / n) * Math.PI));
        g.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.9, r % 2 ? pc : shade(pc, 0.72));
      }
    }
  }
  if (f.lure) {
    const [back, h, fw, c] = f.lure;
    const i = Math.min(L, back), x0 = X[i], y0 = YT[i];
    for (let j = 0; j <= h; j++) g.set(x0 + Math.round(fw * Math.pow(j / h, 1.8)), y0 - j, shade(cols.m, 0.8));
    const bx = x0 + fw, by = y0 - h - 1;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) kit.after(bx + dx, by + dy, pick(cols, c, 2));
    kit.after(bx, by, WHITE);
  }
  f.post?.(kit);
  g.outline(0.55, true);
  if (f.barb) {
    const [n, len] = f.barb;
    for (let b = 0; b < n; b++) {
      const bx = xs - 2 - b * 2, by = YB[Math.min(L, 2 + b * 2)];
      for (let j = 1; j <= len; j++) g.set(bx - Math.floor(j / 3) + (frame % 2 && j > len / 2 ? 1 : 0), by + j, shade(cols.b, 0.75));
    }
  }
  for (const [x, y, c] of afterList) g.set(x, y, c);
  return g;
}
