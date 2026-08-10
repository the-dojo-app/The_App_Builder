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
