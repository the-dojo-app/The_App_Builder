<!-- MODULE_PROGRESSION.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Second capability-module spec (see PLATFORM.md / APP_SPEC.md). -->

# Module: progression (schema v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The **second capability module** and the richest
harvest — the belt engine, badges, the two paths, the impact-preview machinery, the member
inspector, the badge viz. It is also the **other half** of the gating interface that
`MODULE_CONTENT_LIBRARY.md` defined, so speccing it locks the module-to-module contract from
both sides. Design-first: no extraction code until sign-off.

**What it proves (beyond content-library):** that even the most *differentiated, rules-heavy*
feature generalizes — by turning a hand-coded engine into a **config-driven interpreter over a
library of general criterion mechanics**, while keeping the engine's crown-jewel property (pure,
deterministic, clock-injected, evidence-in → standing-out). And it demonstrates the honest limit
of the generic-enough test: where a mechanic *can't* generalize, it becomes a **vetted
app-specific mechanic plugin**, never forced into the platform.

---

## 1. The general capability

> A **leveled advancement system**: members climb an ordered ladder of **units** (belts / levels /
> tiers), each unit earned by satisfying a set of **criterion mechanics** evaluated
> **deterministically from the member's activity evidence**. Rules are config; multiple parallel
> **tracks** (paths) are supported; earning is **never retroactive**; and admins get an **impact
> preview** before any rule change.

Ubiquitous: course completion, fitness levels, loyalty tiers, certification ladders, game ranks.
The Dojo's belts are one instance.

## 2. Generic-enough analysis (the harvest)

Against today's engine (`dojo-belts.js` v1 + the byte-identical `functions/lib/beltEngine.mjs`,
kept in sync by `sync-belt-engine.js`; rules in `config/beltRules`; labels in `config/badgeLabels`):

| Part of the belt system today | Verdict | Becomes |
|---|---|---|
| `evaluate(uid, sessions, beltState, config, {now})` — pure, deterministic, clock-injected | **general (crown jewel)** | the module's evaluator, unchanged in *architecture* |
| `buildContinuityChain`, consecutive-days, spaced-repetition, score-floor, required-materials checks | **general as TYPES** | the **mechanic library** (§3) — extracted, parameterized |
| Never-retroactive / completed-belt boundary | **general** | module invariant |
| `previewBeltRulesImpact` / `previewRequiredImpact` (N members would lose badge X) | **general** | the impact-preview surface (§9) |
| `inspectMember` (server-side engine → per-badge WHY) | **general** | the member-inspector surface |
| Badge **orbit** viz (earned=teal / locked=grey, custom-art mask) | **general** | the badge viz (N units × M badges) |
| `config/badgeLabels` (names/descriptions/icons per mechanic) | **general** | labels config |
| Unit **names** (White…Black), **count** (8/unit) | **Dojo config** | `units`, `badgesPerUnit` |
| Mechanic **parameters** (minScore 90/91, streak windows, day counts) | **Dojo config** | mechanic `params` in the rules doc |
| **Which** mechanic sits at each badge slot | **Dojo config** | the rules doc's per-unit badge list |
| Evidence **shape** (Calm Score, `durationSec`, birds) | **from other modules** | activity-log / content-library / evidence source |
| Two **paths** (neurofeedback / attentional) | **Dojo config** | `tracks` (§7) |
| **Wing Time**, calm-zone coupling — Dojo-flavored mechanics | **fails the test cleanly** | a **vetted app-specific mechanic plugin** (§3, escape hatch) — NOT forced into the platform |

## 3. The mechanic library (the heart)

The module ships a set of **general criterion types**. A rule references a type by name and
supplies `params`; the engine dispatches on the type. Each type is pure `(evidence, params, {now})
→ { met: bool, progress, why }` and has a `cleanMechanic` param validator.

