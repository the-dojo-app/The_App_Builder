// src/intake/intake.mjs — the CONSTRAINED SPEC EDITOR harness (docs/AI_INTAKE.md §5).
//   reviewProposal(spec, ops) → the pure gate+preview: fold the proposal, run cleanSpec (THE GATE),
//                               plan-diff the before/after, render a plain-English summary. No writes.
//   describeProposal(...)     → the owner-facing "here's what I'll change" (used inside reviewProposal).
//   runIntake({ spec, ask, propose, … }) → the loop around the INJECTED MODEL SEAM: ask the model
//                               for ops, review them; on a gate failure hand the errors back and let
//                               it revise (up to maxRounds). `propose` is the seam where the owner's
//                               Anthropic key binds later (BYO key) — exactly like applyPlan's exec.
//
// Nothing here calls a model or touches infra: the model is `propose`, injected by the caller. Tests
// pass a scripted propose; the live intake passes one backed by the owner's key.

import { planSpec, planDiff } from '../plan.mjs';
import { applyDiff } from './diff.mjs';
import { summarizeSpec, buildCatalog } from './catalog.mjs';
import { buildPreview, previewDiff } from './preview.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// Friendly names for the capability modules, so the plain-English preview reads in domain terms.
const MODULE_LABEL = {
  'content-library': 'content library',
  'progression': 'levels',
  'rbac': 'roles & access'
};

const article = word => (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;

// One plain-English sentence per applied op (domain language, no jargon).
function sentenceFor(op) {
  const { target, op: verb, id } = op;
  if (target === 'modules') {
    const name = MODULE_LABEL[id] || id;
    if (verb === 'add') return `Add ${article(name)} capability.`;
    if (verb === 'remove') return `Remove the ${name} capability.`;
    return `Update the ${name} settings.`;
  }
  if (target === 'pages') {
    if (verb === 'add') return `Add a page: ${id}.`;
    if (verb === 'remove') return `Remove the page “${id}”.`;
    return `Update the page “${id}”.`;
  }
  if (target === 'dataModels') {
    if (verb === 'add') return `Start tracking ${id}.`;
    if (verb === 'remove') return `Stop tracking ${id}.`;
    return `Change what’s tracked about ${id}.`;
  }
  if (target === 'roles') {
    if (verb === 'add') return `Add a role: ${id}.`;
    if (verb === 'remove') return `Remove the role “${id}”.`;
    return `Update the role “${id}”.`;
  }
  if (verb === 'merge') return `Update the ${target}.`;
  return `Update ${target}.`;
}

// The owner-facing preview text. Leads with what changes (when the gate passed) or why it can't be
// built yet (the cleanSpec errors), then notes anything that couldn't be applied.
export function describeProposal({ ok, errors, applied, rejected }) {
  const lines = [];
  if (ok) {
    lines.push(applied.length ? 'Here’s what I’ll change:' : 'Nothing to change.');
    applied.forEach(a => lines.push('• ' + sentenceFor(a)));
  } else {
    lines.push('This can’t be built as-is:');
    (errors || []).forEach(e => lines.push('• ' + e));
  }
  (rejected || []).forEach(r => lines.push(`• Skipped (${r.reason}).`));
  return lines.join('\n');
}

// THE GATE + PREVIEW. Pure. Never writes. Returns everything the owner (or the revise loop) needs —
// including a SHOWABLE preview: `preview` (the resulting app frame) and `previewChanges` (the typed
// animated-diff events). Both are derived from the CLEANED specs (post-gate), so the owner only ever
// previews something safe — and only when the gate passed (a refused proposal has no app to show).
export function reviewProposal(currentSpec, ops) {
  const before = planSpec(currentSpec);
  const { spec: candidate, applied, rejected } = applyDiff(currentSpec, ops);
  const after = planSpec(candidate);                       // cleanSpec runs here — the GATE
  const diff = after.ok ? planDiff(before.plan || [], after.plan) : null;
  const preview = after.ok ? buildPreview(after.spec) : null;
  const previewChanges = after.ok ? previewDiff(before.spec, after.spec) : [];
  const result = { ok: after.ok, errors: after.errors, applied, rejected, candidate, plan: after.plan, planDiff: diff, preview, previewChanges };
  result.summary = describeProposal(result);
  return result;
}

// THE LOOP around the injected model seam. `propose(context) → ops` is the only non-pure part, and
// it's supplied by the caller. On a gate failure the model gets the errors and revises; we return
// the first passing review, or the last failing one after maxRounds (the honest boundary: the model
// couldn't produce a buildable proposal — the caller surfaces the gap, never fakes it).
export function runIntake({ spec, ask, propose, catalog, maxRounds = 3 }) {
  if (typeof propose !== 'function') throw new TypeError('runIntake needs a propose(context) function');
  const cat = catalog || buildCatalog(spec);
  const summary = summarizeSpec(spec);
  let last = null, errors = [];
  for (let round = 1; round <= maxRounds; round++) {
    const ops = propose({ spec, summary, catalog: cat, ask, errors, round });
    last = reviewProposal(spec, ops || []);
    if (last.ok) return { ok: true, round, review: last, ops };
    errors = last.errors;
  }
  return { ok: false, rounds: maxRounds, review: last, errors };
}
