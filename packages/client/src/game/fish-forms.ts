// Animaux qui ne se dessinent pas comme un poisson de profil : raies (vues de dessus), céphalopodes,
// crabes, crevettes et écrevisses, coquillages, tortue, hippocampe. Module pur, comme fish-engine.ts.
import { hash2 } from '../../../shared/src/index';
import { Grid, shade, mix } from './pix';
import { GW, GH, CY, pick, flank, applyPat, drawEye, vnoise, type C, type Cols, type Pat, type PatCtx } from './fish-engine';

const WHITE = '#f6f4ea';
const BLACK = '#1b1b26';
const CX = GW / 2;

/** Outils passés aux retouches propres à une espèce. */
export interface FormKit { g: Grid; cols: Cols; frame: number; seed: number; col(c: C): string; after(x: number, y: number, c: string): void }
function kitOf(g: Grid, cols: Cols, frame: number, seed: number): [FormKit, () => void] {
  const list: [number, number, string][] = [];
  const kit: FormKit = { g, cols, frame, seed, col: (c) => pick(cols, c), after: (x, y, c) => { list.push([Math.round(x), Math.round(y), c]); } };
  return [kit, () => { for (const [x, y, c] of list) g.set(x, y, c); }];
}
/** Trait épais : suite de disques dont le rayon varie du début à la fin. */
function limb(g: Grid, pts: [number, number][], r0: number, r1: number, c: string | ((i: number, n: number) => string)): void {
  const n = pts.length;
  pts.forEach(([x, y], i) => {
    const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1));
    const cc = typeof c === 'string' ? c : c(i, n);
    if (r < 0.75) g.set(x, y, cc);
    else g.disc(x, y, r, r, cc);
  });
}

// ---------------------------------------------------------------------------
// Raies — vues de dessus, tête à droite
// ---------------------------------------------------------------------------

export interface RaySpec {
  /** Longueur du disque et demi-envergure, en pixels. */
  Ld: number; W: number;
  /** Position de la largeur maximale (0 = avant) ; courbure des bords avant et arrière. */
  f?: number; a?: number; b?: number;
  /** Recul des pointes d'ailes, rostre, cornes céphaliques (pixels). */
  sweep?: number; snout?: number; horns?: number;
  /** Queue : longueur, genre, couleur. */
  tail?: [number, 'whip' | 'thick' | 'fins' | 'ribbon' | 'barb', C?];
  /** Lobes pelviens (pixels). */
  pelv?: number;
  /** Yeux : recul, écart. */
  eyes?: [number, number, C?];
  rim?: C;
  ridge?: C;
  /** Bord arrière découpé (pixels). */
  rag?: number;
  pat?: Pat[];
  post?: (k: FormKit & { xs: number }) => void;
}

export function drawRay(s: RaySpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const [kit, flush] = kitOf(g, cols, frame, seed);
  const flap = frame % 2 ? 0.9 : 1;
  const W = s.W * flap, Ld = s.Ld, f = s.f ?? 0.45, a = s.a ?? 0.8, b = s.b ?? 1.1;
  const sweep = (s.sweep ?? 0) + (frame % 2 ? 1.5 : 0);
  const xs = Math.round(CX + Ld / 2 + (s.tail ? s.tail[0] / 2 : 0));
  const pctx: PatCtx = { cols, seed, L: Ld };
  const width = (u: number): number => (u < f ? W * Math.pow(u / f, a) : W * Math.pow(Math.max(0, (1 - u) / (1 - f)), b));
  // Queue et pelviennes d'abord (glissées sous le disque).
  if (s.tail) {
    const [len, kind, c] = s.tail;
    const tc = pick(cols, c, 3), x0 = xs - Ld + 2;
    for (let d = 0; d <= len; d++) {
      const y = CY + Math.sin(d * 0.32 + (frame % 2 ? 1.3 : 0)) * Math.min(2.2, d * 0.14);
      g.set(x0 - d, y, tc);
      if ((kind === 'thick' || kind === 'fins' || kind === 'barb') && d < len * 0.55) { g.set(x0 - d, y - 1, tc); g.set(x0 - d, y + 1, tc); }
      if (kind === 'ribbon') { g.set(x0 - d, y + 1, tc); if (d % 4 < 2) g.set(x0 - d, y - 1, shade(tc, 1.3)); }
      if (kind === 'fins' && (Math.abs(d - len * 0.68) < 1.6 || Math.abs(d - len * 0.86) < 1.6)) { g.set(x0 - d, y - 1, tc); g.set(x0 - d, y - 2, tc); }
      if (kind === 'barb' && Math.abs(d - len * 0.45) < 2.5) g.set(x0 - d, y - 2, pick(cols, 1));
    }
  }
  if (s.pelv) for (const side of [-1, 1]) g.disc(xs - Ld + 1, CY + side * (s.pelv * 0.7 + 1), s.pelv, s.pelv * 0.62, shade(cols.m, 0.82));
  if (s.horns) for (const side of [-1, 1]) for (let j = 0; j <= s.horns; j++) {
    const y = CY + side * (W * 0.2 - Math.sin((j / s.horns) * Math.PI * 0.5) * 1.5);
    g.set(xs - 2 + j, y, cols.m); g.set(xs - 2 + j, y + side, shade(cols.m, 0.8));
  }
  // Disque.
  for (let uu = 0; uu <= Ld * 2; uu++) {
    const u = uu / (Ld * 2), w = width(u);
    for (let yy = -Math.round(w * 2); yy <= Math.round(w * 2); yy++) {
      const y = yy / 2, yr = Math.abs(y) / Math.max(1, W);
      const x = Math.round(xs - u * Ld - sweep * Math.pow(yr, 1.6));
      if (s.rag && u > 0.6 && hash2(seed, Math.round(y), 3) % 3 === 0 && w - Math.abs(y) < 0.2 + u * 1.2 && Math.abs(y) > 2 && hash2(seed, Math.round(y), 9) % (s.rag + 1) > 0) continue;
      const yn = y / Math.max(1, W);
      let c = Math.abs(yn) < 0.2 ? mix(cols.m, '#ffffff', 0.1) : u > 0.74 ? shade(cols.m, 0.86) : cols.m;
      if (cols.iris) c = flank(cols, u, -0.1, 2);
      if (s.pat) for (const p of s.pat) c = applyPat(p, c, u, yn, x, Math.round(CY + y), pctx);
      if (s.rim !== undefined && w - Math.abs(y) < 1.3) c = pick(cols, s.rim);
      if (s.ridge !== undefined && Math.abs(y) < 0.4 && u > 0.2) c = pick(cols, s.ridge);
      g.set(x, CY + y, c);
    }
  }
  if (s.snout) for (let j = 1; j <= s.snout; j++) { g.set(xs + j, CY, cols.m); if (j < s.snout * 0.6) { g.set(xs + j, CY - 1, cols.m); g.set(xs + j, CY + 1, cols.m); } }
  const eyes = s.eyes ?? [Math.max(3, Math.round(Ld * 0.18)), Math.max(2, Math.round(W * 0.16))];
  s.post?.({ ...kit, xs });
  g.outline(0.55, true);
  for (const side of [-1, 1]) {
    g.set(xs - eyes[0], CY + side * eyes[1], BLACK);
    g.set(xs - eyes[0] - 1, CY + side * eyes[1], pick(cols, eyes[2], 4));
  }
  flush();
  return g;
}

