<!-- APP_SPEC.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. The core data model for the platform (see PLATFORM.md). -->

# The App Spec — schema v0 (DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The single declarative document that describes an
entire app. The **AI intake writes it**, a deterministic **assembler renders it** into the
`config/*` docs + collections + rules, **rollback versions it**, and an owner **exports it**.
Getting this right is ~80% of the platform architecture, so it is deliberately versioned and
signed off before code depends on it.

**One rule above all:** the Spec is **declarative and bounded**. Every value maps to an
existing, validated shell capability (a theme token, a module config field, a block type, a
data-model field type). Nothing in a Spec is executable. `cleanSpec` (server-side, mirroring
`cleanTheme`/`cleanBlockTree`) rejects anything outside the envelope. That is what makes an
AI-authored Spec safe to run.

---

## 1. Top-level shape

```jsonc
{
  "spec": "0",                     // schema version — the assembler migrates older specs
  "app":        { … },             // identity, branding
  "concepts":   { … },             // the domain vocabulary abstraction (the "reskin" layer)
  "theme":      { … },             // = today's config/appTheme shape (color, colorLight, type, shape…)
  "auth":       { … },             // roles, signup gating  (the RBAC module)
  "dataModels": [ … ],             // per-app collections, declared + validated
  "modules":    [ … ],             // vetted capability modules + their config
  "pages":      [ … ],             // page compositions (block trees) + audience gating
  "nav":        { … },             // menu structure (derives largely from pages[])
  "notifications": { … },          // = today's config/notifications shape
  "integrations":  { … },          // BYO API keys + external services (AI, and domain integrations)
  "meta":       { … }              // authoring provenance, version note, timestamps
}
```

## 2. Sections, annotated

### `app` — identity
```jsonc
"app": {
  "id": "the-dojo",                // stable slug; namespaces this app's config + collections
  "name": "The Dojo",
  "tagline": "Companion to The Stabilized Flow State",
  "branding": { "logoUrl": "…", "faviconUrl": "…" }   // → config/branding
}
```

### `concepts` — the vocabulary abstraction (the cheap reskin)
The domain's nouns, as data. Every UI string + generated label reads a concept, so
`belt → level` is a one-line change, not a code sweep.
```jsonc
"concepts": {
  "member":          { "label": "Member",  "plural": "Members" },
  "progressionUnit": { "label": "Belt",    "plural": "Belts",   "ordered": true },
  "contentItem":     { "label": "Method",  "plural": "Methods" },
  "activity":        { "label": "Session", "plural": "Sessions" }
}
```

### `theme` — reuse what exists verbatim
The **exact** `config/appTheme` shape already validated by `cleanTheme`: `color`,
`colorLight`, `belt`, `shape`, `type`, `elements`, `nav`, `states`, `background`, the surface/
button Looks, etc. No new schema — the Spec *embeds* the theme object. The assembler writes it
to `config/appTheme`.

### `auth` — roles + signup (the RBAC module)
```jsonc
"auth": {
  "roles": ["owner", "admin", "member"],       // owner always exists; the rest are app-defined
  "signup": { "open": false, "invite": true },
  "profileFields": [ "name", "nickname", "avatar", … ]   // the member profile shape
}
```

### `dataModels` — declared collections (bounded field types)
Each app's collections, as data. **v0 uses a bounded field-type set** (no open-ended
code) so `cleanSpec` can validate every field and the assembler can generate Firestore
rules deterministically.
```jsonc
"dataModels": [
  {
    "id": "sessions",
    "concept": "activity",
    "owner": "member",                          // documents belong to a member
    "access": "owner-read",                     // owner-read | admin-read | public | …
    "fields": [
      { "id": "score",       "type": "number", "min": 0, "max": 100 },
      { "id": "durationSec", "type": "number" },
      { "id": "ts",          "type": "timestamp" },
      { "id": "included",    "type": "bool", "default": true },
      { "id": "traceUrl",    "type": "image" }
    ]
  }
]
```
Field types (v0, proposed): `text · longtext · number · bool · date · timestamp · select ·
image · file · ref(<model>) · geo · list(<shape>)`. Relations via `ref`. This ceiling is Open
Decision #4 in `PLATFORM.md`.

