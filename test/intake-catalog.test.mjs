// test/intake-catalog.test.mjs — the grounding the model is given. The catalog must report the REAL
// capability set (imported from the modules, so it can't drift) and summarizeSpec must describe an
// app in plain domain language with no jargon leaking through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog, summarizeSpec } from '../src/intake/catalog.mjs';
import { MECHANIC_TYPES } from '../src/modules/mechanics.mjs';
import { FIELD_TYPES } from '../src/shell/data-model.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('catalog reports the real field-type set and mechanic library (no drift)', () => {
  const cat = buildCatalog(dojo);
  assert.deepEqual(cat.fieldTypes.sort(), Object.keys(FIELD_TYPES).sort());
  assert.deepEqual(cat.mechanics.map(m => m.type).sort(), MECHANIC_TYPES.slice().sort());
  cat.mechanics.forEach(m => assert.ok(m.summary && m.summary.length, `${m.type} has a blurb`));
});

test('catalog lists the three library modules and the diff grammar', () => {
  const cat = buildCatalog(dojo);
  assert.deepEqual(cat.modules.map(m => m.type).sort(), ['activity-log', 'booking', 'commerce', 'content-library', 'messaging', 'progression', 'rbac']);
  assert.ok(cat.diffFormat.objectTargets && cat.diffFormat.arrayTargets);
  assert.ok(cat.diffFormat.guarantee.includes('cleanSpec'));
});

test('catalog carries spec-derived context (concepts, existing models, installed modules)', () => {
  const cat = buildCatalog(dojo);
  assert.ok(cat.concepts.includes('progressionUnit'));
  assert.deepEqual(cat.existingModels.sort(), ['methods', 'sessions']);
  assert.deepEqual(cat.installedModules.sort(), ['content-library', 'progression']);
});

test('buildCatalog tolerates an empty/garbage spec', () => {
  const cat = buildCatalog(undefined);
  assert.deepEqual(cat.concepts, []);
  assert.deepEqual(cat.existingModels, []);
  assert.equal(cat.modules.length, 7);
});

test('summarizeSpec describes the Dojo in plain domain language', () => {
  const text = summarizeSpec(dojo);
  assert.match(text, /The Dojo/);
  assert.match(text, /Roles: Owner, Admin, Coach/);
  assert.match(text, /Belts members climb: 8 \(White…Black\)/);
  assert.match(text, /library of Methods/i);
  // no engine jargon in the owner-facing summary
  assert.doesNotMatch(text, /content-library|progression|dataModel|mechanic/);
});