// ---------------------------------------------------------------------------
// Céphalopodes
// ---------------------------------------------------------------------------

export interface CephSpec {
  kind: 'squid' | 'cuttle' | 'octo';
  /** Manteau : longueur (ou hauteur pour un poulpe) et demi-épaisseur. */
  ML: number; MH: number;
  /** Pointe du manteau : petit = arrondi, grand = effilé. */
  tip?: number;
  /** Nageoires : part de la longueur, hauteur, forme, couleur. */
  fin?: [number, number, 'tri' | 'round' | 'skirt' | 'ear' | 'wide', C?];
  head?: number;
  /** Bras : nombre, longueur, ondulation, épaisseur. */
  arms: [number, number, number?, number?];
  /** Tentacules : longueur, taille de la massue. */
  tent?: [number, number];
  /** Voile entre les bras (0..1) et pointes de la voile. */
  web?: number;
  spikes?: boolean;
  /** Œil : taille, couleur. */
  eye?: [number, C?];
  suck?: C;
  bl?: number;
  pat?: Pat[];
  post?: (k: FormKit & { x0: number; hx: number }) => void;
}

export function drawCeph(s: CephSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const [kit, flush] = kitOf(g, cols, frame, seed);
  const pctx: PatCtx = { cols, seed, L: s.ML };
  const [na, alen, curl = 1.2, ath = 1.5] = s.arms;
  const ph = frame % 2 ? 1.1 : 0;
  const armCol = (i: number, n: number): string => (i > n * 0.75 ? shade(cols.m, 1.15) : shade(cols.m, 0.9));
  if (s.kind === 'octo') {
    const cxm = CX, cym = CY - Math.round(alen * 0.35), rx = s.MH, ry = s.ML / 2;
    const by = cym + ry + 1;
    // Bras en éventail sous la tête.
    for (let k = 0; k < na; k++) {
      const fr = na === 1 ? 0.5 : k / (na - 1), ang = Math.PI * (0.06 + 0.88 * fr);
      const len = alen * (0.78 + 0.22 * Math.sin(fr * Math.PI * 1.0 + 0.4)) * (frame % 2 && k % 2 ? 0.94 : 1);
      const pts: [number, number][] = [];
      for (let d = 0; d <= len; d += 0.5) {
        const q = d / len, off = curl * 2.4 * Math.sin(q * Math.PI * 1.7 + k * 1.3 + ph) * q;
        pts.push([cxm + (rx * 0.5) * Math.cos(ang) + Math.cos(ang) * d - Math.sin(ang) * off, by - 2 + Math.sin(ang) * d * 0.8 + Math.cos(ang) * off]);
      }
      limb(g, pts, ath + 0.6, 0.4, k % 2 ? shade(cols.m, 0.84) : cols.m);
      if (s.suck !== undefined) pts.forEach(([x, y], i) => { if (i % 6 === 3 && i > 6 && i < pts.length - 6) kit.after(x, y + 0.6, pick(cols, s.suck)); });
    }
    if (s.web) {
      const R = alen * s.web;
      for (let aa = 0; aa <= 180; aa += 1) {
        const ang = (aa / 180) * Math.PI, r = R * (s.spikes ? 0.72 + 0.28 * Math.abs(Math.cos(ang * na * 0.5)) : 0.9 + 0.1 * Math.abs(Math.sin(ang * na * 0.5)));
        for (let d = 0; d <= r; d += 0.5) g.set(cxm + Math.cos(ang) * d * 1.05, by - 2 + Math.sin(ang) * d * 0.82, d > r - 1.6 ? shade(cols.m, 0.7) : aa % 24 < 3 ? shade(cols.m, 0.78) : shade(cols.m, 0.9));
      }
    }
    if (s.fin && s.fin[2] === 'ear') for (const side of [-1, 1]) {
      const fy = cym - ry * 0.25 + (frame % 2 ? side : 0);
      g.disc(cxm + side * (rx + s.fin[1] * 0.45), fy, s.fin[1], s.fin[0], pick(cols, s.fin[3], 6));
    }
    // Manteau (pointu si tip > 1) et tête.
    for (let y = -ry; y <= ry + 2; y++) {
      const v = y / ry, w = v < 0 ? rx * Math.pow(Math.max(0, 1 - Math.pow(-v, s.tip ?? 2)), 0.5) : rx * (1 - 0.18 * Math.min(1, v));
      for (let x = -Math.round(w); x <= Math.round(w); x++) {
        const yn = v * 0.9 + (x / rx) * 0.15;
        let c = flank(cols, 0.5 + (x / rx) * 0.4, Math.max(-1, Math.min(1, yn)), s.bl ?? 2);
        if (x < -w * 0.45 && v < 0.2) c = shade(c, 1.12);
        if (s.pat) for (const p of s.pat) c = applyPat(p, c, 0.5 + (x / rx) * 0.5, yn, cxm + x, cym + y, pctx);
        g.set(cxm + x, cym + y, c);
      }
    }
    const es = s.eye?.[0] ?? 2, ey = cym + Math.round(ry * 0.72);
    s.post?.({ ...kit, x0: cxm, hx: cym });
    g.outline(0.55, true);
    for (const side of [-1, 1]) drawEye(g, cxm + side * Math.round(rx * 0.5) + (side < 0 ? 0 : 0), ey, es, pick(cols, s.eye?.[1], 4));
    flush();
    return g;
  }
  // Calmar ou seiche : manteau à gauche, bras à droite.
  const hl = s.head ?? Math.max(4, Math.round(s.ML * 0.2));
  const total = s.ML + hl + alen;
  const x0 = Math.round(CX - total / 2 + (s.tent ? -(s.tent[0] - alen) / 2 : 0));   // pointe du manteau
  const hx = x0 + s.ML + hl;                                                           // base des bras
  const tipE = s.tip ?? 0.7;
  const mh = (u: number): number => (s.kind === 'cuttle' ? s.MH * Math.pow(Math.sin(Math.PI * (0.04 + 0.8 * u)), 0.55) : s.MH * Math.pow(Math.sin(u * Math.PI * 0.5), tipE) * (1 - 0.1 * u));
  // Tentacules et bras.
  if (s.tent) for (const side of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let d = 0; d <= s.tent[0]; d += 0.5) pts.push([hx + d, CY + side * (1 + Math.sin((d / s.tent[0]) * Math.PI * 1.4 + ph + (side > 0 ? 0.8 : 0)) * (2 + s.tent[0] * 0.07))]);
    limb(g, pts, 0.6, 0.6, shade(cols.m, 0.92));
    const [ex, ey] = pts[pts.length - 1];
    g.disc(ex - s.tent[1] * 0.6, ey, s.tent[1], Math.max(1, s.tent[1] * 0.55), cols.m);
    if (s.suck !== undefined) for (let j = 0; j < s.tent[1] * 1.6; j += 2) kit.after(ex - j, ey, pick(cols, s.suck));
  }
  for (let k = 0; k < na; k++) {
    const fr = na === 1 ? 0.5 : k / (na - 1), ang = (fr - 0.5) * 0.95;
    const len = alen * (0.8 + 0.2 * Math.sin(fr * Math.PI));
    const pts: [number, number][] = [];
    for (let d = 0; d <= len; d += 0.5) {
      const q = d / len;
      pts.push([hx - 1 + Math.cos(ang) * d, CY + Math.sin(ang) * d * 1.25 + curl * Math.sin(q * Math.PI * 1.5 + k * 1.7 + ph) * q * 1.6]);
    }
    limb(g, pts, ath, 0.4, armCol);
  }
  // Nageoires.
  if (s.fin) {
    const [fl, fh, kind, fcIdx] = s.fin;
    const fc = pick(cols, fcIdx, 6), n = Math.round(s.ML * fl);
    for (let i = 0; i <= (kind === 'skirt' ? s.ML : n); i++) {
      const q = i / Math.max(1, kind === 'skirt' ? s.ML : n);
      const ext = kind === 'tri' ? fh * (q < 0.42 ? q / 0.42 : 1 - (q - 0.42) / 0.58)
        : kind === 'round' ? fh * Math.pow(Math.sin(q * Math.PI), 0.6)
        : kind === 'wide' ? fh * Math.pow(Math.sin(Math.min(1, q * 1.15) * Math.PI * 0.62), 0.5)
        : 1.6 + Math.sin(i * 0.9 + ph * 2) * 0.8;
      const h = mh(i / s.ML);
      for (let j = 0; j <= Math.round(ext); j++) for (const side of [-1, 1]) g.set(x0 + i, CY + side * (Math.round(h) + j), i % 2 ? fc : shade(fc, 0.86));
    }
  }
  // Manteau.
  for (let i = 0; i <= s.ML; i++) {
    const u = i / s.ML, h = Math.max(0.6, mh(u));
    for (let y = -Math.round(h); y <= Math.round(h); y++) {
      const yn = y / Math.max(1, h);
      let c = flank(cols, 1 - u, yn, s.bl ?? 0.45);
      if (s.pat) for (const p of s.pat) c = applyPat(p, c, 1 - u, yn, x0 + i, CY + y, pctx);
      g.set(x0 + i, CY + y, c);
    }
  }
  // Tête.
  const hh = Math.max(2, s.MH * (s.kind === 'cuttle' ? 0.62 : 0.6));
  for (let i = 0; i <= hl; i++) for (let y = -Math.round(hh); y <= Math.round(hh); y++) {
    const q = i / hl, lim = hh * (0.85 + 0.15 * Math.sin(q * Math.PI));
    if (Math.abs(y) <= lim) g.set(x0 + s.ML + i, CY + y, y > lim * 0.4 ? mix(cols.m, cols.b, 0.4) : i === 0 ? shade(cols.m, 0.7) : shade(cols.m, 0.94));
  }
  s.post?.({ ...kit, x0, hx });
  g.outline(0.55, true);
  drawEye(g, x0 + s.ML + Math.round(hl * 0.55), CY - Math.round(hh * 0.25), s.eye?.[0] ?? 2, pick(cols, s.eye?.[1], 4));
  flush();
  return g;
}

