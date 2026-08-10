// src/modules/activity-log.mjs — the activity-log module's config validator (docs/MODULE_ACTIVITY_LOG.md
// §4). Bounded + pure, like the other module cleaners. The event stream other modules emit to / read
// from (the decoupled-signal hub); this validates only the log's own config. Appends happen at the
// executor seam, never here.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && isFinite(v);
const SLUG = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;   // event-type ids allow dots (content.completed)
const VISIBILITY = { private: 1, staff: 1, public: 1 };
const MAX_TYPES = 60, MAX_EMITS = 20, MAX_RETENTION = 3650;

function cleanEventType(t) {
  if (!isObj(t) || !SLUG.test(t.id || '')) return null;
  const out = { id: t.id };
  if (isStr(t.label)) out.label = String(t.label).slice(0, 60);
  if (VISIBILITY[t.visibility]) out.visibility = t.visibility;
  return out;
}

export function cleanActivityConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  out.collection = isStr(c.collection) ? c.collection : 'activity';
  if (isStr(c.itemConcept)) out.itemConcept = c.itemConcept;
  out.eventTypes = Array.isArray(c.eventTypes) ? c.eventTypes.map(cleanEventType).filter(Boolean).slice(0, MAX_TYPES) : [];
  out.visibilityDefault = VISIBILITY[c.visibilityDefault] ? c.visibilityDefault : 'private';
  out.retentionDays = isNum(c.retentionDays) ? Math.max(0, Math.min(MAX_RETENTION, Math.round(c.retentionDays))) : 0;
  if (Array.isArray(c.emitsTo)) out.emitsTo = c.emitsTo.filter(m => SLUG.test(m || '')).slice(0, MAX_EMITS);
  if (isObj(c.surfaces)) out.surfaces = c.surfaces;   // block-tree/audience validated elsewhere
  return out;
}

export const ACTIVITY_VISIBILITY = Object.keys(VISIBILITY);
