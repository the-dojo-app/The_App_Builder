<!-- MODULE_RBAC.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Third capability-module spec (see PLATFORM.md / APP_SPEC.md). -->

# Module: rbac (roles & access) — schema v0, DRAFT

**Status: PROPOSED / DRAFT, 2026-08-10.** The **third module**, completing the first vertical
slice — **content + progress + access** — enough to assemble a whole app. RBAC is the *most*
general of the three: the Dojo's roles system is already almost entirely shell, so the harvest is
mostly "lift as-is, make the **role set** config." The one genuinely new and important piece is
the **assembler interface**: RBAC config + each `dataModel`'s access → **generated Firestore
security rules**. Design-first: no extraction code until sign-off.

**What it proves:** the trivial-but-load-bearing end of the generic-enough test — a feature that
passes almost verbatim, where "generalize" means *parameterize the one hardcoded list* (the roles)
and expose a clean interface (rules generation) the rest of the platform already needs.

---

## 1. The general capability

> **Role-based access control:** an app-defined set of **roles** (with a privileged **owner**
> always present), assigned via auth **custom claims**, gating pages, actions, and data — with an
> admin **roster + granting UI**, an **audit trail**, a **last-owner guard**, and **token
> revocation on downgrade**.

Every multi-user app needs exactly this. The Dojo's owner / admin / coach / beta / member is one
role set.

## 2. Generic-enough analysis (the harvest)

Against today's roles system (`functions/lib/{adminRoles,roles}.js`; the ROLES & ACCESS panel in
`Admin_Members.html`; `dojo-nav.js` v9 role-gated menu; `staffRole` custom claim):

| Part today | Verdict | Becomes |
|---|---|---|
| `adminSetRole` — owner-gated grant/revoke, **audits**, **guards last owner**, **revokes tokens on downgrade** | **general** | the module's grant callable |
| `adminListStaff` — roster + **claim-vs-mirror drift** flag | **general** | the roster surface |
| `staffRole` custom claim + a mirror field on the member doc (queryable) | **general** | the claim/mirror model |
| Page/nav gating by role (`getIdTokenResult`, `dojo-nav.js` v9 injection) | **general** | the gating helpers + config-driven menu injection |
| Audit via `logAdminAction`, token revocation | **general** | reused verbatim |
| The role **names** owner/admin/coach/beta/member + their ranks | **Dojo config** | the `auth.roles` list |
| Which pages/actions each role reaches | **Dojo config** | `page.audience` + `auth.capabilities` |
| Firestore rules (owner-only `/sessions`, admin reads, etc.) | **general via generation** | **generated** from `dataModel.access` + roles (§5) |
| The legacy `isAdmin` bridge → `admin` (not `owner`) | **Dojo migration cruft** | dropped; clone-first starts clean |

**Almost everything is shell already.** The only "domain" is the role *list* and the per-app
access decisions — both config.

## 3. Module config (the App Spec `auth` block)

`auth` in the Spec **is** the RBAC module's config (per `APP_SPEC.md`):

```jsonc
"auth": {
  "provider": "firebase",
  "roles": [
    { "id":"owner",  "label":"Owner",       "rank":100, "builtin":true },   // always exists
    { "id":"admin",  "label":"Admin",       "rank":80 },
    { "id":"coach",  "label":"Coach",       "rank":40 },
    { "id":"beta",   "label":"Beta tester", "rank":20 },
    { "id":"member", "label":"Member",      "rank":0, "default":true }       // signed-in default
  ],
  "capabilities": {                       // optional fine-grain; absent → rank-based
    "owner": ["*"],
    "admin": ["manage-content","review-evidence","grant-roles"]
  },
  "signup": { "open":false, "invite":true, "defaultRole":"member" },
  "grant":  { "granter":"owner", "audit":true, "guardLastOwner":true, "revokeOnDowngrade":true },
  "profileFields": [ "name","nickname","avatar","… " ]     // the member model shape
}
```

Reskin = change the `roles` list + capabilities. The grant flow, roster, audit, and rules
generation are untouched.