| Mechanic | Meaning | Example params |
|---|---|---|
| `count-threshold` | ≥ N qualifying activities | `{ target, filter }` |
| `continuity-chain` | a streak in a rolling window that **resets on a gap** (today's "Chain" badges 1–4) | `{ window:"24h", target }` |
| `consecutive-days` | activity on N days in a row ("Three Consecutive Days") | `{ days:3 }` |
| `cadence` | spacing between activities within a spec ("Time-Spec / Spaced Repetition") | `{ minGap, maxGap, count }` |
| `score-floor` | a track score ≥ threshold (Black badges 7/8) | `{ min:90, source:"track.score" }` |
| `duration-floor` | activity length ≥ threshold | `{ minSec }` |
| `interval-structure` | N sittings of M minutes with a rest window (Blue: 4×5min, rest 5–20min) | `{ sittings:4, minEach:"5m", rest:["5m","20m"] }` |
| `volume-window` | ≥ N activities within a rolling window | `{ target, window }` |
| **`required-content`** | all **required** content items for the scope completed — **consumes the content-library completion signal** (§6) | `{ contentModule, scope:"unit" }` |

**Escape hatch (the honest limit).** A mechanic that genuinely won't generalize (Wing Time, any
calm-zone coupling) is a **vetted app-specific mechanic plugin**: real, reviewed code the app's
own module extension registers, addressed by name in the rules doc exactly like a library
mechanic. It is *never* AI-generated and *never* ships in the platform — this is the
"fail + irreducibly domain" branch of the generic-enough test, handled cleanly instead of forced.

## 4. The rules model (`config/beltRules`, generalized)