// ---------------------------------------------------------------------------
// Crabes — vus de face, légèrement de dessus
// ---------------------------------------------------------------------------

export type CrabForm = 'oval' | 'box' | 'hex' | 'tri' | 'shield' | 'round' | 'pear' | 'heart' | 'diamond';
export interface CrabSpec {
  /** Carapace : demi-largeur, demi-hauteur, forme. */
  cw: number; ch: number; form?: CrabForm;
  /** Épines du pourtour : hauteur en pixels. */
  spikes?: number;
  /** Pattes : longueur, épaisseur, nombre par côté, allure. */
  legs?: [number, number, number?, ('bent' | 'spider' | 'flat' | 'hairy')?];
  /** Dernière paire en palette (crabes nageurs). */
  paddle?: boolean;
  /** Pinces : taille gauche, taille droite, forme, couleur des doigts. */
  claw?: [number, number, ('nip' | 'fat' | 'long')?, C?];
  /** Yeux : écart, hauteur du pédoncule, couleur. */
  eyes?: [number, number, C?];
  legC?: C;
  pat?: Pat[];
  post?: (k: FormKit & { cx: number; cy: number }) => void;
}

export function drawCrab(s: CrabSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const [kit, flush] = kitOf(g, cols, frame, seed);
  const cx = CX, cy = CY, { cw, ch } = s, form = s.form ?? 'oval';
  const pctx: PatCtx = { cols, seed, L: cw * 2 };
  const legC = pick(cols, s.legC, 6);
  /** Demi-largeur de la carapace à la hauteur v (-1 = avant, +1 = arrière). */
  const half = (v: number): number => {
    const a = Math.abs(v);
    if (a > 1) return 0;
    switch (form) {
      case 'box': return cw * Math.pow(1 - Math.pow(a, 4), 0.25);
      case 'hex': return cw * Math.min(1, 1.55 - a * 1.1);
      case 'tri': return cw * (0.3 + 0.7 * Math.pow((v + 1) / 2, 0.8)) * (v > 0.7 ? Math.sqrt(1 - ((v - 0.7) / 0.3) ** 2) * 0.4 + 0.6 : 1);
      case 'pear': return cw * (0.42 + 0.58 * Math.pow((1 - v) / 2, 0.7)) * Math.sqrt(1 - a ** 4);
      case 'shield': return cw * Math.sqrt(1 - a * a) * (v > 0 ? 1 - 0.28 * v : 1) + (v < 0 ? cw * 0.06 : 0);
      case 'heart': return cw * Math.sqrt(1 - a * a) * (v < 0 ? 1 : 1 - 0.45 * v * v);
      case 'diamond': return cw * Math.pow(1 - a, 0.75);
      case 'round': return cw * Math.sqrt(1 - a * a);
      default: return cw * Math.sqrt(1 - a * a);
    }
  };
  const [ll, lth, ln = 4, lstyle = 'bent'] = s.legs ?? [8, 1];
  // Pattes.
  for (const side of [-1, 1]) for (let k = 0; k < ln; k++) {
    const v = -0.15 + (k / Math.max(1, ln - 1)) * 0.85;
    const sx = cx + side * (half(v) - 1), sy = cy + v * ch;
    const step = frame % 2 ? ((k + (side > 0 ? 1 : 0)) % 2 ? 1 : -1) : 0;
    const isPaddle = s.paddle && k === ln - 1;
    const len = ll * (lstyle === 'spider' ? 1 : 0.86 + 0.14 * Math.sin((k / Math.max(1, ln - 1)) * Math.PI));
    const kx = sx + side * len * (lstyle === 'spider' ? 0.52 : 0.55), ky = sy - len * (lstyle === 'spider' ? 0.5 : lstyle === 'flat' ? 0.08 : 0.26) + k * 0.8;
    const fx = sx + side * (len * (lstyle === 'spider' ? 1.02 : 0.95) + k * 0.6) + step * 0.6, fy = sy + len * (lstyle === 'spider' ? 0.5 : lstyle === 'flat' ? 0.22 : 0.42) + k * 1.1 + step * 0.5;
    for (let w = 0; w < lth; w++) {
      g.line(sx, sy + w, kx, ky + w, w ? shade(legC, 0.8) : legC);
      g.line(kx, ky + w, fx, fy + (isPaddle ? 0 : w * 0.4), w ? shade(legC, 0.8) : legC);
    }
    g.set(kx, ky, shade(legC, 1.25));
    if (isPaddle) g.disc(fx, fy, 2.4, 1.6, pick(cols, 8));
    if (lstyle === 'hairy') for (let q = 0.2; q < 1; q += 0.2) { const hx = sx + (kx - sx) * q, hy = sy + (ky - sy) * q; kit.after(hx, hy - 1, pick(cols, 1)); kit.after(hx + side, hy - 2, pick(cols, 1)); }
  }
  // Pinces : bras, paume et deux doigts qui se font face.
  const [cl, cr, cstyle = 'fat', tipC] = s.claw ?? [5, 5];
  [cl, cr].forEach((size, idx) => {
    if (size <= 0) return;
    const side = idx === 0 ? -1 : 1;
    const shx = cx + side * half(-0.55) * 0.9, shy = cy - ch * 0.55;
    const elx = cx + side * (cw + 1.5 + size * 0.15), ely = cy - ch * 0.75 - size * 0.12;
    const open = frame % 2 ? 0.5 : 0;
    const px = cx + side * (cw * 0.72 + size * 0.5), py = cy - ch - size * 0.62 - 0.5;
    const rx = size * (cstyle === 'long' ? 0.75 : 0.6), ry = size * (cstyle === 'nip' ? 0.3 : cstyle === 'long' ? 0.34 : 0.46);
    g.line(shx, shy, elx, ely, legC); g.line(shx, shy + 1, elx, ely + 1, shade(legC, 0.8));
    g.line(elx, ely, px + side * rx * 0.5, py + ry * 0.6, legC); g.line(elx - side, ely, px + side * rx * 0.5 - side, py + ry * 0.6, legC);
    g.disc(px, py, rx, ry, (x, y) => (y < py - ry * 0.25 ? pick(cols, 8) : y > py + ry * 0.45 ? shade(cols.m, 0.8) : cols.m));
    const fl = size * (cstyle === 'long' ? 1.05 : 0.8), tc = pick(cols, tipC, 7);
    for (const up of [true, false]) {
      const pts: [number, number][] = [];
      for (let q = 0; q <= 1; q += 0.08) {
        const bow = Math.sin(q * Math.PI * 0.6) * ry * 0.28;
        pts.push([px - side * (rx * 0.55 + fl * q), up ? py - ry * 0.72 - bow + q * ry * 0.62 - open : py + ry * 0.72 + bow * 0.6 - q * ry * 0.52 + open * 0.6]);
      }
      limb(g, pts, Math.max(0.7, ry * 0.3), 0.4, (i, n) => (i > n * 0.42 ? tc : up ? cols.m : shade(cols.m, 0.85)));
    }
  });
  // Carapace.
  for (let y = -Math.round(ch); y <= Math.round(ch); y++) {
    const v = y / ch, w = half(v);
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      const u = x / Math.max(1, cw);
      let c = v < -0.45 ? pick(cols, 8) : v > 0.55 ? shade(cols.m, 0.78) : cols.m;
      if (cols.iris) c = flank(cols, (u + 1) / 2, v, 2);
      if (Math.abs(Math.abs(u) - 0.3) < 0.07 && v > -0.3 && v < 0.5) c = shade(c, 0.86);       // sillons
      if (v > 0.1 && v < 0.24 && Math.abs(u) < 0.3) c = shade(c, 0.86);
      if (s.pat) for (const p of s.pat) c = applyPat(p, c, (u + 1) / 2, v, cx + x, cy + y, pctx);
      g.set(cx + x, cy + y, c);
    }
  }
  if (s.spikes) for (let k = -4; k <= 4; k++) {
    const v = -0.85 + Math.abs(k) * 0.3, side = k < 0 ? -1 : 1;
    if (k === 0) continue;
    const w = half(v);
    for (let j = 1; j <= s.spikes; j++) g.set(cx + side * (Math.round(w) + j), cy + v * ch - j * 0.5, shade(cols.m, 0.9));
  }
  // Bouche claire.
  for (let x = -2; x <= 2; x++) g.tint(cx + x, cy - ch + 2, x % 2 ? mix(cols.m, cols.b, 0.7) : shade(cols.m, 0.7));
  const [eg, eh, ec] = s.eyes ?? [3, 2];
  s.post?.({ ...kit, cx, cy });
  g.outline(0.55, true);
  if (eh >= 0) for (const side of [-1, 1]) {
    const ex = cx + side * eg, ey0 = cy + Math.round(-ch * Math.sqrt(Math.max(0, 1 - (eg / (cw + 1)) ** 2)));
    for (let j = 0; j <= eh; j++) g.set(ex, ey0 - j, shade(cols.m, 0.7));
    g.set(ex, ey0 - eh - 1, BLACK); g.set(ex + side, ey0 - eh - 1, pick(cols, ec, 4));
  }
  flush();
  return g;
}

