#!/usr/bin/env node
// bin/materialize.mjs — the thin I/O wrapper around src/materialize.mjs (the executor seam's disk end).
// Turns a validated Spec into a real, deployable artifact bundle on disk. The ONLY file that does I/O.
//   node bin/materialize.mjs <spec.json> <outDir>
//   node bin/materialize.mjs --starter <academy|coaching|knowledgebase> <outDir>
// It never deploys or touches the cloud — you run `firebase deploy` against your own project after.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { materialize } from '../src/materialize.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const args = process.argv.slice(2);
let spec, outDir, label;
if (args[0] === '--starter') {
  spec = getStarter(args[1]); label = `starter "${args[1]}"`; outDir = args[2];
  if (!spec) { console.error(`Unknown starter "${args[1]}".`); process.exit(2); }
} else {
  if (!args[0] || !args[1]) { console.error('Usage: materialize <spec.json> <outDir>  |  --starter <id> <outDir>'); process.exit(2); }
  spec = JSON.parse(readFileSync(args[0], 'utf8')); label = args[0]; outDir = args[1];
}

const { ok, errors, files } = materialize(spec);
if (!ok) {
  console.error(`Refused to build ${label} — the spec has errors:`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
for (const f of files) {
  const p = join(outDir, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content);
}
console.log(`Materialized ${label} → ${files.length} artifacts in ${outDir}`);
files.forEach(f => console.log('  ' + f.path));
