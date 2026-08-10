// test/intake-starters.test.mjs — the starter gallery. The gallery's own promise is "safe by
// construction": EVERY starter must pass cleanSpec with zero errors and render a real preview, or it
// has no business being offered. Also proves the pick→refine flow: a starter feeds straight into the
// intake as the working Spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listStarters, getStarter, STARTER_IDS } from '../src/intake/starters.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { planSpec } from '../src/plan.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';

test('every starter passes cleanSpec with ZERO errors (safe by construction)', () => {
  for (const id of STARTER_IDS) {
    const { errors } = cleanSpec(getStarter(id));
    assert.deepEqual(errors, [], `${id} must validate clean, got: ${errors.join('; ')}`);
  }
});

test('every starter PLANS (the gate produces a real Plan)', () => {
  for (const id of STARTER_IDS) {
    const r = planSpec(getStarter(id));
    assert.equal(r.ok, true, `${id} must plan`);
    assert.ok(Array.isArray(r.plan) && r.plan.length > 0);
  }
});

test('the gallery leans on DIFFERENT parts of the library (honest variety)', () => {
  const mods = id => getStarter(id).modules.map(m => m.type).sort();
  assert.deepEqual(mods('academy'), ['content-library', 'progression', 'rbac']);      // full stack
  assert.deepEqual(mods('coaching'), ['content-library', 'progression', 'rbac']);     // activity-driven progression
  assert.deepEqual(mods('knowledgebase'), ['content-library', 'rbac']);               // NO progression — it's optional
});

test('listStarters returns owner-facing cards, each with a live preview', () => {
  const cards = listStarters();
  assert.equal(cards.length, STARTER_IDS.length);
  for (const c of cards) {
    assert.ok(c.name && c.tagline && c.forWho && c.pitch, `${c.id} card is complete`);
    assert.ok(c.preview && c.preview.app.name, `${c.id} has a preview`);
    assert.doesNotMatch(c.pitch + c.forWho, /content-library|progression|dataModel|cleanSpec/); // no jargon
  }
  // the previews reflect their nature: coaching shows levels (Stages), KB does not
  const kb = cards.find(c => c.id === 'knowledgebase');
  assert.ok(!kb.preview.features.some(f => f.kind === 'levels'));
  const coaching = cards.find(c => c.id === 'coaching');
  assert.equal(coaching.preview.features.find(f => f.kind === 'levels').label, 'Stages');
});

test('getStarter returns an independent clone; unknown id → null', () => {
  const a = getStarter('academy'), b = getStarter('academy');
  a.app.name = 'MUTATED';
  assert.equal(b.app.name, 'Academy');                 // not shared
  assert.equal(getStarter('nope'), null);
});

test('pick → refine: a starter feeds straight into the intake and accepts a valid diff', () => {
  const spec = getStarter('knowledgebase');
  const r = reviewProposal(spec, [
    { target: 'app', op: 'merge', value: { name: 'Acme Help', tagline: 'How to do anything at Acme' } },
    { target: 'roles', op: 'add', value: { id: 'contributor', label: 'Contributor', rank: 30 } }
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.preview.app.name, 'Acme Help');
  assert.ok(r.previewChanges.some(e => e.type === 'role-added'));
});
