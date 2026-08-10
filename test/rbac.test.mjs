// test/rbac.test.mjs — the RBAC decision logic: granter permission, last-owner guard,
// token-revoke-on-downgrade, and roster drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canGrant, planRoleChange, buildRoster } from '../src/modules/rbac.mjs';
import { cleanAuth } from '../src/shell/auth.mjs';

const auth = cleanAuth({
  roles: [{ id: 'owner', rank: 100 }, { id: 'admin', rank: 80 }, { id: 'coach', rank: 40 }, { id: 'member', rank: 0, default: true }],
  grant: { granter: 'owner', audit: true, guardLastOwner: true, revokeOnDowngrade: true }
});
const ctx = { now: 1000 };

test('only the granter (or an owner) may grant roles', () => {
  assert.equal(canGrant('owner', auth), true);
  assert.equal(canGrant('admin', auth), false);
});

test('a non-granter is refused', () => {
  const r = planRoleChange({ actorRole: 'admin', targetUid: 'u1', targetCurrentRole: 'member', newRole: 'coach' }, auth, ctx);
  assert.equal(r.ok, false);
  assert.match(r.error, /not permitted/);
});

test('unknown target role is refused', () => {
  const r = planRoleChange({ actorRole: 'owner', targetUid: 'u1', newRole: 'wizard' }, auth, ctx);
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown role/);
});

test('a promotion succeeds and does NOT revoke the token', () => {
  const r = planRoleChange({ actorRole: 'owner', targetUid: 'u1', targetCurrentRole: 'member', newRole: 'admin', ownerCount: 1 }, auth, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.downgrade, false);
  assert.equal(r.revokeToken, false);
  assert.deepEqual(r.change, { uid: 'u1', from: 'member', to: 'admin' });
  assert.equal(r.audit.at, 1000);
});

test('a downgrade succeeds and REVOKES the token', () => {
  const r = planRoleChange({ actorRole: 'owner', targetUid: 'u1', targetCurrentRole: 'admin', newRole: 'member', ownerCount: 2 }, auth, ctx);
  assert.equal(r.ok, true);
  assert.equal(r.downgrade, true);
  assert.equal(r.revokeToken, true);
});

test('LAST-OWNER GUARD: cannot remove the final owner', () => {
  const sole = planRoleChange({ actorRole: 'owner', targetUid: 'o1', targetCurrentRole: 'owner', newRole: 'admin', ownerCount: 1 }, auth, ctx);
  assert.equal(sole.ok, false);
  assert.match(sole.error, /last owner/);
  const notSole = planRoleChange({ actorRole: 'owner', targetUid: 'o1', targetCurrentRole: 'owner', newRole: 'admin', ownerCount: 2 }, auth, ctx);
  assert.equal(notSole.ok, true);   // fine when another owner exists
});

test('roster groups by role and flags claim-vs-mirror drift', () => {
  const r = buildRoster([
    { uid: 'a', claimRole: 'admin', mirrorRole: 'admin' },
    { uid: 'b', claimRole: 'coach', mirrorRole: 'member' },   // drift
    { uid: 'c', claimRole: 'admin', mirrorRole: 'admin' }
  ], auth);
  assert.deepEqual(r.byRole.admin.sort(), ['a', 'c']);
  assert.deepEqual(r.byRole.coach, ['b']);
  assert.equal(r.drift.length, 1);
  assert.deepEqual(r.drift[0], { uid: 'b', claim: 'coach', mirror: 'member' });
});
