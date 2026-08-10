<!-- PLATFORM.md · v1 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Design-first, per the AI_BUILDER.md / LIVE_BUILDER.md discipline. -->

# The Platform — turning the Dojo shell into an app-builder

**Status: PROPOSED / DRAFT, 2026-08-10. No platform code ships until Will signs off**
(same design-first discipline as `AI_BUILDER.md` and `LIVE_BUILDER.md`). This file is
the strategy source of truth; `APP_SPEC.md` is the companion schema.

**Decided so far (Will, 2026-08-10):**
- The SFS Dojo app is being **shelved for now**; we pivot to developing the underlying
  builder as a **separate product**.
- Distribution is **clone-first** (each owner deploys their own copy, own Firebase, own
  API key). Hosted multi-tenant SaaS is a possible *later* layer, not a prerequisite —
  see §7. Building clone-first keeps the ops weight off until the core is proven.

**Guiding principle (Will, 2026-08-10): reuse everything that can be reused — but only where
we can make it genuinely GENERIC.** Prefer harvesting existing shell code over rebuilding it;
never force a Dojo-specific thing into a "module" it can't honestly generalize into. Each piece
faces the **generic-enough test** (Appendix A): does it read concepts/config rather than hardcode
Dojo vocabulary? does it avoid rules unique to the Dojo? would at least one other plausible app
use it as-is? Pass → it's **shell** (reuse verbatim). Fail but the *capability* is general →
**module** (generalize it). Fail and irreducibly Dojo → it stays **domain data** in the Dojo's
Spec only, not in the platform.

---

## 1. The thesis (one line)

> We already built the runtime for a no-code app platform. It is currently hosting exactly
> **one hardcoded app** (the Dojo). The work is to make that app **data instead of code** —
> a declarative **App Spec** — so a *new* app is a *new spec*, authored by an AI interview,
> rendered by the shell we already have.

Three moving parts, and we have most of two of them:

| Part | State | Where |
|---|---|---|
| **A runtime** that renders an app | ~70% built | Design Center + Live Builder + config-driven shell |
| **An App Spec** the runtime reads | to define | `APP_SPEC.md` (this proposal) |
| **An AI author** that writes the Spec | specced for pages | extend `AI_BUILDER.md` from page → app |

## 2. What already exists (the foundation — do NOT rebuild)

The pivot is cheap precisely because the hard, design-heavy parts are done and shipped:

| Primitive | Already built | Role in the platform |
|---|---|---|
| **Theming engine** | Design Center: colours (+ per-mode light/dark), type, shape, per-element `--el-*` tokens, Looks library, live-apply via `theme.js` | a Spec's `theme` block, applied with no redeploy |
| **Live page builder** | `dojo-builder.js` + `setPageContent`/`cleanBlockTree`, render runtime, member-safe computed blocks | a Spec's `pages` (block trees), created/edited live |
| **Config → live, no redeploy** | callables write `config/*`; `theme.js`/`dojo-*.js` apply on load; JSONP pre-auth channel | how a Spec reaches every device instantly |
| **Server-side validation** | `cleanTheme`/`cleanElement`/`cleanBlockTree` clamp every field — the model can't emit arbitrary HTML/JS | the safety model that makes "AI builds it" safe (§6) |
| **Versioned config + rollback** | `config/{doc}/history` append-only + history UI | Spec versioning + one-click undo, for free |
| **Auth + RBAC** | Firebase Auth, `staffRole` custom claims, owner/admin/member gating, `adminSetRole` | a Spec's `auth`/`roles` (the RBAC module) |
| **Branding / app identity** | `config/branding` + JSONP, `firebaseConfig` extracted to one module, app-name partially factored | already most of the "reskin" layer |
| **AI assistant plumbing** | `adminAssistant` callable | the substrate for the intake interview |

**The platform adds two axes the shell doesn't yet generalize: DATA and LOGIC.** Everything
else is reskinning + composition, which the shell already does.

## 3. The dividing line: Shell vs Domain

Every file in the repo is one of two things. Naming the line *is* the foundational task.

- **SHELL (reusable, ships in every clone):** auth, theming, page-builder, nav, notifications,
  roles, branding, config/rollback machinery, the AI intake, the App-Spec runtime.
- **DOMAIN (Dojo-only, must become configured data):** belts/badges + the belt engine,
  methods schema, Muse/Calm-Score, curriculum, exams/evidence review.

Making a template = the domain stops being hardcoded and becomes:
1. **Concept vocabulary** — the words (`belt` → `level`, `method` → `lesson`, `member`), config
   not code. See `concepts` in `APP_SPEC.md`.
