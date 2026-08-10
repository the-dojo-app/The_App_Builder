// src/modules/rules.mjs — the progression RULES-doc validator (config/beltRules, generalized).
// A rules doc is { <unit>: { badges: [ { slot, mechanic, params } … ] } }. Each badge references a
// LIBRARY mechanic (validated by its cleanParams) OR an `appspecific:<name>` plugin (validated by
// NAME against the registered appMechanics — the plugin owns its params, which are kept shallow +
// primitive only). Unknown mechanics / unregistered plugins / bad units are dropped. See
// docs/MODULE_PROGRESSION.md §3–§4.
import { MECHANICS } from './mechanics.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const setOf = v => { const o = {}; if (Array.isArray(v)) v.forEach(k => { o[String(k)] = 1; }); return o; };
const MAX_BADGES = 64, MAX_UNITS = 40, APP_PREFIX = 'appspecific:';

// A plugin's params are opaque to the platform, so we keep only a shallow map of primitives
// (no nested objects/arrays/functions) with capped keys — enough to configure, never a payload.
function shallowPrimitives(p) {
  const out = {};
  if (!isObj(p)) return out;
  Object.keys(p).slice(0, 20).forEach(k => { const v = p[k]; if (['string', 'number', 'boolean'].includes(typeof v)) out[k] = typeof v === 'string' ? v.slice(0, 200) : v; });
  return out;
}

function cleanBadge(b, appMechs) {
  if (!isObj(b) || typeof b.mechanic !== 'string') return null;
  const slot = Number.isInteger(b.slot) ? b.slot : null;
  const mech = b.mechanic;
  if (mech.startsWith(APP_PREFIX)) {
    const name = mech.slice(APP_PREFIX.length);
    if (!appMechs[name]) return null;                 // plugin must be registered in appMechanics
    return { slot, mechanic: mech, params: shallowPrimitives(b.params) };
  }
  const M = MECHANICS[mech];
  if (!M) return null;                                // unknown library mechanic → dropped
  return { slot, mechanic: mech, params: M.cleanParams(isObj(b.params) ? b.params : {}) };
}

export function cleanRules(doc, opts) {
  opts = opts || {};
  const knownUnits = setOf(opts.units);
  const restrictUnits = Array.isArray(opts.units) && opts.units.length > 0;
  const appMechs = setOf(opts.appMechanics);
  const out = {};
  if (!isObj(doc)) return out;
  Object.keys(doc).slice(0, MAX_UNITS).forEach(unit => {
    if (restrictUnits && !knownUnits[unit]) return;   // only units the progression declares
    const u = doc[unit];
    if (!isObj(u) || !Array.isArray(u.badges)) return;
    const badges = u.badges.map(b => cleanBadge(b, appMechs)).filter(Boolean).slice(0, MAX_BADGES);
    out[unit] = { badges };
  });
  return out;
}
