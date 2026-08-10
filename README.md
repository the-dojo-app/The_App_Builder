# The App Builder

A **clone-first, AI-driven app-builder platform** — a way to create apps easily from all the
design and functionality tooling proven in "The Dojo App," which becomes **reference app #1**.

An owner describes what they want in plain language; an AI **intake** authors a declarative
**App Spec**; a deterministic **assembler** validates it and renders it into a running app — safe
by construction, because the AI only ever proposes Spec diffs inside a validated envelope.

Repo: `github.com/the-dojo-app/The_App_Builder`.

## Design source of truth (`docs/`)

Read in order:

1. `docs/PLATFORM.md` — strategy, the shell/domain line, the module library, the roadmap
2. `docs/APP_SPEC.md` — the declarative App Spec schema (the core artifact)
3. `docs/MODULE_CONTENT_LIBRARY.md` · `docs/MODULE_PROGRESSION.md` · `docs/MODULE_RBAC.md` — the first module slice
4. `docs/ASSEMBLER.md` — the spec→app engine
5. `docs/AI_INTAKE.md` — the interview→Spec front door

## Layout

```
docs/                design-first specs (above)
spec/dojo.spec.json  the Dojo AS an App Spec — reference fixture + byte-for-byte acceptance target
src/
  assembler.mjs      cleanSpec + assemble(spec)→Plan (pure, deterministic)
  shell/             extracted platform code (theme-validator so far; more as the shell is lifted)
  modules/           capability modules (content-library so far)
test/                node --test suites
```

## Run the tests

```
npm test
```

## Status

Phase 0. The engine loop is proven on the easiest slice (validate → assemble → Plan) with the
safety spine tested (unknown modules rejected; colours validated by the extracted `cleanTheme`).
Next: extract the six-format renderer, then the rules generator. Nothing here runs against a live
app yet — it is proven in isolation, then wired to Firebase during the shell lift.
