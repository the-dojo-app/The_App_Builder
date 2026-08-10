// test/theme-validator.test.mjs — the fuller cleanTheme port: colour, shape clamping, type,
// look-enum whitelisting, and the contrast floor (as a portable check + a cleanSpec error).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanTheme, checkContrast } from '../src/shell/theme-validator.mjs';
import { cleanSpec } from '../src/assembler.mjs';

const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));

test('colour + light colour still validated (bad dropped, valid upper-cased)', () => {
  const t = cleanTheme({ color: { accent: 'nope', 'text-primary': '#abcdef' }, colorLight: { accent: '#0b746b' } });
  assert.equal(t.color.accent, undefined);
  assert.equal(t.color['text-primary'], '#ABCDEF');
  assert.equal(t.colorLight.accent, '#0B746B');
});

test('shape numbers are clamped to sane ranges', () => {
  const t = cleanTheme({ shape: { radius: 999, radiusChip: -5, scale: 9, density: 0.1, borderStyle: 'wavy' } });
  assert.equal(t.shape.radius, 40);      // capped
  assert.equal(t.shape.radiusChip, 0);   // floored
  assert.equal(t.shape.scale, 1.8);      // capped
  assert.equal(t.shape.density, 0.6);    // floored
  assert.equal(t.shape.borderStyle, undefined);  // not in whitelist
});

test('type weights snap to 100–900 steps; tracking clamps', () => {
  const t = cleanTheme({ type: { heading: 'Work Sans', weights: { bold: 733, black: 5000 }, tracking: 99 } });
  assert.equal(t.type.heading, 'Work Sans');
  assert.equal(t.type.weights.bold, 700);
  assert.equal(t.type.weights.black, 900);
  assert.equal(t.type.tracking, 4);
});

test('look enums are whitelisted (valid kept, junk dropped)', () => {
  const t = cleanTheme({ barSurface: 'glass', cardSurface: 'hologram', menuBar: 'sunken', accordion: 'v3', background: { tint: 'slate', style: 'nope' } });
  assert.equal(t.barSurface, 'glass');
  assert.equal(t.cardSurface, undefined);        // not a CARD_SURFACE
  assert.equal(t.menuBar, 'sunken');
  assert.equal(t.accordion, undefined);          // only v1/v2
  assert.equal(t.background.tint, 'slate');
  assert.equal(t.background.style, undefined);
});

test('contrast floor: readable passes, unreadable is flagged', () => {
  assert.equal(checkContrast({ color: { 'text-primary': '#F2F6F5', 'surface-page': '#0F171D' } }), null);
  const bad = checkContrast({ color: { 'text-primary': '#111111', 'surface-page': '#0F171D' } });
  assert.match(bad, /below 3:1/);
});

test('cleanSpec surfaces a low-contrast theme as an error (not a throw)', () => {
  const dim = structuredClone(dojoSpec);
  dim.theme.color['text-primary'] = '#111111';   // dark on dark surface-page → unreadable
  const { errors } = cleanSpec(dim);
  assert.ok(errors.some(e => /below 3:1/.test(e)));
});

test('the Dojo spec theme still passes clean (no contrast error)', () => {
  const { errors } = cleanSpec(dojoSpec);
  assert.deepEqual(errors, []);
});
