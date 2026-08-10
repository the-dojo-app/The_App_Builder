// src/intake/diff.mjs — the BOUNDED Spec-diff format the AI intake emits, and applyDiff, which
// folds a proposal onto a Spec (docs/AI_INTAKE.md §5). This is NOT the safety layer — cleanSpec is;
// applyDiff only has to be TOTAL (never throws) and produce a candidate Spec, which the gate then
// validates. Unknown/malformed ops don't mutate — they're returned in `rejected` as feedback.
//
// A proposal is a list of ops:
//   object targets (app, concepts, theme, notifications, integrations, auth):
//     { target, op:'merge', value:{…} }        — deep-merge; value key === null deletes that key
//   array targets (dataModels[id], modules[type], pages[id], roles[id] at auth.roles):
//     { target, op:'add',    value:{…} }        — value must carry the key; fails if it exists
//     { target, op:'update', id, value:{…} }    — deep-merge into the item; fails if absent
//     { target, op:'remove', id }               — fails if absent

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const clone = v => structuredClone(v);

const OBJECT_TARGETS = { app: 1, concepts: 1, theme: 1, notifications: 1, integrations: 1, auth: 1 };
const ARRAY_TARGETS = {
  dataModels: { host: r => r, prop: 'dataModels', key: 'id' },
  modules:    { host: r => r, prop: 'modules', key: 'type' },
  pages:      { host: r => r, prop: 'pages', key: 'id' },
  roles:      { host: r => (isObj(r.auth) ? r.auth : (r.auth = {})), prop: 'roles', key: 'id' }
};

// RFC-7396-style deep merge: recurse into plain objects, replace arrays/scalars, null deletes a key.
function deepMerge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v === null) { delete dst[k]; continue; }
    if (isObj(v) && isObj(dst[k])) deepMerge(dst[k], v);
    else dst[k] = clone(v);
  }
  return dst;
}

function applyOne(root, op) {
  if (!isObj(op) || !isStr(op.target)) return { reason: 'malformed op (needs a target)' };
  const t = op.target;

  if (OBJECT_TARGETS[t]) {
    if (op.op !== 'merge') return { reason: `target "${t}" takes op:"merge"` };
    if (!isObj(op.value)) return { reason: 'merge needs an object value' };
    const dst = isObj(root[t]) ? root[t] : (root[t] = {});
    if (t === 'auth' && ('roles' in op.value)) {           // roles managed via the "roles" target
      const { roles, ...rest } = op.value;                  // eslint-disable-line no-unused-vars
      deepMerge(dst, rest);
    } else {
      deepMerge(dst, op.value);
    }
    return { ok: true };
  }

  const at = ARRAY_TARGETS[t];
  if (at) {
    const host = at.host(root), key = at.key;
    if (!Array.isArray(host[at.prop])) host[at.prop] = [];
    const arr = host[at.prop];

    if (op.op === 'add') {
      if (!isObj(op.value) || !isStr(op.value[key])) return { reason: `add needs a value with "${key}"` };
      if (arr.some(x => isObj(x) && x[key] === op.value[key])) return { reason: `"${op.value[key]}" already exists` };
      arr.push(clone(op.value));
      return { ok: true, id: op.value[key] };
    }
    if (op.op === 'update') {
      if (!isStr(op.id)) return { reason: 'update needs an id' };
      if (!isObj(op.value)) return { reason: 'update needs an object value' };
      const idx = arr.findIndex(x => isObj(x) && x[key] === op.id);
      if (idx < 0) return { reason: `"${op.id}" not found` };
      deepMerge(arr[idx], op.value);
      arr[idx][key] = op.id;                                // the key is not rewritable via update
      return { ok: true, id: op.id };
    }
    if (op.op === 'remove') {
      if (!isStr(op.id)) return { reason: 'remove needs an id' };
      const kept = arr.filter(x => !(isObj(x) && x[key] === op.id));
      if (kept.length === arr.length) return { reason: `"${op.id}" not found` };
      host[at.prop] = kept;
      return { ok: true, id: op.id };
    }
    return { reason: `target "${t}" takes op add|update|remove` };
  }

  return { reason: `unknown target "${t}"` };
}

// Fold a proposal onto a Spec. Total: returns { spec:<candidate>, applied:[], rejected:[] }.
// The candidate is always well-formed enough to hand to cleanSpec; it is NOT yet validated.
export function applyDiff(spec, ops) {
  const out = clone(isObj(spec) ? spec : {});
  const applied = [], rejected = [];
  const list = Array.isArray(ops) ? ops : [];
  list.forEach((op, i) => {
    const res = applyOne(out, op);
    if (res.ok) applied.push({ i, target: op.target, op: op.op, id: res.id });
    else rejected.push({ i, target: isObj(op) ? op.target : undefined, op: isObj(op) ? op.op : undefined, reason: res.reason });
  });
  return { spec: out, applied, rejected };
}
