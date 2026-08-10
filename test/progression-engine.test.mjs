// test/progression-engine.test.mjs — the orchestrator: unit walk, per-badge evaluation, the
// never-retroactive boundary, app-mechanic plugins, and the impact preview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, previewImpact } from '../src/modules/progression-engine.mjs';

const DAY = 86400000;
const CFG = {
  units: ['White', 'Yellow', 'Black'],
  rules: {
    White: { badges: [
      { slot: 1, mechanic: 'count-threshold', params: { target: 3 } },
      { slot: 2, mechanic: 'required-content', params: { scope: 'unit' } }
    ] },
    Black: { badges: [
      { slot: 7, mechanic: 'appspecific:wing-time', params: {} }
    ] }
  }
};
const ctx = { now: 10 * DAY };

test('current unit is the first not-yet-earned; its badges evaluate live', () => {
  const m = { evidence: { activities: [{ ts: 1 }, { ts: 2 }, { ts: 3 }], completedRequired: { unit: true } } };
  const s = evaluate(m, CFG, ctx);
  assert.equal(s.currentUnit, 'White');
  assert.equal(s.currentUnitEarned, true);            // 3 sessions + required done → both badges met
  assert.deepEqual(s.earnedUnits, ['White']);
});

test('a badge unmet keeps the unit unearned', () => {
  const m = { evidence: { activities: [{ ts: 1 }], completedRequired: {} } };   // only 1 session, no required
  const s = evaluate(m, CFG, ctx);
  assert.equal(s.currentUnitEarned, false);
  assert.equal(s.badges.find(b => b.slot === 1).met, false);
});

test('NEVER-RETROACTIVE: a completed unit stays earned with no live evidence', () => {
  const m = { boundary: { completed: ['White'] }, evidence: { activities: [] } };
  const s = evaluate(m, CFG, ctx);
  assert.ok(s.completedUnits.includes('White'));      // trusted, not re-evaluated
  assert.equal(s.currentUnit, 'Yellow');              // advanced past White (Yellow has no rules → not earned)
  assert.equal(s.currentUnitEarned, false);
});

test('app-mechanic plugins: evaluated when provided, not-met when absent', () => {
  const m = { boundary: { completed: ['White', 'Yellow'] }, evidence: { activities: [] } };
  assert.equal(evaluate(m, CFG, ctx).currentUnitEarned, false);   // Black needs wing-time, no plugin → unmet
  const withPlugin = { now: 10 * DAY, plugins: { 'wing-time': { evaluate: () => ({ met: true, progress: 1, why: 'ok' }) } } };
  const s = evaluate(m, CFG, withPlugin);
  assert.equal(s.currentUnit, 'Black');
  assert.equal(s.currentUnitEarned, true);            // plugin says met
});

test('impact preview counts members who lose a badge under harder rules', () => {
  const old = CFG;
  const harder = { units: CFG.units, rules: { White: { badges: [
    { slot: 1, mechanic: 'count-threshold', params: { target: 10 } },   // was 3
    { slot: 2, mechanic: 'required-content', params: { scope: 'unit' } }
  ] }, Black: CFG.rules.Black } };
  const members = [
    { id: 'a', evidence: { activities: [{ ts: 1 }, { ts: 2 }, { ts: 3 }], completedRequired: { unit: true } } }, // met old (3), fails new (10)
    { id: 'b', evidence: { activities: Array.from({ length: 12 }, (_, i) => ({ ts: i })), completedRequired: { unit: true } } } // meets both
  ];
  const r = previewImpact(members, old, harder, ctx);
  assert.equal(r.total, 2);
  assert.equal(r.affected, 1);
  assert.equal(r.details[0].id, 'a');
});
