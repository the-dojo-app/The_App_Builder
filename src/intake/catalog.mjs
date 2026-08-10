// src/intake/catalog.mjs — the GROUNDING the AI intake is given (docs/AI_INTAKE.md §5).
//   buildCatalog(spec)  → the machine-readable envelope the model may build inside: the module
//                         library (what each does + its config shape + what it needs), the bounded
//                         field-type set, the mechanic library, and the DIFF GRAMMAR (the only
//                         output shape the model may emit). Plus spec-derived context (concepts,
//                         existing dataModel ids) so proposals reference real things.
//   summarizeSpec(spec) → the current app in plain English — grounding AND the refinement checkpoint.
// Pure + deterministic. The catalog is authoritative on the SET of capabilities (imported from the
// modules/shell so it can't drift); the human blurbs live here because this is the human-facing surface.

import { FIELD_TYPES, OWNERS, ACCESS } from '../shell/data-model.mjs';
import { CONTENT_FORMATS } from '../modules/content-library.mjs';
import { PROGRESSION_VIZ } from '../modules/progression.mjs';
import { MECHANIC_TYPES } from '../modules/mechanics.mjs';
import { PROVIDERS, CAPABILITIES, DEFAULT_PROVIDERS } from '../shell/providers.mjs';
import { CONNECTORS, CONNECTOR_CATEGORIES } from '../shell/connectors.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// Human blurbs for the mechanic library. The authoritative LIST is MECHANIC_TYPES (from the library);
// these are prose for the model's grounding. A type with no blurb still appears (label = its id).
const MECHANIC_BLURBS = {
  'count-threshold':    'At least N qualifying activities.',
  'continuity-chain':   'A streak of activities each within a time window of the last, that RESETS on a gap.',
  'consecutive-days':   'Activity on N calendar days in a row.',
  'cadence':            'N activities spaced within a min/max gap of each other.',
  'score-floor':        'A best activity score reaches a floor.',
  'duration-floor':     'A single activity of at least a given length.',
  'interval-structure': 'N sittings each of a minimum length, with rests between within a range.',
  'volume-window':      'At least N activities within any rolling time window.',
  'required-content':   'All REQUIRED content for the scope completed (reads the content library).'
};

// The capability module library — what the model may install and how it is configured.
const MODULE_LIBRARY = [
  {
    type: 'content-library',
    summary: 'A library/catalogue of content items (six formats: image, video, audio, pdf, article, external, interactive), with a taxonomy and gated completion tracking.',
    needs: 'a dataModel to hold the items (owner "app", access "public" is typical).',
    config: {
      collection: 'the dataModel id holding the items',
      itemConcept: 'a concept key (what one item is called)',
      formats: `subset of ${CONTENT_FORMATS.join(', ')}`,
      taxonomy: 'list of dimensions to file items under (e.g. by level, by type)',
      gating: '{ progressionModule, requiredFlag, referenceFlag } — ties completion into progression',
      surfaces: '{ catalogue, gatedReader } — which pages show it, to whom'
    }
  },
  {
    type: 'progression',
    summary: 'Levels/tiers members climb by meeting criteria. Members never lose a level they finished (never retroactive).',
    needs: 'an activity dataModel for evidence; optionally the content-library for required-content criteria.',
    config: {
      unitConcept: 'a concept key (what one level is called)',
      units: 'the ordered level names, e.g. ["White","Yellow",…]',
      badgesPerUnit: 'how many badges/steps per level (1–32)',
      tracks: 'independent scoring paths, each { id, label, score.source }',
      evidence: '{ activityModel, contentModule }',
      viz: `how it is shown: ${PROGRESSION_VIZ.join(', ')}`,
      rules: 'per-unit badge slots → a mechanic + params, composed from the mechanic library',
      appMechanics: 'names of vetted app-specific mechanics (escape hatch; never invented)',
      retroactive: 'false (do not change)'
    }
  },
  {
    type: 'rbac',
    summary: 'Roles and who-can-do-what. The role SET lives in the top-level auth block, not this module config.',
    needs: 'nothing extra; edit auth.roles / auth.signup / auth.grant via the "roles" and "auth" diff targets.',
    config: '(no module config — see the top-level auth block)'
  },
  {
    type: 'activity-log',
    summary: 'A stream of what members and the app do — a member feed/timeline, staff analytics, and an audit log. The shared evidence store progression reads and other modules emit to.',
    needs: 'an activity dataModel; other modules emit events into it (decoupled — no coupling).',
    config: {
      collection: 'the dataModel id holding events',
      eventTypes: 'the vetted types this app records, e.g. session / content.completed / order.paid',
      visibilityDefault: 'private | staff | public',
      retentionDays: '0 = keep forever',
      surfaces: '{ feed, analytics, audit } — which pages, to whom'
    }
  },
  {
    type: 'commerce',
    summary: 'A shop: products, cart, checkout, orders, fulfilment. Reuses the content library for the storefront.',
    needs: 'a products dataModel + a PAYMENTS connector in integrations.payments (e.g. stripe) — required.',
    config: {
      productCollection: 'the dataModel id holding the products',
      currency: 'a 3-letter code, e.g. USD',
      pricingModel: 'one-off (v0)',
      tax: '{ mode: none|flat, flatCents }', shipping: '{ mode: none|flat, flatCents }',
      surfaces: '{ storefront, checkout, myOrders, admin } — which pages, to whom'
    }
  }
];

