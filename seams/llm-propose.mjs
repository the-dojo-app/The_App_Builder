// seams/llm-propose.mjs — the LLM propose SEAM (the impure boundary; lives OUTSIDE src/ so the engine
// stays pure). Binds runIntake's injected propose() to a real Anthropic call, on the OWNER'S key.
// Zero-dependency: uses Node's built-in fetch. The pure prompt/parse live in src/intake/llm.mjs; this
// is only the network wrapper. Whatever the model returns is still gated by cleanSpec (reviewProposal).
//
// COST SEPARATION (Will 2026-08-10): the key comes from a DEDICATED env var, APPGNOSTIC_ANTHROPIC_KEY,
// so Appgnostic's model spend is never billed to a Dojo/other key. See the separate-from-dojo memory.
import { buildIntakePrompt, parseOps } from '../src/intake/llm.mjs';

export const KEY_ENV = 'APPGNOSTIC_ANTHROPIC_KEY';

// makeLlmPropose({ apiKey, model, fetchImpl, maxTokens }) → an async propose(context) for runIntake.
// fetchImpl is injectable so tests exercise the whole loop with a mock (no key, no network, no spend).
export function makeLlmPropose({ apiKey, model = 'claude-sonnet-5', fetchImpl = globalThis.fetch, maxTokens = 2048 } = {}) {
  if (!apiKey) throw new Error(`makeLlmPropose needs an apiKey — set ${KEY_ENV} (your own key; separate from the Dojo)`);
  if (typeof fetchImpl !== 'function') throw new Error('no fetch available (need Node 18+ or an injected fetchImpl)');

  return async function propose(context) {
    const { system, user } = buildIntakePrompt(context);
    let res;
    try {
      res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
      });
    } catch { return []; }                       // network error → a failed round (honest boundary), never a crash
    if (!res || !res.ok) return [];
    let data;
    try { data = await res.json(); } catch { return []; }
    const text = Array.isArray(data && data.content) ? data.content.map(b => (b && b.text) || '').join('') : '';
    return parseOps(text);                        // still gated by cleanSpec downstream
  };
}
