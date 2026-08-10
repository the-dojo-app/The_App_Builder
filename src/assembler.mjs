// src/assembler.mjs — the spec→app engine (Phase 0 slice).
//   cleanSpec(spec)      → { spec: <cleaned>, errors: [] }   — validate/clamp; compose validators
//   assemble(cleanedSpec)→ Plan (array of typed ops)         — pure, deterministic; writes nothing
// See docs/ASSEMBLER.md. Covers the runtime config-doc path (theme + modules + notifications +
// branding + history snapshot) AND the deploy-path firestore.rules generation (via shell/rules-gen).

import { cleanTheme, checkContrast } from './shell/theme-validator.mjs';
import { genRules } from './shell/rules-gen.mjs';
import { cleanBlockTree } from './shell/block-tree.mjs';
import { cleanDataModels } from './shell/data-model.mjs';
import { cleanAuth } from './shell/auth.mjs';
import { cleanContentConfig } from './modules/content-library.mjs';
import { cleanProgressionConfig } from './modules/progression.mjs';
import { cleanCommerceConfig } from './modules/commerce.mjs';
import { cleanActivityConfig } from './modules/activity-log.mjs';
import { cleanMessagingConfig } from './modules/messaging.mjs';
import { cleanProviders } from './shell/providers.mjs';
import { cleanIntegrations } from './shell/connectors.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

// Block-tree validation options, derived from the (partially-cleaned) spec: the app's storage
// bucket for media, progression units as per-block audiences, and any stat/chart metrics installed
// modules expose (none declare them yet — a follow-on with the stat/chart module bindings).
function blockOpts(out) {
  const prog = (out.modules || []).find(m => m.type === 'progression');
  const units = (prog && isObj(prog.config) && Array.isArray(prog.config.units)) ? prog.config.units : [];
  return {
    bucket: (isObj(out.app) && isStr(out.app.storageBucket)) ? out.app.storageBucket : null,
    audiences: units,
    statMetrics: [], chartTypes: [], icons: []
  };
}

// Per-module config validators. Unknown module types are an error (never silently trusted).
// Modules beyond content-library get a conservative pass-through in this increment (their own
// cleanConfig lands with each module) — but the TYPE must be known here.
const KNOWN_MODULES = {
  'content-library': cleanContentConfig,
  'progression': cleanProgressionConfig,
  'commerce': cleanCommerceConfig,
  'activity-log': cleanActivityConfig,
  'messaging': cleanMessagingConfig,
  'rbac': cfg => (isObj(cfg) ? cfg : {})   // rbac config lives in the top-level `auth` block (cleanAuth)
};

export function cleanSpec(spec) {
  const errors = [];
  const s = isObj(spec) ? spec : {};
  const out = { spec: isStr(s.spec) ? s.spec : '0' };

  out.app = isObj(s.app) ? s.app : {};
  if (!isStr(out.app.id)) errors.push('app.id is required');

  out.concepts = isObj(s.concepts) ? s.concepts : {};
  out.providers = cleanProviders(s.providers);   // where the app's own infra lives (bounded; defaults to Firebase)

  // THEME — delegate to the extracted validator (drops bad colours/values, clamps numbers,
  // whitelists enums). The contrast floor is a Spec error, not a thrown exception (portable).
  out.theme = cleanTheme(isObj(s.theme) ? s.theme : {});
  const contrastErr = checkContrast(out.theme);
  if (contrastErr) errors.push(contrastErr);

  out.auth = cleanAuth(s.auth);              // roles/capabilities/signup/grant bounded; owner guaranteed
  out.dataModels = cleanDataModels(s.dataModels);   // bounded field types; owner/access whitelisted

  // MODULES — validate each config through its module's cleaner; reject unknown types.
  out.modules = [];
  (Array.isArray(s.modules) ? s.modules : []).forEach((m, i) => {
    if (!isObj(m) || !isStr(m.type)) { errors.push(`modules[${i}] missing type`); return; }
    const cleaner = KNOWN_MODULES[m.type];
    if (!cleaner) { errors.push(`modules[${i}] unknown type "${m.type}"`); return; }
    out.modules.push({ type: m.type, config: cleaner(m.config) });
  });

  // PAGES — validate each page's block tree (unknown types dropped, hrefs de-schemed, media
  // bucket-scoped, everything bounded). opts come from the spec: storage bucket + progression
  // units (per-block audiences) + any stat/chart metrics installed modules expose.
  const bo = blockOpts(out);
  out.pages = (Array.isArray(s.pages) ? s.pages : []).map(p => {
    const q = (p && typeof p === 'object') ? p : {};
    return { ...q, blocks: cleanBlockTree(q.blocks, bo) };
  });
  out.notifications = isObj(s.notifications) ? s.notifications : {};
  out.integrations = cleanIntegrations(s.integrations);   // ai + vetted connectors; keyRefs not literals
  out.meta = isObj(s.meta) ? s.meta : {};

  // Cross-module requirement: commerce cannot operate without a payments connector — surface it as a
  // clear plan-time prompt ("connect a payments processor"), not a silent half-built shop.
  if (out.modules.some(m => m.type === 'commerce') && !isObj(out.integrations.payments)) {
    errors.push('commerce module needs a payments connector (integrations.payments, e.g. stripe)');
  }
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
  plan.push({ op: 'registerPages', pages: (s.pages || []).map(p => ({ id: p.id, audience: p.audience, nav: p.nav, layout: p.layout, blocks: p.blocks || [] })) });

  // rules generation (deploy path) — the RBAC interface: dataModels + auth → firestore.rules text
  plan.push({ op: 'genRulesFile', path: 'firestore.rules', rules: genRules(s.dataModels, s.auth) });

  // version the whole spec (history/rollback)
  plan.push({ op: 'snapshotSpec', spec: s.spec });
  return plan;
}