// ---------------------------------------------------------------------------
// Crevettes, écrevisses, homards — de profil
// ---------------------------------------------------------------------------

export interface CrustSpec {
  /** Longueur du corps déroulé, demi-épaisseur, enroulement de l'abdomen (0..1.4). */
  L: number; th: number; curl: number;
  /** Part de la carapace, nombre de segments de l'abdomen. */
  car?: number; segs?: number;
  /** Rostre (px, dentelé si négatif), antennes : longueur, antennules. */
  rostrum?: number; ant?: [number, number];
  /** Pinces : taille, longueur du bras, couleur des doigts. */
  claws?: [number, number, C?];
  /** Pattes marcheuses : nombre, longueur. */
  legs?: [number, number];
  /** Éventail caudal (px). */
  fan?: number;
  /** Bandes sur les segments. */
  band?: C;
  hump?: number;
  pat?: Pat[];
  post?: (k: FormKit & { hx: number; hy: number }) => void;
}

export function drawCrust(s: CrustSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const [kit, flush] = kitOf(g, cols, frame, seed);
  const pctx: PatCtx = { cols, seed, L: s.L };
  const car = Math.round(s.L * (s.car ?? 0.42)), segs = s.segs ?? 6;
  const hx = Math.round(CX + s.L * 0.42), hy = CY - Math.round(s.curl * 3);
  // Axe du corps : droit pour la carapace, puis l'abdomen se recourbe vers le bas.
  const path: [number, number, number][] = [];
  let x = hx, y = hy, ang = 0;
  for (let d = 0; d <= s.L; d++) {
    const q = d <= car ? 0 : (d - car) / (s.L - car);
    ang = s.curl * 1.25 * Math.pow(q, 1.3) + (frame % 2 ? 0.1 * q : 0);
    const r = d <= car
      ? s.th * (0.55 + 0.45 * Math.sin((d / car) * Math.PI * 0.62 + 0.25)) * (1 + (s.hump ?? 0) * Math.sin((d / car) * Math.PI))
      : s.th * (0.98 - 0.5 * q);
    path.push([x, y, r]);
    x -= Math.cos(ang); y += Math.sin(ang);
  }
  const [ex, ey] = path[path.length - 1];
  // Éventail caudal.
  const fan = s.fan ?? 5;
  for (let k = -2; k <= 2; k++) {
    const a = ang + k * 0.36;
    for (let d = 0; d <= fan * (1 - Math.abs(k) * 0.12); d += 0.5) g.disc(ex - Math.cos(a) * d, ey + Math.sin(a) * d, 0.6 + (d / fan) * 1.1, 0.6 + (d / fan) * 1.1, k % 2 ? pick(cols, 8) : cols.m);
  }
  // Pattes marcheuses et pléopodes.
  const [nl, ll] = s.legs ?? [4, 6];
  for (let k = 0; k < nl; k++) {
    const [px, py, pr] = path[Math.round(car * (0.3 + 0.6 * (k / Math.max(1, nl - 1))))];
    const sw = frame % 2 ? (k % 2 ? 1 : -1) : 0;
    g.line(px, py + pr, px - 1.5 + sw, py + pr + ll * 0.55, shade(cols.m, 0.8));
    g.line(px - 1.5 + sw, py + pr + ll * 0.55, px + 1 + sw, py + pr + ll, pick(cols, 6));
  }
  for (let k = 1; k < segs; k++) {
    const [px, py, pr] = path[car + Math.round(((s.L - car) * k) / segs)];
    g.set(px, py + pr + 1, shade(cols.m, 0.8)); g.set(px - (frame % 2), py + pr + 2, shade(cols.m, 0.8));
  }
  // Pinces.
  if (s.claws) {
    const [size, arm, tipC] = s.claws;
    const [bx, by, br] = path[Math.round(car * 0.25)];
    const ex2 = bx + arm * 0.5, ey2 = by + br + 2, px = bx + arm, py = by + br - 1 + (frame % 2 ? 1 : 0);
    g.line(bx, by + br, ex2, ey2, pick(cols, 6)); g.line(bx, by + br + 1, ex2, ey2 + 1, shade(cols.m, 0.8));
    g.line(ex2, ey2, px, py, pick(cols, 6)); g.line(ex2, ey2 + 1, px, py + 1, shade(cols.m, 0.8));
    g.disc(px + size * 0.45, py, size * 0.6, size * 0.4, (xx, yy) => (yy < py ? pick(cols, 8) : cols.m));
    const tc = pick(cols, tipC, 7), rx = size * 0.6, ry = size * 0.4;
    for (const up of [true, false]) {
      const pts: [number, number][] = [];
      for (let q = 0; q <= 1; q += 0.08) {
        const bow = Math.sin(q * Math.PI * 0.6) * ry * 0.25;
        pts.push([px + size * 0.45 + rx * 0.5 + size * 0.85 * q, up ? py - ry * 0.7 - bow + q * ry * 0.6 - (frame % 2 ? 0.5 : 0) : py + ry * 0.7 + bow * 0.5 - q * ry * 0.5]);
      }
      limb(g, pts, Math.max(0.7, ry * 0.32), 0.4, (i, n) => (i > n * 0.42 ? tc : up ? cols.m : shade(cols.m, 0.85)));
    }
  }
  // Corps : carapace d'un bloc puis segments qui se recouvrent.
  path.forEach(([px, py, pr], d) => {
    const inCar = d <= car, seg = inCar ? 0 : Math.floor(((d - car) / (s.L - car)) * segs);
    const edge = !inCar && Math.floor(((d - 1 - car) / (s.L - car)) * segs) !== seg;
    g.disc(px, py, 1, pr, (xx, yy) => {
      const yn = (yy - py) / Math.max(1, pr);
      let c = yn < -0.45 ? pick(cols, 8) : yn > 0.5 ? mix(cols.m, cols.b, 0.55) : cols.m;
      if (cols.iris) c = flank(cols, d / s.L, yn, 0.5);
      if (s.band !== undefined && !inCar && seg % 2 === 0 && yn < 0.5) c = mix(c, pick(cols, s.band), 0.7);
      if (s.pat) for (const p of s.pat) c = applyPat(p, c, d / s.L, yn, xx, yy, pctx);
      if (edge || d === car) c = shade(c, 0.68);
      return c;
    });
  });
  // Rostre.
  const ro = Math.abs(s.rostrum ?? 3);
  for (let j = 1; j <= ro; j++) {
    g.set(hx + j, hy - Math.round(s.th * 0.35) - Math.floor(j / 4), pick(cols, 8));
    if ((s.rostrum ?? 0) < 0 && j % 2 === 0 && j < ro) g.set(hx + j, hy - Math.round(s.th * 0.35) - Math.floor(j / 4) - 1, pick(cols, 8));
  }
  s.post?.({ ...kit, hx, hy });
  g.outline(0.58, true);
  // Œil et antennes (traits fins, posés après le contour).
  g.set(hx - 1, hy - Math.round(s.th * 0.25), BLACK); g.set(hx - 2, hy - Math.round(s.th * 0.25) - 1, WHITE);
  const [al, al2] = s.ant ?? [14, 6];
  const antC = mix(cols.m, cols.b, 0.55);
  for (let j = 0; j <= al; j++) {
    const q = j / al;
    g.under(hx + 1 + j * 0.55 - q * q * al * 0.1, hy + 1 - Math.sin(q * Math.PI * 0.75) * al * 0.5 + (frame % 2 ? q * 1.5 : 0), antC);
    g.under(hx - j * 0.75 + 1, hy - 1 - Math.sin(q * Math.PI * 0.5) * al * 0.42 - (frame % 2 ? q * 1.5 : 0), antC);
  }
  for (let j = 0; j <= al2; j++) g.under(hx + 1 + j, hy + 2 + Math.round(j * 0.35), antC);
  flush();
  return g;
}

