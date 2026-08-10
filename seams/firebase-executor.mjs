// seams/firebase-executor.mjs — the FIREBASE-BOUND EXECUTOR (the impure boundary, outside src/). Binds
// applyPlan's injected executor to a real Firestore, so a validated Spec's config becomes live config
// docs. Same op set the materializer writes to disk — disk there, Firestore here. The `db` is INJECTED
// (Admin SDK firestore, or a mock in tests), so the mapping is proven without a project or credentials.
//
// SEPARATION (Will 2026-08-10): deploy targets a SEPARATE Firebase project, never the Dojo's. bin/deploy
// resolves the project from the owner's creds and refuses `the-dojo-app-b7004`.
import { planSpec, applyPlan } from '../src/plan.mjs';

// One op → one Firestore write under the `config` collection. genRulesFile is intentionally NOT here —
// security rules are a DEPLOY artifact (firebase deploy), not a runtime doc (the materializer emits them).
export function makeFirebaseExecutor({ db, spec }) {
  if (!db) throw new Error('makeFirebaseExecutor needs a Firestore db (injected)');
  const set = (docId, value) => db.collection('config').doc(docId).set(value);
  return {
    writeConfig: op => set(op.doc, op.value),            // config/appTheme, config/module:commerce, …
    registerPages: op => set('pages', { pages: op.pages }),
    snapshotSpec: () => set('appSpec', spec)             // the full cleaned spec = source of truth
  };
}

// Gate → apply to Firestore. Returns a summary; awaits all writes. Skipped ops (e.g. genRulesFile) are
// reported, not silently dropped. Never runs on a spec with errors.
export async function applySpecLive(spec, { db } = {}) {
  if (!db) throw new Error('applySpecLive needs a Firestore db (injected)');
  const { ok, errors, plan, spec: cleaned } = planSpec(spec);
  if (!ok) return { ok: false, errors, writes: 0, skipped: [] };
  const results = applyPlan(plan, makeFirebaseExecutor({ db, spec: cleaned }));
  const writes = results.filter(r => !r.skipped);
  await Promise.all(writes.map(r => r.result));          // exec methods return the set() promise
  return { ok: true, errors: [], writes: writes.length, skipped: results.filter(r => r.skipped).map(r => r.op) };
}
