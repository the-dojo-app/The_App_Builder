// src/intake/preview.mjs — the PREVIEW HARNESS (docs/EXPERIENCE.md §5). Turns a validated Spec into
// something an owner can SEE, so every proposal can be shown before it's applied.
//   buildPreview(spec)            → a render-agnostic PREVIEW MODEL (nav, pages, theme, features, roles)
//   previewDiff(before, after)    → typed CHANGE EVENTS (page-added, color-changed, level-count…) that
//                                   drive the animated-diff experience — the presentation-layer cousin
//                                   of plan.mjs's planDiff.
//   renderPreviewHTML(model)      → a self-contained, themed HTML app-frame string (no I/O, no deps).
// Pure + deterministic, like the rest of the engine. Feed it a CLEANED spec (post-cleanSpec) so the
// theme colours/contrast are already trustworthy.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

const plural = (c, key) => (isObj(c[key]) && c[key].plural) || key;

// The dark-app palette roles the frame paints with, and safe fallbacks (the Dojo defaults) so an
// under-specified theme still renders a coherent frame.
const PALETTE = {
  'surface-page':   '#0F171D',
  'surface-sunken': '#171C1C',
  'surface-raised-1': '#1B2228',
  'text-primary':   '#F2F6F5',
  'text-secondary': '#9AA6A4',
  'accent':         '#109F93',
  'accent-text':    '#6FE3D6'
};

function resolveColors(theme) {
  const c = (isObj(theme) && isObj(theme.color)) ? theme.color : {};
  const out = {};
  for (const role of Object.keys(PALETTE)) out[role] = isStr(c[role]) ? c[role] : PALETTE[role];
  return out;
}

// ---- buildPreview -----------------------------------------------------------
// A structured "what this app looks like" derived from a validated Spec. Render-agnostic on purpose:
// the HTML renderer is one consumer; an animation layer or a native frame could be others.
export function buildPreview(spec) {
  const s = isObj(spec) ? spec : {};
  const c = isObj(s.concepts) ? s.concepts : {};
  const app = isObj(s.app) ? s.app : {};

  const pages = (Array.isArray(s.pages) ? s.pages : []).map(p => ({
    id: p.id,
    title: p.title || p.id,
    audience: (isObj(p.audience) && p.audience.who) || 'members',
    section: (isObj(p.nav) && p.nav.section) || 'main',
    icon: (isObj(p.nav) && p.nav.icon) || 'dot',
    navLabel: (isObj(p.nav) && p.nav.label) || p.title || p.id
  }));

  // Feature cards — one per installed module, in domain language.
  const features = [];
  (Array.isArray(s.modules) ? s.modules : []).forEach(m => {
    const cfg = isObj(m.config) ? m.config : {};
    if (m.type === 'progression') {
      const units = Array.isArray(cfg.units) ? cfg.units : [];
      features.push({
        kind: 'levels',
        label: plural(c, cfg.unitConcept || 'progressionUnit'),
        units,
        count: units.length,
        badgesPerUnit: cfg.badgesPerUnit || null,
        viz: cfg.viz || 'list'
      });
    } else if (m.type === 'content-library') {
      features.push({
        kind: 'library',
        label: plural(c, cfg.itemConcept || 'contentItem'),
        formats: Array.isArray(cfg.formats) ? cfg.formats : [],
        taxonomy: (Array.isArray(cfg.taxonomy) ? cfg.taxonomy : []).map(t => t.label || t.id)
      });
    } else if (m.type === 'rbac') {
      features.push({ kind: 'access', label: 'Roles & access' });
    } else {
      features.push({ kind: 'other', label: m.type });
    }
  });

  const roles = (isObj(s.auth) && Array.isArray(s.auth.roles)) ? s.auth.roles.map(r => r.label || r.id) : [];

  return {
    app: { name: app.name || app.id || 'Your app', tagline: app.tagline || '' },
    colors: resolveColors(s.theme),
    nav: pages.filter(p => p.section === 'main'),
    pages,
    features,
    roles
  };
}

// ---- previewDiff ------------------------------------------------------------
// Typed, human-labelled change events between two Specs — the substrate for animated diffs and the
// "here's what I'll change" reel. Deterministic ordering; each event carries a plain-English label.
const byId = arr => new Map(arr.map(x => [x.id, x]));

