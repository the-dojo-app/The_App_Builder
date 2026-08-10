// src/modules/commerce.mjs — the commerce module's config validator (docs/MODULE_COMMERCE.md §4).
// Bounded + pure, like the other module cleaners. The connector wiring (which payments processor +
// its keyRef) lives in the top-level `integrations` block (validated by cleanIntegrations) — this
// validates only the commerce-OWNED config. Money-moving happens at the executor seam, never here.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && isFinite(v);
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const CURRENCY = /^[A-Z]{3}$/;

const PRICING = { 'one-off': 1 };                 // v0 = one-off only; subscription is a fast-follow (§10)
const TAXSHIP_MODES = { none: 1, flat: 1 };       // v0 = none|flat; connector-computed comes later (§10)
const DEFAULT_STATES = ['pending', 'paid', 'fulfilled', 'refunded', 'canceled'];
const MAX_STATES = 20;

function cleanTaxShip(t) {
  const x = isObj(t) ? t : {};
  const mode = TAXSHIP_MODES[x.mode] ? x.mode : 'none';
  const out = { mode };
  if (mode === 'flat') out.flatCents = isNum(x.flatCents) ? Math.max(0, Math.round(x.flatCents)) : 0;
  return out;
}

export function cleanCommerceConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  out.productCollection = isStr(c.productCollection) ? c.productCollection : 'products';
  if (isStr(c.itemConcept)) out.itemConcept = c.itemConcept;
  out.currency = (isStr(c.currency) && CURRENCY.test(c.currency)) ? c.currency : 'USD';
  out.pricingModel = PRICING[c.pricingModel] ? c.pricingModel : 'one-off';
  if (isStr(c.catalogueFrom)) out.catalogueFrom = c.catalogueFrom;
  out.tax = cleanTaxShip(c.tax);
  out.shipping = cleanTaxShip(c.shipping);
  out.orderStates = Array.isArray(c.orderStates) ? c.orderStates.filter(s => SLUG.test(s || '')).slice(0, MAX_STATES) : DEFAULT_STATES.slice();
  if (!out.orderStates.length) out.orderStates = DEFAULT_STATES.slice();
  if (isObj(c.surfaces)) out.surfaces = c.surfaces;   // block-tree/audience validated elsewhere
  return out;
}

export const COMMERCE_PRICING = Object.keys(PRICING);
export const COMMERCE_TAXSHIP_MODES = Object.keys(TAXSHIP_MODES);
