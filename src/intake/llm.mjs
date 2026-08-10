// src/intake/llm.mjs — the PURE halves of the LLM propose seam (docs/AI_INTAKE.md §5). The grounding
// prompt and the ops parser live here (no I/O, fully testable); the network call is the injected seam
// in seams/llm-propose.mjs. The model is a PROPOSER inside an envelope: it may only emit a JSON array
// of diff ops, and whatever it returns is still gated by cleanSpec — so a bad or creative model can't
// escape the library.
//   buildIntakePrompt(context) → { system, user }  (context is runIntake's { spec, summary, catalog, ask, errors })
//   parseOps(text)             → a bounded ops array (robust: strips fences/prose, [] on failure)

const list = (arr, fn) => (Array.isArray(arr) ? arr : []).map(fn).join('\n');

export function buildIntakePrompt(context) {
  const c = context || {}, cat = c.catalog || {};
  const modules = list(cat.modules, m => `- ${m.type}: ${m.summary}`);
  const mechanics = list(cat.mechanics, m => `- ${m.type}: ${m.summary}`);
  const connectors = list(cat.connectors, cc => `- ${cc.category}: ${(cc.options || []).map(o => o.id).join(', ')}`);
  const fieldTypes = (cat.fieldTypes || []).join(', ');
  const grammar = JSON.stringify(cat.diffFormat || {}, null, 2);

  const system = [
    'You are the constrained Spec editor for Appgnostic, an AI app builder.',
    'You edit a declarative App Spec by proposing a DIFF: a JSON array of ops. You never write or run',
    'code — you only emit ops within the vetted library below. Every proposal is validated by cleanSpec',
    'before anything happens, so stay strictly inside the catalog.',
    '',
    'CAPABILITY MODULES you may add or configure:', modules || '(none)',
    '', 'BOUNDED FIELD TYPES (for dataModels):', fieldTypes,
    '', 'PROGRESSION MECHANICS (for the progression module rules):', mechanics || '(none)',
    '', 'CONNECTOR categories (external services, keys are secret:// references):', connectors || '(none)',
    '', 'THE DIFF GRAMMAR — your ONLY output shape:', grammar,
    '',
    'RULES:',
    '- Output ONLY a JSON array of ops. No prose, no markdown, no code fences.',
    '- Never invent a module type, connector, field type, or mechanic that is not listed above.',
    '- Use slug ids (kebab/lowercase); reuse the app’s existing concepts where possible.',
    '- If the request cannot be built within this library, output an empty array [] — never fake it.'
  ].join('\n');

  const parts = [`Current app:\n${c.summary || '(a new, empty app)'}`, `\nThe owner wants: ${c.ask || ''}`];
  if (Array.isArray(c.errors) && c.errors.length) {
    parts.push(`\nYour previous proposal was REJECTED by the validator:\n${c.errors.map(e => '- ' + e).join('\n')}\nRevise to fix these, staying within the library.`);
  }
  parts.push('\nRespond with ONLY the JSON array of diff ops.');
  return { system, user: parts.join('\n') };
}

// Robustly pull the ops array out of a model response: tolerate code fences and surrounding prose,
// take the outermost [...], and keep only well-formed ops (objects with a string target). [] on failure
// — which runIntake treats as a failed round (honest boundary), never a crash.
export function parseOps(text) {
  if (typeof text !== 'string') return [];
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('['), end = t.lastIndexOf(']');
  if (start < 0 || end < 0 || end < start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr.filter(o => o && typeof o === 'object' && typeof o.target === 'string') : [];
  } catch { return []; }
}
