// platform/content-library.mjs — the content-library module's config validator.
// Bounded + pure: given a module config, returns a cleaned config keeping only
// well-formed, whitelisted values. Mirrors the shell's cleanTheme/cleanElement
// discipline (drop/clamp anything outside the envelope). See ../MODULE_CONTENT_LIBRARY.md.

const FORMATS = ['image', 'video', 'audio', 'pdf', 'article', 'external', 'interactive'];
const isStr = v => typeof v === 'string' && v.length > 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function cleanTaxonomyDim(d) {
  if (!isObj(d) || !isStr(d.id)) return null;
  const out = { id: d.id };
  if (isStr(d.label)) out.label = d.label;
  if (isStr(d.concept)) out.concept = d.concept;
  if (isStr(d.valuesFrom)) out.valuesFrom = d.valuesFrom;
  if (Array.isArray(d.values)) out.values = d.values.filter(isStr);
  if (Array.isArray(d.extra)) out.extra = d.extra.filter(isStr);
  if (isStr(d.default)) out.default = d.default;
  if (isStr(d.catalogueFilter)) out.catalogueFilter = d.catalogueFilter;
  if (d.required === true) out.required = true;
  if (d.optional === true) out.optional = true;
  return out;
}

export function cleanContentConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  out.collection = isStr(c.collection) ? c.collection : 'content';
  if (isStr(c.itemConcept)) out.itemConcept = c.itemConcept;
  out.formats = Array.isArray(c.formats)
    ? c.formats.filter(f => FORMATS.includes(f))
    : FORMATS.slice();
  if (!out.formats.length) out.formats = FORMATS.slice();
  out.taxonomy = Array.isArray(c.taxonomy)
    ? c.taxonomy.map(cleanTaxonomyDim).filter(Boolean)
    : [];
  if (isObj(c.gating)) {
    const g = c.gating, go = {};
    if (isStr(g.progressionModule)) go.progressionModule = g.progressionModule;
    go.requiredFlag = isStr(g.requiredFlag) ? g.requiredFlag : 'required';
    go.referenceFlag = isStr(g.referenceFlag) ? g.referenceFlag : 'reference';
    out.gating = go;
  }
  if (isObj(c.surfaces)) out.surfaces = c.surfaces;   // block-tree/audience validated elsewhere
  return out;
}

export const CONTENT_FORMATS = FORMATS;