**`list(<shape>)` — a bounded array-of-objects field (ruled 2026-08-10).** A repeated sub-record
whose element shape is itself a bounded list of typed fields, with a max-length cap. Precedented by
content-library's `figures[]`/`stats[]`; generalized so e.g. an order can hold its line items in one
document (`MODULE_COMMERCE.md`). Not open-ended: element fields use the same bounded type set (no
nested `list` in v0), and `cleanDataModel` clamps the element count.

### `modules` — vetted capabilities, configured
```jsonc
"modules": [
  {
    "type": "progression",                      // a shell module (was the belt engine)
    "config": {
      "unitConcept": "progressionUnit",
      "units": ["White","Yellow","Orange","Green","Blue","Purple","Brown","Black"],
      "badgesPerUnit": 8,
      "rulesRef": "config/beltRules",           // the module's own validated config doc
      "evidence": "sessions"                     // which dataModel feeds it
    }
  },
  { "type": "content-library", "config": { "collection": "methods", "gated": true } },
  { "type": "evidence-ocr",    "config": { "source": "sessions.traceUrl" } },
  { "type": "review-workflow", "config": { "queue": "beltExams" } },
  { "type": "messaging",       "config": { "surface": "community" } }
]
```
Each `type` resolves to a shell module with its own `cleanConfig`. Unknown types are rejected.

