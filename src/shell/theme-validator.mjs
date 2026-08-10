// src/shell/theme-validator.mjs — the platform's theme validator, extracted from the Dojo's
// functions/lib/appTheme.js (`cleanTheme`). v0 covers colour + per-mode LIGHT colour, faithful
// to the source's rule: a 6-digit hex is kept (upper-cased), anything else is dropped. The fuller
// cleanTheme (belt/shape/type/elements/nav/states + the text-vs-surface contrast floor) is ported
// in incrementally as the shell is lifted from the Dojo. Pure, no dependencies.

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cleanColorMap(c) {
  const out = {};
  c = (c && typeof c === 'object') ? c : {};
  Object.keys(c).forEach(k => { if (HEX.test(c[k])) out[k] = c[k].toUpperCase(); });
  return out;
}

export function cleanTheme(t) {
  t = (t && typeof t === 'object') ? t : {};
  const out = {};
  out.color = cleanColorMap(t.color);
  out.colorLight = cleanColorMap(t.colorLight);   // per-mode light overrides (see docs/APP_SPEC.md)
  // TODO(shell-lift): port belt/shape/type/elements/nav/states + the contrast floor from
  // the Dojo's functions/lib/appTheme.js as those shell pieces are extracted.
  return out;
}
