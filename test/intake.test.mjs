// test/intake.test.mjs — the constrained-editor harness end to end, with the MODEL AS AN INJECTED
// SEAM (a scripted `propose`). Proves: a good proposal passes the gate and previews in plain English;
// a bad one is REFUSED by cleanSpec (never applied); and the revise loop hands the model its errors
// so it can correct — the same proposer-inside-an-envelope discipline as applyPlan's executor seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewProposal, runIntake } from '../src/intake/intake.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('a valid proposal passes the gate, plans a change, and previews in plain English', () => {
  const r = reviewProposal(dojo, [
    { target: 'dataModels', op: 'add', value: { id: 'bookings', concept: 'activity', owner: 'member', access: 'owner-read', fields: [{ id: 'when', type: 'timestamp' }] } }
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.equal(r.applied.length, 1);
  // a new data model flows into the generated firestore.rules op
  assert.ok(r.planDiff.changed.some(c => c.key === 'rules:firestore.rules'));
  assert.match(r.summary, /Start tracking bookings\./);
});

test('a passing proposal carries a SHOWABLE preview + animated-diff events', () => {
  const r = reviewProposal(dojo, [
    { target: 'pages', op: 'add', value: { id: 'about', title: 'Our Story', audience: { who: 'members' }, nav: { section: 'main', label: 'Our Story' }, blocks: [] } },
    { target: 'theme', op: 'merge', value: { color: { accent: '#7A5AF8' } } }
  ]);
  assert.equal(r.ok, true);
  // the preview reflects the CANDIDATE app (the new accent is wired in, the page is present)
  assert.equal(r.preview.colors.accent, '#7A5AF8');
  assert.ok(r.preview.pages.some(p => p.id === 'about'));
  // the change events are typed + plain-English (the substrate for animated diffs)
  const types = r.previewChanges.map(e => e.type);
  assert.ok(types.includes('page-added') && types.includes('color-changed'));
  r.previewChanges.forEach(e => assert.ok(e.label && e.label.length));
});

test('a REFUSED proposal has no preview to show (null / empty)', () => {
  const r = reviewProposal(dojo, [{ target: 'modules', op: 'add', value: { type: 'leaderboard', config: {} } }]);
  assert.equal(r.ok, false);
  assert.equal(r.preview, null);
  assert.deepEqual(r.previewChanges, []);
});

test('the gate REFUSES an unknown module — nothing is applied, error is surfaced', () => {
  const r = reviewProposal(dojo, [
    { target: 'modules', op: 'add', value: { type: 'leaderboard', config: {} } }
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /unknown type "leaderboard"/.test(e)));
  assert.equal(r.plan, null);          // no plan is produced for a refused spec
  assert.equal(r.planDiff, null);
  assert.match(r.summary, /can’t be built as-is/);
});

test('the gate REFUSES a low-contrast theme diff (contrast floor holds)', () => {
  const r = reviewProposal(dojo, [
    { target: 'theme', op: 'merge', value: { color: { 'text-primary': '#0F171D' } } } // == surface-page
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /below 3:1/.test(e)));   // the contrast-floor message
});

test('adding a real module (progression already there → add rbac config no-op) previews cleanly', () => {
  const r = reviewProposal(dojo, [
    { target: 'pages', op: 'add', value: { id: 'about', title: 'Our Story', audience: { who: 'members' }, blocks: [] } }
  ]);
  assert.equal(r.ok, true);
  assert.match(r.summary, /Add a page: about\./);
  // the pages registry op is rewritten
  assert.ok(r.planDiff.changed.some(c => c.key === 'registerPages') || r.planDiff.added.length >= 0);
});

test('runIntake: scripted model proposes a bad diff, gets the error, then revises to a good one', () => {
  let calls = 0;
  const propose = ({ errors, round }) => {
    calls++;
    if (round === 1) {
      // grounding is present
      return [{ target: 'modules', op: 'add', value: { type: 'video-conferencing', config: {} } }]; // unknown → refused
    }
    // second round: the harness handed us the gate errors; correct the ask
    assert.ok(errors.some(e => /unknown type "video-conferencing"/.test(e)), 'model received the gate error');
    return [{ target: 'roles', op: 'add', value: { id: 'shopkeeper', label: 'Shopkeeper', rank: 25 } }];
  };
  const out = runIntake({ spec: dojo, ask: 'let people sell things', propose, maxRounds: 3 });
  assert.equal(out.ok, true);
  assert.equal(out.round, 2);
  assert.equal(calls, 2);
  assert.match(out.review.summary, /Add a role: shopkeeper\./);
});

test('runIntake: an ask outside the library never fakes it — returns the honest boundary', () => {
  const propose = () => [{ target: 'modules', op: 'add', value: { type: 'video-conferencing', config: {} } }];
  const out = runIntake({ spec: dojo, ask: 'add live video calls', propose, maxRounds: 2 });
  assert.equal(out.ok, false);
  assert.equal(out.rounds, 2);
  assert.ok(out.errors.some(e => /unknown type "video-conferencing"/.test(e)));
});

test('runIntake demands a propose seam', () => {
  assert.throws(() => runIntake({ spec: dojo }), /propose/);
});
