// src/intake/runtime.mjs — the RUNTIME SHELL renderer. Turns a validated Spec into a self-contained,
// themed, navigable member-facing app (the thing a URL serves). Pure + deterministic, like the rest:
//   buildRuntimeModel(spec)   → a render model: theme colours, nav, and per-page module SURFACES
//   renderRuntimeHTML(model)  → one self-contained HTML string (embedded model + inline theme + routing)
// v0 renders the app's STRUCTURE from config (theme, nav, each module's surfaces as themed scaffolds) —
// a real, navigable app frame. Live per-member data (content items, progress, orders) is the next layer,
// layered on the same shell via the provider/executor (it needs auth); the structure is config-driven now.
import { resolveColors } from './preview.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const plural = (c, key) => (isObj(c[key]) && c[key].plural) || key;

// Which module surface names render, and the render kind for each.
const SURFACES = {
  'content-library': { catalogue: 'catalogue', gatedReader: 'reader' },
  'commerce': { storefront: 'storefront', checkout: 'checkout', myOrders: 'orders', admin: 'admin' },
  'messaging': { inbox: 'inbox', thread: 'thread' },
  'booking': { calendar: 'calendar', myBookings: 'bookings', admin: 'schedule' },
  'activity-log': { feed: 'feed', analytics: 'analytics', audit: 'audit' }
};

function surfaceLabel(mType, surfaceName, cfg, concepts) {
  const item = plural(concepts, (cfg && cfg.itemConcept) || 'contentItem');
  if (mType === 'content-library') return surfaceName === 'catalogue' ? `Library of ${item}` : `Your ${item}`;
  if (mType === 'commerce') return surfaceName === 'storefront' ? 'Shop' : surfaceName === 'myOrders' ? 'My orders' : surfaceName === 'admin' ? 'Manage shop' : 'Checkout';
  if (mType === 'messaging') return surfaceName === 'inbox' ? 'Messages' : 'Conversation';
  if (mType === 'booking') return surfaceName === 'calendar' ? 'Book a time' : surfaceName === 'myBookings' ? 'My bookings' : 'Schedule';
  if (mType === 'activity-log') return surfaceName === 'feed' ? 'Activity' : surfaceName === 'audit' ? 'Audit log' : 'Insights';
  return surfaceName;
}

// A small demo dataset per surface kind so a materialized app looks ALIVE (titled cards/rows, not
// placeholders). Live Firestore data flows through the exact same `items` shape once auth is wired.
function demoItems(kind, meta) {
  const n = (k, fn) => Array.from({ length: k }, (_, i) => fn(i + 1));
  switch (kind) {
    case 'catalogue': case 'reader': return n(6, i => ({ title: `${meta.item} ${i}`, sub: meta.taxonomy[0] || '' }));
    case 'storefront': return n(6, i => ({ title: `Product ${i}`, sub: `$${(i * 10) - 1}` }));
    case 'orders': return n(3, i => ({ title: `Order #${1000 + i}`, sub: 'paid' }));
    case 'bookings': return n(3, i => ({ title: `Session ${i}`, sub: 'confirmed' }));
    case 'inbox': return n(4, i => ({ title: `Member ${i}`, sub: 'Tap to open the conversation' }));
    case 'feed': case 'analytics': case 'audit': return n(4, i => ({ title: `Activity ${i}`, sub: 'just now' }));
    default: return [];
  }
}

