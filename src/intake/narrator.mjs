// src/intake/narrator.mjs — the CO-BUILDER VOICE (docs/EXPERIENCE.md §3). Turns the engine's dry
// results into the warm, confident, guiding surface Will called for: the app LEADS, celebrates
// milestones, is honest about limits, and always offers a smart next move.
//   narrateProposal(review)      → owner-facing copy for a reviewed proposal (celebrates / gates kindly)
//   checkpoint(spec)             → "here's your whole app in a paragraph — still right?"
//   suggestNext(spec, catalog)   → 2–3 proactive next moves, each a READY proposal (ops) you can
//                                  preview by dropping straight into reviewProposal. Never a dead end.
//   greeting(spec)               → the opening line after a starter is picked / first build
// Pure, deterministic, no infra. Copy is warm but never hypey (matches Will's own voice guidance).
// Returns STRUCTURED objects (headline/bullets/prompt) so the builder chrome renders them; renderNarration()
// is a plain-text convenience for logs/tests.

import { summarizeSpec, buildCatalog } from './catalog.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// Milestone lines — genuine, restrained celebration when a change crosses a meaningful threshold.
function milestones(changes) {
  const out = [];
  for (const e of changes) {
    if (e.type === 'levels-added') out.push('Nice — members have levels to climb now.');
    else if (e.type === 'library-added') out.push('Your library is in place.');
    else if (e.type === 'level-count') out.push(`The ladder is ${e.to} levels tall now.`);
  }
  return out;
}

export function narrateProposal(review) {
  if (!isObj(review)) return { tone: 'idle', headline: '', bullets: [], prompt: '' };

  if (!review.ok) {
    // The honest boundary, framed kindly — never a hard "no," always a way forward.
    return {
      tone: 'blocked',
      headline: "I can't build that part just yet — here's what's in the way:",
      bullets: (review.errors || []).map(String),
      prompt: 'Want me to note it as something to add later, or try a different way?'
    };
  }

  const changes = review.previewChanges || [];
  const bullets = changes.length ? changes.map(e => e.label)
    : (review.applied || []).map(a => `${a.op} ${a.target}${a.id ? ` (${a.id})` : ''}`);

  return {
    tone: 'ready',
    headline: bullets.length ? "Here's what I'll set up:" : 'Nothing to change there.',
    bullets,
    milestones: milestones(changes),
    prompt: bullets.length ? 'Build it? (You can undo anything later.)' : 'What would you like to do next?'
  };
}

export function checkpoint(spec) {
  return {
    tone: 'checkpoint',
    headline: "Here's your app so far:",
    summary: summarizeSpec(spec),
    prompt: 'Still sounds right? Tell me what to change, or say keep going.'
  };
}

export function greeting(spec) {
  const name = (isObj(spec) && isObj(spec.app) && (spec.app.name || spec.app.id)) || 'your app';
  return {
    tone: 'greeting',
    headline: `Let's build ${name}.`,
    summary: summarizeSpec(spec),
    prompt: "Tell me what you'd like to add or change — or pick one of my suggestions to get rolling."
  };
}

// ── Proactive suggestions — each a READY proposal (ops), so the chrome can hover-preview it through
// reviewProposal and apply on a tap. Grounded in what the app is MISSING; capped, ordered, safe.
export function suggestNext(spec, catalog) {
  const s = isObj(spec) ? spec : {};
  const _cat = catalog || buildCatalog(s);        // reserved: richer, pattern-aware suggestions later
  void _cat;
  const installed = new Set((Array.isArray(s.modules) ? s.modules : []).map(m => m && m.type));
  const pageIds = new Set((Array.isArray(s.pages) ? s.pages : []).map(p => p && p.id));
  const roles = (isObj(s.auth) && Array.isArray(s.auth.roles)) ? s.auth.roles : [];
  const out = [];

  if (!installed.has('progression')) {
    out.push({
      id: 'add-levels',
      label: 'Let members earn levels',
      why: 'Give people a sense of progress and a reason to keep coming back.',
      ops: [{ target: 'modules', op: 'add', value: { type: 'progression', config: {
        unitConcept: 'progressionUnit', units: ['Level 1', 'Level 2', 'Level 3'], badgesPerUnit: 3, retroactive: false, viz: 'list'
      } } }]
    });
  }

  if (!installed.has('content-library')) {
    out.push({
      id: 'add-library',
      label: 'Add a library of content',
      why: 'A home for the lessons, resources, or media your members come back for.',
      ops: [
        { target: 'dataModels', op: 'add', value: { id: 'resources', concept: 'contentItem', owner: 'app', access: 'public', fields: [{ id: 'title', type: 'text' }, { id: 'body', type: 'longtext' }] } },
        { target: 'modules', op: 'add', value: { type: 'content-library', config: { collection: 'resources', itemConcept: 'contentItem', formats: ['article', 'video', 'pdf', 'image'], taxonomy: [], surfaces: { catalogue: { pageId: 'library', audience: { who: 'members' }, showAll: true } } } } },
        { target: 'pages', op: 'add', value: { id: 'library', title: 'Library', audience: { who: 'members' }, nav: { section: 'main', label: 'Library' }, blocks: [] } }
      ]
    });
  }

  if (!pageIds.has('about')) {
    out.push({
      id: 'add-about',
      label: 'Add an “About” page',
      why: 'Tell people who you are and what this is for.',
      ops: [{ target: 'pages', op: 'add', value: { id: 'about', title: 'About', audience: { who: 'members' }, nav: { section: 'main', label: 'About' }, blocks: [] } }]
    });
  }

  if (roles.length <= 2 && !roles.some(r => r.id === 'staff')) {
    out.push({
      id: 'add-staff',
      label: 'Add a staff role',
      why: 'Let a teammate help you manage things without handing over ownership.',
      ops: [{ target: 'roles', op: 'add', value: { id: 'staff', label: 'Staff', rank: 50 } }]
    });
  }

  return out.slice(0, 3);
}

