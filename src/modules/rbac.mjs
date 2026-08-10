// src/modules/rbac.mjs — the RBAC module's DECISION logic, generalized from the Dojo's adminSetRole
// / adminListStaff. Pure: these functions decide WHETHER and WHAT changes; the actual custom-claim
// write + token revocation happen via the injected executor (Firebase binds in later), same seam as
// applyPlan. See docs/MODULE_RBAC.md. `auth` is a cleaned auth block (roles, grant policy).

const isArr = Array.isArray;
const rankOf = (auth, roleId) => { const r = (isArr(auth.roles) ? auth.roles : []).find(x => x.id === roleId); return (r && typeof r.rank === 'number') ? r.rank : 0; };
const knownRole = (auth, roleId) => (isArr(auth.roles) ? auth.roles : []).some(x => x.id === roleId);
const refuse = error => ({ ok: false, error, change: null, revokeToken: false, audit: null });

// Only the configured granter (default owner) — or an owner — may change roles.
export function canGrant(actorRole, auth) {
  const granter = (auth && auth.grant && auth.grant.granter) || 'owner';
  return actorRole === granter || actorRole === 'owner';
}

// Decide a single role change. Enforces: granter permission, known target role, the LAST-OWNER
// GUARD (never strip the final owner), and TOKEN REVOCATION on a downgrade (rank drop). Returns a
// pure decision + an audit record; performs no writes.
export function planRoleChange(req, auth, ctx) {
  ctx = ctx || {}; req = req || {}; auth = auth || {};
  const { actorRole, targetUid, targetCurrentRole = null, newRole, ownerCount = 0 } = req;
  if (!canGrant(actorRole, auth)) return refuse('not permitted to grant roles');
  if (!targetUid) return refuse('target uid required');
  if (!knownRole(auth, newRole)) return refuse(`unknown role "${newRole}"`);

  const guard = !auth.grant || auth.grant.guardLastOwner !== false;
  if (guard && targetCurrentRole === 'owner' && newRole !== 'owner' && ownerCount <= 1) {
    return refuse('cannot remove the last owner');
  }
  if (targetCurrentRole === newRole) return refuse('no change');

  const downgrade = rankOf(auth, newRole) < rankOf(auth, targetCurrentRole);
  const revokeToken = downgrade && (!auth.grant || auth.grant.revokeOnDowngrade !== false);
  return {
    ok: true,
    change: { uid: targetUid, from: targetCurrentRole, to: newRole },
    downgrade,
    revokeToken,
    audit: { at: (ctx.now == null ? null : ctx.now), actor: actorRole, uid: targetUid, from: targetCurrentRole, to: newRole }
  };
}

// Build the staff roster grouped by role, and flag claim-vs-mirror DRIFT (the claim on the token
// disagreeing with the queryable mirror on the member doc — a sign a change didn't fully propagate).
// members: [ { uid, claimRole, mirrorRole } … ]
export function buildRoster(members, auth) {
  const byRole = {};
  (isArr(auth.roles) ? auth.roles : []).forEach(r => { byRole[r.id] = []; });
  const drift = [];
  (isArr(members) ? members : []).forEach(m => {
    if (!m || !m.uid) return;
    const claim = m.claimRole || null;
    if (claim && byRole[claim]) byRole[claim].push(m.uid);
    if (m.mirrorRole !== undefined && (m.mirrorRole || null) !== claim) drift.push({ uid: m.uid, claim, mirror: m.mirrorRole || null });
  });
  return { byRole, drift };
}
