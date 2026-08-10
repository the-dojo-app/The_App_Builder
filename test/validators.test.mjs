// test/validators.test.mjs — the remaining validators that complete cleanSpec:
// cleanDataModel (bounded field types), cleanAuth (roles/caps/signup/grant), and the
// progression module's real config validator. Plus: the Dojo spec still validates clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanDataModel, cleanDataModels } from '../src/shell/data-model.mjs';
import { cleanAuth } from '../src/shell/auth.mjs';
import { cleanProgressionConfig } from '../src/modules/progression.mjs';
import { cleanSpec } from '../src/assembler.mjs';

const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));

test('cleanDataModel: bad id dropped; unknown type/owner/access → safe defaults', () => {
  assert.equal(cleanDataModel({ fields: [] }), null);                 // no id → dropped
  const m = cleanDataModel({ id: 'x', owner: 'martians', access: 'whatever', fields: [
    { id: 'n', type: 'number', min: 0, max: 10 },
    { id: 'weird', type: 'quantum' },        // unknown → text
    { id: '3bad' },                          // bad id → dropped
    { id: 'r', type: 'ref', ref: 'methods' }
  ] });
  assert.equal(m.owner, 'app');              // default
  assert.equal(m.access, 'admin-read');      // default
  assert.deepEqual(m.fields.map(f => f.id), ['n', 'weird', 'r']);
  assert.equal(m.fields[1].type, 'text');    // quantum → text
  assert.equal(m.fields[0].max, 10);
  assert.equal(m.fields[2].ref, 'methods');
});

test('cleanAuth: owner guaranteed, roles deduped, unknown-role caps dropped', () => {
  const a = cleanAuth({ roles: [{ id: 'admin', rank: 80 }, { id: 'admin', rank: 80 }], capabilities: { admin: ['manage-content'], ghost: ['*'] } });
  assert.ok(a.roles.some(r => r.id === 'owner'));         // added
  assert.equal(a.roles.filter(r => r.id === 'admin').length, 1);  // deduped
  assert.deepEqual(a.capabilities.admin, ['manage-content']);
  assert.equal(a.capabilities.ghost, undefined);          // unknown role dropped
});

test('cleanAuth: signup defaultRole + grant.granter must be known roles', () => {
  const a = cleanAuth({ roles: [{ id: 'member', default: true }], signup: { defaultRole: 'nope' }, grant: { granter: 'nobody' } });
  assert.equal(a.signup.defaultRole, 'member');   // falls back to the default role
  assert.equal(a.grant.granter, 'owner');         // unknown → owner
  assert.equal(a.grant.guardLastOwner, true);
});

test('cleanProgressionConfig: units/tracks/viz bounded, retroactive defaults false', () => {
  const c = cleanProgressionConfig({ units: ['A', 'B', 3, null], badgesPerUnit: 999, viz: 'hologram', appMechanics: ['wing-time', 'bad id!'], tracks: [{ id: 'nf', label: 'NF', default: true }, { label: 'no-id' }] });
  assert.deepEqual(c.units, ['A', 'B']);
  assert.equal(c.badgesPerUnit, 32);       // clamped
  assert.equal(c.viz, undefined);          // not whitelisted
  assert.deepEqual(c.appMechanics, ['wing-time']);
  assert.equal(c.tracks.length, 1);
  assert.equal(c.retroactive, false);
});

test('cleanSpec now applies all validators — the Dojo spec still validates clean', () => {
  const { spec, errors } = cleanSpec(dojoSpec);
  assert.deepEqual(errors, []);
  assert.ok(spec.auth.roles.some(r => r.id === 'owner'));
  assert.equal(spec.dataModels.length, 2);
  assert.equal(spec.dataModels[0].fields[0].id, 'score');
  const prog = spec.modules.find(m => m.type === 'progression');
  assert.equal(prog.config.units.length, 8);
  assert.equal(prog.config.retroactive, false);
});
