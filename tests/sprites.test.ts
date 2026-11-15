import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { SPECIES, SPECIES_BY_ID, VESSELS, PAINTS, type Species } from '../packages/shared/src/index';
import { fishGrids } from '../packages/client/src/game/fish-art';
import { SPECS, specOf } from '../packages/client/src/game/fish-specs';
import type { Grid } from '../packages/client/src/game/pix';
(globalThis as unknown as { document: unknown }).document = { createElement: () => createCanvas(1, 1) };
const { fishSprite, boatSprite } = await import('../packages/client/src/game/sprites');
const pixels = (s: HTMLCanvasElement) => s.getContext('2d')!.getImageData(0, 0, s.width, s.height).data;

/** Silhouette seule (où il y a de la matière) puis dessin complet (avec les couleurs). */
const mask = (g: Grid): string => `${g.w}x${g.h}:` + g.d.map((v) => (v ? '1' : '0')).join('');
const full = (g: Grid): string => `${g.w}x${g.h}:` + g.d.map((v) => v ?? '.').join('');
const duplicates = (key: (g: Grid) => string): string[][] => {
  const seen = new Map<string, string[]>();
  for (const sp of SPECIES) { const k = key(fishGrids(sp)[0]); seen.set(k, [...(seen.get(k) ?? []), sp.name]); }
  return [...seen.values()].filter((names) => names.length > 1);
};

test('bestiaire : chaque espèce possède sa propre fiche de dessin', () => {
  const missing = SPECIES.filter((sp) => !SPECS[sp.id]).map((sp) => sp.id);
  assert.deepEqual(missing, [], 'ajoutez une fiche dans packages/client/src/game/fish-specs.ts');
  const orphans = Object.keys(SPECS).filter((id) => !SPECIES_BY_ID[id]);
  assert.deepEqual(orphans, [], 'fiches sans espèce');
});

test('bestiaire : aucune silhouette et aucun dessin en double', () => {
  assert.deepEqual(duplicates(mask), [], 'deux espèces partagent la même silhouette (seule la couleur change)');
  assert.deepEqual(duplicates(full), [], 'deux espèces ont exactement la même image');
});

test('bestiaire : deux espèces de même gabarit se distinguent nettement', () => {
  const grids = SPECIES.map((sp) => [sp.name, fishGrids(sp)[0]] as const);
  for (let i = 0; i < grids.length; i++) for (let j = i + 1; j < grids.length; j++) {
    const [a, ga] = grids[i], [b, gb] = grids[j];
    if (ga.w !== gb.w || ga.h !== gb.h) continue;
    let diff = 0;
    for (let k = 0; k < ga.d.length; k++) if (!!ga.d[k] !== !!gb.d[k]) diff++;
    assert.ok(diff >= 20, `${a} et ${b} : silhouettes presque identiques (${diff} pixels d'écart)`);
  }
});

test('bestiaire : images de nage de même taille, lisibles et dans le gabarit', () => {
  for (const sp of SPECIES) {
    const [a, b] = fishGrids(sp);
    assert.equal(`${a.w}x${a.h}`, `${b.w}x${b.h}`, sp.id);
    assert.ok(a.w <= 88 && a.h <= 60, `${sp.id} trop grand : ${a.w}x${a.h}`);
    assert.ok(a.d.filter(Boolean).length >= 60, `${sp.id} presque vide`);
    assert.ok(new Set(a.d.filter(Boolean)).size >= 4, `${sp.id} manque de nuances`);
  }
});

test('bestiaire : les robes rares changent vraiment les couleurs sans changer la silhouette', () => {
  for (const id of ['sardine', 'crabe_coastal_a', 'raie_manta', 'poulpe_recif', 'moule', 'tortue_marine', 'hippocampe_roi', 'crevette_douce']) {
    const sp = SPECIES_BY_ID[id], base = fishGrids(sp, 0)[0];
    for (let color = 1; color <= 7; color++) {
      const g = fishGrids(sp, color)[0];
      assert.equal(mask(g), mask(base), `${id}/${color}`);
      assert.notEqual(full(g), full(base), `${id}/${color}`);
    }
  }
});

test('bestiaire : une espèce encore sans fiche reçoit un dessin de secours qui ne copie personne', () => {
  const mk = (id: string, shape: Species['shape']): Species => ({ ...SPECIES_BY_ID.sardine, id, shape });
  const known = new Set(SPECIES.map((sp) => mask(fishGrids(sp)[0])));
  for (const shape of ['fusi', 'deep', 'eel', 'ray', 'crab', 'squid', 'octo', 'shark', 'whale', 'shell', 'shrimp', 'bill'] as const) {
    const a = mk(`inconnu_${shape}_a`, shape), b = mk(`inconnu_${shape}_b`, shape);
    assert.ok(!SPECS[a.id] && specOf(a));
    const ma = mask(fishGrids(a)[0]), mb = mask(fishGrids(b)[0]);
    assert.notEqual(ma, mb, shape);
    assert.ok(!known.has(ma) && !known.has(mb), shape);
  }
});

test('bestiaire : le canvas du jeu reproduit la grille, image par image', () => {
  for (const id of ['bar', 'kraken', 'crabe_tropical_b']) {
    const sp = SPECIES_BY_ID[id], [g0, g1] = fishGrids(sp);
    const s0 = fishSprite(sp, 0, 0), s1 = fishSprite(sp, 0, 1);
    assert.equal(s0.width, g0.w); assert.equal(s0.height, g0.h); assert.equal(s1.width, g1.w);
    const opaque = Array.from(pixels(s0)).filter((v, i) => i % 4 === 3 && v > 0).length;
    assert.equal(opaque, g0.d.filter(Boolean).length);
    assert.equal(fishSprite(sp, 0, 2), s0);
  }
});

test('les peintures changent une part importante du bateau, quel que soit le modèle', () => {
  for (const model of VESSELS) for (let paint = 1; paint < PAINTS.length; paint++) {
    const a = pixels(boatSprite(0, model.id, 0)), b = pixels(boatSprite(0, model.id, paint));
    let changed = 0, total = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i + 3]) { total++; if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++; }
    assert.ok(changed / total > .45, `${model.id}/${paint}: ${changed}/${total}`);
  }
});
