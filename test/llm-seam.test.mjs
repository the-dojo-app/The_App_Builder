// test/llm-seam.test.mjs — the LLM propose seam. The pure prompt/parse, and the WHOLE live loop
// exercised with a MOCK fetch (no key, no network, no spend) — proving a real model's output flows
// propose → parse → reviewProposal (the gate) end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIntakePrompt, parseOps } from '../src/intake/llm.mjs';
import { makeLlmPropose, KEY_ENV } from '../seams/llm-propose.mjs';
import { runIntake } from '../src/intake/intake.mjs';
import { buildCatalog } from '../src/intake/catalog.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('buildIntakePrompt grounds the model in the library + diff grammar + the ask', () => {
  const { system, user } = buildIntakePrompt({ catalog: buildCatalog(dojo), summary: 'The Dojo.', ask: 'add a shop' });
  assert.match(system, /commerce/);            // module library present
  assert.match(system, /objectTargets|arrayTargets/);   // diff grammar present
  assert.match(system, /ONLY a JSON array/);   // the output contract
  assert.match(user, /add a shop/);
});

test('buildIntakePrompt folds prior errors into a revise instruction', () => {
  const { user } = buildIntakePrompt({ ask: 'x', errors: ['unknown type "leaderboard"'] });
  assert.match(user, /REJECTED/);
  assert.match(user, /leaderboard/);
});

test('parseOps tolerates fences, prose, and junk', () => {
  assert.deepEqual(parseOps('```json\n[{"target":"roles","op":"add","value":{"id":"coach"}}]\n```').length, 1);
  assert.deepEqual(parseOps('Sure! Here you go: [{"target":"pages","op":"add","value":{"id":"about"}}] hope that helps').length, 1);
  assert.deepEqual(parseOps('no json here'), []);
  assert.deepEqual(parseOps('[{"op":"add"}]'), []);   // missing target → filtered out
  assert.deepEqual(parseOps(null), []);
});

test('makeLlmPropose requires a key (dedicated env var enforced by the caller)', () => {
  assert.throws(() => makeLlmPropose({}), new RegExp(KEY_ENV));
});

test('the WHOLE live loop with a mock model: propose → parse → gate → buildable', async () => {
  // a fake Anthropic endpoint that returns a valid ops array as message content
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ content: [{ text: '[{"target":"roles","op":"add","value":{"id":"shopkeeper","label":"Shopkeeper","rank":25}}]' }] })
  });
  const propose = makeLlmPropose({ apiKey: 'test-key', fetchImpl });
  const out = await runIntake({ spec: dojo, ask: 'add a shopkeeper role', propose, catalog: buildCatalog(dojo) });
  assert.equal(out.ok, true);
  assert.match(out.review.summary, /Add a role: shopkeeper\./);
});

test('a model that returns junk fails safe: no crash, nothing built', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ text: "I can't do that." }] }) });
  const propose = makeLlmPropose({ apiKey: 'test-key', fetchImpl });
  const out = await runIntake({ spec: getStarter('knowledgebase'), ask: 'nonsense', propose, maxRounds: 1 });
  // empty ops → a valid spec unchanged: ok, but NOTHING was applied or previewed (no hallucinated build)
  assert.equal(out.ok, true);
  assert.equal(out.review.applied.length, 0);
  assert.equal(out.review.previewChanges.length, 0);
});

test('an HTTP error fails safe (returns [])', async () => {
  const fetchImpl = async () => ({ ok: false });
  const propose = makeLlmPropose({ apiKey: 'test-key', fetchImpl });
  assert.deepEqual(await propose({ catalog: buildCatalog(dojo), ask: 'x' }), []);
});
