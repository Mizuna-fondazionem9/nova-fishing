import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticalScore } from '../packages/client/src/game/critical-score';

test('les huit premières phrases sont décalées de deux rangs puis deux arpèges sont ajoutés', () => {
  const starts = (n: number) => [...new Set(criticalScore(n).layers.map(l => l.delay))];
  for (let n = 1; n <= 8; n++) assert.equal(starts(n).length, n + 2);
  assert.equal(starts(9).length, 12);
  assert.equal(starts(10).length, 14);
  for (let n = 1; n <= 10; n++) {
    const score = criticalScore(n);
    assert.ok(Math.max(...starts(n)) < 0.65);
    assert.ok(score.layers.every(l => l.volume > 0 && l.volume <= 0.18));
    assert.ok(score.layers.every(l => score.pitch * l.ratio < 4000));
  }
});
test('le son complet reste identique après le dixième, y compris aux multiples de cinq', () => {
  for (const n of [11, 12, 15, 20, 100, 10000]) assert.deepEqual(criticalScore(n), criticalScore(10));
  for (const n of [0, -5, NaN]) assert.deepEqual(criticalScore(n), criticalScore(1));
});