### `pages` — compositions (block trees) + gating
Reuses the **existing** `cleanBlockTree` block model. `audience` drives BOTH nav placement and
the real access gate (per the Creator Wizard's "one answer" rule).
```jsonc
"pages": [
  {
    "id": "dashboard",
    "title": "Dashboard",
    "audience": { "who": "members" },           // members | staff:<roles> | belt:<unit> | public
    "nav": { "section": "main", "icon": "home", "label": "Home" },
    "layout": "single",
    "blocks": [ /* the cleanBlockTree structure the Live Builder already renders */ ]
  }
]
```

### `nav`, `notifications`, `integrations`, `meta`
- `nav` — mostly derived from `pages[].nav`; holds ordering/overrides (today's Manage Navigation).
- `notifications` — the `config/notifications` shape (categories, defaults, push).
- `integrations` — **BYO keys** + external services. AI + any domain integration:
  ```jsonc
  "integrations": {
    "ai":   { "provider": "anthropic", "keyRef": "secret://ANTHROPIC_KEY" },   // owner-supplied
    "muse": { "type": "evidence-source", "moduleRef": "evidence-ocr" }         // domain = a module
  }
  ```
  Keys are **references**, never literals in the Spec (so a Spec is safe to export/share).
- `meta` — `{ authoredBy, intakeVersion, note, createdAt, updatedAt }`.

## 3. The assembler contract

`assemble(spec)` is **pure and deterministic** — same Spec ⇒ same config, always:
1. Validate: `cleanSpec(spec)` (reject/clamp everything out of envelope).
2. Write config docs: `theme → config/appTheme`, `notifications → config/notifications`,
   `branding → config/branding`, each module's config → its `config/*` doc.
3. Provision `dataModels` → collection definitions + **generated Firestore security rules**
   from `owner`/`access`.
4. Register `pages` → the `config/pages` registry + block trees.
5. Snapshot to `config/appSpec/history` (versioning + rollback, reusing the existing pattern).

The assembler writes **only** through the existing validated callables/patterns — it introduces
no new trust surface.

## 4. Validation model

`cleanSpec` composes the validators the shell **already has**:
`cleanTheme` (theme) · `cleanBlockTree` (pages) · per-module `cleanConfig` · a new
`cleanDataModel` (bounded field types) · a new `cleanAuth`. Each is a pure server-side function
that clamps/drops bad input. An AI-authored Spec is run through `cleanSpec` before it can touch
anything — the model's output is *proposed*, never *trusted*.

## 5. Worked example — the Dojo as a Spec (abbreviated)

```jsonc
{
  "spec": "0",
  "app": { "id": "the-dojo", "name": "The Dojo", "branding": { "logoUrl": "…", "faviconUrl": "…" } },
  "concepts": {
    "member":          { "label": "Member",  "plural": "Members" },
    "progressionUnit": { "label": "Belt",    "plural": "Belts", "ordered": true },
    "contentItem":     { "label": "Method",  "plural": "Methods" },
    "activity":        { "label": "Session", "plural": "Sessions" }
  },
  "theme": { /* the live config/appTheme verbatim: color, colorLight, belt, type, shape… */ },
  "auth":  { "roles": ["owner","admin","member","coach","beta"], "signup": { "open": false, "invite": true } },
  "dataModels": [
    { "id": "sessions", "concept": "activity", "owner": "member", "access": "owner-read",
      "fields": [ { "id":"score","type":"number","min":0,"max":100 }, { "id":"ts","type":"timestamp" },
                  { "id":"durationSec","type":"number" }, { "id":"included","type":"bool","default":true },
                  { "id":"traceUrl","type":"image" } ] },
    { "id": "methods",  "concept": "contentItem", "owner": "app", "access": "public",
      "fields": [ { "id":"title","type":"text" }, { "id":"belt","type":"select" }, { "id":"body","type":"longtext" },
                  { "id":"required","type":"bool" }, { "id":"figures","type":"file" } ] }
  ],
  "modules": [
    { "type": "progression",     "config": { "unitConcept":"progressionUnit", "units":["White","…","Black"], "badgesPerUnit":8, "rulesRef":"config/beltRules", "evidence":"sessions" } },
    { "type": "content-library", "config": { "collection":"methods", "gated":true } },
    { "type": "evidence-ocr",    "config": { "source":"sessions.traceUrl" } },
    { "type": "review-workflow", "config": { "queue":"beltExams" } },
    { "type": "messaging",       "config": { "surface":"community" } }
  ],
  "pages": [ { "id":"dashboard", "audience":{ "who":"members" }, "nav":{ "section":"main","icon":"home" }, "blocks":[ … ] } ],
  "integrations": { "ai": { "provider":"anthropic", "keyRef":"secret://ANTHROPIC_KEY" },
                    "muse": { "type":"evidence-source", "moduleRef":"evidence-ocr" } },
  "meta": { "authoredBy":"intake", "note":"reference app #1", "createdAt":"…" }
}
```
Note how the Dojo's specialness collapses into **concepts + module config**: the belt engine is
the `progression` module, Muse is `evidence-ocr`, the curriculum is `content-library`. Reskin to
a fitness app = change `concepts` + `theme` + a few module fields; the shell code is untouched.

## 6. Versioning & export

- **Version:** the whole Spec is snapshotted to `config/appSpec/history` on every assemble
  (append-only rule already exists) → free rollback of an entire app configuration.
- **Export (clone):** the Spec + the shell code + a `firebaseConfig` = a runnable standalone app.
  The setup wizard (Phase 4) takes a Spec and a fresh Firebase project and provisions it. Because
  the Spec carries no secrets (keys are `keyRef`s), it is safe to hand over, template, or seed a
  gallery of starter apps from.

## 7. Open schema questions

1. **Field-type ceiling** (PLATFORM.md #4): the bounded list in §2 — enough for "most apps," or
   add computed/formula fields (bounded, like `builderStat`) in v0?
2. **Module ↔ dataModel coupling:** do modules *own* their collections (progression owns
   `beltExams`) or only *reference* declared `dataModels`? (Leaning: modules declare the models
   they need; the assembler merges.)
3. **Concept depth** (PLATFORM.md #1): how many concepts are first-class in v0 vs free-form.
4. **Pages authored vs generated:** are Spec `pages` always AI/wizard-generated block trees, or
   can a module contribute canned pages (e.g. progression ships a default dashboard)? (Leaning:
   modules ship default pages; the owner overrides.)
