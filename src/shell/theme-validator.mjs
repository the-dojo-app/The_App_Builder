// src/shell/theme-validator.mjs — the platform's theme validator, ported faithfully from the
// Dojo's functions/lib/appTheme.js `cleanTheme`. Pure, no dependencies. Every value is a hex /
// clamped number / whitelisted enum, so nothing an author (or the AI) supplies can become
// arbitrary CSS. See docs/APP_SPEC.md (theme), docs/ASSEMBLER.md §4.
//
// PORTED here: colour + per-mode light colour, belt, shape, motion, elevation, type, button,
// states, chrome, background, and the surface/look enums, plus the CONTRAST FLOOR. The Dojo's
// save-time guard `throw HttpsError` is adapted to a portable `checkContrast()` the assembler's
// cleanSpec turns into a Spec error (no Firebase dependency).
// NOT yet ported (the Design-Inspector element system — a separate, larger lift): the nav token
// cleaner, per-element `elements`, per-page `scope`, and `elementOverrides`.

const HEX = /^#[0-9a-fA-F]{6}$/;
const clampNum = (v, lo, hi, dp = 0) => { const m = Math.pow(10, dp); return Math.max(lo, Math.min(hi, Math.round(v * m) / m)); };
const isNum = v => typeof v === 'number' && isFinite(v);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// ---- WCAG luminance + contrast (faithful port) ----------------------------
function lum(hex) {
  hex = String(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

// ---- enum whitelists (from appTheme.js) -----------------------------------
const BG_TINTS = ['blue', 'slate', 'charcoal', 'tint'];
const BG_STYLES = ['flat', 'soft', 'gradient', 'trough', 'glass'];
const BAR_SURFACES = ['raised', 'sunken', 'flat', 'soft', 'glass', 'gradient', 'trough', 'hairline', 'tinted'];
const CARD_SURFACES = ['raised', 'sunken', 'flat', 'soft', 'glass', 'gradient'];
const BUTTON_SURFACES = ['raised', 'sunken', 'flat', 'soft', 'glass', 'gradient'];
const MENU_TILES = ['raised', 'carved', 'flat', 'accent', 'frame'];
const MENU_BARS = ['raised', 'sunken', 'flat', 'soft', 'glass'];

// ---- sub-cleaners (faithful ports) ----------------------------------------
export function cleanColorMap(c) {
  const out = {}; c = isObj(c) ? c : {};
  Object.keys(c).forEach(k => { if (HEX.test(c[k])) out[k] = c[k].toUpperCase(); });
  return out;
}

function cleanShapeObj(s) {
  const out = {}; s = isObj(s) ? s : {};
  const r = (k, hi) => { if (isNum(s[k])) out[k] = clampNum(s[k], 0, hi); };
  r('radius', 40); r('radiusBtn', 40); r('radiusMenu', 30); r('radiusField', 30);
  r('radiusChip', 20); r('radiusBox', 30); r('radiusPanel', 40); r('radiusPill', 40);
  if (isNum(s.borderWidth)) out.borderWidth = Math.max(0, Math.min(4, Math.round(s.borderWidth * 2) / 2));
  if (['solid', 'dashed', 'dotted', 'double', 'none'].includes(s.borderStyle)) out.borderStyle = s.borderStyle;
  if (isObj(s.corners)) {
    const co = {};
    ['tl', 'tr', 'br', 'bl'].forEach(k => { if (isNum(s.corners[k])) co[k] = clampNum(s.corners[k], 0, 40); });
    if (Object.keys(co).length === 4) out.corners = co;
  }
  if (isNum(s.density)) out.density = Math.max(0.6, Math.min(1.6, Math.round(s.density * 20) / 20));
  if (isNum(s.padBtn)) out.padBtn = Math.max(0.5, Math.min(2, Math.round(s.padBtn * 20) / 20));
  if (isNum(s.padAcc)) out.padAcc = Math.max(0.5, Math.min(2, Math.round(s.padAcc * 20) / 20));
  if (isNum(s.scale)) out.scale = Math.max(0.7, Math.min(1.8, Math.round(s.scale * 100) / 100));
  return out;
}

function cleanTypeObj(ty) {
  const out = {}; ty = isObj(ty) ? ty : {};
  ['heading', 'body', 'headingWeight', 'bodyWeight'].forEach(k => { if (typeof ty[k] === 'string' && ty[k].length < 60) out[k] = ty[k]; });
  const W = isObj(ty.weights) ? ty.weights : {}, wout = {};
  ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black'].forEach(k => {
    if (isNum(W[k])) wout[k] = Math.max(100, Math.min(900, Math.round(W[k] / 100) * 100));
  });
  if (Object.keys(wout).length) out.weights = wout;
  if (isNum(ty.tracking)) out.tracking = clampNum(ty.tracking, -2, 4, 2);
  return out;
}

function cleanElevationObj(ev) {
  const out = {}; ev = isObj(ev) ? ev : {};
  if (isNum(ev.offsetY)) out.offsetY = clampNum(ev.offsetY, 0, 40);
  if (isNum(ev.blur)) out.blur = clampNum(ev.blur, 0, 80);
  if (isNum(ev.opacity)) out.opacity = clampNum(ev.opacity, 0, 100);
  return out;
}

