// src/modules/progression-engine.mjs — the progression ORCHESTRATOR. Walks a member's units ×
// badge slots, runs the right mechanic per slot from the library, and applies the NEVER-RETROACTIVE
// completed-unit boundary to produce their standing. Pure + clock-injected. This is what the member
// inspector, the impact preview, and the badge viz all call. See docs/MODULE_PROGRESSION.md §5, §9.
//
// member  = { boundary: { completed: [<unit>…] }, evidence: { activities:[…], completedRequired } }
//   `boundary.completed` is the STORED, trusted set of already-earned units — the never-retroactive
//   record. Only the CURRENT unit is evaluated live against the current rules; finished units stay
//   earned even if the rules later change (a completed unit is closed).
// config  = a cleaned progression config (units, rules) — see cleanProgressionConfig.
// ctx     = { now:<ms>, plugins: { <name>: { evaluate(evidence, params, ctx) } } }  (app-mechanic plugins)
import { MECHANICS } from './mechanics.mjs';

const APP_PREFIX = 'appspecific:';

function evalBadge(b, evidence, ctx, plugins) {
  const mech = b.mechanic;
  let r;
  if (mech.startsWith(APP_PREFIX)) {
    const pl = plugins[mech.slice(APP_PREFIX.length)];
    r = (pl && typeof pl.evaluate === 'function') ? pl.evaluate(evidence, b.params || {}, ctx) : { met: false, progress: 0, why: 'app-mechanic plugin not provided' };
  } else {
    const M = MECHANICS[mech];
    r = M ? M.evaluate(evidence, b.params || {}, ctx) : { met: false, progress: 0, why: 'unknown mechanic' };
  }
  return { slot: b.slot, mechanic: mech, met: !!r.met, progress: r.progress || 0, why: r.why || '' };
}

export function evaluate(member, config, ctx) {
  member = member || {}; config = config || {}; ctx = ctx || {};
  const plugins = ctx.plugins || {};
  const units = Array.isArray(config.units) ? config.units : [];
  const rules = (config.rules && typeof config.rules === 'object') ? config.rules : {};
  const completed = new Set((member.boundary && Array.isArray(member.boundary.completed)) ? member.boundary.completed : []);
  const evidence = member.evidence || { activities: [] };

  // The current unit is the first declared unit NOT already earned. Finished units are trusted.
  const currentUnit = units.find(u => !completed.has(u)) || null;

  let badges = [];
  if (currentUnit && rules[currentUnit] && Array.isArray(rules[currentUnit].badges)) {
    badges = rules[currentUnit].badges.map(b => evalBadge(b, evidence, ctx, plugins));
  }
  const currentUnitEarned = badges.length > 0 && badges.every(x => x.met);

  const earnedUnits = [...completed];
  if (currentUnitEarned && currentUnit) earnedUnits.push(currentUnit);

  return {
    completedUnits: [...completed],   // never re-evaluated (retroactive-safe)
    currentUnit,
    badges,                           // per-badge {slot, mechanic, met, progress, why} for the current unit
    currentUnitEarned,
    earnedUnits
  };
}

// Impact preview — the admin safeguard. Counts members who'd LOSE a badge (or the current unit)
// under newConfig vs oldConfig. Only the current unit changes, since finished units are closed.
// members: [ { id, boundary, evidence } … ]
export function previewImpact(members, oldConfig, newConfig, ctx) {
  const details = [];
  for (const m of (Array.isArray(members) ? members : [])) {
    const before = evaluate(m, oldConfig, ctx);
    const after = evaluate(m, newConfig, ctx);
    const lostUnit = before.currentUnitEarned && !after.currentUnitEarned;
    const lostBadge = before.badges.some(bb => bb.met &&
      after.badges.some(ab => ab.slot === bb.slot && ab.mechanic === bb.mechanic && !ab.met));
    if (lostUnit || lostBadge) details.push({ id: m.id, currentUnit: after.currentUnit, lostUnit });
  }
  return { affected: details.length, total: (Array.isArray(members) ? members.length : 0), details };
}