2. **Capability modules** — the *behaviour* (progression, content library, review workflow),
   general and reused (§5).
3. **Data models** — the *collections* an app needs, declared and validated, not hand-wired.

Concrete debt to clear in Phase 0: the ~12 `BELTS` array copies, domain collections
referenced directly in page code, and any remaining hardcoded app identity, all move behind
a module/config boundary. (`firebaseConfig` and branding are already done — the pattern works.)

## 4. The App Spec (the unifier)

A single declarative JSON document describes an entire app: identity, concepts, theme, auth,
data models, modules, pages, nav, notifications, integrations. See **`APP_SPEC.md`** for the
schema. It is the artifact that:
- the **AI intake writes**,
- a deterministic **assembler renders** into the individual `config/*` docs + collection
  provisioning + security rules,
- **rollback versions**, and
- an owner **exports/takes with them**.

Principle: **the AI decides *what* (writes the Spec); deterministic, validated code decides
*how* (assembles it).** Same split as the workflow engine — model proposes, safe code disposes.

## 5. Capability modules — the library

The frontier no-code tools die on is data + logic. We do **not** let the AI generate arbitrary
backend. Instead: a library of **vetted, config-driven modules** the AI *assembles and
configures*, each filling a validated schema. The Dojo is **reference app #1** — we harvest its
features into general modules, then rebuild the Dojo *from* them to prove the abstraction:

| Dojo feature | → General module | Recurs in |
|---|---|---|
| Belts/badges + engine | **Progression / gamification** | courses, fitness, loyalty, games |
| Methods + schema | **Content library** | almost everything |
| Muse screenshots + OCR | **Evidence upload + OCR** | claims, verification, receipts |
| Sessions | **Activity log** | habit/fitness/usage tracking |
| Community / DMs | **Social / messaging** | any community app |
| Exams / evidence review | **Review & approval workflow** | submissions, moderation |
| Roles | **RBAC** | every app |
| (new) | Forms & intake, commerce/checkout, booking/scheduling, events, directory, leaderboard | breadth for "most projects" |

Each module = shell code + a config schema + (optionally) member-safe callables, exactly like
today's `builderStat`/`builderChart`/`builderVote` pattern.

## 6. The AI intake — interview → Spec

The "gather everything and build it" experience, staged from `AI_BUILDER.md`'s Creator Wizard
(page-scope) up to **app-scope**:

- An **interview** (plain questions, no jargon) elicits: who it's for, what it does, the look,
  the key objects/data, the must-have features. Output = a **machine-readable App Spec**, not
  prose.
- The AI **fills validated schemas** — theme fields, module configs, data-model fields, page
  block trees — every one passing `cleanSpec` (mirrors `cleanTheme`/`cleanBlockTree`). It can
  never emit raw code or unbounded output.
- **BYO API key:** the owner supplies their own Anthropic/other key (we help with setup). The
  key lives in their deploy; usage is theirs.
- **Three tiers, no wall:** (1) zero-config — ~8 questions → a working app; (2) guided wizard —
  pages/sections/content; (3) power-user — full Design Center + Inspector.

## 7. Distribution — clone-first (decided), SaaS-later

- **Clone-and-own (now):** ship a **starter kit + setup wizard**. The owner deploys their own
  Firebase, adds their API key, runs the intake. Low ongoing ops for us; the setup/onboarding
  help is the service. The Spec makes a clone reproducible.
- **Hosted multi-tenant SaaS (later, optional):** the *same runtime + same Spec*, many specs as
  tenants. Adds tenant isolation (data + rules + config namespacing) and billing — real work,
  deferred until the core is proven. Because both consume one Spec, this is a **layer, not a
  fork**: an export path turns a hosted tenant into a self-hosted clone and vice-versa.

## 8. Phased roadmap

- **Phase 0 — Extract the shell.** Finish the shell/domain split; harvest 2–3 Dojo features into
  general modules (start: content-library ← methods, progression ← belts, RBAC ← roles); put
  domain collections behind a module boundary; namespace config under an app id. *Deliverable:
  the Dojo runs unchanged, but as "app #1" assembled from modules + config — proof it's now
  data-driven.*
- **Phase 1 — App Spec + assembler.** Freeze the Spec schema; build the deterministic
  spec → config assembler + `cleanSpec` validator. The Dojo's Spec is the first. A new app = a
  new Spec.
- **Phase 2 — AI intake.** Interview → Spec (BYO key), reusing the validate-the-model discipline.
  Ship the zero-config tier.
- **Phase 3 — Module breadth.** Grow toward "most projects": content, membership, commerce,
  booking, forms, leaderboard, messaging, events, directory, reviews.