## 4. What the module provides (surfaces + helpers)

| Piece | Harvested from | Generalization |
|---|---|---|
| **Grant / revoke** callable | `adminSetRole` | role set from `auth.roles`; `granter`/guards from `auth.grant` |
| **Roster** (admin) | `adminListStaff` + ROLES & ACCESS panel | lists holders per role; claim-vs-mirror drift flag |
| **Claim + mirror** | `staffRole` + member-doc mirror | generic `role` claim + mirror for queryability |
| **Gating helpers** (shell-wide) | `getIdTokenResult` reads, page gates | `page.audience` resolution: `public · members · role:<id> · staff:<roles> · belt:<unit>` |
| **Menu injection by role** | `dojo-nav.js` v9 | role-gated menu groups from config |
| **Rules generation** | today's hand-written `firestore.rules` | **generated** (§5) — the key new piece |
| **Bootstrap** | first-owner mint (out-of-band today) | the **setup wizard** mints the first owner in clone-first (§6) |

## 5. The assembler interface — generated security rules (the important new piece)

Today `firestore.rules` is hand-written. In the platform, the **assembler generates** rules
deterministically from two inputs it already has:

1. each `dataModel`'s `owner` / `access` (from `APP_SPEC.md` §2), and
2. the `auth.roles` / `capabilities`.

```
dataModel { owner:"member", access:"owner-read" }   → allow read: request.auth.uid == resource.data.uid;
dataModel { access:"admin-read" }                   → allow read: hasRole(['admin','owner']);
dataModel { access:"public" }                       → allow read: request.auth != null;
authoring (write) on a content/config model         → allow write: hasCapability('manage-content');
config/{doc}/history                                → create-only (the existing append-only pattern)
```

`hasRole()` / `hasCapability()` are emitted helper functions reading the claim. This makes access
**a property of the Spec**, not hand-maintained per app — and it's the same generator both the
clone export and (later) hosted tenancy use. A `cleanAuth` validator bounds the role/capability
config before generation.

## 6. Bootstrap (clone-first)

The first `owner` claim can't be granted through the UI (grant is owner-gated). In clone-first, the
**setup wizard** mints it: on first deploy, the owner authenticates and the wizard sets their
`owner` claim once (a one-time provisioning callable or a documented CLI step). After that, the
in-app grant flow takes over. (This replaces today's out-of-band mint + the `isAdmin` bridge.)

## 7. Interfaces with the other modules

- **content-library:** authoring gated by `capability:manage-content`; the catalogue/reader
  audiences resolved by RBAC.
- **progression:** `page.audience: belt:<unit>` → RBAC asks progression for the member's current
  unit (the standing interface) to resolve the gate. RBAC owns audience *resolution*; progression
  owns *standing*.
- **assembler:** consumes `auth` + all `dataModels` to emit rules (§5) — RBAC's biggest role in the
  platform.

## 8. The Dojo, re-expressed (reference-app proof)

Owner / admin / coach / beta / member become the `auth.roles` list; the grant UI, roster, audit,
nav gating, and drift detection are unchanged; the hand-written rules become generated ones that
match today's access. Members and admins see zero change — the roles system was already general;
we just stopped hardcoding the list and started generating the rules.

## 9. Open questions

1. **Capability granularity in v0:** ship rank-based gating only (simple), or the optional
   `capabilities` map too? (Leaning: support both; default rank-based, capabilities when present.)
2. **Rules-generation coverage:** does the generator cover *all* collections in v0, or leave an
   `extraRules` escape hatch for hand-written edge cases? (Leaning: generate the common shapes +
   an `extraRules` append slot, validated, for the rare bespoke rule.)
3. **Audience ↔ progression coupling:** confirm RBAC resolving `belt:<unit>` via the progression
   standing interface (vs. progression owning audience). (Leaning: RBAC resolves, progression
   answers.)
4. **Member model ownership:** `profileFields` lives under `auth` here; if a future "profiles"
   module wants it, move it there. (Leaning: keep under `auth` until a profiles module exists.)
