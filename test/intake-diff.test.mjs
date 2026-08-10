// test/intake-diff.test.mjs — the bounded Spec-diff format (applyDiff). Total, never throws;
// unknown/malformed ops don't mutate and come back as `rejected`. cleanSpec is the safety layer,
// not this — so these tests are about faithful folding + feedback, not validation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiff } from '../src/intake/diff.mjs';

const base = () => ({
  spec: '0',
  app: { id: 'x', name: 'X' },
  theme: { color: { accent: '#111111', 'text-primary': '#eeeeee' } },
  auth: { roles: [{ id: 'owner', label: 'Owner', rank: 100 }], signup: { invite: true } },
  dataModels: [{ id: 'items', owner: 'app', fields: [] }],
  modules: [{ type: 'content-library', config: { collection: 'items' } }],
  pages: [{ id: 'home', title: 'Home' }]
});

test('object merge is deep and a null value deletes a key', () => {
  const { spec, applied, rejected } = applyDiff(base(), [
    { target: 'theme', op: 'merge', value: { color: { accent: '#222222' }, look: 'flat' } },
    { target: 'theme', op: 'merge', value: { color: { 'text-primary': null } } }
  ]);
  assert.equal(applied.length, 2);
  assert.equal(rejected.length, 0);
  assert.equal(spec.theme.color.accent, '#222222');            // changed
  assert.equal(spec.theme.color['text-primary'], undefined);   // deleted
  assert.equal(spec.theme.look, 'flat');                       // added, siblings preserved
});

test('array add is keyed and refuses a duplicate', () => {
  const ok = applyDiff(base(), [{ target: 'modules', op: 'add', value: { type: 'progression', config: { units: ['A'] } } }]);
  assert.equal(ok.spec.modules.length, 2);
  assert.equal(ok.applied[0].id, 'progression');

  const dup = applyDiff(base(), [{ target: 'modules', op: 'add', value: { type: 'content-library' } }]);
  assert.equal(dup.spec.modules.length, 1);                    // unchanged
  assert.match(dup.rejected[0].reason, /already exists/);
});

test('update deep-merges into the item and cannot rewrite the key', () => {
  const { spec, applied } = applyDiff(base(), [
    { target: 'dataModels', op: 'update', id: 'items', value: { id: 'HACKED', access: 'public', fields: [{ id: 'title', type: 'text' }] } }
  ]);
  assert.equal(applied[0].id, 'items');
  assert.equal(spec.dataModels[0].id, 'items');               // key preserved
  assert.equal(spec.dataModels[0].access, 'public');          // merged
  assert.equal(spec.dataModels[0].fields.length, 1);          // arrays replace
});

test('update/remove on a missing id is rejected, spec untouched', () => {
  const r = applyDiff(base(), [
    { target: 'pages', op: 'update', id: 'ghost', value: { title: 'Z' } },
    { target: 'pages', op: 'remove', id: 'ghost' }
  ]);
  assert.equal(r.rejected.length, 2);
  assert.deepEqual(r.spec.pages, base().pages);
});

test('roles target writes into auth.roles; auth merge cannot touch roles', () => {
  const { spec } = applyDiff(base(), [
    { target: 'roles', op: 'add', value: { id: 'coach', label: 'Coach', rank: 40 } },
    { target: 'auth', op: 'merge', value: { signup: { open: true }, roles: [{ id: 'INJECT' }] } }
  ]);
  assert.deepEqual(spec.auth.roles.map(r => r.id), ['owner', 'coach']);  // coach added, INJECT ignored
  assert.equal(spec.auth.signup.open, true);                             // the safe part of the merge applied
});

test('unknown target / malformed op / wrong verb are all rejected, never thrown', () => {
  const r = applyDiff(base(), [
    { target: 'nope', op: 'merge', value: {} },
    { target: 'app', op: 'add', value: {} },        // object target, array verb
    null,
    { op: 'merge', value: {} }                        // no target
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.rejected.length, 4);
});

test('applyDiff does not mutate the input spec', () => {
  const input = base();
  const snapshot = JSON.stringify(input);
  applyDiff(input, [{ target: 'theme', op: 'merge', value: { color: { accent: '#999999' } } }]);
  assert.equal(JSON.stringify(input), snapshot);
});
