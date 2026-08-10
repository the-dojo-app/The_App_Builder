<!-- ASSEMBLER.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. The spec→app engine (see PLATFORM.md / APP_SPEC.md). -->

# The Assembler — spec → running app (v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The piece every other doc converges on: the
deterministic engine that turns an **App Spec** into a live app. It is the *render* half of the
platform's core principle — **the AI proposes (writes the Spec); the assembler disposes
(validates + applies it)** — and it introduces **no new trust surface**: it writes only through
the validated callables/patterns the Design Center and Live Builder already use. Design-first: no
code until sign-off.

Drafted on the recommended defaults (bounded field types, reskin-first concepts, fresh repo).

---

## 1. What it is

`assemble(spec)` maps a **validated** Spec to the app's live configuration: the `config/*` docs,
the page registry, the module configs, and the generated security rules. It is **pure and
deterministic** — same Spec ⇒ same result — so it is safe to re-run, diff, preview, and roll back.

Two functions, cleanly split:
- **`cleanSpec(spec)`** — validate/clamp (composes the validators the shell already has). §4.
- **`assemble(spec) → Plan` + `apply(Plan)`** — compute a typed change plan, then execute it. §3.

## 2. Two paths — runtime config vs deploy artifacts (the key split)

Most of a Spec is **runtime config** that reaches every device instantly with **no redeploy** —
that is the whole point of the config-driven shell. A small residue needs a **deploy**. The
assembler must route each part correctly:

| Path | What | How it applies | Examples |
|---|---|---|---|
| **Runtime** (live, no redeploy) | theme, pages, module configs, rules-*docs*, labels, notifications, branding | written to `config/*` Firestore docs via callables; `theme.js`/`dojo-*.js` apply on load; JSONP for pre-auth | `config/appTheme`, `config/pages`, `config/<module>`, `config/badgeLabels` |
| **Deploy** (needs a ship) | the generated **`firestore.rules`** file, PWA identity (manifest/install icons), `firebaseConfig` | written to repo files → `firebase deploy` (the setup wizard / CLI runs it in clone-first) | `firestore.rules`, `manifest.json` |

This split is a feature: **95% of building an app is runtime** (instant, reversible); only access
rules + install identity touch a deploy. It also mirrors the existing `sync-belt-engine.js`
predeploy-generator pattern for the deploy-path artifacts.

## 3. Plan / Apply split (Terraform-style)

`assemble(spec)` returns a **Plan** — an ordered list of typed operations — *without writing
anything*. `apply(plan)` executes it. This buys three things for free:

- **Dry-run preview:** the AI intake shows the owner *"here's what I'll build/change"* before a
  single write — the same UX as the belt/required impact previews, generalized to the whole app.
- **Determinism + testability:** a Plan is diffable; identical Spec ⇒ identical Plan.
- **Idempotency:** `apply` diffs each op against current state and writes only real changes;
  re-applying an unchanged Spec is a no-op.

```
Op = writeConfig(doc, value)         // runtime
   | registerPages(registry)         // runtime
   | genRulesFile(rulesText)         // deploy artifact
   | writeIdentity(manifest, icons)  // deploy artifact
   | snapshotSpec(version)           // history/rollback
```

## 4. `cleanSpec` — the safety guarantee

`cleanSpec` is a pure server-side function that **composes validators the shell already has**,
plus a few small new ones. Anything outside the envelope is dropped/clamped — an AI-authored Spec
passes through this before `assemble` can touch it, so the model's output is *proposed, never
trusted*:

| Spec section | Validator | Status |
|---|---|---|
| `theme` | `cleanTheme` (+ `colorLight`, per this session) | **exists** |
| `pages[].blocks` | `cleanBlockTree` | **exists** |
| `notifications`, `branding` | existing config cleaners | **exists** |
| `auth` | `cleanAuth` (roles/capabilities bounded) | new, small |
| `dataModels` | `cleanDataModel` (bounded field types) | new |
| `modules[].config` | per-module `cleanConfig` | new per module |
| progression rules | `cleanRules` → per-mechanic `cleanMechanic` | new (from MODULE_PROGRESSION) |
| `concepts`, `integrations` | `cleanConcepts`, `cleanIntegrations` (keyRefs only, no literals) | new, tiny |

## 5. The assemble pipeline (ordered — dependencies matter)

Modules depend on each other, so `assemble` resolves a fixed order:

1. **`cleanSpec`** — reject/clamp. Stop on fatal (e.g. contrast floor, per `cleanTheme`).
2. **concepts** — resolve the vocabulary (labels other stages read).
3. **dataModels** — merge `spec.dataModels` with the models each **module declares it needs**
   (per APP_SPEC open-Q: modules declare, assembler merges).
4. **modules** — each module's `cleanConfig` → its `config/*` doc op; wire inter-module interfaces
   (content-library completion ↔ progression `required-content`).
