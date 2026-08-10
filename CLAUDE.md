# The App Builder — assistant context

**Read this first.** A **clone-first, AI-driven app-builder platform**. Private repo:
`github.com/the-dojo-app/The_App_Builder`. Local: `~/The_App_Builder`. Working name; rebrandable.

This was extracted from **"The Dojo App"** (`~/The Dojo App`), which becomes **reference app #1**.
The Dojo was shelved 2026-08-10 to build its underlying builder as a separate product.

---

## 1. What it is (the thesis)

> We already have the runtime for a no-code app platform — it was hosting exactly one hardcoded
> app (the Dojo). The work is to make an app **data, not code**: a declarative **App Spec** (JSON).
> An **AI intake** writes the Spec; a deterministic **assembler** validates + renders it into a
> running app. **Safe by construction** — the AI only ever proposes Spec diffs inside a validated
> envelope (`cleanSpec`); nothing in a Spec is executable.

**The core principle, everywhere:** the model/author **proposes** (a Spec); validated code
**disposes** (validates, plans, applies). Same discipline the Dojo's Live Builder proved with
`cleanBlockTree`, generalized to the whole app.

## 2. Read next (`docs/` — the design-first source of truth)

1. `docs/PLATFORM.md` — strategy, the shell/domain line, the capability-module library, the roadmap
2. `docs/APP_SPEC.md` — the declarative App Spec schema (the core artifact)
3. `docs/MODULE_CONTENT_LIBRARY.md` · `docs/MODULE_PROGRESSION.md` · `docs/MODULE_RBAC.md`
4. `docs/ASSEMBLER.md` — the spec→app engine (cleanSpec + plan/apply, runtime-config vs deploy-artifact)
5. `docs/AI_INTAKE.md` — the interview→Spec front door

**Design-first discipline:** no substantial feature ships without its doc. Update the doc, match the
existing module/validator style.

## 3. Stack & non-negotiable conventions

- **Plain Node, ESM (`.mjs`), ZERO runtime dependencies.** Tests: `npm test` (`node --test`).
- **Pure + deterministic.** No wall-clock reads in the engine — the clock is injected via `ctx.now`.
  Missing block ids are deterministic (`b_<counter>`), never random. Same Spec ⇒ same Plan.
- **The safety spine.** `cleanSpec` composes per-section validators; every author-supplied value is a
  hex / clamped number / whitelisted enum / known type. **Unknown or unsafe input is DROPPED, never
  trusted** (unknown module type, `javascript:` href, low-contrast theme → refused/stripped).
- **The executor SEAM.** `applyPlan(plan, exec)` runs ops through an **injected** executor. Firebase
  binds in *there*, later, without touching the pure engine. **Never let `src/` import firebase or
  perform I/O** — keep the engine pure; the Firebase-bound executor lives at the seam.
- **The generic-enough test** (for anything harvested from the Dojo): does it read config not Dojo
  vocabulary? → shell. Fails but the capability is general? → a module. Fails and irreducibly Dojo? →
  a **registered app-specific plugin** (e.g. Wing Time), never forced into the platform.
- **Git:** commit + push to `origin main`. End commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 4. Layout

```
docs/                 the design spine (§2)
spec/dojo.spec.json   the Dojo AS an App Spec — reference fixture + byte-for-byte acceptance target
src/
  assembler.mjs       cleanSpec (composes all validators) + assemble(spec)→Plan (pure, deterministic)
  plan.mjs            planSpec (GATE: no plan if errors) · planDiff (intake preview) · applyPlan (exec seam)
  shell/              extracted platform code: theme-validator, rules-gen, block-tree, data-model, auth
  modules/            capability modules: content-library, content-render, content-completion,
                      progression, rules, mechanics, progression-engine, rbac
test/                 node --test suites (currently 69 across 11 files)
```

## 5. Current status — Phase 0 (engine feature-complete in isolation)

```
Spec ──cleanSpec (GATED)──▶ Plan ──planDiff──▶ preview
                             ├─▶ applyPlan(exec)         ← executor seam (Firebase binds here)
                             └─▶ genRules ─▶ firestore.rules
modules:  content-library ✓   progression ✓   rbac ✓    (all logic-complete + integrated)
```
- **cleanSpec** validates every section: theme (+ contrast floor), auth, dataModels (bounded field
  types), module configs, pages (`cleanBlockTree`), and generates `firestore.rules` from dataModels+auth.
- **progression** is fully realized: config + rules validated, the **mechanic library** (9 pure
  criterion types), the **orchestrator** `evaluate(member, config)` with the never-retroactive
  boundary, and `previewImpact`.
- **content-library**: config validator + the **six-format renderer** + the **completion flow**
  (`computeRequiredSignal` → feeds progression's `required-content`, proven end-to-end).
- **rbac**: `cleanAuth` + rules generation + grant/roster decisions (last-owner guard, token-revoke).
- **69 tests, all pure, all green.**

**The one boundary left to "live":** binding the executor + `gen-rules` to a real Firebase project
(turns a validated Spec into a running clone). Needs infra provisioning + the owner's go — do NOT
provision infra unprompted.

## 6. The Dojo as a read-only reference

`~/The Dojo App` is the source for further **shell lifts** — read from it when generalizing the next
piece; never depend on it. Not yet ported (a larger lift = the Design-Inspector element system): the
FULLER `cleanTheme` (nav token cleaner, per-element `elements`, per-page `scope`, `elementOverrides`),
`dojo-nav`, the badge-labels/viz data. Apply the generic-enough test to each.

## 7. Roadmap / good next moves

- **Non-infra hardening:** `assemble(dojoSpec)` byte-for-byte round-trip; the fuller `cleanTheme`
  port; badge-labels + viz data; a 4th module (activity-log / messaging / commerce) to broaden the
  library; `cleanMechanic` edge coverage.
- **The AI intake** (`docs/AI_INTAKE.md`): the constrained Spec-editor agent — proposes Spec diffs
  within the module library, gated by `cleanSpec`, previewed by `planDiff`, applied on confirm.
- **The live inflection:** the Firebase-bound executor + a setup wizard (mints the first owner,
  runs `applySpec`, deploys rules) — the clone-first onboarding. Infra + owner sign-off required.

## 8. Invariants (don't break)

1. The engine is **pure** — no side effects in `src/`; all writes go through the executor seam.
2. **Deterministic** — same Spec ⇒ same Plan (no random ids, no `Date.now()` in the engine).
3. **Bounded** — every author/AI value is validated; unknown is dropped, never trusted.
4. **Generic-enough** — nothing Dojo-specific enters the platform; it's config, a module, or a plugin.