// ── the accountability layer: consequences, the decision ledger, and plain-English explainers ─────
// (docs/EXPERIENCE.md; Will 2026-08-10). Every major decision is recorded with its title, details,
// AND its consequences — to keep the owner honest — and can be revisited ("I've changed my mind").

// What a change MEANS/affects, in plain domain language. Picks the most significant consequence.
export function consequenceOf(review) {
  if (!isObj(review) || !review.ok) return '';
  const types = new Set((review.previewChanges || []).map(e => e.type));
  if (types.has('levels-added')) return 'Members will now climb levels — a visible ladder of progress. It adds a Levels area to your app.';
  if (types.has('levels-removed')) return 'Members will no longer have levels to climb; anyone partway through loses that progress view.';
  if (types.has('library-added')) return 'Adds a library your members can browse, and a place for you to publish content.';
  if (types.has('library-removed')) return 'Removes the library and the home your content lived in.';
  if (types.has('level-count')) return 'Changes how many levels members climb — and their sense of how far they have to go.';
  if (types.has('role-added')) return 'Adds a new kind of user, with its own level of access to your app.';
  if (types.has('role-removed')) return 'Removes a kind of user — anyone with that role loses their access.';
  if (types.has('page-added')) return 'Adds a new page to your app’s menu for members to visit.';
  if (types.has('page-removed')) return 'Removes a page — members can no longer visit it.';
  if (types.has('color-changed')) return 'Changes how your whole app looks for every member. Purely visual — your content and setup are untouched.';
  return 'Updates your app’s setup. Everything else stays exactly as it was.';
}

// A ledger record for a committed decision: title + the concrete details + the consequence.
export function decisionRecord({ title, review }) {
  return {
    title: title || 'Change',
    details: ((isObj(review) && review.previewChanges) || []).map(e => e.label),
    consequence: consequenceOf(review)
  };
}

// "Explain this to me in plain English" — a deeper, jargon-free read of a ledger record, always
// ending on the reassurance that it's reversible. Accepts a stored record ({title,details,consequence}).
export function explainRecord(rec) {
  const r = isObj(rec) ? rec : {};
  const parts = [`“${r.title || 'This change'}” — here's what it actually does.`];
  if (Array.isArray(r.details) && r.details.length) parts.push('In plain terms: ' + r.details.join('; ') + '.');
  if (r.consequence) parts.push(r.consequence);
  parts.push('And remember — this is fully reversible: you can rewind to just before this change anytime you like.');
  return parts.join(' ');
}

