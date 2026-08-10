// test/plan.test.mjs — the gate (refuse on errors), the plan-diff (intake preview), and the
// pluggable executor seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planSpec, planDiff, applyPlan } from '../src/plan.mjs';

const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));

test('planSpec produces a plan for a clean spec', () => {
  const r = planSpec(dojoSpec);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.ok(Array.isArray(r.plan) && r.plan.length);
});

test('planSpec REFUSES a spec with errors (no plan)', () => {
  const bad = structuredClone(dojoSpec);
  bad.theme.color['text-primary'] = '#111111';   // unreadable on the dark surface-page
  const r = planSpec(bad);
  assert.equal(r.ok, false);
  assert.equal(r.plan, null);
  assert.ok(r.errors.some(e => /below 3:1/.test(e)));
});

test('planDiff reports added / removed / changed by target', () => {
  const before = planSpec(dojoSpec).plan;

  const edited = structuredClone(dojoSpec);
  edited.theme.color['accent'] = '#123456';                 // changed appTheme
  edited.modules = edited.modules.filter(m => m.type !== 'progression');   // removed a module
  edited.notifications = { categories: [{ id: 'x' }] };     // added? notifications was already an op → changed
  const after = planSpec(edited).plan;

  const d = planDiff(before, after);
  assert.ok(d.changed.some(c => c.key === 'config:appTheme' && c.fields.includes('color')));
  assert.ok(d.removed.some(r => r.key === 'config:module:progression'));
  assert.ok(d.changed.some(c => c.key === 'config:notifications'));
});

test('planDiff of a spec against itself is empty', () => {
  const p = planSpec(dojoSpec).plan;
  const d = planDiff(p, p);
  assert.deepEqual(d, { added: [], removed: [], changed: [] });
});

test('applyPlan routes every op through the injected executor; unknown ops are skipped', () => {
  const plan = planSpec(dojoSpec).plan;
  const calls = [];
  const exec = {
    writeConfig: op => { calls.push('writeConfig:' + op.doc); return 'ok'; },
    registerPages: () => { calls.push('registerPages'); return 'ok'; },
    genRulesFile: () => { calls.push('genRulesFile'); return 'ok'; }
    // NOTE: no snapshotSpec handler → that op should be reported skipped
  };
  const results = applyPlan(plan, exec);
  assert.ok(calls.includes('writeConfig:appTheme'));
  assert.ok(calls.includes('registerPages'));
  assert.ok(results.some(r => r.op === 'snapshotSpec' && r.skipped === true));
});
