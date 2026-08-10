// test/materialize.test.mjs — the materializer: a validated Spec → a deployable artifact bundle.
// Pure (file DESCRIPTORS, not disk). The gate still applies: a bad spec yields no bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materialize } from '../src/materialize.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));
const paths = r => r.files.map(f => f.path);
const byPath = (r, p) => r.files.find(f => f.path === p);

test('materialize(dojo) yields the expected deployable artifacts', () => {
  const r = materialize(dojo);
  assert.equal(r.ok, true);
  const ps = paths(r);
  assert.ok(ps.includes('config/appTheme.json'));
  assert.ok(ps.includes('config/pages.json'));
  assert.ok(ps.includes('config/appSpec.json'));
  assert.ok(ps.includes('firestore.rules'));
  assert.ok(ps.includes('index.html'));                 // the runtime shell — a visitable app
  assert.ok(ps.includes('firebase.json'));              // deploy-ready
  assert.ok(ps.includes('README.txt'));
  // module configs land as their own docs (colon → path)
  assert.ok(ps.some(p => p.startsWith('config/module/')));
});

test('the generated firestore.rules is real rules text; json artifacts parse', () => {
  const r = materialize(dojo);
  const rules = byPath(r, 'firestore.rules').content;
  assert.match(rules, /match/);                          // Firestore rules syntax
  for (const f of r.files) if (f.path.endsWith('.json')) JSON.parse(f.content);   // valid JSON, no throw
  assert.equal(JSON.parse(byPath(r, 'config/appSpec.json').content).app.id, 'the-dojo');
});

test('the GATE holds — a spec with errors produces NO bundle', () => {
  const bad = { ...dojo, modules: [...dojo.modules, { type: 'nonsense', config: {} }] };
  const r = materialize(bad);
  assert.equal(r.ok, false);
  assert.deepEqual(r.files, []);
  assert.ok(r.errors.some(e => /unknown type "nonsense"/.test(e)));
});

test('materialize is deterministic (same spec ⇒ same bundle)', () => {
  const a = materialize(getStarter('academy'));
  const b = materialize(getStarter('academy'));
  assert.deepEqual(a, b);
});

test('every starter materializes into a bundle', () => {
  for (const id of ['academy', 'coaching', 'knowledgebase']) {
    const r = materialize(getStarter(id));
    assert.equal(r.ok, true, `${id} must materialize`);
    assert.ok(r.files.length >= 4);
  }
});
