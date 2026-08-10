#!/usr/bin/env node
// bin/intake.mjs — run the LIVE AI intake once, on the owner's key. The seam wired to a real model.
//   APPGNOSTIC_ANTHROPIC_KEY=sk-... node bin/intake.mjs --starter academy "add a shop"
//   APPGNOSTIC_ANTHROPIC_KEY=sk-... node bin/intake.mjs myspec.json "let members message each other"
// Prints the proposed change (plain English + preview) — it does NOT apply. cleanSpec still gates the
// model's output. Key comes from a DEDICATED env var (separate from the Dojo — cost/tracking).
import { readFileSync } from 'node:fs';
import { getStarter } from '../src/intake/starters.mjs';
import { buildCatalog } from '../src/intake/catalog.mjs';
import { runIntake } from '../src/intake/intake.mjs';
import { makeLlmPropose, KEY_ENV } from '../seams/llm-propose.mjs';

const args = process.argv.slice(2);
let spec, ask;
if (args[0] === '--starter') { spec = getStarter(args[1]); ask = args[2]; if (!spec) { console.error(`Unknown starter "${args[1]}".`); process.exit(2); } }
else { if (!args[0] || !args[1]) { console.error('Usage: intake <spec.json|--starter id> "<ask>"'); process.exit(2); } spec = JSON.parse(readFileSync(args[0], 'utf8')); ask = args[1]; }

const apiKey = process.env[KEY_ENV];
if (!apiKey) { console.error(`Set ${KEY_ENV} (your own Anthropic key, separate from the Dojo) to run the live intake.`); process.exit(2); }

const propose = makeLlmPropose({ apiKey, model: process.env.APPGNOSTIC_MODEL || 'claude-sonnet-5' });
const out = await runIntake({ spec, ask, propose, catalog: buildCatalog(spec) });

if (out.ok) {
  console.log('\n' + out.review.summary + '\n');
  if (out.review.previewChanges.length) { console.log('Preview:'); out.review.previewChanges.forEach(e => console.log('  - ' + e.label)); }
  console.log('\n(Proposed only — nothing applied. cleanSpec validated it.)');
} else {
  console.log("\nI couldn't build that within the library:");
  (out.errors || []).forEach(e => console.log('  - ' + e));
  console.log('\n(That gap would become a vetted module/connector request — never faked.)');
}
