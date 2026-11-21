import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIES, SPECIES_BY_ID, Rng, rollSpecimen, priceOf, pickSpecies, tileAt,
  isPredatorSpecies, predatorForShadow, type BiomeId, type Tile,
} from '../packages/shared/src/index';

test('les fiches conservent les petits adultes, les géants et les poids estimés', () => {
  const entries = SPECIES.filter(sp => sp.fieldNotes);
  assert.equal(entries.length, 250);
  assert.equal(new Set(entries.map(sp => sp.fieldNotes!.scientificName)).size, 250);
  assert.equal(entries.filter(sp => sp.fieldNotes!.estimatedWeight).length, 143);
  for (const sp of entries) {
    const rng = new Rng(803);
    for (let i = 0; i < 24; i++) {
      const f = rollSpecimen(rng, sp, 3, sp.biomes[0], 0, 'sample');
      assert.ok(f.kg > 0 && Number.isSafeInteger(priceOf(f)), sp.name);
      if (f.size === 0) assert.ok(f.kg >= sp.kgMin! && f.kg <= sp.kgMax, sp.name);
    }
  }
  assert.ok(SPECIES_BY_ID.neon.kgMax < 0.001);
});

test('chaque nouvelle espèce peut entrer dans le tirage de son habitat', () => {
  const depths: Partial<Record<BiomeId, number>> = {river:.22, coastal:.2, reef:.23, tropical:.45, polar:.4, deep:.8, abyss:.85};
  // Inspect the actual eligible pool and its weights at a representative water tile.
  class Pool extends Rng {
    eligible = new Set<string>();
    override weighted<T>(items: T[], weights: number[]): T {
      for (const [i, item] of items.entries()) if (weights[i] > 0) this.eligible.add((item as {id:string}).id);
      return super.weighted(items, weights);
    }
  }
  for (const [biome, depth] of Object.entries(depths)) {
    const tile: Tile = {...tileAt(42,0,0), biome:biome as BiomeId, land:false, depth};
    const pool = new Pool(47);
    pickSpecies(pool, tile, 'jour', 'clair');
    const passive = new Pool(49);
    pickSpecies(passive, tile, 'jour', 'clair', undefined, false, 'none', 1, true);
    for (const sp of SPECIES.filter(s => s.fieldNotes && s.biomes.includes(tile.biome))) {
      assert.ok(pool.eligible.has(sp.id), sp.id);
      assert.equal(passive.eligible.has(sp.id), !isPredatorSpecies(sp), sp.id);
    }
  }
  const sh = {seed:1, sil:'cephalo', biome:'deep' as const, depth:.8};
  assert.equal(predatorForShadow({...sh,predatorId:null}),undefined);
  assert.equal(predatorForShadow({...sh,predatorId:'calmar_de_humboldt'})?.id,'calmar_de_humboldt');
});