// ---------------------------------------------------------------------------
// Coquillages
// ---------------------------------------------------------------------------

export interface ShellSpec {
  form: 'mussel' | 'clam' | 'oyster' | 'scallop' | 'spiral' | 'cockle' | 'open';
  w: number; h: number;
  /** Nombre de côtes rayonnantes ou d'anneaux de croissance. */
  ribs?: number;
  pat?: Pat[];
  post?: (k: FormKit & { cx: number; cy: number }) => void;
}

export function drawShell(s: ShellSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const [kit, flush] = kitOf(g, cols, frame, seed);
  const cx = CX, cy = CY, { w, h } = s, ribs = s.ribs ?? 6;
  const pctx: PatCtx = { cols, seed, L: w * 2 };
  const light = pick(cols, 8), dark = shade(cols.m, 0.72);
  const paint = (x: number, y: number, c: string, u: number, v: number): void => {
    let cc = cols.iris ? flank(cols, (u + 1) / 2, v, 2) : c;
    if (s.pat) for (const p of s.pat) cc = applyPat(p, cc, (u + 1) / 2, v, Math.round(x), Math.round(y), pctx);
    g.set(x, y, cc);
  };
  if (s.form === 'mussel') {
    // Goutte allongée, pointe à gauche, stries de croissance parallèles au bord.
    for (let i = 0; i <= w * 2; i++) {
      const u = i / (w * 2), up = h * Math.pow(Math.sin(u * Math.PI * 0.5), 0.75) * (1 - 0.12 * u), dn = h * 0.62 * Math.pow(Math.sin(u * Math.PI * 0.56), 0.9);
      for (let y = -Math.round(up); y <= Math.round(dn); y++) {
        const rr = (y + up) / Math.max(1, up + dn), ring = Math.floor((u * 0.9 + (1 - rr) * 0.25) * ribs * 1.6);
        paint(cx - w + i, cy + y, rr < 0.22 ? light : ring % 2 ? cols.m : shade(cols.m, 0.86), u * 2 - 1, rr * 2 - 1);
      }
    }
    for (let i = 3; i < w * 2 - 2; i++) g.tint(cx - w + i, cy + Math.round(h * 0.62 * Math.pow(Math.sin((i / (w * 2)) * Math.PI * 0.56), 0.9)) - 1, pick(cols, 1));
  } else if (s.form === 'clam' || s.form === 'cockle') {
    // Valve bombée : anneaux concentriques (palourde) ou côtes rayonnantes (coque), charnière en haut.
    for (let y = -h; y <= h; y++) {
      const v = y / h;
      const half = s.form === 'clam' ? w * Math.pow(Math.max(0, 1 - Math.abs(v) ** 2.4), 0.5) * (v < 0 ? 0.84 + 0.16 * (1 + v) : 1)
        : w * Math.sqrt(Math.max(0, 1 - v * v)) * (v < 0 ? 0.55 + 0.45 * (1 + v) : 1);
      for (let x = -Math.round(half); x <= Math.round(half); x++) {
        const u = x / w, r = Math.hypot(u * 0.9, (v + 1) * 0.5);
        const a = Math.atan2(v + 1.15, u);
        const stripe = s.form === 'clam' ? Math.floor(r * ribs * 1.5) % 2 === 0 : Math.floor((a / Math.PI) * ribs * 2.2) % 2 === 0;
        paint(cx + x, cy + y, v < -0.5 && Math.abs(u) < 0.5 ? light : stripe ? cols.m : s.form === 'clam' ? shade(cols.m, 0.85) : pick(cols, 7), u, v);
      }
    }
    g.disc(cx, cy - h, 2, 1.3, dark);
    if (s.form === 'cockle') for (let k = -ribs; k <= ribs; k += 2) g.set(cx + (k / ribs) * w * 0.94, cy + h * Math.sqrt(Math.max(0, 1 - ((k / ribs) * 0.94) ** 2)) + 1, cols.m);
  } else if (s.form === 'oyster') {
    // Contour irrégulier et feuilleté.
    for (let aa = 0; aa < 360; aa += 1) {
      const a = (aa / 180) * Math.PI, rr = 0.78 + 0.22 * vnoise(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, seed) + 0.07 * Math.sin(a * 7);
      for (let d = 0; d <= 1; d += 0.03) {
        const x = cx + Math.cos(a) * w * rr * d * (Math.cos(a) < 0 ? 1.12 : 0.95), y = cy + Math.sin(a) * h * rr * d;
        const layer = Math.floor(d * ribs + vnoise(x / 4, y / 4, seed + 2) * 1.5);
        paint(x, y, d > 0.86 ? pick(cols, 1) : layer % 2 ? cols.m : shade(cols.m, 0.84), Math.cos(a) * d, Math.sin(a) * d);
      }
    }
    g.disc(cx + w * 0.2, cy - h * 0.15, w * 0.3, h * 0.22, light);
  } else if (s.form === 'scallop') {
    // Éventail à côtes, bord festonné en haut, deux oreilles à la charnière en bas.
    for (const side of [-1, 1]) g.poly([[cx + side * 1, cy + h - 3], [cx + side * (w * 0.5), cy + h - 2], [cx + side * (w * 0.42), cy + h + 1], [cx + side * 1, cy + h + 1]], pick(cols, 7));
    for (let aa = 0; aa <= 180; aa += 0.5) {
      const a = (aa / 180) * Math.PI, rib = (aa / 180) * ribs, crest = Math.abs(Math.sin(rib * Math.PI));
      const R = 1 - 0.07 * (1 - crest);
      for (let d = 0; d <= 1; d += 0.02) {
        const x = cx - Math.cos(a) * w * R * d, y = cy + h - Math.sin(a) * (h * 2) * R * d * (0.72 + 0.28 * Math.sin(a));
        paint(x, y, crest < 0.28 ? dark : d > 0.5 && Math.floor(d * 9) % 3 === 0 ? pick(cols, 1) : crest > 0.75 ? light : cols.m, -Math.cos(a) * d, 1 - d * 2);
      }
    }
  } else if (s.form === 'spiral') {
    // Spire conique : tours empilés qui rétrécissent, ouverture en bas à droite.
    const turns = Math.max(3, ribs);
    for (let k = 0; k < turns; k++) {
      const q = k / turns, ww = w * (1 - q * 0.8), yy = cy + h - 3 - q * (h * 2 - 3) * 0.95, hh = Math.max(1.6, (h * 2 * 0.62) / turns + (1 - q) * 1.6);
      g.disc(cx - q * w * 0.25, yy, ww, hh, (xx, py) => {
        const u = (xx - (cx - q * w * 0.25)) / Math.max(1, ww), v = (py - yy) / hh;
        let c = v < -0.35 ? light : v > 0.45 ? dark : u > 0.55 ? shade(cols.m, 0.86) : cols.m;
        if (Math.floor((u + 1) * 3.2 + k) % 2 === 0 && v > -0.2 && v < 0.4) c = mix(c, cols.a, 0.4);
        if (s.pat) for (const p of s.pat) c = applyPat(p, c, (u + 1) / 2, v, xx, py, pctx);
        return c;
      });
    }
    g.disc(cx + w * 0.42, cy + h - 3, w * 0.42, 2.6, pick(cols, 1));
    g.disc(cx + w * 0.46, cy + h - 3, w * 0.24, 1.4, shade(cols.a, 0.7));
  } else {
    // Bivalve entrouvert : deux valves, chair et perle visibles.
    for (let i = 0; i <= w * 2; i++) {
      const u = i / (w * 2), up = h * 0.95 * Math.pow(Math.sin(u * Math.PI), 0.6), dn = h * 0.6 * Math.pow(Math.sin(u * Math.PI), 0.7);
      const gap = 2.6 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.5) + (frame % 2 ? 0.5 : 0);
      for (let y = 0; y <= Math.round(up); y++) paint(cx - w + i, cy - gap - y, y > up - 1.6 ? light : Math.floor((y + u * 6) * 0.8) % 2 ? cols.m : shade(cols.m, 0.86), u * 2 - 1, -y / h);
      for (let y = 0; y <= Math.round(dn); y++) paint(cx - w + i, cy + gap * 0.4 + 1 + y, y < 1 ? pick(cols, 1) : shade(cols.m, 0.8), u * 2 - 1, y / h);
      for (let y = -Math.round(gap); y <= Math.round(gap * 0.4); y++) if (u > 0.12) g.under(cx - w + i, cy + y, shade(cols.a, 0.55));
    }
  }
  s.post?.({ ...kit, cx, cy });
  g.outline(0.58, true);
  flush();
  return g;
}