5. **auth** — resolve roles/capabilities (needed by rules).
6. **theme / notifications / branding** — config-doc ops.
7. **pages / nav** — `config/pages` registry + block trees; nav derived from `pages[].nav`.
8. **rules generation** — from dataModels + auth (§ MODULE_RBAC.md §5) → a `firestore.rules` file op.
9. **identity** — manifest/branding install artifacts (deploy path).
10. **snapshot** — the whole Spec → `config/appSpec/history` (append-only, rollback).

Output: a Plan. Nothing has been written yet.

## 6. Output targets (spec → where it lands)

| Spec section | Target | Path |
|---|---|---|
| `theme` | `config/appTheme` | runtime |
| `notifications` | `config/notifications` | runtime |
| `app.branding` | `config/branding` (+ JSONP) | runtime |
| `modules[content-library].config` | `config/contentLibrary` | runtime |
| `modules[progression]` rules / labels | `config/<progression>.rules` / `config/badgeLabels` | runtime |
| `modules[*].config` | `config/<module>` | runtime |
| `pages` / `nav` | `config/pages` | runtime |
| `dataModels` + `auth` | **`firestore.rules`** (generated) | **deploy** |
| `app` identity | `manifest.json` / install icons | **deploy** |
| whole Spec | `config/appSpec/history/<version>` | runtime |

## 7. dataModels & "provisioning" (the schemaless reality)

Firestore is schemaless — there is **no DDL, no migration**. A `dataModel` therefore does not
*create* anything physically; it **drives four things**:
1. **Rules generation** (§8) — `owner`/`access` → security rules.
2. **Admin authoring forms** — field list → the module's editor UI.
3. **AI content generation** — the field schema bounds what the intake can generate/seed.
4. **Optional seed docs** — starter content, if the Spec provides it.

This is a strength: adding or changing a model is a config edit + a rules redeploy, never a migration.

## 8. Rules generation (the RBAC interface, deterministic)

Per `MODULE_RBAC.md §5`, the assembler emits `firestore.rules` deterministically from each
`dataModel.access` + `auth` (with `hasRole()`/`hasCapability()` helpers). An `extraRules` slot
(validated, appended) covers the rare bespoke rule. Because it is generated, **access is a
property of the Spec, not hand-maintained** — and the same generator serves the clone export today
and hosted tenancy later. It is the one part of `assemble` whose output is a **deploy artifact**,
not a live write.

## 9. Where it runs

- **`applySpec` callable** (runtime path) — admin-gated, audited, writes the `config/*` docs +
  history snapshot. Same trust surface as `setAppTheme`/`setPageContent`; reuses their validators.
- **`gen-rules.js` build script** (deploy path) — a repo generator (like `sync-belt-engine.js`)
  wired into predeploy; emits `firestore.rules` from the current Spec and fails the deploy if the
  committed rules drift from the Spec.
- **The setup wizard** (clone-first) orchestrates first run: mint the owner claim, run `applySpec`,
  run `gen-rules.js` + `firebase deploy`. After that, day-to-day edits are pure runtime `applySpec`.

## 10. Versioning · diff · rollback

The whole Spec snapshots to `config/appSpec/history` on every `apply` (the existing append-only +
one-click-restore pattern). Rollback = `assemble` an older Spec version and `apply` its Plan. A
Plan diff between two Spec versions is the human-readable "what changed" — reused for both the
intake preview and an audit view.

## 11. Safety — no new trust surface

- The AI's Spec passes `cleanSpec` before anything runs; nothing in a Spec is executable.
- `assemble` writes only through existing validated callables + the deterministic rules generator.
- Plan/apply + history + rollback make every change previewable and reversible.
- `integrations` hold **keyRefs, never literal secrets**, so a Spec is safe to export/share.

## 12. The Dojo assembled (proof)

The acceptance test for v0: **`assemble(dojoSpec)` reproduces the Dojo's current live config
byte-for-byte** — `config/appTheme`, `config/beltRules`, `config/badgeLabels`,
`config/notifications`, `config/pages`, and a `firestore.rules` equivalent to today's. If the
assembled Dojo is indistinguishable from the hand-built one, the Spec + assembler are faithful and
every *other* app is just a different Spec through the same engine.

## 13. Open questions

1. **Plan granularity:** op-per-config-doc (simple) vs field-level diffs (richer preview)?
   (Leaning: op-per-doc in v0, with a value-diff shown in the preview.)
2. **Rules drift policy:** does `gen-rules.js --check` *block* deploy on drift (like the belt-engine
   guard) or auto-regenerate? (Leaning: block — the human commits the regenerated file.)
3. **Partial apply:** can an owner apply just the theme (runtime) without touching rules (deploy)?
   (Leaning: yes — the Plan is filterable by path; runtime-only applies never need a deploy.)
4. **Seed data ownership:** does the assembler seed starter content, or is that the intake/wizard's
   job feeding the Spec? (Leaning: Spec carries optional seeds; assembler writes them idempotently.)
5. **Spec storage:** the live Spec lives at `config/appSpec` (current) with `history/*` versions —
   confirm one canonical home, mirrored to a repo file for export.
