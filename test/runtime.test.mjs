// test/runtime.test.mjs — the runtime shell: buildRuntimeModel (pure model) + renderRuntimeHTML (a
// self-contained, navigable app). Structure comes from config; live data is a later layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRuntimeModel, renderRuntimeHTML } from '../src/intake/runtime.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('buildRuntimeModel maps pages to their module surfaces', () => {
  const m = buildRuntimeModel(getStarter('academy'));
  assert.equal(m.app.name, 'Academy');
  assert.ok(m.nav.some(n => n.id === 'catalog'));
  const catalog = m.pages.find(p => p.id === 'catalog');
  assert.ok(catalog.surfaces.some(s => s.module === 'content-library' && s.kind === 'catalogue'));
  assert.ok(m.progression && m.progression.units.length >= 1);   // Academy has levels
  assert.ok(m.colors.accent);                                     // theme resolved
});

test('a knowledge base (no progression) yields no levels strip', () => {
  const m = buildRuntimeModel(getStarter('knowledgebase'));
  assert.equal(m.progression, null);
  assert.ok(m.pages.find(p => p.id === 'help').surfaces.some(s => s.kind === 'catalogue'));
});

test('renderRuntimeHTML is a self-contained app: app name, nav, embedded model, no crash', () => {
  const html = renderRuntimeHTML(buildRuntimeModel(getStarter('coaching')));
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Coaching Program/);
  assert.match(html, /<nav id="nav">/);
  assert.match(html, /const M = /);                    // model embedded for client routing
  assert.match(html, /Book a time|Programs|Today/);    // a surface/nav label rendered
  // the embedded model must not break the <script> (escaped <)
  assert.ok(!/<\/script>\s*<\/script>/.test(html));
});

test('renderRuntimeHTML tolerates an empty model', () => {
  const html = renderRuntimeHTML(buildRuntimeModel({}));
  assert.match(html, /<!doctype html>/i);
});