Per unit, an ordered list of badge slots, each a mechanic reference. Config, validated by
`cleanRules` (which calls each mechanic's `cleanMechanic`):

```jsonc
{
  "White": { "badges": [
    { "slot":1, "mechanic":"continuity-chain", "params":{ "window":"24h", "target":1 } },
    { "slot":5, "mechanic":"required-content",  "params":{ "contentModule":"content-library", "scope":"unit" } },
    { "slot":7, "mechanic":"consecutive-days",  "params":{ "days":3 } },
    { "slot":8, "mechanic":"cadence",           "params":{ "minGap":"20h", "maxGap":"36h", "count":2 } }
  ] },
  "Black": { "badges": [
    { "slot":5, "mechanic":"appspecific:wing-time", "params":{ … } },
    { "slot":7, "mechanic":"score-floor", "params":{ "min":90 } },
    { "slot":8, "mechanic":"score-floor", "params":{ "min":91 } }
  ] }
}
```

This materializes the same defaults the current engine hard-codes — so the Dojo is byte-identical
in behaviour, but the rules are now data (and already admin-editable via the Requirements editor).

## 5. The evaluator engine (crown jewel, generalized)

- **Architecture unchanged:** pure, deterministic, clock-injected, zero-dependency, Node-and-browser
  runnable, badges **computed from evidence** (not stored). Kept in two synced copies via the
  existing `sync-belt-engine.js` predeploy guard.
- **One change:** the hand-written mechanic checks become a **dispatch over the mechanic library** —
  `evaluate` reads the rules doc, and for each badge slot runs `mechanics[slot.mechanic](evidence,
  slot.params, {now})`. The bespoke functions (`buildContinuityChain`, the advanced-tier checks)
  become the library's `continuity-chain` etc.
- **Invariant preserved:** never-retroactive — a completed unit stays earned; the evaluator treats a
  finished unit as closed. This is module-level, not per-app.

## 6. The completion interface with content-library (loop closed)

Both sides are now specced and agree:

- **content-library** marks items `required`/`reference` and **emits** completions
  (`{ itemId, uid, at, completionMode }`); it knows nothing about badges.
- **progression's `required-content` mechanic** consumes "all required items for unit X completed" →
  earns the Preparation badge. **Progression owns the meaning.**
- **Impact preview lives here:** publishing a `required` content item can revoke a Preparation badge
  from members mid-unit — progression computes the affected count (today's `previewRequiredImpact`,
  now owned by the module via the interface, not hardcoded in the content admin page).

This resolves `MODULE_CONTENT_LIBRARY.md` Open-Q1 in favor of decoupling: **content-library reports
facts, progression assigns meaning.**

## 7. Tracks (parallel ladders / paths)

The Dojo's dual paths generalize to **tracks** — independent ladders a member can be enrolled in,
each with its own score source and (optionally) its own rules:

```jsonc
"tracks": [
  { "id":"neurofeedback", "label":"Neurofeedback", "score":{ "source":"activity:sessions.score" }, "default":true },
  { "id":"attentional",   "label":"Attentional",   "score":{ "source":"activity:attentionalReviews.composite" } }
]
```

`score-floor` and friends read `track.score`. A member's standing is per-track. (Today's
`dojo-belts-attentional.js` is the attentional track's score model — a general "composite
self-review score" evidence source.)

## 8. Module config (the App Spec block, worked for the Dojo)

```jsonc
{ "type":"progression",
  "config":{
    "unitConcept":"progressionUnit",
    "units":["White","Yellow","Orange","Green","Blue","Purple","Brown","Black"],
    "badgesPerUnit":8,
    "tracks":[ /* §7 */ ],
    "evidence":{ "activityModel":"sessions", "contentModule":"content-library" },
    "rulesRef":"config/beltRules",
    "labelsRef":"config/badgeLabels",
    "retroactive":false,
    "viz":"orbit",
    "appMechanics":["wing-time"]        // registered app-specific plugins (§3 escape hatch)
  }
}
```

Reskin to a fitness-levels app = change `units`, point `score.source` at the app's activity model,
compose badge slots from the library mechanics, drop `appMechanics`. Engine code untouched.

## 9. Surfaces (generalized from today's pages/callables)

| Surface | Harvested from | Generalization |
|---|---|---|
| **Badge viz** (member) | `dojo-badge-orbit` + dashboard | N units × M badges; earned/locked treatment + custom-art mask, config labels/icons |
| **Requirements editor** (admin) | Admin Hub Requirements editor (`config/beltRules`) | edits the rules doc; mechanic pickers from the library; per-mechanic param forms |
| **Impact preview** (admin) | `previewBeltRulesImpact` / `previewRequiredImpact` | `evaluate(member, oldCfg)` vs `evaluate(member, newCfg)` server-side; counts real members affected |
| **Member inspector** (admin) | `inspectMember` | per-badge WHY against the config bars; server-side engine |
| **Labels/icons editor** (admin) | Admin Hub Badge editor (`config/badgeLabels`) | names/descriptions/glyphs/custom art per mechanic |

## 10. Shell-reuse map

| Reuse verdict | Pieces |
|---|---|
| **Shell, after a generalize pass** | the evaluator (`dojo-belts.js`) → mechanic-dispatch interpreter; the impact-preview callables → `evaluate` old-vs-new; the member inspector; the orbit viz (N×M); the attentional score model → a track score source |
| **Shell, verbatim** | `sync-belt-engine.js` (the two-copy guard), the append-only config history/rollback, `config/badgeLabels` loader pattern |
| **New** | the **mechanic library** (general types + `cleanMechanic` per type), the rules interpreter + `cleanRules`, the app-specific-mechanic **plugin registry** (§3) |
| **Does NOT come along** | Wing Time / calm-zone logic as platform code — they live as the Dojo's registered app-mechanics |

## 11. The Dojo, re-expressed (reference-app proof)

Members and admins see **zero change**: the same belts, badges, orbit, Requirements editor, impact
previews, and member inspector — now the progression module *configured* with the Dojo's units,
rules doc, labels, two tracks, and one registered app-mechanic (Wing Time). The belt engine's
behaviour is byte-identical because the rules doc materializes exactly what it used to hard-code.

## 12. Open questions

1. **App-mechanic plugin surface:** how does an app register `appMechanics` in the clone-first
   model — a small `mechanics/` folder of vetted files the module imports? (Leaning: yes; reviewed
   code, never AI-authored.)
2. **Cross-track credit** (Dojo §7 cross-credit): a library `cross-track` mechanic, or app-specific?
3. **Evidence adapters:** the engine consumes a normalized evidence shape; each source module
   (activity-log, content-library, an evidence-source like Muse) provides an adapter to it. Confirm
   this thin adapter boundary rather than the engine knowing each source.
4. **Stored vs computed standing:** keep computed-live (today) for correctness, or cache per member
   for scale? (Leaning: computed-live in v0; cache is a later optimization, same as today.)
