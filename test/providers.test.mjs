// test/providers.test.mjs — the provider catalog + its bounded validator. Appgnostic is provider-
// agnostic: every capability offers vetted choices, defaults are safe (Firebase/Anthropic), and an
// unknown/absent choice never breaks — it falls back to the capability default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROVIDERS, CAPABILITIES, DEFAULT_PROVIDERS, listProviders, getProvider, cleanProviders } from '../src/shell/providers.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { buildCatalog } from '../src/intake/catalog.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('every capability has choices and exactly one default', () => {
  for (const cap of CAPABILITIES) {
    const opts = listProviders(cap);
    assert.ok(opts.length >= 2, `${cap} should offer choices`);
    assert.equal(opts.filter(p => p.default).length, 1, `${cap} has one default`);
    assert.ok(opts.every(p => p.byoAccount), `${cap} providers all support bring-your-own-account`);
  }
});

test('defaults are all Firebase (+ Anthropic for ai)', () => {
  assert.equal(DEFAULT_PROVIDERS.database, 'firebase-firestore');
  assert.equal(DEFAULT_PROVIDERS.auth, 'firebase-auth');
  assert.equal(DEFAULT_PROVIDERS.storage, 'firebase-storage');
  assert.equal(DEFAULT_PROVIDERS.hosting, 'firebase-hosting');
  assert.equal(DEFAULT_PROVIDERS.ai, 'anthropic');
});

test('cleanProviders keeps known choices, drops unknown to the default, fills the rest', () => {
  const out = cleanProviders({ database: 'supabase-postgres', auth: 'not-a-thing', storage: 'firebase-auth' /* wrong capability */ });
  assert.equal(out.database, 'supabase-postgres');       // valid → kept
  assert.equal(out.auth, DEFAULT_PROVIDERS.auth);        // unknown → default
  assert.equal(out.storage, DEFAULT_PROVIDERS.storage);  // right id, wrong capability → default
  CAPABILITIES.forEach(c => assert.ok(out[c], `${c} always resolved`));
});

test('cleanProviders on junk returns all defaults', () => {
  assert.deepEqual(cleanProviders(undefined), DEFAULT_PROVIDERS);
});

test('getProvider returns a copy or null', () => {
  assert.equal(getProvider('vercel').capability, 'hosting');
  assert.equal(getProvider('nope'), null);
});

test('cleanSpec resolves a providers block and the Dojo spec still validates clean', () => {
  const { spec, errors } = cleanSpec(dojo);
  assert.deepEqual(errors, []);
  assert.deepEqual(spec.providers, DEFAULT_PROVIDERS);    // Dojo has no providers block → safe defaults
  const withPick = cleanSpec({ ...dojo, providers: { database: 'supabase-postgres' } });
  assert.equal(withPick.spec.providers.database, 'supabase-postgres');
});

test('the AI grounding catalog exposes the provider choices', () => {
  const cat = buildCatalog(dojo);
  assert.equal(cat.providers.length, CAPABILITIES.length);
  const db = cat.providers.find(p => p.capability === 'database');
  assert.ok(db.options.some(o => o.id === 'supabase-postgres'));
  assert.equal(db.default, 'firebase-firestore');
});
