<!-- AI_INTAKE.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. The interview→Spec front door (see PLATFORM.md / APP_SPEC.md / ASSEMBLER.md). -->

# The AI Intake — interview → App Spec (v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The **front door** and the "ease of use" heart: a new
owner describes what they want in plain language, and the intake **authors the App Spec** that the
assembler renders into a running app. It is the **app-scope superset** of `AI_BUILDER.md`'s
Creator Wizard (which is page/section scope) — same principle, wider blast radius. Design-first:
no code until sign-off.

**One line:** the intake is a *constrained Spec editor* — an AI that can propose anything the
**module library + bounded schema** support, whose every proposal passes `cleanSpec`, is shown as
a plain-English **Plan** (from the assembler), and is applied only on the owner's confirm. It is to
an *App Spec* what Claude Code is to a *repo*: it edits within a validated envelope, never outside
it.

---

## 1. Principles

- **The owner speaks their DOMAIN, never tech.** "A membership site where people take courses and
  earn levels" — never "pick a field type" or "choose a module." The AI does the mapping.
- **Progressive, not a mega-form.** Short rounds; each produces a *visible* partial app (live
  preview). The Creator Wizard's north star — *the easiest path is the only path* — scaled to a
  whole app.
- **AI proposes, assembler disposes.** The AI only ever emits a **Spec diff**. It never writes to
  the app. Every diff → `cleanSpec` → assemble → **Plan preview** → owner confirm → apply →
  history/rollback. This is the same safety spine the whole platform rides on.
- **Module-grounded creativity.** The AI's "intelligence" is in *mapping needs to the vetted module
  library + bounded field types + concept model* — not in inventing logic. That bound is what makes
  its output safe **and** reviewable.
- **Conversational forever.** The app is never "done being built." After the first assemble, the
  owner keeps talking — "add a leaderboard," "let members book sessions," "make the levels harder"
  — each a Spec diff through the same loop. The intake is an ongoing plain-language editor over the
  Spec, not a one-shot generator.
- **BYO key.** The owner supplies their own Anthropic/other key; the intake runs on it (their
  data, their cost). We help with setup. Keys are `keyRef`s, never literals in the Spec.

## 2. The three tiers (one Spec underneath)

| Tier | Who | What |
|---|---|---|
| **Zero-config** | first run | ~8 domain questions (§3) → a first Spec → a working app appears |
| **Guided** | refining | walk the app, say "change/add/remove this" in plain language (§4) |
| **Power-user** | pixel control | Design Center + Inspector + the manual Creator Wizard |

All three edit the **same App Spec** — the AI intake and the manual controls are two hands on one
object. An owner can flip between them freely.

## 3. Stage 1 — the concept interview (~8 questions → first Spec)

The AI asks only what it needs to fill a first Spec, defaulting hard and using the module library
to know which questions matter. Illustrative round (the AI adapts, doesn't recite):

| Question (domain language) | Fills |
|---|---|
| What are you building? (a course platform · a community · a membership site · a booking service · …) | seeds `concepts` + a **starter module set** |
| Who uses it? (just members · members + admins · coaches/staff too) | `auth.roles` |
| What's the main thing people do in it? (learn · track activity · book · buy · connect) | the **primary modules** |
| What do you keep track of about them or their activity? | `dataModels` (bounded fields) |
| Do people advance — levels, tiers, badges? | the `progression` module (or not) |
| What's it called, who's it for, and what's the vibe? | `concepts` labels + a **starter theme** (§7) |

→ The AI emits a first **App Spec** → `cleanSpec` → assemble → a **plain-English Plan**:

> *"I'll set up a **Members** area with a **Home**, a **Library** of **Lessons**, and **Levels**
> members climb by finishing required lessons. **Admins** can add lessons and edit the levels.
> Here's the starting look — teal on a light background. Build it?"*

→ owner confirms → apply → a real, working app. No jargon crossed the table.

## 4. Stage 2 — conversational refinement (Spec diffs)

The owner walks the app and edits it by talking. This is `AI_BUILDER.md`'s create / add / edit /
delete verbs, lifted from **section** scope to **page and module** scope:

- *"Add a leaderboard of most-active members"* → AI proposes the `leaderboard` module + a page →
  Plan preview → apply.
- *"Let members message each other"* → `messaging` module + surfaces.
- *"Make Level 3 need ten sessions, not five"* → a `progression` rules diff (one mechanic param).
- *"Add a page with our story and a photo"* → a page with a `cleanBlockTree` composition (the
  manual builder can also do this — same object).

Each is a small Spec diff; the loop (validate → plan → confirm → apply → version) is identical.

## 5. The intake engine (the constrained Spec editor)

The AI runs on the owner's key with a tight harness:

- **Working state:** the current App Spec.
- **Grounding it's given:** the **module library catalog** (each module: what it does + its config
  schema + the dataModels it needs), the **bounded field-type set**, the **concept model**, and
  the current Spec + a plain-English summary of it.
