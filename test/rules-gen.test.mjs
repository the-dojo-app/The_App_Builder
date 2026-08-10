// test/rules-gen.test.mjs — the security-rules generator: per-access clauses, admin resolution,
// append-only config history, and determinism. Also checks the assembler emits the rules text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { genRules } from '../src/shell/rules-gen.mjs';
import { cleanSpec, assemble } from '../src/assembler.mjs';

const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));

const AUTH = { roles: [{ id: 'owner', rank: 100 }, { id: 'admin', rank: 80 }, { id: 'member', rank: 0 }] };

test('owner-read models gate on the document owner (uid)', () => {
  const r = genRules([{ id: 'sessions', access: 'owner-read' }], AUTH);
  assert.match(r, /match \/sessions\/\{docId\}/);
  assert.match(r, /request\.auth\.uid == resource\.data\.uid/);
  assert.match(r, /request\.auth\.uid == request\.resource\.data\.uid/);
});

test('public models: signed-in read, admin write', () => {
  const r = genRules([{ id: 'methods', access: 'public' }], AUTH);
  assert.match(r, /match \/methods\/\{docId\}/);
  assert.match(r, /allow read: if signedIn\(\)/);
  assert.match(r, /allow write: if hasRole\(\['owner', 'admin'\]\)/);
});

test('admins resolve from capabilities when present, else rank ≥ 80', () => {
  const capAuth = { roles: [{ id: 'owner' }, { id: 'boss' }, { id: 'member' }], capabilities: { boss: ['manage-content'] } };
  const r = genRules([{ id: 'x', access: 'public' }], capAuth);
  assert.match(r, /hasRole\(\['boss'\]\)/);   // capability-driven, not rank
});

test('config history is append-only (no update/delete)', () => {
  const r = genRules([], AUTH);
  assert.match(r, /match \/config\/\{doc\}/);
  assert.match(r, /match \/history\/\{version\}/);   // nested inside config/{doc}
  assert.match(r, /allow read, create: if hasRole/);
  assert.match(r, /allow update, delete: if false;/);
});

test('emits a valid v2 header + hasRole helper', () => {
  const r = genRules([], AUTH);
  assert.match(r, /^rules_version = '2';/);
  assert.match(r, /function hasRole\(roles\)/);
});

test('generation is deterministic', () => {
  assert.equal(genRules(dojoSpec.dataModels, dojoSpec.auth), genRules(dojoSpec.dataModels, dojoSpec.auth));
});

test('the assembler carries the generated rules text in its Plan', () => {
  const plan = assemble(cleanSpec(dojoSpec));
  const op = plan.find(o => o.op === 'genRulesFile');
  assert.equal(op.path, 'firestore.rules');
  assert.match(op.rules, /match \/sessions\/\{docId\}/);
  assert.match(op.rules, /match \/methods\/\{docId\}/);
});