export function buildRuntimeModel(spec, opts = {}) {
  const s = isObj(spec) ? spec : {};
  const c = isObj(s.concepts) ? s.concepts : {};
  const app = isObj(s.app) ? s.app : {};
  const modules = Array.isArray(s.modules) ? s.modules : [];

  const surfacesByPage = {};
  modules.forEach(m => {
    const cfg = isObj(m.config) ? m.config : {};
    const surf = isObj(cfg.surfaces) ? cfg.surfaces : {};
    const kinds = SURFACES[m.type] || {};
    Object.keys(surf).forEach(name => {
      const sd = surf[name];
      if (!isObj(sd) || !isStr(sd.pageId) || !kinds[name]) return;
      const meta = {
        taxonomy: (m.type === 'content-library' && Array.isArray(cfg.taxonomy)) ? cfg.taxonomy.map(t => t.label || t.id) : [],
        formats: (m.type === 'content-library' && Array.isArray(cfg.formats)) ? cfg.formats : [],
        item: (isObj(c[cfg.itemConcept]) && c[cfg.itemConcept].label) || 'Item'
      };
      (surfacesByPage[sd.pageId] ||= []).push({
        module: m.type, surface: name, kind: kinds[name],
        label: surfaceLabel(m.type, name, cfg, c),
        meta,
        // the DATA CHANNEL: live records for this surface. Empty → the shell shows a scaffold/loading.
        // A demo seed fills it statically; when `firebase` is set, the shell reads `collection` live.
        collection: (m.type === 'content-library' && isStr(cfg.collection)) ? cfg.collection : null,
        items: opts.demo ? demoItems(kinds[name], meta) : []
      });
    });
  });

  const pages = (Array.isArray(s.pages) ? s.pages : []).map(p => {
    const q = isObj(p) ? p : {};
    return {
      id: q.id, title: q.title || q.id,
      nav: (isObj(q.nav) && q.nav.label) || q.title || q.id,
      section: (isObj(q.nav) && q.nav.section) || 'main',
      surfaces: surfacesByPage[q.id] || []
    };
  });

  const prog = modules.find(m => m.type === 'progression');
  const progression = (prog && isObj(prog.config)) ? {
    label: plural(c, prog.config.unitConcept || 'progressionUnit'),
    units: Array.isArray(prog.config.units) ? prog.config.units : []
  } : null;

  return {
    app: { name: app.name || app.id || 'Your app', tagline: app.tagline || '' },
    colors: resolveColors(s.theme),
    nav: pages.filter(p => p.section === 'main').map(p => ({ id: p.id, label: p.nav })),
    pages,
    progression,
    roles: (isObj(s.auth) && Array.isArray(s.auth.roles)) ? s.auth.roles.map(r => r.label || r.id) : [],
    firebase: isObj(opts.firebase) ? opts.firebase : null   // public client config → live Firestore reads
  };
}

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// One self-contained, navigable, themed app. The model is embedded as JSON; inline JS routes between
// pages and renders each surface as a themed scaffold. No build step, no framework.
export function renderRuntimeHTML(model) {
  const m = isObj(model) ? model : buildRuntimeModel({});
  const co = m.colors;
  const modelJson = JSON.stringify(m).replace(/</g, '\\u003c');   // safe to embed in a <script>

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.app.name)}</title>
<link rel="icon" href="data:,">