- **Its only output:** a proposed **Spec diff** (add/change/remove Spec nodes) + a one-line
  rationale. Nothing executable.
- **The gate:** `cleanSpec(spec + diff)`. If it fails (unknown module, out-of-bounds field, broken
  reference), the AI is handed the error and revises — or, if the ask is genuinely outside the
  library, it **says so** (§6) instead of faking it.
- **The confirm:** the assembler's **Plan** rendered in plain English; the owner approves before
  any write.

This mirrors the workflow engine's discipline and the Live Builder's `cleanBlockTree` precedent:
the model is a *proposer inside an envelope*, and deterministic validated code is what actually
changes the app.

## 6. The validated-output guarantee & the honest boundary

- **Inside the library:** the AI can assemble it — modules, pages, data models, theme, roles — all
  within `cleanSpec`. This covers "the majority of any given project's needs" (the stated goal),
  because the library is built to.
- **Outside the library:** the AI does **not** hallucinate code. It surfaces the gap: *"That needs
  a custom capability we don't have yet — here's roughly what it'd involve"* → which becomes a
  **module request** (a vetted, human-built addition to the library, per the app-specific-mechanic
  escape hatch in `MODULE_PROGRESSION.md`). The platform grows by adding *vetted modules*, never by
  the AI writing raw backend into someone's app.

This boundary is the product's integrity: everything the intake produces is safe by construction,
and what it *can't* do, it names.

## 7. Design from description

"The vibe" answer → the AI proposes a **starter theme** (palette + type + shape), validated by
`cleanTheme` (which enforces the contrast floor, so a bad palette can't ship). The owner refines
via the Look library or "make it warmer / more corporate / higher-contrast" → a theme diff. Design
and function come from the *same* interview, exactly as the brief asked — the AI figures out both,
each landing in the Spec through its own validator.

## 8. BYO key, privacy, cost

- The owner's key lives in **their** deploy; the intake calls it directly. Their conversation and
  data never transit us (clone-first). We provide setup help + the harness.
- The Spec carries `keyRef`s, not secrets, so it stays safe to export, template, or seed a starter
  gallery from.

## 9. Safety recap

- The AI never executes anything — it emits Spec diffs only.
- Every diff: `cleanSpec` → assemble Plan → **owner confirm** → apply → `config/appSpec/history`
  (versioned, one-click rollback).
- Nothing in a Spec is executable; modules are vetted shell code; keys are references.
- Result: an AI builds the app, and it is **safe by construction** — the same guarantee the Design
  Center and Live Builder already ship, now at app scope.

## 10. Reuse map (what this is built from)

| Piece | Reuses |
|---|---|
| The conversation surface | `adminAssistant` callable (the AI substrate) |
| Section create/add/edit/delete | `AI_BUILDER.md` Creator Wizard + `dojo-builder.js` verbs |
| Validate the AI's output | `cleanSpec` = `cleanTheme`/`cleanBlockTree`/… (`ASSEMBLER.md` §4) |
| The confirm preview | the assembler's Plan (`ASSEMBLER.md` §3) |
| Apply + version + rollback | `applySpec` + `config/appSpec/history` |
| Live result, no redeploy | the config→live machinery (runtime path) |

## 11. Open questions

1. **Interview authoring:** are the Stage-1 questions AI-driven free-form, or a fixed script the AI
   fills conversationally? (Leaning: a fixed *intent* checklist the AI covers in natural
   conversation — reliable coverage, natural feel.)
2. **Auto-apply vs always-confirm:** does zero-config auto-apply the first Spec (fastest "wow"), or
   always show the Plan first? (Leaning: always show the Plan — it's the trust anchor — but make it
   one tap to accept.)
3. **Module-request pipeline:** when the AI hits the boundary (§6), how is the request captured and
   triaged into the vetted library? (Leaning: a structured request doc, like the Review Board flow.)
4. **Multi-turn spec drift:** long refinement sessions accumulate diffs — periodic "here's your app
   in plain English, still right?" checkpoints? (Leaning: yes, a summary checkpoint every N diffs.)
5. **Starter gallery:** ship a set of ready Specs (course app, community, booking) the intake starts
   *from* rather than blank? (Leaning: yes — fastest path is picking a near-match then refining.)