// ── the MODULE PICKER / toolbox (Will 2026-08-10: build your app by picking the modules the job
// needs, added onto a core app). Each offer is the module's card + a READY add/remove proposal, so
// the picker rides the same gate → preview → confirm spine. `recommended` = a big building block the
// app is missing (the "you'll want these tools for this job" nudge).
const MODULE_LIBRARY_OFFERS = [
  {
    type: 'content-library', name: 'Content library', bigBlock: true,
    summary: 'A browsable library of lessons, resources, or media — with completion tracking.',
    addOps: [
      { target: 'dataModels', op: 'add', value: { id: 'resources', concept: 'contentItem', owner: 'app', access: 'public', fields: [{ id: 'title', type: 'text' }, { id: 'body', type: 'longtext' }] } },
      { target: 'modules', op: 'add', value: { type: 'content-library', config: { collection: 'resources', itemConcept: 'contentItem', formats: ['article', 'video', 'pdf', 'image'], taxonomy: [], surfaces: { catalogue: { pageId: 'library', audience: { who: 'members' }, showAll: true } } } } },
      { target: 'pages', op: 'add', value: { id: 'library', title: 'Library', audience: { who: 'members' }, nav: { section: 'main', label: 'Library' }, blocks: [] } }
    ]
  },
  {
    type: 'progression', name: 'Levels & progress', bigBlock: true,
    summary: 'Levels or tiers members climb by meeting criteria — a reason to keep coming back.',
    addOps: [{ target: 'modules', op: 'add', value: { type: 'progression', config: { unitConcept: 'progressionUnit', units: ['Level 1', 'Level 2', 'Level 3'], badgesPerUnit: 3, retroactive: false, viz: 'list' } } }]
  },
  {
    type: 'rbac', name: 'Roles & access', bigBlock: false,
    summary: 'Roles and who-can-do-what — staff, admins, and members with different access.',
    addOps: [{ target: 'modules', op: 'add', value: { type: 'rbac', config: {} } }]
  },
  {
    type: 'commerce', name: 'Shop', bigBlock: false,
    summary: 'Sell products — cart, checkout, orders. Comes with Stripe for payments (bring your key).',
    addOps: [
      { target: 'dataModels', op: 'add', value: { id: 'products', concept: 'product', owner: 'app', access: 'public', fields: [{ id: 'title', type: 'text' }, { id: 'priceCents', type: 'number', min: 0 }, { id: 'currency', type: 'select', values: ['USD'] }, { id: 'sku', type: 'text' }, { id: 'inventory', type: 'number' }, { id: 'kind', type: 'select', values: ['physical', 'digital', 'subscription'] }, { id: 'active', type: 'bool', default: true }] } },
      { target: 'dataModels', op: 'add', value: { id: 'orders', concept: 'order', owner: 'member', access: 'owner-read', fields: [{ id: 'buyer', type: 'ref', ref: 'members' }, { id: 'status', type: 'select', values: ['pending', 'paid', 'fulfilled', 'refunded', 'canceled'] }, { id: 'totalCents', type: 'number' }, { id: 'currency', type: 'select', values: ['USD'] }, { id: 'placedAt', type: 'timestamp' }, { id: 'items', type: 'list', of: [{ id: 'productRef', type: 'ref', ref: 'products' }, { id: 'qty', type: 'number' }, { id: 'unitPriceCents', type: 'number' }, { id: 'titleSnapshot', type: 'text' }] }] } },
      { target: 'modules', op: 'add', value: { type: 'commerce', config: { productCollection: 'products', itemConcept: 'product', currency: 'USD', pricingModel: 'one-off', catalogueFrom: 'module:content-library', tax: { mode: 'none' }, shipping: { mode: 'flat', flatCents: 500 }, surfaces: { storefront: { pageId: 'shop', audience: { who: 'members' } }, myOrders: { pageId: 'orders-page', audience: { who: 'members' }, scopeBy: 'buyer' }, admin: { pageId: 'manage-shop', audience: { who: 'staff' } } } } } },
      { target: 'integrations', op: 'merge', value: { payments: { connector: 'stripe', keyRef: 'secret://STRIPE_KEY' } } },
      { target: 'pages', op: 'add', value: { id: 'shop', title: 'Shop', audience: { who: 'members' }, nav: { section: 'main', label: 'Shop' }, blocks: [] } },
      { target: 'pages', op: 'add', value: { id: 'orders-page', title: 'My Orders', audience: { who: 'members' }, nav: { section: 'main', label: 'My Orders' }, blocks: [] } }
    ]
  }
];

export function moduleOffers(spec) {
  const installed = new Set(((isObj(spec) && Array.isArray(spec.modules)) ? spec.modules : []).map(m => m && m.type));
  return MODULE_LIBRARY_OFFERS.map(o => ({
    type: o.type, name: o.name, summary: o.summary,
    installed: installed.has(o.type),
    recommended: o.bigBlock && !installed.has(o.type),
    addOps: o.addOps,
    removeOps: [{ target: 'modules', op: 'remove', id: o.type }]
  }));
}

// Plain-text rendering of any narration object — for logs, tests, and a no-frills fallback.
export function renderNarration(n) {
  if (!isObj(n)) return '';
  const lines = [];
  if (n.headline) lines.push(n.headline);
  if (n.summary) lines.push(n.summary);
  (n.bullets || []).forEach(b => lines.push('• ' + b));
  (n.milestones || []).forEach(m => lines.push(m));
  if (n.prompt) lines.push(n.prompt);
  return lines.join('\n');
}
