// test/firebase-executor.test.mjs — the Firebase-bound executor, proven against a MOCK Firestore (no
// project, no credentials, no writes to a real db). Verifies the op→doc mapping, the gate, and that
// rules are (correctly) not a runtime write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeFirebaseExecutor, applySpecLive } from '../seams/firebase-executor.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

// a minimal Firestore mock: records every config/<doc> set()
function mockDb() {
  const store = {};
  return {
    store,
    collection: c => ({ doc: d => ({ set: async v => { store[`${c}/${d}`] = v; } }) })
  };
}

test('applySpecLive writes the config docs, snapshot, and pages — but NOT rules', async () => {
  const db = mockDb();
  const r = await applySpecLive(dojo, { db });
  assert.equal(r.ok, true);
  assert.ok(db.store['config/appTheme']);                 // theme doc written
  assert.ok(db.store['config/pages'].pages.length >= 1);  // pages registry written
  assert.equal(db.store['config/appSpec'].app.id, 'the-dojo');  // full cleaned spec snapshot
  assert.ok(db.store['config/module:content-library']);   // module config doc written
  assert.ok(!('config/firestore.rules' in db.store));     // rules are a DEPLOY artifact, not a doc
  assert.deepEqual(r.skipped, ['genRulesFile']);          // reported, not silently dropped
});

test('the GATE holds — a bad spec writes NOTHING', async () => {
  const db = mockDb();
  const r = await applySpecLive({ ...dojo, modules: [...dojo.modules, { type: 'bogus', config: {} }] }, { db });
  assert.equal(r.ok, false);
  assert.equal(Object.keys(db.store).length, 0);          // nothing written
  assert.ok(r.errors.some(e => /unknown type "bogus"/.test(e)));
});

test('a starter with a module config doc writes it live', async () => {
  const db = mockDb();
  await applySpecLive(getStarter('coaching'), { db });
  assert.ok(db.store['config/module:progression']);
  assert.ok(db.store['config/module:content-library']);
});

test('makeFirebaseExecutor + applySpecLive require an injected db', () => {
  assert.throws(() => makeFirebaseExecutor({}), /db/);
  assert.rejects(applySpecLive(dojo, {}), /db/);
});
