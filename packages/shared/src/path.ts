// Recherche de chemin A* sur la grille de tuiles, pour contourner les îles.

export interface Pt {
  x: number;
  y: number;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
] as const;

/** Vrai si le segment a -> b ne traverse aucune tuile bloquée (échantillonnage tous les 0,4 tuile). */
export function lineFree(blocked: (tx: number, ty: number) => boolean, a: Pt, b: Pt): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (blocked(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t))) return false;
  }
  return true;
}

/** Tuile libre la plus proche de (tx, ty), dans un rayon donné. */
export function nearestFree(blocked: (tx: number, ty: number) => boolean, tx: number, ty: number, radius = 8): Pt | null {
  if (!blocked(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= radius; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!blocked(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
      }
  return null;
}

/**
 * Chemin de (sx, sy) à (gx, gy) en coordonnées de tuiles flottantes.
 * Renvoie des points de passage lissés (centres de tuiles), ou null si rien n'est atteignable.
 * Si la recherche dépasse `maxNodes`, renvoie le chemin vers le point exploré le plus proche du but.
 */
export function findPath(blocked: (tx: number, ty: number) => boolean, sx: number, sy: number, gx: number, gy: number, maxNodes = 30000): Pt[] | null {
  const start = nearestFree(blocked, Math.floor(sx), Math.floor(sy), 4);
  const goal = nearestFree(blocked, Math.floor(gx), Math.floor(gy), 10);
  if (!start || !goal) return null;
  const from: Pt = { x: sx, y: sy };
  const to: Pt = { x: goal.x === Math.floor(gx) && goal.y === Math.floor(gy) ? gx : goal.x + 0.5, y: goal.x === Math.floor(gx) && goal.y === Math.floor(gy) ? gy : goal.y + 0.5 };
  if (lineFree(blocked, from, to)) return [to];

  const W = 16384;
  const key = (x: number, y: number): number => (x - start.x + W / 2) * W + (y - start.y + W / 2);
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const pos = new Map<number, Pt>();
  const heap: { f: number; k: number }[] = [];
  const push = (f: number, k: number): void => {
    heap.push({ f, k });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): { f: number; k: number } => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const hx = (x: number, y: number): number => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  };

  const sk = key(start.x, start.y);
  g.set(sk, 0);
  pos.set(sk, start);
  push(hx(start.x, start.y), sk);
  let bestK = sk;
  let bestH = hx(start.x, start.y);
  let found = false;
  let expanded = 0;
  while (heap.length && expanded < maxNodes) {
    const { k } = pop();
    const p = pos.get(k)!;
    const gk = g.get(k)!;
    expanded++;
    const h = hx(p.x, p.y);
    if (h < bestH) {
      bestH = h;
      bestK = k;
    }
    if (p.x === goal.x && p.y === goal.y) {
      bestK = k;
      found = true;
      break;
    }
    for (const [dx, dy, c] of DIRS) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (Math.abs(nx - start.x) >= W / 2 - 2 || Math.abs(ny - start.y) >= W / 2 - 2) continue;
      if (blocked(nx, ny)) continue;
      if (dx && dy && (blocked(p.x + dx, p.y) || blocked(p.x, p.y + dy))) continue; // pas de coupe de coin
      const nk = key(nx, ny);
      const ng = gk + c;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, k);
        pos.set(nk, { x: nx, y: ny });
        push(ng + hx(nx, ny) * 1.001, nk);
      }
    }
  }
  if (bestK === sk) return null;
  const raw: Pt[] = [];
  for (let k: number | undefined = bestK; k !== undefined; k = parent.get(k)) {
    const p = pos.get(k)!;
    raw.push({ x: p.x + 0.5, y: p.y + 0.5 });
  }
  raw.reverse();
  if (found) raw[raw.length - 1] = to;
  // Lissage : on saute les points intermédiaires tant que la ligne droite est libre.
  const out: Pt[] = [];
  let cur = from;
  let i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !lineFree(blocked, cur, raw[j])) j--;
    out.push(raw[j]);
    cur = raw[j];
    i = j + 1;
  }
  return out;
}
