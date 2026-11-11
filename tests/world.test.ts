import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tileAt, isLand, getPort, startPort, nearestPort, portInRange, spawnShadows, speciesForShadow, findPath, lineFree,
  BIOME_IDS, CELL, CHUNK, Rng, weatherAt, timeOfDay, DAY_MS,
} from '../packages/shared/src/index';

const SEED = 20261111;

function chunkSignature(seed: number, cx: number, cy: number): string {
  let s = '';
  for (let y = 0; y < CHUNK; y += 2)
    for (let x = 0; x < CHUNK; x += 2) {
      const t = tileAt(seed, cx * CHUNK + x, cy * CHUNK + y);
      s += t.land ? 'L' : t.biome[0] + Math.round(t.depth * 9);
    }
  return s;
}

test('monde : génération déterministe et reproductible', () => {
  const a = chunkSignature(SEED, 3, -2);
  for (let i = 0; i < 20; i++) chunkSignature(SEED, i * 7 - 50, i * 3); // on « se promène » ailleurs
  assert.equal(chunkSignature(SEED, 3, -2), a, 'un chunk rechargé doit être identique');
  assert.notEqual(chunkSignature(SEED + 1, 3, -2), a, 'un autre seed doit donner un autre monde');
  assert.deepEqual(getPort(SEED, 5, -3), getPort(SEED, 5, -3));
});

test('monde : les 8 biomes existent et la zone de départ est douce', () => {
  const o = startPort(SEED);
  const seen = new Set<string>();
  for (let y = -2600; y <= 2600; y += 13)
    for (let x = -2600; x <= 2600; x += 13) {
      const t = tileAt(SEED, o.x + x, o.y + y);
      if (!t.land) seen.add(t.biome);
    }
  for (const b of BIOME_IDS) assert.ok(seen.has(b), `biome absent : ${b}`);
  for (let y = -120; y <= 120; y += 4)
    for (let x = -120; x <= 120; x += 4) {
      const t = tileAt(SEED, o.x + x, o.y + y);
      if (!t.land) assert.ok(t.biome === 'coastal' || t.biome === 'temperate', `biome dur près du départ : ${t.biome}`);
    }
});

test('monde : la difficulté augmente avec l’éloignement', () => {
  const o = startPort(SEED);
  const l0 = tileAt(SEED, o.x + 5, o.y + 5).level;
  const l1 = tileAt(SEED, o.x + 1500, o.y).level;
  const l2 = tileAt(SEED, o.x + 20000, o.y).level;
  assert.ok(l0 < 1.2 && l1 > l0 + 2 && l2 > l1 * 3);
  assert.ok(tileAt(SEED, o.x + 5_000_000, o.y).level < 5000, 'la croissance doit rester maîtrisée');
});

test('ports : un port par cellule, quai dans l’eau, îlot sur terre', () => {
  for (let cy = -3; cy <= 3; cy++)
    for (let cx = -3; cx <= 3; cx++) {
      const p = getPort(SEED, cx, cy);
      assert.equal(Math.floor(p.x / CELL), cx);
      assert.equal(Math.floor(p.y / CELL), cy);
      assert.ok(!isLand(SEED, p.x, p.y), `quai sur terre en ${p.id}`);
      assert.ok(isLand(SEED, p.ix, p.iy), `îlot absent en ${p.id}`);
      assert.equal(portInRange(SEED, p.x + 0.5, p.y + 0.5)?.id, p.id);
    }
  assert.equal(startPort(SEED).name, 'Port-Nova');
  const rng = new Rng(5);
  for (let i = 0; i < 200; i++) {
    const x = rng.range(-5000, 5000);
    const y = rng.range(-5000, 5000);
    const p = nearestPort(SEED, x, y);
    assert.ok(Math.hypot(p.x - x, p.y - y) < CELL * 1.5, 'ravitaillement trop lointain');
  }
});

