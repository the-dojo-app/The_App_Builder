// src/modules/content-completion.mjs — content-library's completion side (the emit/record half).
// Closes the cross-module seam: content-library records a completion (with the per-format completion
// MODE enforced — the time gate from docs/MODULE_CONTENT_LIBRARY.md §9) and computes the
// `completedRequired` signal that progression's `required-content` mechanic consumes (§6). Pure
// decisions; the actual completion write happens via the executor seam.
import { resolveKind } from './content-render.mjs';

const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;

// Per-format completion MODE — how "done" is proven, so it can't be spoofed by a bare `ended` event.
const MODE_BY_KIND = {
  video: 'played-range', audio: 'played-range',   // needs actual played coverage, not just ended
  pdf: 'dwell', article: 'dwell',                  // needs dwell time ≥ the expected minutes
  image: 'view', external: 'view', interactive: 'view'
};
export function completionModeFor(item) {
  return MODE_BY_KIND[resolveKind(item || {})] || 'view';
}

// Decide whether a member's PROOF completes an item. proof = { playedSec, dwellSec, viewed }.
// requiredSec comes from expectedMin (or durationMin). Reference material is never completable.
export function recordCompletion(item, proof, ctx) {
  item = item || {}; proof = proof || {}; ctx = ctx || {};
  if (item.reference === true) return { completed: false, mode: null, why: 'reference material is not completable' };
  const mode = completionModeFor(item);
  const requiredSec = Math.round((num(item.expectedMin) || num(item.durationMin) || 0) * 60);
  const need = Math.max(1, requiredSec);   // at least a moment, or the full expected time
  let completed = false, why = '';
  if (mode === 'view') { completed = proof.viewed === true; why = completed ? 'viewed' : 'not viewed'; }
  else if (mode === 'played-range') { completed = num(proof.playedSec) >= need; why = `played ${num(proof.playedSec)}s / ${need}s`; }
  else if (mode === 'dwell') { completed = num(proof.dwellSec) >= need; why = `dwell ${num(proof.dwellSec)}s / ${need}s`; }
  return { completed, mode, why, at: (ctx.now == null ? null : ctx.now) };
}

// Compute the `completedRequired` signal for a scope: are ALL published, required, non-reference
// items in that taxonomy scope completed? `dim` is the taxonomy dimension (e.g. 'belt'), `value`
// the scope value (e.g. 'White'); `extra` are values that count for EVERY scope (e.g. 'General').
// Zero required items → done (matches the Dojo's "belt with no required material auto-earns").
export function computeRequiredSignal({ items, completions, dim, value, extra } = {}) {
  const extras = new Set(Array.isArray(extra) ? extra : []);
  const inScope = i => i[dim] === value || extras.has(i[dim]);
  const required = (Array.isArray(items) ? items : []).filter(i =>
    i && i.published !== false && i.required === true && i.reference !== true && inScope(i));
  const done = new Set((Array.isArray(completions) ? completions : []).map(c => c && c.itemId).filter(Boolean));
  const missing = required.filter(i => !done.has(i.id)).map(i => i.id);
  return { done: missing.length === 0, total: required.length, completed: required.length - missing.length, missing };
}
