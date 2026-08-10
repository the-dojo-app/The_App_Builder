// test/assemble.test.mjs — proves the Phase 0 slice: the Dojo spec validates, cleanSpec applies
// the extracted cleanTheme, unknown modules are rejected, config is bounded, assemble is
// deterministic. Run: `npm test` (or `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanSpec, assemble } from '../src/assembler.mjs';
import { cleanContentConfig } from '../src/modules/content-library.mjs';

const specPath = fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url));
const dojoSpec = JSON.parse(readFileSync(specPath, 'utf8'));

test('the Dojo spec validates with no errors', () => {
  const { spec, errors } = cleanSpec(dojoSpec);
  assert.deepEqual(errors, []);
  assert.equal(spec.app.id, 'the-dojo');
  assert.equal(spec.modules.length, 2);
  assert.equal(spec.modules[0].type, 'content-library');
});

test('cleanSpec applies the extracted cleanTheme (bad colour dropped, valid kept)', () => {
  const dirty = structuredClone(dojoSpec);
  dirty.theme.color['accent'] = 'not-a-hex';       // dropped
  dirty.theme.color['text-primary'] = '#abcdef';   // valid → kept, upper-cased
  const { spec } = cleanSpec(dirty);
  assert.equal(spec.theme.color['accent'], undefined);
  assert.equal(spec.theme.color['text-primary'], '#ABCDEF');
});

test('unknown module types are rejected, not trusted', () => {
  const bad = structuredClone(dojoSpec);
  bad.modules.push({ type: 'mystery-backend', config: { run: 'rm -rf /' } });
  const { spec, errors } = cleanSpec(bad);
  assert.ok(errors.some(e => e.includes('mystery-backend')));
  assert.ok(!spec.modules.some(m => m.type === 'mystery-backend'));
});

test('content-library config is bounded (formats whitelisted, junk taxonomy dropped)', () => {
  const cleaned = cleanContentConfig({
    collection: 'lessons',
    formats: ['video', 'evil-format', 'pdf'],
    taxonomy: [{ id: 'level' }, { label: 'no-id' }, 'garbage']
  });
  assert.deepEqual(cleaned.formats, ['video', 'pdf']);
  assert.equal(cleaned.taxonomy.length, 1);
  assert.equal(cleaned.taxonomy[0].id, 'level');
});

test('assemble produces the expected config-doc ops', () => {
  const plan = assemble(cleanSpec(dojoSpec));
  const docs = plan.filter(o => o.op === 'writeConfig').map(o => o.doc);
  assert.ok(docs.includes('appTheme'));
  assert.ok(docs.includes('module:content-library'));
  assert.ok(docs.includes('module:progression'));
  assert.ok(plan.some(o => o.op === 'registerPages'));
  assert.ok(plan.some(o => o.op === 'genRulesFile'));
  assert.ok(plan.some(o => o.op === 'snapshotSpec'));
});

test('assemble is deterministic (same spec ⇒ identical plan)', () => {
  assert.deepEqual(assemble(cleanSpec(dojoSpec)), assemble(cleanSpec(dojoSpec)));
});
