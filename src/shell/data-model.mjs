// src/shell/data-model.mjs — the dataModel validator. Bounded field-type set (per docs/APP_SPEC.md
// §2) so cleanSpec can validate every field and the rules generator can key off owner/access
// deterministically. Pure. A model with no valid id is dropped; unknown types/owners/access fall
// back to safe defaults; fields are capped.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && isFinite(v);
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

// `list` = a bounded array-of-objects field (APP_SPEC.md, ruled 2026-08-10) — a repeated sub-record
// whose element shape is itself a bounded list of typed fields, count-capped. Precedented by
// content-library's figures[]/stats[]; used e.g. for an order's line items (MODULE_COMMERCE.md).
export const FIELD_TYPES = { text: 1, longtext: 1, number: 1, bool: 1, date: 1, timestamp: 1, select: 1, image: 1, file: 1, ref: 1, geo: 1, list: 1 };
export const OWNERS = { member: 1, app: 1, staff: 1 };
export const ACCESS = { 'owner-read': 1, 'admin-read': 1, 'public': 1 };
const MAX_FIELDS = 100, MAX_SELECT = 100, MAX_LIST_SHAPE = 20, MAX_LIST_ITEMS = 500;

// opts.noNest forbids `list` inside a `list` (no nested lists in v0 — a list element that declares
// type "list" is coerced to a plain text field).
function cleanField(f, opts = {}) {
  if (!isObj(f) || !SLUG.test(f.id || '')) return null;
  let type = FIELD_TYPES[f.type] ? f.type : 'text';
  if (type === 'list' && opts.noNest) type = 'text';
  const out = { id: f.id, type };
  if (type === 'number') { if (isNum(f.min)) out.min = f.min; if (isNum(f.max)) out.max = f.max; }
  if (type === 'select' && Array.isArray(f.values)) out.values = f.values.filter(isStr).slice(0, MAX_SELECT);
  if (type === 'ref' && SLUG.test(f.ref || '')) out.ref = f.ref;
  if (type === 'list') {
    // the element shape: a bounded set of typed fields (no nested lists), plus a max item count
    out.of = Array.isArray(f.of) ? f.of.map(x => cleanField(x, { noNest: true })).filter(Boolean).slice(0, MAX_LIST_SHAPE) : [];
    out.max = isNum(f.max) ? Math.max(1, Math.min(MAX_LIST_ITEMS, Math.round(f.max))) : MAX_LIST_ITEMS;
  }
  // a scalar default only (never for list); guard so a list's `max` above isn't shadowed
  if (type !== 'list' && ['string', 'number', 'boolean'].includes(typeof f.default)) out.default = f.default;
  return out;
}

export function cleanDataModel(m) {
  if (!isObj(m) || !SLUG.test(m.id || '')) return null;
  const out = { id: m.id };
  if (isStr(m.concept)) out.concept = m.concept;
  out.owner = OWNERS[m.owner] ? m.owner : 'app';
  out.access = ACCESS[m.access] ? m.access : 'admin-read';
  out.fields = Array.isArray(m.fields) ? m.fields.map(cleanField).filter(Boolean).slice(0, MAX_FIELDS) : [];
  return out;
}

export function cleanDataModels(list) {
  return (Array.isArray(list) ? list : []).map(cleanDataModel).filter(Boolean);
}