test('monde : pas de région infranchissable, tous les ports voisins sont atteignables', () => {
  // Remplissage par diffusion sur 3 x 3 cellules depuis le port de départ.
  const x0 = -CELL;
  const y0 = -CELL;
  const W = CELL * 3;
  const land = new Uint8Array(W * W);
  let water = 0;
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      land[y * W + x] = isLand(SEED, x0 + x, y0 + y) ? 1 : 0;
      if (!land[y * W + x]) water++;
    }
  const o = startPort(SEED);
  const seen = new Uint8Array(W * W);
  const stack = [(o.y - y0) * W + (o.x - x0)];
  seen[stack[0]] = 1;
  let reached = 0;
  while (stack.length) {
    const k = stack.pop()!;
    reached++;
    const x = k % W;
    const y = (k - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const nk = ny * W + nx;
      if (!seen[nk] && !land[nk]) {
        seen[nk] = 1;
        stack.push(nk);
      }
    }
  }
  assert.ok(reached / water > 0.995, `eau connectée à ${((reached / water) * 100).toFixed(2)} %`);
  for (let cy = -1; cy <= 1; cy++)
    for (let cx = -1; cx <= 1; cx++) {
      const p = getPort(SEED, cx, cy);
      assert.ok(seen[(p.y - y0) * W + (p.x - x0)], `port ${p.id} inatteignable`);
    }
  assert.ok(water / (W * W) > 0.8, 'trop de terres');
});

test('chemin : contourne les îles et va droit en eau libre', () => {
  const blocked = (x: number, y: number): boolean => x === 10 && y >= -5 && y <= 5; // un mur
  const direct = findPath(() => false, 0.5, 0.5, 20.5, 0.5)!;
  assert.equal(direct.length, 1);
  const path = findPath(blocked, 0.5, 0.5, 20.5, 0.5)!;
  assert.ok(path.length >= 2);
  let prev = { x: 0.5, y: 0.5 };
  for (const p of path) {
    assert.ok(lineFree(blocked, prev, p), 'segment traversant un obstacle');
    prev = p;
  }
  assert.ok(Math.hypot(prev.x - 20.5, prev.y - 0.5) < 0.01);
  // Chemin réel entre le port de départ et un port voisin.
  const a = startPort(SEED);
  const b = getPort(SEED, 1, 0);
  const real = findPath((x, y) => isLand(SEED, x, y), a.x + 0.5, a.y + 0.5, b.x + 0.5, b.y + 0.5, 60000)!;
  assert.ok(real && real.length >= 1);
  const end = real[real.length - 1];
  assert.ok(Math.hypot(end.x - b.x - 0.5, end.y - b.y - 0.5) < 1);
});

test('ombres : déterministes, dans l’eau, et l’espèce serveur respecte la silhouette', () => {
  let total = 0;
  for (let cy = -6; cy <= 6; cy++)
    for (let cx = -6; cx <= 6; cx++) {
      const a = spawnShadows(SEED, cx, cy, 1234);
      assert.deepEqual(a, spawnShadows(SEED, cx, cy, 1234));
      assert.ok(a.length <= 5);
      for (const sh of a) {
        total++;
        assert.ok(!isLand(SEED, Math.floor(sh.x), Math.floor(sh.y)));
        const r = speciesForShadow(new Rng(total * 31 + 7), SEED, sh);
        assert.ok(r, 'aucune espèce pour une ombre publique');
        assert.equal(r!.sp.sil, sh.sil);
        assert.ok(r!.sp.biomes.includes(sh.biome));
      }
    }
  assert.ok(total > 200, `trop peu d’ombres (${total})`);
  assert.notDeepEqual(spawnShadows(SEED, 1, 1, 1234), spawnShadows(SEED, 1, 1, 1235));
});

test('temps et météo : déterministes', () => {
  assert.equal(timeOfDay(0.3 * DAY_MS), 'jour');
  assert.equal(timeOfDay(0.9 * DAY_MS), 'nuit');
  assert.equal(weatherAt(SEED, 1e12, 10, 10), weatherAt(SEED, 1e12, 12, 14));
  const kinds = new Set<string>();
  for (let i = 0; i < 300; i++) kinds.add(weatherAt(SEED, i * 200000, 0, 0));
  assert.equal(kinds.size, 4);
});
