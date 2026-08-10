// src/modules/progression.mjs — the progression module's config validator (was a passthrough stub).
// Bounds the units, tracks, evidence bindings, viz, and registered app-mechanic names. The RULES
// doc itself (per-unit badge slots → mechanic + params) is a separate config doc validated by a
// cleanRules/cleanMechanic pass (the mechanic library — a follow-on). See docs/MODULE_PROGRESSION.md.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && isFinite(v);
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const VIZ = { orbit: 1, strip: 1, grid: 1, list: 1 };
const MAX_UNITS = 40, MAX_TRACKS = 12, MAX_MECHANICS = 40;

function cleanTrack(t) {
  if (!isObj(t) || !SLUG.test(t.id || '')) return null;
  const out = { id: t.id };
  if (isStr(t.label)) out.label = String(t.label).slice(0, 60);
  if (isObj(t.score) && isStr(t.score.source)) out.score = { source: String(t.score.source).slice(0, 120) };
  if (t.default === true) out.default = true;
  return out;
}

export function cleanProgressionConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  if (isStr(c.unitConcept)) out.unitConcept = c.unitConcept;
  out.units = Array.isArray(c.units) ? c.units.filter(isStr).slice(0, MAX_UNITS) : [];
  if (isNum(c.badgesPerUnit)) out.badgesPerUnit = Math.max(1, Math.min(32, Math.round(c.badgesPerUnit)));
  out.tracks = Array.isArray(c.tracks) ? c.tracks.map(cleanTrack).filter(Boolean).slice(0, MAX_TRACKS) : [];
  if (isObj(c.evidence)) {
    const e = {};
    if (isStr(c.evidence.activityModel)) e.activityModel = c.evidence.activityModel;
    if (isStr(c.evidence.contentModule)) e.contentModule = c.evidence.contentModule;
    if (Object.keys(e).length) out.evidence = e;
  }
  if (isStr(c.rulesRef)) out.rulesRef = c.rulesRef;
  if (isStr(c.labelsRef)) out.labelsRef = c.labelsRef;
  out.retroactive = c.retroactive === true;   // default false — never retroactive
  if (VIZ[c.viz]) out.viz = c.viz;
  if (Array.isArray(c.appMechanics)) out.appMechanics = c.appMechanics.filter(m => SLUG.test(m || '')).slice(0, MAX_MECHANICS);
  return out;
}
