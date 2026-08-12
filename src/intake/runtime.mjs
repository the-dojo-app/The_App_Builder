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
  .lvl.done{background:var(--accent);color:#04110f;border-color:transparent}
  .lvl.cur{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 35%,transparent)}
  .lvl.lock{opacity:.4}
  .prog{width:100%;color:var(--muted);font-size:12px;margin-top:9px}
  .done-btn{background:var(--accent);color:#04110f;font-weight:700;letter-spacing:.02em;border:0;border-radius:11px;padding:12px 20px;cursor:pointer;font:inherit;margin-top:18px;box-shadow:0 2px 6px rgba(0,0,0,.35)}
  .done-btn.undo{background:transparent;color:var(--accent-text);border:1px solid var(--accent)}
  .done-btn:disabled{opacity:.6;cursor:default}
  /* member DASHBOARD — the Dojo profile card + AT A GLANCE gauge dials */
  .profile{display:flex;align-items:center;gap:16px;padding:18px;border-radius:14px;margin-bottom:16px;
    background:linear-gradient(to bottom,color-mix(in srgb,var(--raised) 95%,#fff 5%) 0%,var(--raised) 45%,color-mix(in srgb,var(--raised) 82%,#000 18%) 100%);
    border:1px solid rgba(255,255,255,.09);border-bottom:2px solid rgba(0,0,0,.5);box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 7px rgba(0,0,0,.42)}
  .avatar{flex:none;width:64px;height:64px;border-radius:50%;background:var(--sunken);border:2px solid var(--accent);box-shadow:0 0 16px color-mix(in srgb,var(--accent) 45%,transparent);display:flex;align-items:center;justify-content:center;font-family:'Work Sans',sans-serif;font-weight:800;font-size:26px;color:var(--accent-text)}
  .pinfo{flex:1;min-width:0}.pname{font-family:'Work Sans',sans-serif;font-weight:800;font-size:22px}.prole{color:var(--muted);font-size:13px;margin:2px 0 11px}
  .ppills{display:flex;flex-wrap:wrap;gap:8px}
  .ppill{background:color-mix(in srgb,var(--page) 80%,#000 20%);border:1px solid rgba(255,255,255,.06);box-shadow:inset 0 1px 3px rgba(0,0,0,.5);color:var(--text);font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px}
  .glance{border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:18px;margin-bottom:16px}
  .glance-h{color:var(--muted);font-size:11px;letter-spacing:.11em;font-weight:700;margin-bottom:16px}
  .gauges{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .gauge{text-align:center}.gauge svg{width:100%;max-width:160px;overflow:visible}
  .glabel{color:var(--muted);font-size:12px;font-weight:600;margin-top:2px}
  .statrow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
  .statbox{text-align:center;padding:15px;border-radius:11px;background:color-mix(in srgb,var(--page) 80%,#000 20%);box-shadow:inset 0 2px 6px rgba(0,0,0,.5)}
  .sbico{font-size:17px}.sbig{font-family:'Work Sans',sans-serif;font-weight:800;font-size:22px;margin-top:5px}.slab{color:var(--muted);font-size:12px;margin-top:2px}
  nav{display:flex;gap:8px;padding:12px 18px;flex-wrap:wrap;position:sticky;top:0;background:var(--page);border-bottom:1px solid rgba(255,255,255,.06);z-index:2}
  nav button{background:linear-gradient(to bottom,color-mix(in srgb,var(--raised) 95%,#fff 5%),color-mix(in srgb,var(--raised) 85%,#000 15%));color:var(--text);border:1px solid rgba(255,255,255,.08);border-bottom:2px solid rgba(0,0,0,.4);font:inherit;font-size:13px;font-weight:700;letter-spacing:.02em;padding:8px 15px;border-radius:999px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.3)}
  nav button.on{background:var(--accent);color:#04110f;border-color:transparent}
  main{max-width:820px;margin:0 auto;padding:24px 18px 60px}
  /* the Dojo .key-card raised recipe — themed via each app's own --raised (gradient + lip + inset) */
  .surface{background:linear-gradient(to bottom, color-mix(in srgb,var(--raised) 95%,#fff 5%) 0%, var(--raised) 45%, color-mix(in srgb,var(--raised) 82%,#000 18%) 100%);
    border:1px solid rgba(255,255,255,.09);border-bottom:2px solid rgba(0,0,0,.5);border-radius:14px;padding:18px;margin-bottom:16px;
    box-shadow:0 1px 0 rgba(255,255,255,.06) inset, 0 3px 7px rgba(0,0,0,.42)}
  h2{font-family:'Work Sans',system-ui,sans-serif;font-size:18px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:13px;margin-bottom:14px}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
  .chip{background:var(--raised);color:var(--accent-text);font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .cardph{background:var(--raised);border:1px solid rgba(255,255,255,.05);border-radius:12px;height:96px;display:flex;align-items:flex-end;padding:10px}
  .cardph span{color:var(--muted);font-size:11px}
  .cardph.lesson{cursor:pointer;transition:.15s}
  .cardph.lesson:hover{border-color:var(--accent);transform:translateY(-1px)}
  .lbody{color:var(--text);font-size:15px;line-height:1.75;margin-top:14px;white-space:pre-wrap}
  .vid{display:block;width:100%;aspect-ratio:16/9;margin:14px 0;border-radius:12px;overflow:hidden;background:#000}
  .vid iframe,.vid video{width:100%;height:100%;border:0}
  .field textarea{width:100%;min-height:100px;background:var(--sunken);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:var(--text);padding:12px 13px;font:inherit;box-shadow:inset 0 2px 4px rgba(0,0,0,.35);resize:vertical}
  .row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .dot{width:34px;height:34px;border-radius:50%;background:var(--raised);flex:none}
  .row .ln{flex:1}.row .ln b{display:block;font-size:14px}.row .ln span{color:var(--muted);font-size:12px}
  .cta{background:var(--accent);color:#04110f;font-weight:700;text-align:center;padding:11px;border-radius:11px;margin-top:6px;font-size:14px}
  .empty{color:var(--muted);font-size:13px}
  .foot{color:var(--muted);font-size:11px;text-align:center;padding:20px;opacity:.7}
  /* admin / authoring (?admin) */
  body.admin-mode header, body.admin-mode nav, body.admin-mode main, body.admin-mode .foot{display:none}
  #admin{display:none;max-width:560px;margin:0 auto;padding:36px 20px}
  body.admin-mode #admin{display:block}
  #admin h1{font-family:'Work Sans',system-ui,sans-serif;font-size:22px;margin:0 0 12px}
  .field{margin:12px 0}
  .field label{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
  .field input{width:100%;background:var(--sunken);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:var(--text);padding:12px 13px;font:inherit;box-shadow:inset 0 2px 4px rgba(0,0,0,.35)}
  .field input:focus{outline:none;border-color:var(--accent);box-shadow:inset 0 2px 4px rgba(0,0,0,.35),0 0 0 2px color-mix(in srgb,var(--accent) 40%,transparent)}
  .abtn{background:var(--accent);color:#04110f;font-weight:700;letter-spacing:.02em;border:0;border-radius:11px;padding:12px 18px;cursor:pointer;font:inherit;box-shadow:0 2px 6px rgba(0,0,0,.35)}
  .alink{color:var(--accent-text);cursor:pointer;font-size:13px}
  .amsg{color:var(--muted);font-size:13px;margin:10px 0;min-height:18px;line-height:1.5}
  .amsg b{color:var(--accent-text)}
  .litem{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px}
  .litem .del{color:#ff9a8a;cursor:pointer;font-size:12px}
  .litem .edit{color:var(--accent-text);cursor:pointer;font-size:12px;margin-right:14px}
  code.uid{background:var(--raised);padding:2px 7px;border-radius:6px;font-size:12px;user-select:all}
  /* admin CONSOLE — the Dojo drill-down: sticky header, breadcrumb, carved-glyph Center tiles */
  .actop{position:sticky;top:0;z-index:2;background:var(--page);display:flex;justify-content:space-between;align-items:center;padding:16px 0 12px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:14px}
  .acsub{color:var(--muted);font-size:11px;letter-spacing:.13em;font-weight:700}
  .acapp{font-family:'Work Sans',system-ui,sans-serif;font-size:22px;font-weight:700;letter-spacing:-.01em}
  .acrumb{color:var(--muted);font-size:13px;margin:2px 0 18px}
  /* SUNKEN surfaces — the Dojo bar-surface recipe: a darker well recessed into the page with a strong
     inset shadow + a faint bright bottom lip, so tiles read as carved IN (not floating). */
  .centers{display:flex;flex-direction:column;gap:14px;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px}
  .center-row{display:flex;align-items:flex-start;gap:16px;cursor:pointer;padding:24px 20px;border-radius:9px;
    background:color-mix(in srgb,var(--page) 78%,#000 22%);border:1px solid rgba(0,0,0,.55);
    box-shadow:inset 0 4px 12px rgba(0,0,0,.6), inset 0 1px 3px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.05);transition:border-color .15s}
  .center-row:hover{border-color:color-mix(in srgb,var(--accent) 42%,rgba(0,0,0,.55))}
  .cglyph{flex:none;margin-top:6px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:26px;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent) 45%,transparent))}
  .ctext{flex:1;min-width:0}
  .ctext b{display:block;font-family:'Work Sans',system-ui,sans-serif;font-weight:800;font-size:clamp(24px,7vw,34px);text-transform:uppercase;letter-spacing:-.6px;line-height:.95}
  .cdesc{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;line-height:1.55;margin-top:11px}
  .cpeek{display:flex;gap:9px;margin-top:15px;flex-wrap:wrap}
  .cpk{width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--page) 82%,#000 18%);border:1px solid color-mix(in srgb,var(--accent) 38%,transparent);box-shadow:inset 0 1px 3px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:13px}
  .cchev{color:var(--muted);font-size:26px;align-self:center;flex:none}
  .dcrow{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06)}
  .dcrow label{font-size:14px}
  .dcrow input[type=color]{width:54px;height:34px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:none;cursor:pointer;padding:2px}
</style></head>
<body>
  <header>
    <div class="app-name">${esc(m.app.name)}</div>
    ${m.app.tagline ? `<div class="tagline">${esc(m.app.tagline)}</div>` : ''}
    <div id="levels" class="levels"></div>
  </header>
  <nav id="nav"></nav>
  <main id="main"></main>
  <div id="admin"></div>
  <div class="foot">Built with Appgnostic</div>
<script type="module">
const M = ${modelJson};
const $ = s => document.querySelector(s);
let current = null, LIVE = null;
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

// LIVE THEME — the runtime ships a baked theme, but if config/appTheme exists in Firestore it wins
// (like the Dojo's theme.js). The Design center writes it; members + admin read + apply it on load.
const THEME_VARS = { 'surface-page':'--page','surface-sunken':'--sunken','surface-raised-1':'--raised','text-primary':'--text','text-secondary':'--muted','accent':'--accent','accent-text':'--accent-text' };
function applyTheme(t){
  if(!t||typeof t!=='object') return;
  const c=t.color||{}, S=document.documentElement.style;
  for(const role in THEME_VARS){ const hex=c[role]; if(typeof hex==='string' && /^#[0-9a-fA-F]{3,8}$/.test(hex)) S.setProperty(THEME_VARS[role], hex); }
}

// The levels strip reflects the member's real progress: a level is DONE when all its lessons are
// complete, the first incomplete level is CURRENT, empty ones are LOCKED. Recomputed on each change.
function renderLevels(){
  if (!M.progression || !M.progression.units.length) return;
  const lessons = (LIVE && LIVE.lessons) || [];
  const done = LIVE ? LIVE.completed : new Set();
  let html = '<span class="cap">'+esc(M.progression.label)+':</span>', curSet=false, curLabel='';
  M.progression.units.forEach(u=>{
    const inU = lessons.filter(l=>String(l.sub||'').toLowerCase()===String(u).toLowerCase());
    const complete = inU.length>0 && inU.every(l=>done.has(l.id));
    let cls='lvl';
    if(complete) cls+=' done';
    else if(!curSet && inU.length>0){ cls+=' cur'; curSet=true; curLabel=u; }
    else if(inU.length===0) cls+=' lock';
    html += '<span class="'+cls+'">'+esc(u)+(complete?' \\u2713':'')+'</span>';
  });
  if (LIVE) {
    const tot=lessons.length, dn=[...done].filter(id=>lessons.some(l=>l.id===id)).length;
    const tail = curLabel ? ' \\u00b7 you\\u2019re on '+esc(curLabel) : (tot&&dn===tot ? ' \\u00b7 all done \\ud83c\\udf89' : '');
    html += '<div class="prog">'+dn+' of '+tot+' complete'+tail+'</div>';
  }
  $('#levels').innerHTML = html;
}
renderLevels();

async function toggleComplete(item){
  if (!LIVE || !item.id) return;
  const mk=$('#mark'); if(mk){ mk.disabled=true; mk.textContent='Saving\\u2026'; }
  try {
    if (LIVE.completed.has(item.id)) {
      const did=LIVE.completedDocs[item.id];
      if(did) await LIVE.FS.deleteDoc(LIVE.FS.doc(LIVE.db,'completions',did));
      LIVE.completed.delete(item.id); delete LIVE.completedDocs[item.id];
    } else {
      const ref=await LIVE.FS.addDoc(LIVE.FS.collection(LIVE.db,'completions'),{ uid:LIVE.uid, lessonId:item.id, ts:Date.now() });
      LIVE.completed.add(item.id); LIVE.completedDocs[item.id]=ref.id;
    }
    renderLevels(); openDetail(item);
  } catch(e){ const m=$('#mark'); if(m){ m.disabled=false; m.textContent='Couldn\\u2019t save \\u2014 try again'; } }
}

function scaffold(s, si){
  const items = Array.isArray(s.items) ? s.items : [];
  const clickable = (s.kind==='catalogue' || s.kind==='reader');
  const ph = n => items.length
    ? items.map((it,i)=>'<div class="cardph'+(clickable?' lesson':'')+'"'+(clickable?' data-si="'+si+'" data-ii="'+i+'"':'')+'><span>'+esc(it.title)+(it.sub?' \\u00b7 '+esc(it.sub):'')+'</span></div>').join('')
    : Array.from({length:n}).map(()=>'<div class="cardph"><span>\\u2026</span></div>').join('');
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

// member progress, computed from live completions + lesson levels (shared by the dashboard + strip).
function progress(){
  const lessons=(LIVE&&LIVE.lessons)||[]; const done=LIVE?LIVE.completed:new Set();
  const total=lessons.length, dn=[...done].filter(id=>lessons.some(l=>l.id===id)).length;
  const units=(M.progression&&M.progression.units)||[]; let levelsDone=0, cur='';
  units.forEach(u=>{ const inU=lessons.filter(l=>String(l.sub||'').toLowerCase()===String(u).toLowerCase()); if(inU.length&&inU.every(l=>done.has(l.id))) levelsDone++; });
  for(const u of units){ const inU=lessons.filter(l=>String(l.sub||'').toLowerCase()===String(u).toLowerCase()); if(inU.length && !inU.every(l=>done.has(l.id))){ cur=u; break; } }
  return { total, dn, pct: total?Math.round(dn/total*100):0, cur: cur||(units[0]||'—'), levelsDone, levelsTotal:units.length };
}
function gauge(pct,icon,label,big){
  const R=52,C=Math.PI*R,off=C*(1-Math.max(0,Math.min(100,pct))/100);
  return '<div class="gauge"><svg viewBox="0 0 120 64">'
   +'<path d="M8 58 A52 52 0 0 1 112 58" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="6" stroke-linecap="round"/>'
   +'<path d="M8 58 A52 52 0 0 1 112 58" fill="none" stroke="var(--accent-text)" stroke-width="6" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/>'
   +'<text x="60" y="52" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text)" style="font-family:Work Sans,sans-serif">'+esc(big)+'</text></svg>'
   +'<div class="glabel">'+icon+' '+esc(label)+'</div></div>';
}
function statbox(icon,val,label){ return '<div class="statbox"><div class="sbico">'+icon+'</div><div class="sbig">'+esc(val)+'</div><div class="slab">'+esc(label)+'</div></div>'; }
function dashboardHTML(){
  const p=progress();
  return '<div class="profile"><div class="avatar">'+esc((M.app.name[0]||'A').toUpperCase())+'</div>'
    +'<div class="pinfo"><div class="pname">'+esc(M.app.name)+'</div><div class="prole">Your progress'+(LIVE?'':' \\u2014 loading\\u2026')+'</div>'
    +'<div class="ppills"><span class="ppill">'+esc(p.cur)+'</span><span class="ppill">'+p.dn+'/'+p.total+' lessons</span><span class="ppill">'+p.levelsDone+'/'+p.levelsTotal+' levels</span></div></div></div>'
    +'<div class="glance"><div class="glance-h">AT A GLANCE</div><div class="gauges">'
    + gauge(p.pct,'\\ud83d\\udcc8','Complete',p.pct+'%')
    + gauge(p.levelsTotal?Math.round(p.levelsDone/p.levelsTotal*100):0,'\\ud83c\\udfc5','Levels',p.levelsDone+'/'+p.levelsTotal)
    + '</div><div class="statrow">'+ statbox('\\u2713',p.dn,'Lessons done') + statbox('\\ud83d\\udcda',p.total,'Total lessons') +'</div></div>';
}
function render(pageId){
  if(pageId==='__home'){
    current='__home';
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.id==='__home'));
    $('#main').innerHTML = dashboardHTML();
    return;
  }
  const page = M.pages.find(p=>p.id===pageId) || M.pages[0];
  current = page && page.id;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.id===(page&&page.id)));
  if(!page){ $('#main').innerHTML='<div class="empty">No pages yet.</div>'; return; }
  $('#main').innerHTML = page.surfaces.length
    ? page.surfaces.map((s,si)=>scaffold(s,si)).join('')
    : '<div class="surface"><h2>'+esc(page.title)+'</h2><div class="empty">This page is ready for content.</div></div>';
  $('#main').querySelectorAll('.lesson').forEach(el=>el.onclick=()=>{ const s=page.surfaces[+el.dataset.si]; if(s&&s.items&&s.items[+el.dataset.ii]) openDetail(s.items[+el.dataset.ii]); });
}
function videoEmbed(u){
  if(!u) return '';
  const yt=String(u).match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)([\\w-]+)/);
  if(yt) return '<div class="vid"><iframe src="https://www.youtube.com/embed/'+yt[1]+'" allowfullscreen></iframe></div>';
  const vm=String(u).match(/vimeo\\.com\\/(\\d+)/);
  if(vm) return '<div class="vid"><iframe src="https://player.vimeo.com/video/'+vm[1]+'" allowfullscreen></iframe></div>';
  return '<video class="vid" controls src="'+esc(u)+'"></video>';
}
function openDetail(item){
  const done = LIVE && item.id && LIVE.completed.has(item.id);
  const markBtn = (LIVE && item.id) ? '<div><button class="done-btn'+(done?' undo':'')+'" id="mark">'+(done?'\\u2713 Completed \\u2014 mark as not done':'Mark complete')+'</button></div>' : '';
  $('#main').innerHTML = '<div class="surface"><span class="alink" id="back">\\u2190 Back</span>'
    +'<h2 style="margin-top:12px">'+esc(item.title)+'</h2>'
    +(item.sub?'<div class="sub">'+esc(item.sub)+'</div>':'')
    +videoEmbed(item.video)
    +(item.body?'<div class="lbody">'+esc(item.body)+'</div>':'<div class="empty">No details yet.</div>')
    +markBtn
    +'</div>';
  const b=$('#back'); if(b) b.onclick=()=>render(current);
  const mk=$('#mark'); if(mk) mk.onclick=()=>toggleComplete(item);
}

$('#nav').innerHTML = '<button data-id="__home">Home</button>' + M.nav.map(n=>'<button data-id="'+esc(n.id)+'">'+esc(n.label)+'</button>').join('');
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>render(b.dataset.id)));
render('__home');

const isAdmin = new URLSearchParams(location.search).has('admin');
if (isAdmin) document.body.classList.add('admin-mode');

// LIVE DATA (member view) — read the app's OWN Firestore with its public client config + anonymous
// sign-in. On any failure every live surface flips to a friendly hint (never a blank/broken screen).
if (!isAdmin && M.firebase && M.firebase.apiKey) (async () => {
  try {
    const [appM, authM, FS] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js')
    ]);
    const app = appM.initializeApp(M.firebase);
    const cred = await authM.signInAnonymously(authM.getAuth(app));
    const uid = cred.user.uid;
    const db = FS.getFirestore(app), cache = {};
    try { const td = await FS.getDoc(FS.doc(db,'config','appTheme')); if(td.exists()) applyTheme(td.data()); } catch(e){}
    for (const page of M.pages) for (const s of page.surfaces) {
      if (!s.collection) continue;
      try {
        if (!cache[s.collection]) { const snap = await FS.getDocs(FS.collection(db, s.collection)); cache[s.collection] = snap.docs.map(d=>({ __id:d.id, ...d.data() })); }
        const rows = cache[s.collection].filter(x=>x.published!==false).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
        s.items = rows.map(x=>({ id:x.__id, title: x.title || '(untitled)', sub: x.level || x.category || '', body: x.body || '', video: x.videoUrl || x.video || '' }));
        s.live = true;
      } catch (e) { s.liveError = true; }
    }
    // this member's completions (per-uid; owner-read rules) + the lesson list for progress
    const completed = new Set(), completedDocs = {};
    try { const cs = await FS.getDocs(FS.query(FS.collection(db,'completions'), FS.where('uid','==',uid)));
      cs.docs.forEach(d=>{ const l=d.data().lessonId; if(l){ completed.add(l); completedDocs[l]=d.id; } }); } catch(e){}
    let lessons = [];
    for (const page of M.pages) for (const s of page.surfaces) if (s.collection && s.items && s.items.length && !lessons.length) lessons = s.items;
    LIVE = { db, uid, FS, completed, completedDocs, lessons };
    renderLevels();
    render(current);
  } catch (e) {
    for (const page of M.pages) for (const s of page.surfaces) if (s.collection) s.liveError = true;
    render(current);
  }
})();

// ADMIN / AUTHORING (?admin) — email/password sign-in for the OWNER, then add / list / delete content.
// Writes are owner-gated by the Firestore rules; the screen shows the signed-in uid to lock in.
if (isAdmin && M.firebase && M.firebase.apiKey) adminApp();
async function adminApp(){
  const A = $('#admin'); A.innerHTML = '<div class="amsg">Loading\\u2026</div>';
  let auth, db, F;
  try {
    const [a,b,c] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js')
    ]);
    const app = a.initializeApp(M.firebase); auth = b.getAuth(app); db = c.getFirestore(app); F = { ...b, ...c };
    try { const td = await F.getDoc(F.doc(db,'config','appTheme')); if(td.exists()) applyTheme(td.data()); } catch(e){}
  } catch (e) { A.innerHTML = '<div class="amsg">Could not load Firebase.</div>'; return; }
  const coll = (function(){ for (const p of M.pages) for (const s of p.surfaces) if (s.collection) return s.collection; return 'lessons'; })();
  const field = (l,id,t) => '<div class="field"><label>'+l+'</label><input id="'+id+'" type="'+t+'"></div>';
  const friendly = e => { const k=(e&&e.code)||''; return /permission-denied/.test(k)?'Write blocked \\u2014 this account isn\\u2019t the owner yet. Send me your id (below) and I\\u2019ll unlock it.':/email-already-in-use/.test(k)?'That account already exists \\u2014 use Sign in.':/invalid-credential|wrong-password|user-not-found/.test(k)?'Wrong email or password.':/weak-password/.test(k)?'Password too short (min 6).':(e&&e.message)||'Something went wrong.'; };
  F.onAuthStateChanged(auth, u => (u && !u.isAnonymous) ? adminHome(u) : login());

  // The admin CONSOLE home — a Dojo-style drill-down of Center tiles. Content drills into authoring();
  // the others are placeholders that land as each module's admin is built (same tile + IA everywhere).
  function adminHome(user){
    A.innerHTML =
      '<div class="actop"><div><div class="acsub">ADMIN</div><div class="acapp">'+esc(M.app.name)+'</div></div><span class="alink" id="out">sign out</span></div>'
      + '<div class="acrumb">Signed in as '+esc(user.email)+'</div>'
      + '<div class="centers">'
      +  centerRow('content','\\ud83d\\udcda','Content center','Add, edit, and organise your '+esc(coll)+' \\u2014 the material members work through.',['\\u2795','\\u270f\\ufe0f','\\ud83c\\udfac','\\ud83d\\uddc2\\ufe0f'])
      +  centerRow('members','\\ud83d\\udc65','Member center','Everything you do for \\u2014 or to \\u2014 a member: account, access, standing.',['\\ud83d\\udc64','\\ud83d\\udee1\\ufe0f','\\ud83d\\udd0e'])
      +  centerRow('design','\\ud83c\\udfa8','Design center','Change the look & feel \\u2014 colours, fonts, shapes, the whole design.',['\\ud83c\\udfa8','\\ud83d\\udd24','\\ud83d\\udcd0','\\ud83d\\uddbc\\ufe0f'])
      +  centerRow('settings','\\u2699\\ufe0f','Settings','App details, sign-in, and the services it connects to.',['\\u2699\\ufe0f','\\ud83d\\udd0c','\\ud83c\\udf10'])
      + '</div>';
    $('#out').onclick = () => F.signOut(auth);
    A.querySelectorAll('.center-row').forEach(r=>r.onclick=()=>openCenter(r.dataset.c, user));
  }
  function centerRow(id,glyph,name,desc,peek){
    const chips = (peek||[]).map(i=>'<span class="cpk">'+i+'</span>').join('');
    return '<div class="center-row" data-c="'+id+'"><span class="cglyph">'+glyph+'</span><span class="ctext"><b>'+esc(name)+'</b><span class="cdesc">'+esc(desc)+'</span>'+(chips?'<span class="cpeek">'+chips+'</span>':'')+'</span><span class="cchev">\\u203a</span></div>';
  }
  function openCenter(id, user){
    if(id==='content'){ authoring(user); return; }
    if(id==='design'){ designCenter(user); return; }
    const titles={ members:'Member center', settings:'Settings' };
    A.innerHTML = '<div class="acrumb"><span class="alink" id="home">\\u2190 Admin</span> \\u203a '+esc(titles[id]||id)+'</div>'
      + '<div class="surface"><h2>'+esc(titles[id]||id)+'</h2><div class="empty">This area is next \\u2014 the tile and layout are here; the tools land as we build each module\\u2019s admin.</div></div>';
    $('#home').onclick = () => adminHome(user);
  }

  // DESIGN CENTER — edit the app's colour roles; changes apply LIVE (to :root) and save to
  // config/appTheme (owner-gated), so every member sees the new look. A one-tap Dojo preset.
  const DC_ROLES = [['surface-page','Page background'],['surface-sunken','Sunken / recessed'],['surface-raised-1','Card / raised'],['text-primary','Text'],['text-secondary','Muted text'],['accent','Accent'],['accent-text','Accent text']];
  const DOJO_LOOK = { 'surface-page':'#0F171D','surface-sunken':'#0F171D','surface-raised-1':'#0F171D','text-primary':'#F2F6F5','text-secondary':'#9AA6A4','accent':'#109F93','accent-text':'#6FE3D6' };
  async function designCenter(user){
    A.innerHTML = '<div class="acrumb"><span class="alink" id="home">\\u2190 Admin</span> \\u203a Design center</div>'
      + '<h1>Design center</h1><div class="amsg">Pick colours \\u2014 changes preview live, and Save applies them to your whole app.</div>'
      + '<div id="dcfields"></div>'
      + '<div style="margin-top:18px"><button class="abtn" id="dcsave">Save design</button> &nbsp; <span class="alink" id="dcdojo">Use the Dojo look</span></div>'
      + '<div class="amsg" id="dcmsg"></div>';
    $('#home').onclick = () => adminHome(user);
    let cur = {}; try { const td = await F.getDoc(F.doc(db,'config','appTheme')); if(td.exists() && td.data().color) cur = td.data().color; } catch(e){}
    const baked = M.colors || {};
    const val = r => cur[r] || baked[r] || '#000000';
    $('#dcfields').innerHTML = DC_ROLES.map(([r,l])=>'<div class="dcrow"><label>'+esc(l)+'</label><input type="color" data-role="'+r+'" value="'+val(r)+'"></div>').join('');
    const applyOne = inp => document.documentElement.style.setProperty(THEME_VARS[inp.dataset.role], inp.value);
    A.querySelectorAll('#dcfields input').forEach(inp=>inp.oninput=()=>applyOne(inp));
    $('#dcdojo').onclick = () => { A.querySelectorAll('#dcfields input').forEach(inp=>{ inp.value=DOJO_LOOK[inp.dataset.role]; applyOne(inp); }); $('#dcmsg').textContent='Dojo look previewed \\u2014 hit Save design to keep it.'; };
    $('#dcsave').onclick = async () => {
      const color={}; A.querySelectorAll('#dcfields input').forEach(inp=>color[inp.dataset.role]=inp.value);
      $('#dcmsg').textContent='Saving\\u2026';
      try { await F.setDoc(F.doc(db,'config','appTheme'), { color }, { merge:true }); $('#dcmsg').innerHTML='Saved \\u2713 \\u2014 your whole app now uses this look.'; }
      catch(err){ $('#dcmsg').textContent=friendly(err); }
    };
  }

  function login(){
    A.innerHTML = '<h1>Owner sign-in</h1><div class="amsg">Sign in to manage <b>'+esc(coll)+'</b>. First time? Create the owner account.</div>'
      + field('Email','em','email') + field('Password','pw','password')
      + '<button class="abtn" id="si">Sign in</button> &nbsp; <span class="alink" id="su">Create owner account</span><div class="amsg" id="msg"></div>';
    const go = fn => { const e=$('#em').value.trim(), p=$('#pw').value; $('#msg').textContent='\\u2026'; fn(auth,e,p).catch(err=>$('#msg').textContent=friendly(err)); };
    $('#si').onclick = () => go(F.signInWithEmailAndPassword);
    $('#su').onclick = () => go(F.createUserWithEmailAndPassword);
  }
  function authoring(user){
    let editingId = null; const byId = {};
    const noun = coll.replace(/s$/,'');
    A.innerHTML = '<div class="acrumb"><span class="alink" id="home">\\u2190 Admin</span> \\u203a Content</div>'
      + '<h1 id="formTitle">Add '+esc(noun)+'</h1>'
      + field('Title','t','text') + field('Level','lv','text')
      + '<div class="field"><label>Body (text)</label><textarea id="bd"></textarea></div>'
      + field('Video URL (YouTube, Vimeo, or .mp4)','vd','text') + field('Order','ord','number')
      + '<button class="abtn" id="add">Add</button> &nbsp; <span class="alink" id="cancel" style="display:none">cancel edit</span><div class="amsg" id="msg"></div>'
      + '<h1 style="margin-top:26px">Current '+esc(coll)+'</h1><div id="list"></div>';
    $('#ord').value = '1'; $('#home').onclick = () => adminHome(user);
    function reset(){ editingId=null; $('#t').value=''; $('#lv').value=''; $('#bd').value=''; $('#vd').value=''; $('#ord').value='1'; $('#add').textContent='Add'; $('#formTitle').textContent='Add '+noun; $('#cancel').style.display='none'; }
    $('#cancel').onclick = () => { reset(); $('#msg').textContent=''; };
    $('#add').onclick = async () => {
      const t=$('#t').value.trim(); if(!t){ $('#msg').textContent='Add a title.'; return; }
      const data={ title:t, level:$('#lv').value.trim(), body:$('#bd').value.trim(), videoUrl:$('#vd').value.trim(), sortOrder:Number($('#ord').value)||0, published:true };
      $('#msg').textContent='Saving\\u2026';
      try {
        if(editingId){ await F.updateDoc(F.doc(db,coll,editingId), data); $('#msg').innerHTML='Saved \\u2713'; }
        else { data.createdAt=Date.now(); await F.addDoc(F.collection(db,coll), data); $('#msg').innerHTML='Added \\u2713'; }
        reset(); list();
      } catch(err){ $('#msg').textContent=friendly(err); }
    };
    list();
    async function list(){
      try { const snap=await F.getDocs(F.collection(db,coll)); const ds=snap.docs.slice().sort((a,b)=>((a.data().sortOrder||0)-(b.data().sortOrder||0)));
        ds.forEach(d=>{ byId[d.id]=d.data(); });
        $('#list').innerHTML = ds.length ? ds.map(d=>'<div class="litem"><span>'+esc(d.data().title||'(untitled)')+' <span style="color:var(--muted)">'+esc(d.data().level||'')+'</span></span><span><span class="edit" data-id="'+d.id+'">edit</span><span class="del" data-id="'+d.id+'">delete</span></span></div>').join('') : '<div class="amsg">No '+esc(coll)+' yet.</div>';
        $('#list').querySelectorAll('.del').forEach(x=>x.onclick=async()=>{ try{ await F.deleteDoc(F.doc(db,coll,x.dataset.id)); if(editingId===x.dataset.id) reset(); list(); }catch(err){ $('#msg').textContent=friendly(err); } });
        $('#list').querySelectorAll('.edit').forEach(x=>x.onclick=()=>{ const d=byId[x.dataset.id]||{}; editingId=x.dataset.id; $('#t').value=d.title||''; $('#lv').value=d.level||''; $('#bd').value=d.body||''; $('#vd').value=d.videoUrl||d.video||''; $('#ord').value=(d.sortOrder!=null?d.sortOrder:0); $('#add').textContent='Save changes'; $('#formTitle').textContent='Edit '+noun; $('#cancel').style.display='inline'; $('#msg').textContent=''; window.scrollTo(0,0); });
      } catch(err){ $('#list').innerHTML='<div class="amsg">'+friendly(err)+'</div>'; }
    }
  }
}
</script>
</body></html>`;
}
