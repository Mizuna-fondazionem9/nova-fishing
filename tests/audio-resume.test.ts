import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeAudio } from '../packages/client/src/game/audio-resume';

test('Safari : reprendre suspended et interrupted, jamais running, closed ou onglet caché', () => {
  for (const state of ['suspended', 'interrupted', 'running', 'closed']) {
    let calls = 0;
    const context = { state, resume: async () => { calls++; } };
    resumeAudio(context, true);
    assert.equal(calls, 0);
    resumeAudio(context, false);
    assert.equal(calls, ['suspended', 'interrupted'].includes(state) ? 1 : 0);
  }
});
test('un refus de reprise laisse le prochain geste réessayer', async () => {
  let calls = 0;
  const context = { state: 'interrupted', resume: async () => { calls++; throw new Error('NotAllowedError'); } };
  resumeAudio(context, false);
  await Promise.resolve();
  resumeAudio(context, false);
  await Promise.resolve();
  assert.equal(calls, 2);
});
