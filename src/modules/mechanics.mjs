// src/modules/mechanics.mjs — the MECHANIC LIBRARY: the general criterion types a progression
// rules doc composes from (docs/MODULE_PROGRESSION.md §3). Each type is PURE and has two halves:
//   cleanParams(params)               → bounded params (so a rules doc can be validated)
//   evaluate(evidence, params, ctx)   → { met, progress, why }   (the actual criterion logic)
// evidence is the NORMALIZED shape source modules adapt to:
//   { activities: [ { ts:<ms>, score:<num>, durationSec:<num> } … ], completedRequired: bool | {scope:bool} }
// ctx = { now:<ms> } (clock-injected — the engine never reads the wall clock itself).

const DAY = 86400000;
const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
const clampInt = (v, lo, hi, def) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, Math.round(v))) : def;
const clamp01 = v => Math.max(0, Math.min(1, isFinite(v) ? v : 0));
const mk = (met, progress, why) => ({ met: !!met, progress: clamp01(progress), why: String(why) });
// activities as a ts-ascending array of {ts,score,durationSec}
const acts = ev => ((ev && Array.isArray(ev.activities)) ? ev.activities : [])
  .filter(a => a && isFinite(a.ts)).map(a => ({ ts: +a.ts, score: num(a.score), durationSec: num(a.durationSec) }))
  .sort((a, b) => a.ts - b.ts);

export const MECHANICS = {
  // ≥ N qualifying activities.
  'count-threshold': {
    cleanParams: p => ({ target: clampInt(p.target, 1, 100000, 1) }),
    evaluate: (ev, p) => { const n = acts(ev).length; return mk(n >= p.target, n / p.target, `${n}/${p.target}`); }
  },
  // A streak of activities each within `window` ms of the previous, that RESETS on a gap. Uses the
  // CURRENT run (ending at the most recent activity) — so a lapse drops you back, like the belt "Chain".
  'continuity-chain': {
    cleanParams: p => ({ window: clampInt(p.window, 60000, 30 * DAY, DAY), target: clampInt(p.target, 1, 1000, 1) }),
    evaluate: (ev, p) => {
      const a = acts(ev); if (!a.length) return mk(false, 0, `chain 0/${p.target}`);
      let cur = 1;
      for (let i = a.length - 1; i > 0; i--) { if (a[i].ts - a[i - 1].ts <= p.window) cur++; else break; }
      return mk(cur >= p.target, cur / p.target, `chain ${cur}/${p.target}`);
    }
  },
  // Activity on N distinct calendar days in a row (longest run of consecutive UTC day-keys).
  'consecutive-days': {
    cleanParams: p => ({ days: clampInt(p.days, 1, 366, 1) }),
    evaluate: (ev, p) => {
      const days = [...new Set(acts(ev).map(x => Math.floor(x.ts / DAY)))].sort((a, b) => a - b);
      let run = days.length ? 1 : 0, best = run;
      for (let i = 1; i < days.length; i++) { run = (days[i] === days[i - 1] + 1) ? run + 1 : 1; best = Math.max(best, run); }
      return mk(best >= p.days, best / p.days, `${best}/${p.days} days`);
    }
  },
  // `count` activities spaced within [minGap, maxGap] ms of the previous qualifying one.
  'cadence': {
    cleanParams: p => ({ minGap: clampInt(p.minGap, 0, 365 * DAY, DAY), maxGap: clampInt(p.maxGap, 1, 365 * DAY, 2 * DAY), count: clampInt(p.count, 1, 1000, 2) }),
    evaluate: (ev, p) => {
      const a = acts(ev); let cnt = 0, last = null;
      for (const x of a) {
        if (last === null) { last = x.ts; continue; }
        const g = x.ts - last;
        if (g >= p.minGap && g <= p.maxGap) { cnt++; last = x.ts; }
        else if (g > p.maxGap) { last = x.ts; }   // too long a gap → restart the spacing from here
      }
      return mk(cnt >= p.count, cnt / p.count, `${cnt}/${p.count} spaced`);
    }
  },
  // A track score reaches a floor (best activity score ≥ min).
  'score-floor': {
    cleanParams: p => ({ min: clampInt(p.min, 0, 100000, 1), source: (typeof p.source === 'string' ? p.source.slice(0, 120) : 'activity.score') }),
    evaluate: (ev, p) => { const a = acts(ev); if (!a.length) return mk(false, 0, `best -/${p.min}`); const best = a.reduce((m, x) => Math.max(m, x.score), -Infinity); return mk(best >= p.min, best / p.min, `best ${best}/${p.min}`); }
  },
  // An activity of at least a given length (best durationSec ≥ minSec).
  'duration-floor': {
    cleanParams: p => ({ minSec: clampInt(p.minSec, 1, 86400, 60) }),
    evaluate: (ev, p) => { const best = acts(ev).reduce((m, x) => Math.max(m, x.durationSec), 0); return mk(best >= p.minSec, best / p.minSec, `${best}s/${p.minSec}s`); }
  },
  // N sittings each ≥ minEachSec, with rests between in [restLoSec, restHiSec] (e.g. Blue: 4×5min, rest 5–20min).
  'interval-structure': {
    cleanParams: p => ({ sittings: clampInt(p.sittings, 1, 100, 2), minEachSec: clampInt(p.minEachSec, 1, 86400, 60), restLoSec: clampInt(p.restLoSec, 0, 86400, 0), restHiSec: clampInt(p.restHiSec, 1, 86400, 86400) }),
    evaluate: (ev, p) => {
      const a = acts(ev), lo = p.restLoSec * 1000, hi = p.restHiSec * 1000;
      let run = 0, best = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i].durationSec < p.minEachSec) { run = 0; continue; }
        if (run === 0) run = 1;
        else { const g = a[i].ts - a[i - 1].ts; run = (g >= lo && g <= hi && a[i - 1].durationSec >= p.minEachSec) ? run + 1 : 1; }
        best = Math.max(best, run);
      }
      return mk(best >= p.sittings, best / p.sittings, `${best}/${p.sittings} sittings`);
    }
  },
  // ≥ target activities within any rolling window of windowMs.
  'volume-window': {
    cleanParams: p => ({ target: clampInt(p.target, 1, 100000, 1), windowMs: clampInt(p.windowMs, 60000, 365 * DAY, 7 * DAY) }),
    evaluate: (ev, p) => {
      const a = acts(ev); let best = 0;
      for (let i = 0; i < a.length; i++) { let c = 0; for (let j = i; j < a.length && a[j].ts - a[i].ts <= p.windowMs; j++) c++; best = Math.max(best, c); }
      return mk(best >= p.target, best / p.target, `${best}/${p.target} in window`);
    }
  },
  // All REQUIRED content for the scope completed — consumes the content-library completion signal.
  'required-content': {
    cleanParams: p => ({ contentModule: (typeof p.contentModule === 'string' ? p.contentModule.slice(0, 60) : 'content-library'), scope: (typeof p.scope === 'string' ? p.scope.slice(0, 60) : 'unit') }),
    evaluate: (ev, p) => { const cr = ev && ev.completedRequired; const done = cr === true || (cr && typeof cr === 'object' && cr[p.scope] === true); return mk(!!done, done ? 1 : 0, done ? 'required complete' : 'required pending'); }
  }
};

export const MECHANIC_TYPES = Object.keys(MECHANICS);
