// test/intake-themes.test.mjs — the design-direction presets. Same guarantee as the starter gallery:
// EVERY look must be a valid, gate-passing theme proposal (a bad palette can't ship — the contrast
// floor sees to it), and applying one must visibly change the preview's accent/surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeProposals, THEME_IDS, THEME_PRESETS } from '../src/intake/themes.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('every look is a buildable proposal that passes the contrast floor', () => {
  for (const p of themeProposals()) {
    const r = reviewProposal(dojo, p.ops);
    assert.equal(r.ok, true, `look "${p.id}" must pass the gate, errors: ${(r.errors || []).join('; ')}`);
    assert.equal(r.preview.colors.accent, THEME_PRESETS.find(x => x.id === p.id).theme.color.accent);
  }
});

test('applying a look actually changes the visible palette', () => {
  const before = reviewProposal(getStarter('knowledgebase'), []).preview.colors.accent;
  const vibrant = themeProposals().find(p => p.id === 'vibrant');
  const after = reviewProposal(getStarter('knowledgebase'), vibrant.ops).preview.colors.accent;
  assert.notEqual(after, before);
  assert.equal(after, '#8B5CF6');
});

test('proposals carry owner-facing cards (name, blurb, swatch) and stay jargon-free', () => {
  const ps = themeProposals();
  assert.deepEqual(ps.map(p => p.id).sort(), THEME_IDS.slice().sort());
  for (const p of ps) {
    assert.ok(p.name && p.blurb && p.swatch.bg && p.swatch.accent && p.ops.length);
    assert.doesNotMatch(p.name + p.blurb, /theme|token|cleanTheme|surface-|#/);
  }
});
