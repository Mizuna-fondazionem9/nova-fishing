// Illustration d'une espèce : choisit le bon dessinateur d'après sa fiche et rend les deux images de nage.
// Module pur : utilisable dans les tests sans navigateur.
import type { Species } from '../../../shared/src/index';
import { drawAnimal } from './catalog-art/animals';
import { Grid } from './pix';
import { drawFish, makeCols, seedOf, type Cols } from './fish-engine';
import { drawRay, drawCeph, drawCrab, drawCrust, drawShell, drawTurtle, drawSeahorse } from './fish-forms';
import { specOf, type ArtSpec } from './fish-specs';

export function renderSpec(spec: ArtSpec, cols: Cols, frame: number, seed: number): Grid {
  switch (spec.r) {
    case 'animal': return drawAnimal(spec, cols, frame);
    case 'ray': return drawRay(spec, cols, frame, seed);
    case 'ceph': return drawCeph(spec, cols, frame, seed);
    case 'crab': return drawCrab(spec, cols, frame, seed);
    case 'crust': return drawCrust(spec, cols, frame, seed);
    case 'shell': return drawShell(spec, cols, frame, seed);
    case 'turtle': return drawTurtle(spec, cols, frame, seed);
    case 'horse': return drawSeahorse(spec, cols, frame, seed);
    default: return drawFish(spec, cols, frame, seed);
  }
}

/** Recadre deux images sur leur boîte englobante commune (elles gardent donc la même taille), avec 1 pixel de marge. */
export function cropPair(a: Grid, b: Grid): [Grid, Grid] {
  const ba = a.bounds() ?? [0, 0, 1, 1], bb = b.bounds() ?? ba;
  const x0 = Math.max(0, Math.min(ba[0], bb[0]) - 1), y0 = Math.max(0, Math.min(ba[1], bb[1]) - 1);
  const x1 = Math.min(a.w - 1, Math.max(ba[2], bb[2]) + 1), y1 = Math.min(a.h - 1, Math.max(ba[3], bb[3]) + 1);
  return [a.crop(x0, y0, x1, y1), b.crop(x0, y0, x1, y1)];
}

/** Les deux images (nage) d'une espèce dans la robe demandée, tête à droite. */
export function fishGrids(sp: Species, color = 0): [Grid, Grid] {
  const spec = specOf(sp), cols = makeCols(sp, color), seed = seedOf(sp.id);
  return cropPair(renderSpec(spec, cols, 0, seed), renderSpec(spec, cols, 1, seed));
}