function cleanStatesObj(st) {
  const out = {}; st = isObj(st) ? st : {};
  ['selectionBg', 'selectionText', 'focusRing', 'wash'].forEach(k => { if (HEX.test(st[k])) out[k] = st[k].toUpperCase(); });
  return out;
}

function cleanMotionObj(mo) {
  const out = {}; mo = isObj(mo) ? mo : {};
  if (isNum(mo.scale)) out.scale = clampNum(mo.scale, 0, 2.5, 2);
  if (['ease', 'ease-in-out', 'ease-out', 'linear', 'spring', 'smooth'].includes(mo.ease)) out.ease = mo.ease;
  return out;
}

function cleanChromeObj(ch) {
  const out = {}; ch = isObj(ch) ? ch : {};
  ['infobarBg', 'infobarIconColor', 'barAccent', 'bellDot', 'toastBg', 'crumbColor', 'crumbSep']
    .forEach(k => { if (HEX.test(ch[k])) out[k] = ch[k].toUpperCase(); });
  const num = (k, lo, hi, dp) => { if (isNum(ch[k])) out[k] = clampNum(ch[k], lo, hi, dp || 0); };
  num('infobarMinH', 16, 80); num('infobarSize', 4, 22, 1); num('infobarIcon', 6, 30);
  num('barIcon', 24, 48); num('barLabel', 5, 11, 1); num('tabIcon', 32, 60); num('tabTitle', 7, 14, 1);
  num('crumbSize', 6, 14, 1); num('toastRadius', 0, 20);
  if (ch.crumbFont === 'heading' || ch.crumbFont === 'body' ||
      (typeof ch.crumbFont === 'string' && ch.crumbFont.length < 60 && /^[\w \-]+$/.test(ch.crumbFont))) out.crumbFont = ch.crumbFont;
  if (ch.frameBorder === 'on' || ch.frameBorder === 'off') out.frameBorder = ch.frameBorder;
  if (ch.frameCorners === 'rounded' || ch.frameCorners === 'square') out.frameCorners = ch.frameCorners;
  return out;
}

// ---- the composed validator -----------------------------------------------
export function cleanTheme(t) {
  t = isObj(t) ? t : {};
  const out = {};
  out.color = cleanColorMap(t.color);
  out.colorLight = cleanColorMap(t.colorLight);   // per-mode light overrides
  out.belt = cleanColorMap(t.belt);
  out.shape = cleanShapeObj(t.shape);
  out.motion = cleanMotionObj(t.motion);
  out.elevation = cleanElevationObj(t.elevation);
  out.type = cleanTypeObj(t.type);
  const bt = isObj(t.button) ? t.button : {};
  out.button = {};
  if (typeof bt.weight === 'string' && bt.weight.length < 5) out.button.weight = bt.weight;
  if (isNum(bt.tracking)) out.button.tracking = clampNum(bt.tracking, -1, 8, 1);
  out.states = cleanStatesObj(t.states);
  out.chrome = cleanChromeObj(t.chrome);
  const bg = isObj(t.background) ? t.background : {}, bgt = {};
  if (BG_TINTS.includes(bg.tint)) bgt.tint = bg.tint;
  if (BG_STYLES.includes(bg.style)) bgt.style = bg.style;
  if (Object.keys(bgt).length) out.background = bgt;
  if (['v1', 'v2'].includes(t.accordion)) out.accordion = t.accordion;
  if (BAR_SURFACES.includes(t.barSurface)) out.barSurface = t.barSurface;
  if (CARD_SURFACES.includes(t.cardSurface)) out.cardSurface = t.cardSurface;
  if (BUTTON_SURFACES.includes(t.buttonPrimary)) out.buttonPrimary = t.buttonPrimary;
  if (BUTTON_SURFACES.includes(t.buttonSecondary)) out.buttonSecondary = t.buttonSecondary;
  if (MENU_TILES.includes(t.menuTiles)) out.menuTiles = t.menuTiles;
  if (MENU_BARS.includes(t.menuBar)) out.menuBar = t.menuBar;
  const bl = isObj(t.backlink) ? t.backlink : {};
  out.backlink = {};
  if (['link', 'pill', 'button', 'bar'].includes(bl.variant)) out.backlink.variant = bl.variant;
  if (['left', 'center', 'right'].includes(bl.align)) out.backlink.align = bl.align;
  // TODO(shell-lift): nav token cleaner, per-element `elements`, per-page `scope`, elementOverrides.
  return out;
}

// The contrast floor, portable: returns an error message if primary text would be unreadable on
// the card surface (< 3:1), else null. The assembler's cleanSpec turns a message into a Spec error
// (the Dojo throws an HttpsError here; the platform records it so the Plan preview can show it).
export function checkContrast(theme) {
  const c = (theme && theme.color) || {};
  const text = c['text-primary'];
  const surf = c['surface-raised-1'] || c['surface-page'];
  if (text && surf && HEX.test(text) && HEX.test(surf) && contrast(text, surf) < 3) {
    return 'theme rejected: primary text vs the card surface is below 3:1 (it would be ignored on every device).';
  }
  return null;
}
