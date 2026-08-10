// src/assembler.mjs — the spec→app engine (Phase 0 slice).
//   cleanSpec(spec)      → { spec: <cleaned>, errors: [] }   — validate/clamp; compose validators
//   assemble(cleanedSpec)→ Plan (array of typed ops)         — pure, deterministic; writes nothing
// See docs/ASSEMBLER.md. Covers the runtime config-doc path (theme + modules + notifications +
// branding + history snapshot) AND the deploy-path firestore.rules generation (via shell/rules-gen).

import { cleanTheme, checkContrast } from './shell/theme-validator.mjs';
import { genRules } from './shell/rules-gen.mjs';
import { cleanContentConfig } from './modules/content-library.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

// Per-module config validators. Unknown module types are an error (never silently trusted).
// Modules beyond content-library get a conservative pass-through in this increment (their own
// cleanConfig lands with each module) — but the TYPE must be known here.
const KNOWN_MODULES = {
  'content-library': cleanContentConfig,
  'progression': cfg => (isObj(cfg) ? cfg : {}),   // TODO: cleanProgressionConfig (docs/MODULE_PROGRESSION.md)
  'rbac': cfg => (isObj(cfg) ? cfg : {})
};

export function cleanSpec(spec) {
  const errors = [];
  const s = isObj(spec) ? spec : {};
  const out = { spec: isStr(s.spec) ? s.spec : '0' };

  out.app = isObj(s.app) ? s.app : {};
  if (!isStr(out.app.id)) errors.push('app.id is required');

  out.concepts = isObj(s.concepts) ? s.concepts : {};

  // THEME — delegate to the extracted validator (drops bad colours/values, clamps numbers,
  // whitelists enums). The contrast floor is a Spec error, not a thrown exception (portable).
  out.theme = cleanTheme(isObj(s.theme) ? s.theme : {});
  const contrastErr = checkContrast(out.theme);
  if (contrastErr) errors.push(contrastErr);

  out.auth = isObj(s.auth) ? s.auth : {};
  out.dataModels = Array.isArray(s.dataModels) ? s.dataModels : [];

  // MODULES — validate each config through its module's cleaner; reject unknown types.
  out.modules = [];
  (Array.isArray(s.modules) ? s.modules : []).forEach((m, i) => {
    if (!isObj(m) || !isStr(m.type)) { errors.push(`modules[${i}] missing type`); return; }
    const cleaner = KNOWN_MODULES[m.type];
    if (!cleaner) { errors.push(`modules[${i}] unknown type "${m.type}"`); return; }
    out.modules.push({ type: m.type, config: cleaner(m.config) });
  });

  out.pages = Array.isArray(s.pages) ? s.pages : [];       // blocks validated by cleanBlockTree (later)
  out.notifications = isObj(s.notifications) ? s.notifications : {};
  out.integrations = isObj(s.integrations) ? s.integrations : {};
  out.meta = isObj(s.meta) ? s.meta : {};
  return { spec: out, errors };
}

// assemble → a Plan of typed ops. Deterministic: identical spec ⇒ identical plan (fixed order).
// Ops shape: { op, ... }. apply() (not here) would execute them via the existing callables.
export function assemble(cleaned) {
  const s = cleaned && cleaned.spec ? cleaned.spec : cleaned;
  const plan = [];
  const writeConfig = (doc, value) => plan.push({ op: 'writeConfig', doc, value });

  writeConfig('appTheme', s.theme);
  if (s.app && isObj(s.app.branding)) writeConfig('branding', s.app.branding);
  writeConfig('notifications', s.notifications || {});

  // modules → one config doc each, in declared order (stable)
  (s.modules || []).forEach(m => writeConfig('module:' + m.type, m.config));

  // pages registry
  plan.push({ op: 'registerPages', pages: (s.pages || []).map(p => ({ id: p.id, audience: p.audience, nav: p.nav, layout: p.layout })) });

  // rules generation (deploy path) — the RBAC interface: dataModels + auth → firestore.rules text
  plan.push({ op: 'genRulesFile', path: 'firestore.rules', rules: genRules(s.dataModels, s.auth) });

  // version the whole spec (history/rollback)
  plan.push({ op: 'snapshotSpec', spec: s.spec });
  return plan;
}
