#!/usr/bin/env node
// bin/deploy.mjs — the owner-run wiring to make a validated Spec LIVE on THEIR Firebase project.
// Two halves: (1) materialize the deploy bundle to disk (rules + hosting-ready config), (2) seed the
// config docs into Firestore via the Admin SDK. It does NOT run `firebase deploy` for you — it prints
// the command so you stay in control of the deploy.
//
//   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \        # a service account for YOUR (separate) project
//   node bin/deploy.mjs --starter academy ./build
//   node bin/deploy.mjs myspec.json ./build
//
// SEPARATION (Will 2026-08-10): refuses to target the Dojo project. firebase-admin is a LAZY import,
// so the repo stays zero-dependency until you actually deploy (npm i firebase-admin first).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { materialize } from '../src/materialize.mjs';
import { getStarter } from '../src/intake/starters.mjs';
import { applySpecLive } from '../seams/firebase-executor.mjs';

const DOJO_PROJECT = 'the-dojo-app-b7004';

const args = process.argv.slice(2);
let spec, outDir, label;
if (args[0] === '--starter') { spec = getStarter(args[1]); label = `starter "${args[1]}"`; outDir = args[2]; if (!spec) { console.error(`Unknown starter "${args[1]}".`); process.exit(2); } }
else { if (!args[0] || !args[1]) { console.error('Usage: deploy <spec.json|--starter id> <outDir>'); process.exit(2); } spec = JSON.parse(readFileSync(args[0], 'utf8')); label = args[0]; outDir = args[1]; }

// 1) materialize the deploy bundle (the gate runs here too)
const bundle = materialize(spec);
if (!bundle.ok) { console.error('Refused — the spec has errors:'); bundle.errors.forEach(e => console.error('  - ' + e)); process.exit(1); }
for (const f of bundle.files) { const p = join(outDir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, f.content); }
console.log(`Materialized ${label} → ${bundle.files.length} artifacts in ${outDir}`);

// 2) seed config docs into Firestore (Admin SDK, lazy-imported so the repo stays zero-dep)
let admin;
try { admin = (await import('firebase-admin')).default; }
catch { console.error('\nTo seed Firestore, install the Admin SDK first:  npm i firebase-admin'); console.error('(The bundle is written; you can still `firebase deploy` the rules + hosting.)'); process.exit(0); }

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.error('\nSet GOOGLE_APPLICATION_CREDENTIALS to a service account for YOUR project to seed config.'); process.exit(0); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
const projectId = admin.app().options.projectId || (admin.app().options.credential && admin.app().options.credential.projectId) || '';
if (projectId === DOJO_PROJECT) { console.error(`\nRefusing to deploy to the Dojo project (${DOJO_PROJECT}). Appgnostic uses a SEPARATE project.`); process.exit(1); }

const r = await applySpecLive(spec, { db: admin.firestore() });
console.log(`Seeded ${r.writes} config docs into Firestore${projectId ? ' (' + projectId + ')' : ''}. Skipped (deploy-time): ${r.skipped.join(', ') || 'none'}`);
console.log(`\nNext: from ${outDir}, deploy rules + hosting with your own project:\n  firebase deploy --only firestore:rules,hosting`);
