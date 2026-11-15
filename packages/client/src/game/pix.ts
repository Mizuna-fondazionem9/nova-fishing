// Outils de dessin au pixel, sans dépendance au navigateur tant qu'on n'appelle pas toCanvas().
// Les illustrations sont calculées dans une grille de couleurs : on peut donc les comparer dans un test.

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
/** Assombrit (f < 1) ou éclaircit (f > 1) une couleur. */
export const shade = (hex: string, f: number): string => {
  const [r, g, b] = rgb(hex);
  return f <= 1 ? toHex(r * f, g * f, b * f) : toHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
};
export const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

/** Grille de pixels. Une case vaut une couleur « #rrggbb » ou null (transparent). */
export class Grid {
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
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null;
  }
  /** Ne peint que les cases déjà remplies (motif posé sur un corps). */
  tint(x: number, y: number, c: string): void {
    if (this.get(x, y)) this.set(x, y, c);
  }
  /** Ne peint que les cases vides (détail glissé derrière un corps). */
  under(x: number, y: number, c: string): void {
    if (!this.get(x, y)) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  disc(cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number) => string)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, typeof c === 'string' ? c : c(x, y));
  }
  /** Remplit un polygone (liste de sommets). */
  poly(pts: [number, number][], c: string | ((x: number, y: number) => string)): void {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, typeof c === 'string' ? c : c(x, y));
      }
  }
  /**
   * Assombrit les pixels de bord : contour intérieur, la silhouette ne grossit pas.
   * Avec `rim`, les couleurs déjà très sombres reçoivent au contraire un liseré clair, pour rester lisibles sur fond nuit.
   */
  outline(f = 0.5, rim = false): this {
    const src = this.d.slice();
    const at = (x: number, y: number): string | null => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const c = at(x, y);
        if (!c || c.length !== 7 || (at(x - 1, y) && at(x + 1, y) && at(x, y - 1) && at(x, y + 1))) continue;
        const [r, g, b] = rgb(c);
        this.d[y * this.w + x] = rim && 0.299 * r + 0.587 * g + 0.114 * b < 58 ? mix(c, '#8ea2c8', 0.42) : shade(c, f);
      }
    return this;
  }
  /** Boîte englobante des pixels remplis : [x0, y0, x1, y1], ou null si la grille est vide. */
  bounds(): [number, number, number, number] | null {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.d[y * this.w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
  crop(x0: number, y0: number, x1: number, y1: number): Grid {
    const out = new Grid(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.d[(y - y0) * out.w + (x - x0)] = this.get(x, y);
    return out;
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