// ---------------------------------------------------------------------------
// Tortue marine et hippocampe
// ---------------------------------------------------------------------------

export interface TurtleSpec { L: number; H: number; flip?: number; pat?: Pat[] }
export function drawTurtle(s: TurtleSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const pctx: PatCtx = { cols, seed, L: s.L };
  const x0 = Math.round(CX - s.L / 2), fl = s.flip ?? s.L * 0.5, sw = frame % 2 ? 2 : 0;
  const skin = mix(cols.m, cols.b, 0.55), skinD = shade(skin, 0.8);
  const speck = (x: number, y: number): string => (hash2(seed, x, y) % 4 === 0 ? shade(cols.a, 0.9) : (x + y) % 5 === 0 ? skinD : skin);
  // Nageoire arrière, queue, puis grande nageoire avant qui bat.
  g.poly([[x0 + 4, CY + 2], [x0 - 5, CY + 5 + sw * 0.5], [x0 - 3, CY + 8 + sw * 0.5], [x0 + 7, CY + 5]], speck);
  g.poly([[x0 + 1, CY], [x0 - 4, CY + 1], [x0 + 1, CY + 2]], skinD);
  g.poly([[x0 + s.L * 0.7, CY + 2], [x0 + s.L * 0.34 - sw, CY + fl * 0.62 + sw], [x0 + s.L * 0.24 - sw, CY + fl * 0.72 + sw], [x0 + s.L * 0.3, CY + fl * 0.46], [x0 + s.L * 0.52, CY + 3]], speck);
  // Tête et bec.
  const hx = x0 + s.L + 4, hy = CY - 1;
  g.disc(hx - 2, hy + 1, 5, 2.6, skin);
  g.disc(hx, hy, 4.2, 3.4, speck);
  g.poly([[hx + 3, hy - 1], [hx + 6, hy + 1], [hx + 3, hy + 3]], skin);
  // Plastron clair, puis dossière en dôme avec ses écailles.
  for (let i = 0; i <= s.L; i++) {
    const u = i / s.L, up = s.H * Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * u)), 0.6), dn = s.H * 0.42 * Math.pow(Math.sin(Math.PI * u), 0.5);
    for (let y = 0; y <= Math.round(dn); y++) g.set(x0 + i, CY + 1 + y, y > dn - 1 ? shade(cols.b, 0.82) : cols.b);
    for (let y = 0; y <= Math.round(up); y++) {
      const v = y / Math.max(1, s.H);
      const seam = (i + Math.round(v * 6)) % 7 === 0 || Math.abs(v - 0.42) < 0.07 || Math.abs(v - 0.8) < 0.05;
      let c = y < 2 ? shade(cols.m, 0.7) : seam ? shade(cols.m, 0.66) : v > 0.6 ? pick(cols, 8) : (i + y) % 3 === 0 ? mix(cols.m, cols.a, 0.4) : cols.m;
      if (cols.iris) c = seam ? shade(flank(cols, 1 - u, -0.2, 2), 0.7) : flank(cols, 1 - u, -0.2, 2);
      if (s.pat) for (const p of s.pat) c = applyPat(p, c, 1 - u, -v, x0 + i, CY - y, pctx);
      g.set(x0 + i, CY - y, c);
    }
  }
  g.outline(0.55, true);
  drawEye(g, hx + 1, hy - 1, 1);
  g.set(hx + 4, hy + 2, shade(skin, 0.5)); g.set(hx + 3, hy + 2, shade(skin, 0.5));
  return g;
}

