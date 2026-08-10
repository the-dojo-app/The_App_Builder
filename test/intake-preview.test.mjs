// test/intake-preview.test.mjs — the preview harness: a render-agnostic model from a Spec, typed
// change events between two Specs (for animated diffs), and a self-contained themed HTML frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPreview, previewDiff, renderPreviewHTML } from '../src/intake/preview.mjs';
import { cleanSpec } from '../src/assembler.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('buildPreview derives nav, features, and roles in domain language', () => {
  const m = buildPreview(dojo);
  assert.equal(m.app.name, 'The Dojo');
  assert.deepEqual(m.nav.map(n => n.navLabel).sort(), ['Library', 'Training']);
  const levels = m.features.find(f => f.kind === 'levels');
  assert.equal(levels.label, 'Belts');          // concept plural, not "progressionUnit"
  assert.equal(levels.count, 8);
  const lib = m.features.find(f => f.kind === 'library');
  assert.equal(lib.label, 'Methods');
  assert.ok(m.roles.includes('Owner') && m.roles.includes('Member'));
});

test('buildPreview resolves theme colours with safe fallbacks', () => {
  const m = buildPreview(dojo);
  assert.equal(m.colors.accent, '#109F93');                 // from the spec
  assert.equal(m.colors['surface-raised-1'], '#1B2228');    // fallback (spec omits it)
  const bare = buildPreview({});
  assert.equal(bare.colors['surface-page'], '#0F171D');     // all-fallback still coherent
});

test('previewDiff emits typed, plain-English change events', () => {
  const before = cleanSpec(dojo).spec;
  // add a page, recolour the accent, and grow the belts
  const after = JSON.parse(JSON.stringify(before));
  after.pages.push({ id: 'about', title: 'Our Story', audience: { who: 'members' }, nav: { section: 'main', label: 'Our Story' }, blocks: [] });
  after.theme.color.accent = '#7A5AF8';
  after.modules.find(m => m.type === 'progression').config.units.push('Red');

  const events = previewDiff(before, after);
  const types = events.map(e => e.type);
  assert.ok(types.includes('page-added'));
  assert.ok(types.includes('color-changed'));
  assert.ok(types.includes('level-count'));
  const lvl = events.find(e => e.type === 'level-count');
  assert.deepEqual([lvl.from, lvl.to], [8, 9]);
  events.forEach(e => assert.ok(e.label && e.label.length, 'every event has a label'));
});

test('previewDiff is empty for an unchanged spec', () => {
  assert.deepEqual(previewDiff(dojo, dojo), []);
});

test('renderPreviewHTML produces a self-contained themed frame', () => {
  const html = renderPreviewHTML(buildPreview(dojo));
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /The Dojo/);
  assert.match(html, /#109F93/);                 // the accent colour is wired into the frame
  assert.match(html, /White/);                   // the belt ladder rendered
  assert.doesNotMatch(html, /https?:\/\//);      // no external assets — fully self-contained
});