// The DIFF GRAMMAR — the ONLY output the model may emit. A proposal is a list of these ops.
const DIFF_GRAMMAR = {
  objectTargets: {
    targets: ['app', 'concepts', 'theme', 'notifications', 'integrations', 'auth'],
    op: 'merge',
    shape: '{ target, op:"merge", value:{…} }  — deep-merged; a null value at a key deletes that key.',
    note: 'For "auth", the roles array is managed via the "roles" target, not here.'
  },
  arrayTargets: {
    targets: { dataModels: 'id', modules: 'type', pages: 'id', roles: 'id (at auth.roles)' },
    ops: {
      add:    '{ target, op:"add", value:{…} }     — value must carry the key; fails if it already exists',
      update: '{ target, op:"update", id, value }   — deep-merges into the existing item; fails if absent',
      remove: '{ target, op:"remove", id }          — fails if absent'
    }
  },
  guarantee: 'Every proposal passes cleanSpec before anything is shown or applied. Unknown modules, out-of-bounds fields, or broken references are refused — the model is handed the error and revises, or names the gap. It never emits executable code.'
};

export function buildCatalog(spec) {
  const s = isObj(spec) ? spec : {};
  return {
    fieldTypes: Object.keys(FIELD_TYPES),
    owners: Object.keys(OWNERS),
    access: Object.keys(ACCESS),
    contentFormats: CONTENT_FORMATS.slice(),
    vizOptions: PROGRESSION_VIZ.slice(),
    modules: MODULE_LIBRARY.map(m => ({ ...m })),
    mechanics: MECHANIC_TYPES.map(t => ({ type: t, summary: MECHANIC_BLURBS[t] || t })),
    providers: CAPABILITIES.map(cap => ({
      capability: cap,
      default: DEFAULT_PROVIDERS[cap],
      options: PROVIDERS.filter(p => p.capability === cap).map(p => ({ id: p.id, name: p.name, summary: p.summary, byoAccount: p.byoAccount }))
    })),
    connectors: CONNECTOR_CATEGORIES.map(cat => ({
      category: cat,
      options: CONNECTORS.filter(c => c.category === cat).map(c => ({ id: c.id, name: c.name }))
    })),
    diffFormat: DIFF_GRAMMAR,
    // spec-derived context so proposals reference real things
    concepts: Object.keys(isObj(s.concepts) ? s.concepts : {}),
    existingModels: (Array.isArray(s.dataModels) ? s.dataModels : []).map(m => m && m.id).filter(Boolean),
    installedModules: (Array.isArray(s.modules) ? s.modules : []).map(m => m && m.type).filter(Boolean)
  };
}

const plural = (c, key) => (isObj(c[key]) && c[key].plural) || key;
const label = (c, key) => (isObj(c[key]) && c[key].label) || key;

// Plain-English description of the current app — the grounding summary AND the refinement checkpoint
// ("here's your app in plain English, still right?"). Deterministic; no jargon.
export function summarizeSpec(spec) {
  const s = isObj(spec) ? spec : {};
  const c = isObj(s.concepts) ? s.concepts : {};
  const lines = [];

  const name = (isObj(s.app) && s.app.name) || (isObj(s.app) && s.app.id) || 'This app';
  lines.push((isObj(s.app) && s.app.tagline) ? `${name} — ${s.app.tagline}.` : `${name}.`);

  const roles = (isObj(s.auth) && Array.isArray(s.auth.roles)) ? s.auth.roles : [];
  if (roles.length) {
    const su = (isObj(s.auth) && isObj(s.auth.signup)) ? s.auth.signup : {};
    const how = su.open ? 'anyone can sign up' : su.invite ? 'members join by invite' : 'sign-up is closed';
    lines.push(`Roles: ${roles.map(r => r.label || r.id).join(', ')} (${how}).`);
  }

  const dms = Array.isArray(s.dataModels) ? s.dataModels : [];
  if (dms.length) {
    const priv = { 'owner-read': 'private', 'admin-read': 'staff-visible', 'public': 'public' };
    lines.push('Keeps track of: ' + dms.map(m =>
      `${label(c, m.concept) !== m.concept ? plural(c, m.concept) : m.id} (${m.owner}-owned, ${priv[m.access] || m.access})`
    ).join('; ') + '.');
  }

  const mods = Array.isArray(s.modules) ? s.modules : [];
  mods.forEach(m => {
    if (m.type === 'content-library') {
      const item = plural(c, (m.config && m.config.itemConcept) || 'contentItem');
      lines.push(`A library of ${item}.`);
    } else if (m.type === 'progression') {
      const units = (m.config && Array.isArray(m.config.units)) ? m.config.units : [];
      const unitName = plural(c, (m.config && m.config.unitConcept) || 'progressionUnit');
      lines.push(units.length
        ? `${unitName} members climb: ${units.length} (${units[0]}…${units[units.length - 1]}).`
        : `${unitName} members climb.`);
    } else if (m.type === 'rbac') {
      lines.push('Role-based access control.');
    } else {
      lines.push(`Capability: ${m.type}.`);
    }
  });

  const pages = Array.isArray(s.pages) ? s.pages : [];
  if (pages.length) lines.push('Pages: ' + pages.map(p => p.title || p.id).join(', ') + '.');

  return lines.join('\n');
}