export interface SeahorseSpec { H: number; crown?: boolean; pat?: Pat[] }
export function drawSeahorse(s: SeahorseSpec, cols: Cols, frame: number, seed: number): Grid {
  const g = new Grid(GW, GH);
  const pctx: PatCtx = { cols, seed, L: s.H };
  const k = s.H / 30, top = CY - s.H / 2;
  const P = (x: number, y: number): [number, number] => [CX + x * k, top + y * k];
  const paintCol = (x: number, y: number): string => {
    const v = (y - top) / s.H, u = (x - CX) / (10 * k);
    let c = u > 0.25 ? cols.b : u > 0 ? mix(cols.m, cols.b, 0.5) : u < -0.45 ? shade(cols.m, 0.78) : cols.m;
    if (cols.iris) c = flank(cols, v, u, 0.3);
    if (Math.round(y) % 3 === 0 && u < 0.3) c = shade(c, 0.84);   // anneaux osseux
    if (s.pat) for (const p of s.pat) c = applyPat(p, c, v, u, Math.round(x), Math.round(y), pctx);
    return c;
  };
  // Nageoire dorsale qui vibre.
  const [fx, fy] = P(-6.5, 13);
  for (let j = -4; j <= 4; j++) for (let d = 0; d <= 3.5 * k - Math.abs(j) * 0.3 + (frame % 2 && j % 2 ? 1 : 0); d++) g.set(fx - d, fy + j * k * 0.7, j % 2 ? pick(cols, 2) : shade(cols.a, 1.3));
  // Queue enroulée.
  const tail: [number, number][] = [];
  for (let a = 0; a <= 1; a += 0.01) {
    const ang = -Math.PI * 0.5 + a * Math.PI * 2.9, r = (6.2 * (1 - a) + 0.9) * k;
    const [qx, qy] = P(-1 + 5.6 * (1 - a) - 5.6, 23.2);
    tail.push([qx + Math.cos(ang) * r + 5.6 * k * (1 - a) * 0.2, qy + Math.sin(ang) * r * 0.82]);
  }
  limb(g, tail, 2.5 * k, 0.6, (i, n) => (i / n > 0.5 && i % 4 < 2 ? shade(cols.m, 0.84) : cols.m));
  // Tronc, cou, tête et museau en tube.
  const body: [number, number, number][] = [[-1.5, 20, 3], [-1, 17.5, 4], [-0.5, 15, 4.8], [-0.5, 12.5, 4.6], [-1.2, 10, 3.6], [-1.6, 8, 2.9], [-1, 6.2, 2.9], [0.8, 4.8, 3.5]];
  for (let i = 0; i < body.length - 1; i++) for (let q = 0; q <= 1; q += 0.1) {
    const [x1, y1, r1] = body[i], [x2, y2, r2] = body[i + 1];
    const [px, py] = P(x1 + (x2 - x1) * q, y1 + (y2 - y1) * q);
    g.disc(px, py, (r1 + (r2 - r1) * q) * k, (r1 + (r2 - r1) * q) * k * 0.9, paintCol);
  }
  const [sx, sy] = P(3, 5.6);
  for (let j = 0; j <= 7 * k; j++) { g.set(sx + j, sy + j * 0.12, cols.m); g.set(sx + j, sy + 1 + j * 0.12, mix(cols.m, cols.b, 0.5)); if (j < 3 * k) g.set(sx + j, sy - 1, cols.m); }
  // Couronne.
  const [cx0, cy0] = P(0.2, 1.4);
  if (s.crown) {
    for (const [dx, hh] of [[-3, 3], [-1, 5], [1, 4], [3, 2]] as const) for (let j = 0; j <= hh * k; j++) g.set(cx0 + dx * k * 0.8, cy0 - j, j > hh * k - 1.5 ? pick(cols, 10) : pick(cols, 2));
    for (let x = -3; x <= 3; x++) g.set(cx0 + x * k * 0.8, cy0 + 1, pick(cols, 2));
  } else for (let j = 0; j <= 2 * k; j++) { g.set(cx0 - 1, cy0 - j + 1, cols.m); g.set(cx0 + 1, cy0 - j + 2, cols.m); }
  g.outline(0.55, true);
  const [ex, ey] = P(1.4, 4.2);
  drawEye(g, ex, ey, k > 1.1 ? 2 : 1);
  return g;
}