<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --page:${co['surface-page']};--sunken:${co['surface-sunken']};--raised:${co['surface-raised-1']};
    --text:${co['text-primary']};--muted:${co['text-secondary']};--accent:${co['accent']};--accent-text:${co['accent-text']};
  }
  *{box-sizing:border-box} html,body{margin:0} body{background:var(--page);color:var(--text);font-family:'Roboto',system-ui,sans-serif}
  header{background:linear-gradient(160deg,var(--sunken),var(--page));padding:26px 22px 16px;border-bottom:1px solid rgba(255,255,255,.06)}
  .app-name{font-family:'Work Sans',system-ui,sans-serif;font-size:26px;font-weight:700;letter-spacing:-.01em}
  .tagline{color:var(--muted);font-size:14px;margin-top:4px}
  .levels{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;align-items:center}
  .levels .cap{color:var(--muted);font-size:12px;margin-right:4px}
  .lvl{background:var(--sunken);border:1px solid var(--accent);color:var(--accent-text);font-size:11px;font-weight:600;padding:3px 9px;border-radius:8px}
  nav{display:flex;gap:8px;padding:12px 18px;flex-wrap:wrap;position:sticky;top:0;background:var(--page);border-bottom:1px solid rgba(255,255,255,.06);z-index:2}
  nav button{background:var(--raised);color:var(--text);border:1px solid rgba(255,255,255,.08);font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:999px;cursor:pointer}
  nav button.on{background:var(--accent);color:#04110f;border-color:transparent}
  main{max-width:820px;margin:0 auto;padding:24px 18px 60px}
  .surface{background:var(--sunken);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:18px;margin-bottom:16px}
  h2{font-family:'Work Sans',system-ui,sans-serif;font-size:18px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:14px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .chip{background:var(--raised);color:var(--accent-text);font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .cardph{background:var(--raised);border:1px solid rgba(255,255,255,.05);border-radius:12px;height:96px;display:flex;align-items:flex-end;padding:10px}
  .cardph span{color:var(--muted);font-size:11px}
  .row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .dot{width:34px;height:34px;border-radius:50%;background:var(--raised);flex:none}
  .row .ln{flex:1}.row .ln b{display:block;font-size:14px}.row .ln span{color:var(--muted);font-size:12px}
  .cta{background:var(--accent);color:#04110f;font-weight:700;text-align:center;padding:11px;border-radius:11px;margin-top:6px;font-size:14px}
  .empty{color:var(--muted);font-size:13px}
  .foot{color:var(--muted);font-size:11px;text-align:center;padding:20px;opacity:.7}
</style></head>
<body>
  <header>
    <div class="app-name">${esc(m.app.name)}</div>
    ${m.app.tagline ? `<div class="tagline">${esc(m.app.tagline)}</div>` : ''}
    <div id="levels" class="levels"></div>
  </header>
  <nav id="nav"></nav>
  <main id="main"></main>
  <div class="foot">Built with Appgnostic</div>
<script type="module">
const M = ${modelJson};
const $ = s => document.querySelector(s);
let current = null;
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

if (M.progression && M.progression.units.length) {
  $('#levels').innerHTML = '<span class="cap">'+esc(M.progression.label)+':</span>' +
    M.progression.units.map(u=>'<span class="lvl">'+esc(u)+'</span>').join('');
}

function scaffold(s){
  const items = Array.isArray(s.items) ? s.items : [];
  const ph = n => items.length
    ? items.map(it=>'<div class="cardph"><span>'+esc(it.title)+(it.sub?' · '+esc(it.sub):'')+'</span></div>').join('')
    : Array.from({length:n}).map(()=>'<div class="cardph"><span>…</span></div>').join('');
  const rows = n => items.length
    ? items.map(it=>'<div class="row"><div class="dot"></div><div class="ln"><b>'+esc(it.title)+'</b><span>'+esc(it.sub||'')+'</span></div></div>').join('')
    : Array.from({length:n}).map(()=>'<div class="row"><div class="dot"></div><div class="ln"><b>—</b><span>…</span></div></div>').join('');
  const chips = (s.meta&&s.meta.taxonomy||[]).map(t=>'<span class="chip">'+esc(t)+'</span>').join('');
  let body='';
  switch(s.kind){
    case 'catalogue': case 'reader':
      if (s.collection && s.liveError) { body = '<div class="empty">Couldn\\u2019t load content \\u2014 enable Anonymous sign-in in Firebase Auth, then refresh.</div>'; break; }
      if (s.collection && !s.live) { body = '<div class="empty">Loading\\u2026</div>'; break; }
      if (s.collection && s.live && !items.length) { body = '<div class="empty">No content yet \\u2014 add a document to the \\u201c'+esc(s.collection)+'\\u201d collection in Firestore.</div>'; break; }
      body = (chips?'<div class="chips">'+chips+'</div>':'')+'<div class="grid">'+ph(6)+'</div>'; break;
    case 'storefront': body = '<div class="grid">'+ph(6)+'</div><div class="cta">Checkout</div>'; break;
    case 'orders': case 'bookings': body = rows(3); break;
    case 'calendar': body = '<div class="chips">'+['Mon','Tue','Wed','Thu','Fri'].map(d=>'<span class="chip">'+d+'</span>').join('')+'</div><div class="grid">'+ph(4)+'</div>'; break;
    case 'inbox': body = rows(4); break;
    case 'feed': case 'analytics': case 'audit': body = rows(4); break;
    case 'admin': case 'schedule': case 'checkout': body = '<div class="empty">Staff tools — manage this here.</div>'; break;
    default: body = '<div class="empty">Ready for content.</div>';
  }
  return '<div class="surface"><h2>'+esc(s.label)+'</h2><div class="sub">'+esc(s.module)+'</div>'+body+'</div>';
}

function render(pageId){
  const page = M.pages.find(p=>p.id===pageId) || M.pages[0];
  current = page && page.id;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.id===(page&&page.id)));
  if(!page){ $('#main').innerHTML='<div class="empty">No pages yet.</div>'; return; }
  $('#main').innerHTML = page.surfaces.length
    ? page.surfaces.map(scaffold).join('')
    : '<div class="surface"><h2>'+esc(page.title)+'</h2><div class="empty">This page is ready for content.</div></div>';
}

$('#nav').innerHTML = M.nav.map(n=>'<button data-id="'+esc(n.id)+'">'+esc(n.label)+'</button>').join('') || '';
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>render(b.dataset.id)));
render((M.nav[0]||M.pages[0]||{}).id);

// LIVE DATA — read the app's OWN Firestore with its public client config + anonymous sign-in. On any
// failure every live surface flips to a friendly hint (never a blank/broken screen).
if (M.firebase && M.firebase.apiKey) (async () => {
  try {
    const [{ initializeApp }, { getAuth, signInAnonymously }, { getFirestore, collection, getDocs }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js')
    ]);
    const app = initializeApp(M.firebase);
    await signInAnonymously(getAuth(app));
    const db = getFirestore(app), cache = {};
    for (const page of M.pages) for (const s of page.surfaces) {
      if (!s.collection) continue;
      try {
        if (!cache[s.collection]) { const snap = await getDocs(collection(db, s.collection)); cache[s.collection] = snap.docs.map(d=>d.data()); }
        const rows = cache[s.collection].filter(x=>x.published!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
        s.items = rows.map(x=>({ title: x.title || '(untitled)', sub: x.level || x.category || '' }));
        s.live = true;
      } catch (e) { s.liveError = true; }
    }
    render(current);
  } catch (e) {
    for (const page of M.pages) for (const s of page.surfaces) if (s.collection) s.liveError = true;
    render(current);
  }
})();
</script>
</body></html>`;
}
