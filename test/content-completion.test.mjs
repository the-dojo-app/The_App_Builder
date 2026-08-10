// test/content-completion.test.mjs — the completion flow: per-format completion mode + time gate,
// the completedRequired signal, and the END-TO-END content-library → progression seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionModeFor, recordCompletion, computeRequiredSignal } from '../src/modules/content-completion.mjs';
import { evaluate } from '../src/modules/progression-engine.mjs';

test('completion mode is per format', () => {
  assert.equal(completionModeFor({ kind: 'video' }), 'played-range');
  assert.equal(completionModeFor({ kind: 'article' }), 'dwell');
  assert.equal(completionModeFor({ kind: 'image' }), 'view');
});

test('the time gate: a video needs played coverage; an article needs dwell', () => {
  const vid = { kind: 'video', expectedMin: 5 };                 // 300s required
  assert.equal(recordCompletion(vid, { playedSec: 120 }).completed, false);
  assert.equal(recordCompletion(vid, { playedSec: 300 }).completed, true);
  const art = { kind: 'article', expectedMin: 2 };               // 120s dwell
  assert.equal(recordCompletion(art, { dwellSec: 30 }).completed, false);
  assert.equal(recordCompletion(art, { dwellSec: 130 }).completed, true);
  assert.equal(recordCompletion({ kind: 'image' }, { viewed: true }).completed, true);
});

test('reference material is never completable', () => {
  const r = recordCompletion({ kind: 'article', reference: true }, { dwellSec: 9999 });
  assert.equal(r.completed, false);
  assert.match(r.why, /reference/);
});

test('completedRequired signal: all required-in-scope done, General counts, 0 required → done', () => {
  const items = [
    { id: 'm1', published: true, required: true, belt: 'White' },
    { id: 'm2', published: true, required: true, belt: 'General' },   // counts for every scope
    { id: 'm3', published: true, required: false, belt: 'White' },    // not required
    { id: 'm4', published: false, required: true, belt: 'White' }     // draft → ignored
  ];
  const partial = computeRequiredSignal({ items, completions: [{ itemId: 'm1' }], dim: 'belt', value: 'White', extra: ['General'] });
  assert.equal(partial.done, false);
  assert.deepEqual(partial.missing, ['m2']);
  const full = computeRequiredSignal({ items, completions: [{ itemId: 'm1' }, { itemId: 'm2' }], dim: 'belt', value: 'White', extra: ['General'] });
  assert.equal(full.done, true);
  assert.equal(full.total, 2);
  const none = computeRequiredSignal({ items: [], completions: [], dim: 'belt', value: 'Yellow' });
  assert.equal(none.done, true);   // no required material → auto-done
});

test('END TO END: content completion feeds progression required-content', () => {
  const items = [{ id: 'm1', published: true, required: true, belt: 'White' }];
  const config = { units: ['White'], rules: { White: { badges: [{ slot: 5, mechanic: 'required-content', params: { scope: 'unit' } }] } } };

  const before = computeRequiredSignal({ items, completions: [], dim: 'belt', value: 'White', extra: ['General'] });
  const sBefore = evaluate({ evidence: { completedRequired: { unit: before.done } } }, config, {});
  assert.equal(sBefore.currentUnitEarned, false);   // required not done → badge unmet

  const after = computeRequiredSignal({ items, completions: [{ itemId: 'm1' }], dim: 'belt', value: 'White', extra: ['General'] });
  const sAfter = evaluate({ evidence: { completedRequired: { unit: after.done } } }, config, {});
  assert.equal(sAfter.currentUnitEarned, true);      // completing the required item earns the badge
});
