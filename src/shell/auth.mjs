// src/shell/auth.mjs — the auth (RBAC) config validator. Bounds the role set, capability map,
// signup, and grant policy so the rules generator and gating helpers key off trusted data. Pure.
// `owner` is guaranteed to exist (it's the bootstrap/privileged role). See docs/MODULE_RBAC.md.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isBool = v => typeof v === 'boolean';
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const MAX_ROLES = 30, MAX_CAPS = 100, MAX_PROFILE = 60;

function cleanRole(r) {
  if (!isObj(r) || !SLUG.test(r.id || '')) return null;
  const out = { id: r.id };
  out.label = isStr(r.label) ? String(r.label).slice(0, 60) : r.id;
  if (typeof r.rank === 'number' && isFinite(r.rank)) out.rank = Math.max(0, Math.min(1000, Math.round(r.rank)));
  if (r.builtin === true) out.builtin = true;
  if (r.default === true) out.default = true;
  return out;
}

export function cleanAuth(auth) {
  const a = isObj(auth) ? auth : {};
  const out = {};
  out.provider = a.provider === 'firebase' ? 'firebase' : 'firebase';   // only firebase for v0

  // Roles — dedup by id, cap, and guarantee `owner` exists (rank 100).
  const seen = {};
  const roles = (Array.isArray(a.roles) ? a.roles : []).map(cleanRole).filter(Boolean)
    .filter(r => (seen[r.id] ? false : (seen[r.id] = true)))
    .slice(0, MAX_ROLES);
  if (!roles.some(r => r.id === 'owner')) roles.unshift({ id: 'owner', label: 'Owner', rank: 100, builtin: true });
  out.roles = roles;
  const roleIds = {}; roles.forEach(r => { roleIds[r.id] = 1; });

  // Capabilities — a map of KNOWN role → list of capability strings.
  if (isObj(a.capabilities)) {
    const caps = {};
    Object.keys(a.capabilities).forEach(rid => {
      if (!roleIds[rid]) return;                              // only known roles
      const v = a.capabilities[rid];
      if (Array.isArray(v)) caps[rid] = v.filter(isStr).slice(0, MAX_CAPS);
    });
    if (Object.keys(caps).length) out.capabilities = caps;
  }

  // Signup — defaultRole must be a known role.
  const su = isObj(a.signup) ? a.signup : {};
  out.signup = { open: !!su.open, invite: su.invite !== false };
  out.signup.defaultRole = (isStr(su.defaultRole) && roleIds[su.defaultRole]) ? su.defaultRole
    : (roles.find(r => r.default) ? roles.find(r => r.default).id : 'member');

  // Grant policy — granter must be a known role; flags are booleans (default the safe values).
  const g = isObj(a.grant) ? a.grant : {};
  out.grant = {
    granter: (isStr(g.granter) && roleIds[g.granter]) ? g.granter : 'owner',
    audit: g.audit !== false,
    guardLastOwner: g.guardLastOwner !== false,
    revokeOnDowngrade: g.revokeOnDowngrade !== false
  };

  if (Array.isArray(a.profileFields)) out.profileFields = a.profileFields.filter(isStr).slice(0, MAX_PROFILE);
  return out;
}
