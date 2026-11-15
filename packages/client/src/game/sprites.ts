import { PAINTS } from '../../../shared/src/gear';
// Pixel art 100 % programmatique : aucun fichier image, aucun asset tiers.
// Tout est dessiné une fois dans de petits canvas puis réutilisé (cache).
import type { Species, Silhouette } from '../../../shared/src/index';
import { Grid, makeCanvas, shade, mix, type Spr } from './pix';
import { fishGrids } from './fish-art';

export { makeCanvas, rgb, shade, mix, type Spr } from './pix';


/** Sprite à partir d'un dessin en caractères : une lettre = une couleur. */
function ascii(rows: string[], pal: Record<string, string>): Spr {
  const g = new Grid(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] && g.set(x, y, pal[ch])));
  return g.toCanvas();
}

// ---------------------------------------------------------------------------
// Illustrations d'espèces : bestiaire, aquarium, écran de capture
// Les dessins eux-mêmes vivent dans fish-art.ts (moteur) et fish-specs.ts (une fiche par espèce).
// ---------------------------------------------------------------------------

const fishCache = new Map<string, Spr>();

/** Image d'une espèce, tête à droite. `color` = robe (0 naturelle), `frame` = 0 ou 1 pour la nage ; les deux images ont la même taille. */
export function fishSprite(sp: Species, color = 0, frame = 0): Spr {
  const key = `${sp.id}:${color}:${frame % 2}`;
  let s = fishCache.get(key);
  if (s) return s;
  const [a, b] = fishGrids(sp, color);
  fishCache.set(`${sp.id}:${color}:0`, a.toCanvas());
  fishCache.set(`${sp.id}:${color}:1`, b.toCanvas());
  s = fishCache.get(key)!;
  return s;
}

// ---------------------------------------------------------------------------
// Ombres dans l'eau (vue du dessus) : seule la silhouette est lisible
// ---------------------------------------------------------------------------

export const SHADOW_FRAMES = 8;
const shadowCache = new Map<string, Spr[]>();
const SH: Record<Silhouette, { L: number; W: number; amp: number; size: number }> = {
  crab: { L: 9, W: 7, amp: 0.3, size: 24 },
  small: { L: 9, W: 1.7, amp: 1.4, size: 14 },
  long: { L: 24, W: 1.5, amp: 2.6, size: 30 },
  massive: { L: 18, W: 4.6, amp: 1.6, size: 26 },
  shark: { L: 30, W: 4, amp: 2.2, size: 40 },
  ray: { L: 16, W: 10, amp: 0, size: 40 },
  cephalo: { L: 10, W: 3.6, amp: 0, size: 30 },
  giant: { L: 64, W: 10, amp: 3, size: 80 },
};

export function shadowFrames(kind: Silhouette, luminous = false): Spr[] {
  const cacheKey = luminous ? `${kind}:light` : kind;
  let frames = shadowCache.get(cacheKey);
  if (frames) return frames;
  frames = [];
  const p = SH[kind];
  const col = luminous ? '#8fc7d2' : '#06182b';
  for (let f = 0; f < SHADOW_FRAMES; f++) {
    const ph = (f / SHADOW_FRAMES) * Math.PI * 2;
    const g = new Grid(p.size, p.size);
    const c = p.size / 2;
    const x1 = c + p.L / 2; // tête à droite
    if (kind === 'crab') {
      for (let x = -5; x <= 5; x++) for (let y = -4; y <= 4; y++) g.set(c+x,c+y,col);
      for (const side of [-1,1]) {
        for (let leg = 0; leg < 4; leg++) for (let n = 0; n < 5; n++) g.set(c+side*(5+n),c-3+leg*2+n*0.3*Math.sin(ph),col);
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) g.set(c+side*(6+x),c-8+y,col);
      }
    } else if (kind === 'ray') {
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
  shadowCache.set(cacheKey, frames);
  return frames;
}

// ---------------------------------------------------------------------------
// Bateau (vue du dessus, proue à droite) — trois allures selon le niveau de coque
// ---------------------------------------------------------------------------

const boatCache = new Map<string, Spr>();
export function boatSprite(tier: number, model='skiff', paint=0): Spr {
  const key=`${tier}:${model}:${paint}`;
  let s = boatCache.get(key);
  if (s) return s;
  const L = [26,31,37][tier] + (model==='trawler'?10:model==='sailboat'?7:model==='cutter'?3:0);
  const W = [5.5,6.5,7.5][tier] + (model==='trawler'?3:model==='sailboat'?1:0);
  const size = L + 6;
  const g = new Grid(size, size);
  const c = Math.floor(size / 2);
  const x0 = c - Math.floor(L / 2);
  const paintColor=PAINTS[paint]??PAINTS[0];
  const hull=shade(paintColor,.65);
  const deck=mix(paintColor,'#eee3cf',.3);
  const trim=mix(paintColor,'#ffffff',.25);
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
  for (let x = cab0; x <= cab1; x++) for (let y = -Math.round(W * 0.55); y <= Math.round(W * 0.55); y++) g.set(x, c + y, x === cab0 || x === cab1 || Math.abs(y) === Math.round(W * 0.55) ? trim : y < 0 ? mix(paintColor,'#ffffff',.45) : mix(paintColor,'#eee3cf',.3));
  g.set(cab1 - 1, c - 1, '#6fc3e8'); g.set(cab1 - 1, c + 1, '#6fc3e8');
  // Mât(s) et voile vue de dessus
  const masts = model==='trawler'?[]:model==='sailboat'||tier===2?[0.45,0.72]:[0.6];
  for (const m of masts) {
    const mx = x0 + Math.round(L * m);
    for (let y = -Math.round(W * 1.15); y <= Math.round(W * 1.15); y++) { g.set(mx, c + y, '#fbfaf4'); g.set(mx + 1, c + y, Math.abs(y) % 3 === 0 ? '#f0eee4' : paintColor); }
    g.set(mx, c, '#5a3a1c'); g.set(mx + 1, c, '#5a3a1c');
  }
  if(model==='trawler') {
    for(let x=Math.floor(c-3);x<=c+6;x++) for(let y=Math.floor(c-W+2);y<=c+W-2;y++) g.set(x,y,Math.abs(y-c)<2?'#6ab8cb':mix(paintColor,'#eee3cf',.35));
    for(let x=Math.floor(x0+4);x<x0+12;x++) g.set(x,c,'#9e8966');
  }
  s = g.outline(0.45).toCanvas();
  boatCache.set(key, s);
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