export function previewDiff(before, after) {
  const A = buildPreview(before), B = buildPreview(after);
  const events = [];

  // Pages
  const pa = byId(A.pages), pb = byId(B.pages);
  for (const [id, p] of pb) if (!pa.has(id)) events.push({ type: 'page-added', id, label: `Added the “${p.title}” page` });
  for (const [id, p] of pa) if (!pb.has(id)) events.push({ type: 'page-removed', id, label: `Removed the “${p.title}” page` });
  for (const [id, p] of pb) { const q = pa.get(id); if (q && q.title !== p.title) events.push({ type: 'page-renamed', id, from: q.title, to: p.title, label: `Renamed “${q.title}” to “${p.title}”` }); }

  // Theme colours
  for (const role of Object.keys(B.colors)) {
    if (A.colors[role] !== B.colors[role]) events.push({ type: 'color-changed', role, from: A.colors[role], to: B.colors[role], label: `Changed the ${role.replace(/-/g, ' ')} colour` });
  }

  // Levels (progression feature)
  const la = A.features.find(f => f.kind === 'levels'), lb = B.features.find(f => f.kind === 'levels');
  if (!la && lb) events.push({ type: 'levels-added', label: `Added ${lb.label} (${lb.count} to climb)` });
  if (la && !lb) events.push({ type: 'levels-removed', label: `Removed ${la.label}` });
  if (la && lb && la.count !== lb.count) events.push({ type: 'level-count', from: la.count, to: lb.count, label: `${lb.label}: ${la.count} → ${lb.count}` });

  // Library feature
  const cla = A.features.find(f => f.kind === 'library'), clb = B.features.find(f => f.kind === 'library');
  if (!cla && clb) events.push({ type: 'library-added', label: `Added a library of ${clb.label}` });
  if (cla && !clb) events.push({ type: 'library-removed', label: `Removed the ${cla.label} library` });

  // Roles
  const ra = new Set(A.roles), rb = new Set(B.roles);
  for (const r of rb) if (!ra.has(r)) events.push({ type: 'role-added', role: r, label: `Added the ${r} role` });
  for (const r of ra) if (!rb.has(r)) events.push({ type: 'role-removed', role: r, label: `Removed the ${r} role` });

  return events;
}

// ---- renderPreviewHTML ------------------------------------------------------
// A self-contained themed app-frame. No external assets; colours come straight from the Spec's theme
// so the preview honestly reflects "the starting look." String-only (no I/O) — a harness writes it.
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function featureCardHTML(f) {
  if (f.kind === 'levels') {
    const ladder = f.units.map((u, i) =>
      `<span class="lvl" style="--i:${i}">${esc(u)}</span>`).join('<span class="arrow">›</span>');
    return `<div class="card"><div class="card-h">${esc(f.label)}${f.count ? ` <span class="pill">${f.count}</span>` : ''}</div>
      <div class="ladder">${ladder || '<span class="muted">no levels yet</span>'}</div>
      ${f.badgesPerUnit ? `<div class="muted">${f.badgesPerUnit} badges each</div>` : ''}</div>`;
  }
  if (f.kind === 'library') {
    const tags = f.taxonomy.map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="card"><div class="card-h">Library of ${esc(f.label)}</div>
      <div class="muted">${f.formats.length} formats</div><div class="tags">${tags}</div></div>`;
  }
  return `<div class="card"><div class="card-h">${esc(f.label)}</div></div>`;
}

export function renderPreviewHTML(model) {
  const m = isObj(model) ? model : buildPreview({});
  const co = m.colors;
  const nav = m.nav.map(p => `<div class="nav-item">${esc(p.navLabel)}</div>`).join('') ||
    m.pages.map(p => `<div class="nav-item">${esc(p.title)}</div>`).join('');
  const features = m.features.map(featureCardHTML).join('');
  const roles = m.roles.map(r => `<span class="tag">${esc(r)}</span>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.app.name)} — preview</title>
<style>
  :root{
    --page:${co['surface-page']}; --sunken:${co['surface-sunken']}; --raised:${co['surface-raised-1']};
    --text:${co['text-primary']}; --muted:${co['text-secondary']}; --accent:${co['accent']}; --accent-text:${co['accent-text']};
  }
  *{box-sizing:border-box} body{margin:0;background:#05080a;color:var(--text);
    font-family:'Work Sans',system-ui,sans-serif;display:flex;justify-content:center;padding:24px;min-height:100vh}
  .frame{width:390px;background:var(--page);border-radius:32px;overflow:hidden;
    box-shadow:0 24px 60px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.06)}
  .top{background:linear-gradient(160deg,var(--sunken),var(--page));padding:26px 22px 18px}
  .app-name{font-size:24px;font-weight:700;letter-spacing:-.01em}
  .tagline{color:var(--muted);font-size:13px;margin-top:4px}
  .nav{display:flex;gap:8px;padding:14px 18px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.06)}
  .nav-item{background:var(--raised);color:var(--accent-text);font-size:12px;font-weight:600;
    padding:7px 13px;border-radius:999px}
  .body{padding:18px}
  .card{background:var(--raised);border-radius:16px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,255,255,.05)}
  .card-h{font-weight:700;font-size:15px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
  .pill{background:var(--accent);color:#04110f;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
  .ladder{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .lvl{background:var(--sunken);border:1px solid var(--accent);color:var(--accent-text);
    font-size:11px;font-weight:600;padding:4px 9px;border-radius:8px}
  .arrow{color:var(--muted);font-size:12px}
  .tags,.roles{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .tag{background:var(--sunken);color:var(--muted);font-size:11px;padding:4px 9px;border-radius:7px}
  .muted{color:var(--muted);font-size:12px}
  .section-label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:4px 0 10px}
  .accent-btn{background:var(--accent);color:#04110f;font-weight:700;text-align:center;
    padding:13px;border-radius:12px;margin-top:6px}
</style></head>
<body><div class="frame">
  <div class="top"><div class="app-name">${esc(m.app.name)}</div>${m.app.tagline ? `<div class="tagline">${esc(m.app.tagline)}</div>` : ''}</div>
  <div class="nav">${nav}</div>
  <div class="body">
    ${features}
    ${roles ? `<div class="card"><div class="section-label">Who's inside</div><div class="roles">${roles}</div></div>` : ''}
    <div class="accent-btn">Get started</div>
  </div>
</div></body></html>`;
}
