// Rendu du monde par chunks : chaque chunk est peint une fois dans un canvas hors écran (pixel art avec tramage),
// gardé dans un cache à taille bornée, puis simplement recopié à chaque image.
import { tileAt, heightAt, rand2, hash2, CHUNK, TILE, BIOME_IDS, type BiomeId, type Tile } from '../../../shared/src/index';
import { makeCanvas, rgb, mix, getDecor, type Spr } from './sprites';

export const CHUNK_PX = CHUNK * TILE;

const PAL: Record<BiomeId, string[]> = {
  river: ['#82bfa0','#67a78c','#4c8a7c','#38726c','#295d60'],
  volcanic: ['#e87f69','#c95651','#a33942','#7c273a','#531e32'],
  crystal: ['#b1f0ec','#79dfe3','#54bdcf','#3895bc','#296b99'],
  spectral: ['#7ac7a4','#489b8e','#2d756e','#205453','#163b43'],
  coastal: ['#6fd3c9', '#46b3c2', '#2f93b8', '#2577a6', '#1d5f8f'],
  tropical: ['#63dcd0', '#33c0cf', '#1aa0c8', '#1482b8', '#0f66a0'],
  reef: ['#7fe6d0', '#4fd0c4', '#2fb4c0', '#2496b4', '#1b7aa3'],
  temperate: ['#5fb3b8', '#3f93a8', '#2f7898', '#255f86', '#1c4a70'],
  polar: ['#a9d6e2', '#7fbdd6', '#5a9fc4', '#427fae', '#2f6494'],
  deep: ['#3a7ea6', '#2b6592', '#1f4f7c', '#173d66', '#102c50'],
  abyss: ['#2a5a86', '#1e456e', '#153356', '#0e2440', '#08182c'],
  mystic: ['#6a6fd0', '#5055b8', '#3d3f9c', '#2e2c80', '#1f1c5e'],
};
const SAND = '#ecd9a0';

