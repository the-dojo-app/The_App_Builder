// src/shell/block-tree.mjs — the page BLOCK-TREE validator, ported faithfully from the Dojo's
// Live Builder (functions/lib/pageContent.js `cleanBlockTree`). Pure. The core safety rule: an
// unknown block type is DROPPED, hrefs may never carry a scheme (no javascript:/data:), media
// sources must match the app's own storage bucket, and every value is length/enum/number-bounded
// — so a stored (or AI-authored) block tree can never carry arbitrary HTML/JS. See
// docs/ASSEMBLER.md §4, docs/LIVE_BUILDER.md.
//
// GENERALIZED from the Dojo via `opts` (the three app-specific pins): the storage `bucket` +
// `mediaFolders` (media src validation), `audiences` (per-block visibleTo), and the `statMetrics`
// / `chartTypes` allow-lists (provided by installed modules). Missing block ids are DETERMINISTIC
// (`b_<n>` from the walk counter) so assembly stays reproducible — the Dojo used random ids.
// NOT ported for v0 (a follow-on — the playlist media handling): audioplayer / videoplayer.

const TYPES = { section: 1, text: 1, heading: 1, divider: 1, button: 1, image: 1, stat: 1, chart: 1, accordion: 1, poll: 1, quote: 1, linklist: 1, video: 1, columns: 1, icon: 1 };
const MAX_COLUMNS = 3, MIN_COLUMNS = 2;
const MAX_DEPTH = 6, MAX_BLOCKS = 500, MAX_TEXT = 5000, MAX_CHILDREN = 200, MAX_LABEL = 200, MAX_HREF = 500, MAX_ALT = 300, MAX_ACC_ITEMS = 30, MAX_POLL_OPTIONS = 6, MIN_POLL_OPTIONS = 2, MAX_LINKS = 20;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const STYLE_ROLES = { 'accent': 1, 'text-primary': 1, 'text-secondary': 1, 'text-muted': 1, 'accent-text': 1 };
const STYLE_BG_ROLES = { 'surface-raised': 1, 'surface-raised-2': 1, 'surface-sunken': 1, 'accent': 1, 'accent-wash': 1, 'transparent': 1 };
const STYLE_WEIGHTS = { '100': 1, '200': 1, '300': 1, '400': 1, '500': 1, '600': 1, '700': 1, '800': 1, '900': 1 };
const STYLE_SHADOWS = { soft: 1, medium: 1, strong: 1, glow: 1 };
const STYLE_FRAMES = { line: 1, matte: 1, rounded: 1, circle: 1 };

const setOf = v => {
  const o = {};
  if (Array.isArray(v)) v.forEach(k => { o[String(k)] = 1; });
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => { o[k] = 1; });
  return o;
};
function normOpts(o) {
  o = o || {};
  return {
    bucket: typeof o.bucket === 'string' ? o.bucket : null,
    folders: Object.assign({ image: 'builder-images', video: 'builder-videos' }, o.mediaFolders || {}),
    audiences: setOf(o.audiences),
    statMetrics: setOf(o.statMetrics),
    chartTypes: setOf(o.chartTypes),
    icons: setOf(o.icons)
  };
}

const cleanText = v => String(v == null ? '' : v).slice(0, MAX_TEXT);
const cleanLabel = v => String(v == null ? '' : v).slice(0, MAX_LABEL);
const cleanLevel = v => { v = parseInt(v, 10); return (v >= 1 && v <= 4) ? v : 2; };
const cleanId = (v, counter) => (typeof v === 'string' && ID_RE.test(v)) ? v : ('b_' + counter.n);
const cleanIconName = (v, o) => { v = String(v == null ? '' : v).trim(); return o.icons[v] ? v : ''; };

