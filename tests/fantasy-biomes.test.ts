import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, SPECIES_BY_ID, BIOMES, tileAt, spawnShadows, speciesForShadow, Rng, startPort } from '../packages/shared/src/index';

test('chaque province fantastique a six poissons, trois crabes et deux formes régionales', () => {
  for (const b of ['volcanic','crystal','spectral'] as const) {
    assert.ok(BIOMES[b]);
    const fauna = SPECIES.filter(s => s.biomes.includes(b));
    assert.equal(fauna.filter(s => s.sil === 'crab').length,3);
    assert.equal(fauna.filter(s => s.sil !== 'crab').length,6);
    assert.equal(fauna.filter(s => s.name.startsWith('Bar ') || s.name.startsWith('Calmar ')).length,2);
  }
  assert.ok(SPECIES_BY_ID.bar && SPECIES_BY_ID.calmar && SPECIES_BY_ID.crabe_coastal_a);
});
test('faune fantastique : ombres réellement présentes, capturables et fidèles au biome', () => {
  const seed = 20261111;
  const seen = new Set<string>();
  for (let y=-2400;y<=2400 && seen.size<3;y+=64) for (let x=-2400;x<=2400 && seen.size<3;x+=64) {
    const tile = tileAt(seed,x,y);
    if (!['volcanic','crystal','spectral'].includes(tile.biome) || tile.land) continue;
    for (const shadow of spawnShadows(seed,Math.floor(x/32),Math.floor(y/32),123)) {
      if (!['volcanic','crystal','spectral'].includes(shadow.biome)) continue;
      const result = speciesForShadow(new Rng(43),seed,shadow);
      assert.ok(result);
      assert.ok(result.sp.biomes.includes(shadow.biome));
      seen.add(shadow.biome);
    }
  }
  assert.equal(seen.size,3);
  const port = startPort(seed);
  assert.equal(tileAt(seed,port.x,port.y).biome,'coastal');
});
