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
let current = null;
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

if (M.progression && M.progression.units.length) {
  $('#levels').innerHTML = '<span class="cap">'+esc(M.progression.label)+':</span>' +
    M.progression.units.map(u=>'<span class="lvl">'+esc(u)+'</span>').join('');
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

function render(pageId){
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
  $('#main').innerHTML = '<div class="surface"><span class="alink" id="back">\\u2190 Back</span>'
    +'<h2 style="margin-top:12px">'+esc(item.title)+'</h2>'
    +(item.sub?'<div class="sub">'+esc(item.sub)+'</div>':'')
    +videoEmbed(item.video)
    +(item.body?'<div class="lbody">'+esc(item.body)+'</div>':'<div class="empty">No details yet.</div>')
    +'</div>';
  const b=$('#back'); if(b) b.onclick=()=>render(current);
}

$('#nav').innerHTML = M.nav.map(n=>'<button data-id="'+esc(n.id)+'">'+esc(n.label)+'</button>').join('') || '';
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>render(b.dataset.id)));
render((M.nav[0]||M.pages[0]||{}).id);

const isAdmin = new URLSearchParams(location.search).has('admin');
if (isAdmin) document.body.classList.add('admin-mode');

// LIVE DATA (member view) — read the app's OWN Firestore with its public client config + anonymous
// sign-in. On any failure every live surface flips to a friendly hint (never a blank/broken screen).
if (!isAdmin && M.firebase && M.firebase.apiKey) (async () => {
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
        s.items = rows.map(x=>({ title: x.title || '(untitled)', sub: x.level || x.category || '', body: x.body || '', video: x.videoUrl || x.video || '' }));
        s.live = true;
      } catch (e) { s.liveError = true; }
    }
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
  } catch (e) { A.innerHTML = '<div class="amsg">Could not load Firebase.</div>'; return; }
  const coll = (function(){ for (const p of M.pages) for (const s of p.surfaces) if (s.collection) return s.collection; return 'lessons'; })();
  const field = (l,id,t) => '<div class="field"><label>'+l+'</label><input id="'+id+'" type="'+t+'"></div>';
  const friendly = e => { const k=(e&&e.code)||''; return /permission-denied/.test(k)?'Write blocked \\u2014 this account isn\\u2019t the owner yet. Send me your id (below) and I\\u2019ll unlock it.':/email-already-in-use/.test(k)?'That account already exists \\u2014 use Sign in.':/invalid-credential|wrong-password|user-not-found/.test(k)?'Wrong email or password.':/weak-password/.test(k)?'Password too short (min 6).':(e&&e.message)||'Something went wrong.'; };
  F.onAuthStateChanged(auth, u => (u && !u.isAnonymous) ? authoring(u) : login());

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
    A.innerHTML = '<h1 id="formTitle">Add '+esc(noun)+'</h1>'
      + '<div class="amsg">Signed in as <b>'+esc(user.email)+'</b> \\u00b7 <span class="alink" id="out">sign out</span></div>'
      + field('Title','t','text') + field('Level','lv','text')
      + '<div class="field"><label>Body (text)</label><textarea id="bd"></textarea></div>'
      + field('Video URL (YouTube, Vimeo, or .mp4)','vd','text') + field('Order','ord','number')
      + '<button class="abtn" id="add">Add</button> &nbsp; <span class="alink" id="cancel" style="display:none">cancel edit</span><div class="amsg" id="msg"></div>'
      + '<h1 style="margin-top:26px">Current '+esc(coll)+'</h1><div id="list"></div>';
    $('#ord').value = '1'; $('#out').onclick = () => F.signOut(auth);
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