/** Couleur 0xAABBGGRR (ordre des octets d'ImageData sur machine petit-boutiste). */
const u32 = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return (255 << 24) | (b << 16) | (g << 8) | r;
};
const WATER = BIOME_IDS.map((b) => PAL[b].map(u32));
const SHALLOW1 = BIOME_IDS.map((b) => u32(mix(PAL[b][0], SAND, 0.3)));
const SHALLOW2 = BIOME_IDS.map((b) => u32(mix(PAL[b][0], SAND, 0.58)));
const C = {
  foam: u32('#f1fffb'), wet: u32('#cbb57a'), sand: u32(SAND), sandD: u32('#dcc688'),
  grassT: [u32('#62b84c'), u32('#4f9c3f'), u32('#7ccc5c')], grassM: [u32('#5a9c50'), u32('#4a8844'), u32('#6fb062')],
  snow: [u32('#eef4f8'), u32('#d6e2ec'), u32('#ffffff')], rock: [u32('#8a8f96'), u32('#767b82'), u32('#9da2a8')],
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export interface Chunk {
  cx: number;
  cy: number;
  canvas: Spr;
  /** 1 = terre, par tuile. */
  land: Uint8Array;
  biome: Uint8Array;
  /** Points d'écume animée le long du rivage (x, y en pixels locaux). */
  foam: Uint16Array;
  used: number;
}

export class Terrain {
  private chunks = new Map<string, Chunk>();
  private landCache = new Map<string, Int8Array>();
  frame = 0;
  constructor(public seed: number, private maxChunks = 42) {}

  has(cx: number, cy: number): boolean {
    return this.chunks.has(`${cx},${cy}`);
  }

  /** Chunk prêt à dessiner, ou undefined s'il n'est pas encore généré. */
  peek(cx: number, cy: number): Chunk | undefined {
    const c = this.chunks.get(`${cx},${cy}`);
    if (c) c.used = this.frame;
    return c;
  }

  get count(): number {
    return this.chunks.size;
  }

  /** Oublie les images des chunks (pas les données de terrain) : ils seront redessinés autour de la caméra. */
  clearImages(): void {
    this.chunks.clear();
  }

  /** Vrai si une image de chunk a été vidée par le navigateur (contexte graphique perdu). */
  imagesLost(): boolean {
    for (const c of this.chunks.values()) {
      const ctx = c.canvas.getContext('2d');
      if (!ctx || (ctx as CanvasRenderingContext2D & { isContextLost?: () => boolean }).isContextLost?.()) return true;
      // Un chunk est entièrement opaque : un pixel transparent en son centre signifie qu'il a été effacé.
      return ctx.getImageData(c.canvas.width >> 1, c.canvas.height >> 1, 1, 1).data[3] === 0;
    }
    return false;
  }

  /** Vrai si la tuile est de la terre. Cache léger, utilisable loin de l'écran (recherche de chemin). */
  isLand = (tx: number, ty: number): boolean => {
    const cx = Math.floor(tx / CHUNK);
    const cy = Math.floor(ty / CHUNK);
    const key = `${cx},${cy}`;
    const c = this.chunks.get(key);
    const i = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
    if (c) return c.land[i] === 1;
    let arr = this.landCache.get(key);
    if (!arr) {
      if (this.landCache.size > 600) this.landCache.clear();
      arr = new Int8Array(CHUNK * CHUNK).fill(-1);
      this.landCache.set(key, arr);
    }
    if (arr[i] < 0) arr[i] = heightAt(this.seed, tx, ty) > 0 ? 1 : 0;
    return arr[i] === 1;
  };

  /** Obstacle pour la navigation : la terre et ses voisines immédiates (marge pour la coque). */
  blocked = (tx: number, ty: number): boolean =>
    this.isLand(tx, ty) || this.isLand(tx + 1, ty) || this.isLand(tx - 1, ty) || this.isLand(tx, ty + 1) || this.isLand(tx, ty - 1);

  /** Génère un chunk (coûteux : à appeler au plus une fois par image). */
  build(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`;
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const seed = this.seed;
    const N = CHUNK + 2;
    const S: Tile[] = new Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) S[j * N + i] = tileAt(seed, cx * CHUNK - 1 + i, cy * CHUNK - 1 + j);
    const H = new Float32Array(N * N);
    const D = new Float32Array(N * N);
    const B = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      H[k] = S[k].h;
      D[k] = S[k].depth;
      B[k] = BIOME_IDS.indexOf(S[k].biome);
    }
    const land = new Uint8Array(CHUNK * CHUNK);
    const biome = new Uint8Array(CHUNK * CHUNK);
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const s = S[(ty + 1) * N + tx + 1];
        land[ty * CHUNK + tx] = s.land ? 1 : 0;
        biome[ty * CHUNK + tx] = B[(ty + 1) * N + tx + 1];
      }

    const [canvas, ctx] = makeCanvas(CHUNK_PX, CHUNK_PX);
    const img = ctx.createImageData(CHUNK_PX, CHUNK_PX);
    const px = new Uint32Array(img.data.buffer);
    const foam: number[] = [];
    const gx0 = cx * CHUNK_PX;
    const gy0 = cy * CHUNK_PX;
    for (let y = 0; y < CHUNK_PX; y++) {
      const fy = y / TILE + 0.5;
      const j0 = Math.floor(fy);
      const ty = fy - j0;
      for (let x = 0; x < CHUNK_PX; x++) {
        const fx = x / TILE + 0.5;
        const i0 = Math.floor(fx);
        const tx = fx - i0;
        const k = j0 * N + i0;
        const h = (H[k] * (1 - tx) + H[k + 1] * tx) * (1 - ty) + (H[k + N] * (1 - tx) + H[k + N + 1] * tx) * ty;
        const thr = BAYER[(y & 3) * 4 + (x & 3)];
        const n = (hash2(seed + 5, gx0 + x, gy0 + y) & 1023) / 1024;
        // Échantillon le plus proche, décalé par la trame : transitions tramées entre biomes et climats.
        const jx = Math.min(N - 1, Math.max(0, Math.round(fx + (thr - 0.5) * 0.9)));
        const jy = Math.min(N - 1, Math.max(0, Math.round(fy + (BAYER[(x & 3) * 4 + (y & 3)] - 0.5) * 0.9)));
        const near = S[jy * N + jx];
        let col: number;
        if (h > 0) {
          if (h < 0.004) col = C.wet;
          else if (h < 0.017 + (thr - 0.5) * 0.008) col = n < 0.12 ? C.sandD : C.sand;
          else {
            const set = h > 0.085 + (thr - 0.5) * 0.02 ? (near.temp < 0.3 ? C.snow : C.rock) : near.temp < 0.22 ? C.snow : near.temp > 0.66 ? C.grassT : C.grassM;
            col = n < 0.16 ? set[1] : n > 0.94 ? set[2] : set[0];
          }
        } else {
          const shore = -h / 0.17;
          if (shore < 0.03 - thr * 0.018) col = C.foam;
          else {
            const b = B[jy * N + jx];
            if (shore < 0.045 + thr * 0.04) col = SHALLOW2[b];
            else if (shore < 0.1 + thr * 0.1) col = SHALLOW1[b];
            else {
              const d = ((D[k] * (1 - tx) + D[k + 1] * tx) * (1 - ty) + (D[k + N] * (1 - tx) + D[k + N + 1] * tx) * ty) * 4.999;
              let band = Math.floor(d);
              if (d - band > thr && band < 4) band++;
              col = WATER[b][band];
            }
            if (shore > 0.03 && shore < 0.085 && n < 0.035 && foam.length < 1400) foam.push(x, y);
          }
        }
        px[y * CHUNK_PX + x] = col;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Décors : fonds marins visibles par transparence, puis végétation et rochers.
    const dec = getDecor();
    const put = (s: Spr, tx: number, ty: number, alpha = 1): void => {
      ctx.globalAlpha = alpha;
      ctx.drawImage(s, Math.round(tx * TILE + TILE / 2 - s.width / 2), Math.round(ty * TILE + TILE - s.height));
    };
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const s = S[(ty + 1) * N + tx + 1];
        const r = rand2(seed + 91, cx * CHUNK + tx, cy * CHUNK + ty);
        if (s.land) continue;
        if (s.biome === 'reef' && r < 0.3 && s.shore > 0.1) put(r < 0.15 ? dec.coralA : dec.coralB, tx, ty, 0.42 + 0.3 * (1 - s.shore));
        else if (s.shore > 0.08 && s.shore < 0.34 && r < 0.07) put(r < 0.035 ? dec.rock : dec.weed, tx, ty, 0.4);
        else if (s.biome === 'polar' && r > 0.965) put(dec.ice, tx, ty, 0.95);
      }
    for (let ty = 1; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const s = S[(ty + 1) * N + tx + 1];
        if (!s.land || s.h < 0.024) continue;
        const r = rand2(seed + 92, cx * CHUNK + tx, cy * CHUNK + ty);
        if (s.temp > 0.66) {
          if (r < 0.13) put(dec.palm, tx, ty);
          else if (r < 0.2) put(dec.bush, tx, ty);
        } else if (s.temp < 0.22) {
          if (r < 0.08) put(dec.snowPine, tx, ty);
          else if (r < 0.13) put(dec.snowRock, tx, ty);
        } else if (r < 0.17) put(dec.pine, tx, ty);
        else if (r < 0.24) put(dec.bush, tx, ty);
        else if (r > 0.965) put(dec.rock, tx, ty);
      }
    ctx.globalAlpha = 1;

    const chunk: Chunk = { cx, cy, canvas, land, biome, foam: Uint16Array.from(foam), used: this.frame };
    this.chunks.set(key, chunk);
    this.landCache.delete(key);
    this.evict();
    return chunk;
  }

  /** Décharge les chunks les moins récemment vus : la mémoire ne grandit pas avec la distance parcourue. */
  private evict(): void {
    if (this.chunks.size <= this.maxChunks) return;
    const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length - this.maxChunks; i++) {
      old[i][1].canvas.width = 0; // libère tout de suite la mémoire du canvas
      this.chunks.delete(old[i][0]);
    }
  }
}