// media src — same-bucket only, built from the APP's bucket + folder (was hardcoded to the Dojo's).
function cleanMediaSrc(v, o, kind) {
  v = String(v == null ? '' : v).trim().slice(0, 1000);
  if (!o.bucket) return '';
  const folder = o.folders[kind] || '';
  const re = new RegExp('^https://firebasestorage\\.googleapis\\.com/v0/b/' +
    o.bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/o/' +
    folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:%2F|/)[^?#\\s]+(?:\\?[^\\s]*)?$', 'i');
  return re.test(v) ? v : '';
}

// A button/link destination is a LINK, never code: external https or a same-origin relative path;
// anything carrying a scheme (javascript:/data:/…) or protocol-relative (//host) is dropped. Verbatim.
function cleanHref(v) {
  v = String(v == null ? '' : v).trim().slice(0, MAX_HREF);
  if (!v || v.indexOf('\\') !== -1 || v.slice(0, 2) === '//') return '';
  if (/^https:\/\/[^\s]+$/i.test(v)) return v;
  if (/^\/?[A-Za-z0-9][A-Za-z0-9_./?=&#%~+-]*$/.test(v)) return v;
  return '';
}

// per-block audience (presentation only): 'members' | 'staff' | 'unit:<x>' (x in opts.audiences).
function cleanVisibleTo(v, o) {
  v = String(v == null ? '' : v).trim();
  if (v === 'members' || v === 'staff') return v;
  if (v.slice(0, 5) === 'unit:' && o.audiences[v.slice(5)]) return v;
  return '';
}

function cleanBlockStyle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = {}, num = (v, lo, hi, dp) => Math.max(lo, Math.min(hi, Math.round(v * Math.pow(10, dp || 0)) / Math.pow(10, dp || 0)));
  if (['left', 'center', 'right'].includes(raw.align)) o.align = raw.align;
  if (typeof raw.scale === 'number' && isFinite(raw.scale)) o.scale = Math.max(0.8, Math.min(2, Math.round(raw.scale * 20) / 20));
  if (STYLE_ROLES[raw.colorRole]) o.colorRole = raw.colorRole;
  if (STYLE_WEIGHTS[String(raw.weight)]) o.weight = String(raw.weight);
  if (['none', 'uppercase', 'lowercase', 'capitalize'].includes(raw.transform)) o.transform = raw.transform;
  if (typeof raw.tracking === 'number' && isFinite(raw.tracking)) { const t = Math.max(-2, Math.min(6, Math.round(raw.tracking * 2) / 2)); if (t) o.tracking = t; }
  if (STYLE_BG_ROLES[raw.bgRole]) o.bgRole = raw.bgRole;
  if (typeof raw.pad === 'number' && isFinite(raw.pad)) { const p = num(raw.pad, 0, 40); if (p) o.pad = p; }
  if (typeof raw.radius === 'number' && isFinite(raw.radius)) { const r = num(raw.radius, 0, 40); if (r) o.radius = r; }
  if (STYLE_SHADOWS[raw.shadow]) o.shadow = raw.shadow;
  if (STYLE_FRAMES[raw.frame]) o.frame = raw.frame;
  return Object.keys(o).length ? o : null;
}

function cleanAccordionItems(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (let i = 0; i < v.length && out.length < MAX_ACC_ITEMS; i++) {
    const it = v[i]; if (!it || typeof it !== 'object') continue;
    const q = cleanLabel(it.q).trim(); if (!q) continue;
    out.push({ q, a: cleanText(it.a) });
  }
  return out;
}
function cleanPollOptions(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (let i = 0; i < v.length && out.length < MAX_POLL_OPTIONS; i++) { const o = cleanLabel(v[i]).trim(); if (o) out.push(o); }
  return out;
}
function cleanLinks(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (let i = 0; i < v.length && out.length < MAX_LINKS; i++) {
    const it = v[i]; if (!it || typeof it !== 'object') continue;
    const label = cleanLabel(it.label).trim(), href = cleanHref(it.href);
    if (!label || !href) continue;
    out.push({ label, href });
  }
  return out;
}

function cleanColumn(raw, depth, counter, o) {
  counter.n++;
  const kids = (raw && Array.isArray(raw.children) && depth < MAX_DEPTH) ? raw.children.slice(0, MAX_CHILDREN) : [];
  const children = kids.map(c => cleanBlock(c, depth + 1, counter, o)).filter(Boolean)
    .filter(b => b.type !== 'columns' && b.type !== 'column' && b.type !== 'section');
  return { type: 'column', id: cleanId(raw && raw.id, counter), children };
}

function cleanBlock(raw, depth, counter, o) {
  if (!raw || typeof raw !== 'object' || counter.n >= MAX_BLOCKS) return null;
  const type = raw.type;
  if (!TYPES[type]) return null;                 // UNKNOWN TYPE → dropped (the core safety rule)
  counter.n++;
  const out = { type, id: cleanId(raw.id, counter) };
  const P = raw.props || {};
  if (type === 'text') out.props = { text: cleanText(P.text) };
  else if (type === 'heading') out.props = { level: cleanLevel(P.level), text: cleanText(P.text) };
  else if (type === 'button') { out.props = { label: cleanLabel(P.label), href: cleanHref(P.href) }; const bi = cleanIconName(P.icon, o); if (bi) out.props.icon = bi; }
  else if (type === 'icon') { const nm = cleanIconName(P.name, o); if (!nm) return null; out.props = { name: nm }; }
  else if (type === 'image') { const src = cleanMediaSrc(P.src, o, 'image'); if (!src) return null; out.props = { src, alt: cleanText(P.alt).slice(0, MAX_ALT) }; }
  else if (type === 'video') { const src = cleanMediaSrc(P.src, o, 'video'); if (!src) return null; out.props = { src }; }
  else if (type === 'stat') { const m = String(P.metric || ''); if (!o.statMetrics[m]) return null; out.props = { metric: m, label: cleanText(P.label).slice(0, MAX_LABEL) }; }
  else if (type === 'chart') { const c = String(P.chart || ''); if (!o.chartTypes[c]) return null; out.props = { chart: c, label: cleanText(P.label).slice(0, MAX_LABEL) }; }
  else if (type === 'accordion') { const items = cleanAccordionItems(P.items); if (!items.length) return null; out.props = { items }; }
  else if (type === 'poll') { const options = cleanPollOptions(P.options); if (options.length < MIN_POLL_OPTIONS) return null; out.props = { question: cleanLabel(P.question).trim(), options }; }
  else if (type === 'quote') { const text = cleanText(P.text); if (!text.trim()) return null; out.props = { text, cite: cleanLabel(P.cite).trim() }; }
  else if (type === 'linklist') { const links = cleanLinks(P.links); if (!links.length) return null; out.props = { title: cleanLabel(P.title).trim(), links }; }

  if (type === 'section') {
    out.children = (Array.isArray(raw.children) && depth < MAX_DEPTH)
      ? raw.children.slice(0, MAX_CHILDREN).map(c => cleanBlock(c, depth + 1, counter, o)).filter(Boolean) : [];
  }
  if (type === 'columns') {
    let count = parseInt(P.count, 10);
    if (!(count >= MIN_COLUMNS && count <= MAX_COLUMNS)) count = MIN_COLUMNS;
    out.props = { count };
    const kids = (Array.isArray(raw.children) && depth < MAX_DEPTH) ? raw.children : [];
    const cols = [];
    for (let i = 0; i < count; i++) cols.push(cleanColumn(kids[i], depth + 1, counter, o));
    out.children = cols;
  }
  const vis = cleanVisibleTo(raw.visibleTo, o); if (vis) out.visibleTo = vis;
  const style = cleanBlockStyle(raw.style); if (style) out.style = style;
  return out;
}

export function cleanBlockTree(raw, opts) {
  if (!Array.isArray(raw)) return [];
  const o = normOpts(opts);
  const counter = { n: 0 };
  return raw.slice(0, MAX_CHILDREN).map(b => cleanBlock(b, 0, counter, o)).filter(Boolean);
}

export const BLOCK_TYPES = TYPES;
