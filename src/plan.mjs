// src/plan.mjs — the gate, the diff, and the executor seam around assemble (docs/ASSEMBLER.md §3).
//   planSpec(spec)          → { ok, errors, plan|null } — REFUSES to plan a spec with errors
//   planDiff(before, after) → { added, removed, changed } — the intake's dry-run "what changes"
//   applyPlan(plan, exec)   → runs each op through an injected executor (Firebase binds in later)
// This is what turns "validate → assemble" into a safe, previewable, applyable flow without any
// infra dependency: the executor is pluggable, so the engine stays pure and testable.
import { cleanSpec, assemble } from './assembler.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// The GATE: clean the spec, and only produce a plan if it is error-free. A spec with errors (an
// unknown module, an unreadable theme, …) never yields a plan — apply() literally cannot run it.
export function planSpec(spec) {
  const { spec: cleaned, errors } = cleanSpec(spec);
  if (errors.length) return { ok: false, errors, plan: null, spec: cleaned };
  return { ok: true, errors: [], plan: assemble({ spec: cleaned }), spec: cleaned };
}

// Stable key per op so two plans can be compared by what they target.
const opKey = op => op.op === 'writeConfig' ? `config:${op.doc}`
  : op.op === 'genRulesFile' ? `rules:${op.path || 'firestore.rules'}`
    : op.op;

function changedFields(a, b) {
  const av = isObj(a.value) ? a.value : a, bv = isObj(b.value) ? b.value : b;
  if (!isObj(av) || !isObj(bv)) return [];
  const keys = new Set([...Object.keys(av), ...Object.keys(bv)]);
  const out = [];
  for (const k of keys) if (JSON.stringify(av[k]) !== JSON.stringify(bv[k])) out.push(k);
  return out.sort();
}

// A human-readable diff of two plans — the basis of the AI intake's "here's what I'll change"
// preview and an audit view. Deterministic ordering.
export function planDiff(before, after) {
  const bm = new Map((Array.isArray(before) ? before : []).map(o => [opKey(o), o]));
  const am = new Map((Array.isArray(after) ? after : []).map(o => [opKey(o), o]));
  const added = [], removed = [], changed = [];
  for (const [k, o] of am) if (!bm.has(k)) added.push({ key: k, op: o.op });
  for (const [k, o] of bm) if (!am.has(k)) removed.push({ key: k, op: o.op });
  for (const [k, ao] of am) {
    const bo = bm.get(k);
    if (bo && JSON.stringify(bo) !== JSON.stringify(ao)) changed.push({ key: k, op: ao.op, fields: changedFields(bo, ao) });
  }
  const sort = a => a.sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0);
  return { added: sort(added), removed: sort(removed), changed: sort(changed) };
}

// APPLY: run each op through an injected executor — an object of { writeConfig, registerPages,
// genRulesFile, snapshotSpec } functions. The Firebase-bound executor lands with the live wiring;
// tests (and dry runs) pass a recording/no-op executor. An op with no matching executor method is
// reported as skipped, never silently dropped.
export function applyPlan(plan, exec) {
  const results = [];
  for (const op of (Array.isArray(plan) ? plan : [])) {
    const fn = exec && exec[op.op];
    if (typeof fn !== 'function') { results.push({ op: op.op, skipped: true }); continue; }
    results.push({ op: op.op, result: fn(op) });
  }
  return results;
}