- **Phase 4 — Setup wizard + export polish** (clone), then optionally **hosted multi-tenancy**.

## 9. Open decisions (need Will)

1. **Concept-model depth (Phase 0/1):** does the first Spec abstract the Dojo *just enough to
   reskin* (belts→levels), or a fuller generic concept-model? Sets how ambitious the schema is.
2. **Where the new product lives:** new repo vs a branch/extraction of this one. (Recommend a
   fresh repo seeded from the extracted shell, so the Dojo stays a clean reference app.)
3. **Module priority order** for Phase 3 (which verticals to target first — informs which
   modules matter).
4. **Data-model ceiling:** how general do arbitrary data models get in v1 — a fixed set of
   field types + relations, or open-ended? (Recommend a bounded field-type set first.)

## 10. Related docs / reading order

1. `PLATFORM.md` (this) — strategy + roadmap
2. `APP_SPEC.md` — the Spec schema (the core artifact)
3. `AI_BUILDER.md` — the Creator Wizard (page-scope; the intake's front end)
4. `LIVE_BUILDER.md` — the shipped block-tree runtime + validation (the safety precedent)
5. `DESIGN-SYSTEM.md` — the token/theming language the Spec's `theme` speaks
6. `MODULE_CONTENT_LIBRARY.md` — the first capability-module spec (harvest pattern worked end to end)
7. `MODULE_PROGRESSION.md` — the second module (the belt engine → config-driven mechanic interpreter)
8. `MODULE_RBAC.md` — the third module (roles & access; the security-rules generator interface)
9. `ASSEMBLER.md` — the spec→app engine (cleanSpec + plan/apply; runtime-config vs deploy-artifact split)
10. `AI_INTAKE.md` — the interview→Spec front door (the app-scope superset of `AI_BUILDER.md`)

---

## Appendix A — Phase 0 extraction map (first cut)

Applying the generic-enough test to today's shared assets. **First pass — needs verification
per file and the §9 decisions; a piece only earns SHELL after it's confirmed to read config, not
hardcode Dojo vocabulary.**

### Shared JS/CSS

| Bucket | Assets | Note |
|---|---|---|
| **SHELL — reuse verbatim** | `theme.js`, `dojo-firebase.js`, `dojo-nav.js`/`dojo-nav-config.js`/`dojo-nav.css`, `dojo-topbar.js`/`.css`, `dojo-inspect.js`, `dojo-builder.js`, `dojo-transitions.js`/`.css`, `dojo-theme-color.js`, `dojo-voice.js`, `dojo-date.js`, `dojo-track.js`, `dojo-events.js`, `dojo-consolidate.js`, `dojo-admin-preview.js`, `dojo-palette.css`, `dojo-key.css`, `dojo-buttons.css`, `dojo-headings.css`, `dojo-menu-tiles.css` | the platform proper; mostly already config-driven |
| **SHELL — reuse after a generalize pass** | `dojo-upload.js` (generic upload; drop any session-shaped assumptions), `dojo-miniprofile.js`/`.css` (avatar/profile chip; `profileFields` → config), `dojo-nextaction.js` (next-action resolver; make module-driven, not belt-aware) | capability is general; scrub Dojo specifics |
| **DOMAIN → `progression`/gamification module** | `dojo-belts.js` (+ `functions/lib/beltEngine.mjs`), `dojo-belts-data.js`, `dojo-belts-attentional.js`, `beltRules.js`, `dojo-badge-labels.js`, `dojo-badge-orbit.js`/`.css` | belt engine → progression; badges/orbit → gamification viz (generalize N units × M badges) |
| **DOMAIN → `evidence-ocr` + `activity-log` modules** | `dojo-ocr.js`, `dojo-session.js` | OCR/evidence capture + session record; both general capabilities |

### Collections

| Bucket | Collections |
|---|---|
| **SHELL / generic** | `users` (→ member model + `profileFields` config), `config/*`, `auditLogs`, `connections` (→ social module), `videoJobs` (→ media module) |
| **DOMAIN → module-owned** | `sessions` (→ activity-log), `methods` (→ content-library), `trainingProgress` (→ progression), `beltExams` (→ review-workflow), `products` (→ commerce, largely generic) |

### First module to harvest (recommended)

Start with **content-library ← `methods`**: it's the most general (almost every app has content),
its schema/readers/writers are already documented (`METHODS-SCHEMA.md`), and it exercises the full
pipeline (data model + a module + generated pages) without the belt engine's rule complexity. Then
**progression ← belts** (the richest, most differentiated module), then **RBAC ← roles** (needed by
every app anyway).
