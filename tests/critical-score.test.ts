import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticalScore } from '../packages/client/src/game/critical-score';

test('chaque critique de 1 à 10 enrichit le son sans événement périodique', () => {
  for (let n = 2; n <= 10; n++) {
    const before = criticalScore(n - 1), after = criticalScore(n);
    assert.ok(after.pitch > before.pitch);
    assert.ok(after.echo > before.echo);
    assert.ok(after.layers[0].duration > before.layers[0].duration);
    assert.ok(after.layers[3].volume > before.layers[3].volume);
    assert.ok(after.layers.reduce((sum, l) => sum + l.volume, 0) < 0.32);
  }
});
test('le son complet reste identique après le dixième, y compris aux multiples de cinq', () => {
  for (const n of [11, 12, 15, 20, 100, 10000]) assert.deepEqual(criticalScore(n), criticalScore(10));
  for (const n of [0, -5, NaN]) assert.deepEqual(criticalScore(n), criticalScore(1));
});
