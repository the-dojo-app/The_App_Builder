<!-- MODULE_CONTENT_LIBRARY.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. First capability-module spec (see PLATFORM.md / APP_SPEC.md). -->

# Module: content-library (schema v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The **first capability module** — harvested from the
Dojo's `methods` system to prove the whole pattern on the easiest case (no belt-engine rule
complexity). Design-first: no extraction code until sign-off.

**What it proves:** that a rich, Dojo-specific feature (`methods` + `Admin_Methods` + the two
readers) generalizes into a reusable module by (a) keeping the *general* parts as shell,
(b) turning the *Dojo taxonomy/gating* into config, and (c) leaving nothing Dojo-shaped in the
platform code. This is the generic-enough test (PLATFORM.md Appendix A) worked end to end.

---

## 1. The general capability

> A **published, ordered, multi-format content collection** — items in any of several formats,
> optionally **categorized** by one or more app-defined dimensions, optionally **gated / counted**
> by a progression module, presented through up to three **surfaces**: an ungated catalogue, a
> scoped+tracked reader, and an admin authoring tool.

Almost every app has this: courses (lessons), fitness (exercises), a knowledge base (articles),
a product catalogue, a media library. The Dojo's "methods" is one instance.

## 2. Generic-enough analysis (the harvest)

Applying the test to today's `methods` implementation (fields per CONTEXT §5b, verified
2026-07-29 — six-format writer `Admin_Methods` v21, readers `Training_Center`/`Method_Library` v16):

| Part of `methods` today | Verdict | Becomes |
|---|---|---|
| Display text — `title` `eyebrow` `description` `caption` `figureDesc` `footnote` | **general** | module core fields |
| Format + media — `kind`∈{image,video,audio,pdf,article,external,interactive}, `imageUrl` `videoUrl` `audioUrl` `fileUrl` `linkUrl`/`linkLabel` `posterUrl` `mediaType` `body` | **general** | module core (the **six-format renderer** — the crown-jewel reusable asset) |
| Structure — `figures[]` `stats[]` | **general** | module core |
| Ordering / publish — `sortOrder` `published` | **general** | module core |
| Timing — `durationMin` `expectedMin` | **general** | module core (+ enforcement, §9) |
| `belt` (which belt the item is for; `General` = all) | **Dojo taxonomy** | a **config-defined taxonomy dimension** whose *values* come from the progression module's units |
| `role` (method / animation / transition) | **Dojo taxonomy** | a config-defined dimension (values are Dojo's) |
| `path` (neurofeedback / attentional) | **Dojo taxonomy** | a config-defined dimension (optional) |
| `required` / `reference` (counts toward Badge 5 / never counted) | **gating — general concept, Dojo coupling** | module marks items; the **progression module** decides what it means (§6) |

**Nothing Dojo-specific survives in the module.** `belt`/`role`/`path` collapse into a generic
`taxonomy` list; `required`/`reference` become a generic gating interface to whatever progression
module (if any) is installed.

## 3. The content-item data model (generalized)

A module-owned collection (`dataModels` entry, per `APP_SPEC.md`). Core fields are fixed; the
**taxonomy fields are config-driven** — the module reads `config.taxonomy` to know which extra
fields exist and how to validate them.

```jsonc
// core (always present)
title, eyebrow, description, caption, figureDesc, footnote,     // display
kind,                                                            // one of config.formats
imageUrl, videoUrl, audioUrl, fileUrl, linkUrl, linkLabel,
posterUrl, mediaType, body,                                      // media, by kind
figures: [ { url, caption, desc } ],                             // rich figure list
stats:   [ { label, value } ],
sortOrder, published,
durationMin, expectedMin,                                        // timing
createdAt, updatedAt

// taxonomy (one field per config.taxonomy[] entry) — e.g. Dojo: belt, role, path
// gating (only if config.gating set) — e.g. Dojo: required, reference
```

## 4. Module config (the App Spec `config` block)

The whole Dojo-ness is expressed here as data:

```jsonc
{ "type": "content-library",
  "config": {
    "collection": "methods",
    "itemConcept": "contentItem",                 // "Method" (from spec.concepts)
    "formats": ["image","video","audio","pdf","article","external","interactive"],
    "taxonomy": [
      { "id":"belt", "concept":"progressionUnit",
        "valuesFrom":"module:progression.units", "extra":["General"], "required":true },
      { "id":"role", "label":"Type",
        "values":["method","animation","transition"], "default":"method",
        "catalogueFilter":"method" },              // Library shows only role=method
      { "id":"path", "label":"Path",
        "values":["neurofeedback","attentional"], "optional":true }
    ],
    "gating": {                                    // optional; omit for an ungated library
      "progressionModule":"progression",
      "requiredFlag":"required", "referenceFlag":"reference"
    },
    "surfaces": {
      "catalogue":   { "pageId":"library",  "audience":{"who":"members"}, "showAll":true,
                       "groupBy":"belt", "sortBy":"sortOrder" },
      "gatedReader": { "pageId":"training", "audience":{"who":"members"},
                       "scopeBy":"belt", "tracksCompletion":true }
    }
  }
}
```

Reskin to a course app = change `collection`, `concept`, and the `taxonomy` values
(`belt`→`module`, drop `role`/`path`). Shell code untouched.

## 5. Surfaces (generalized from the three Dojo pages)

| Surface | Harvested from | Generalization |
|---|---|---|
| **Catalogue** — browse-all, ungated | `Method_Library.html` | group/sort by any `taxonomy` dim (not hardcoded `belt`); apply `catalogueFilter`; renders the full rich set incl. `eyebrow`/`caption`/`figureDesc` |
| **Gated reader** — scoped + completion-tracked | `Training_Center.html` | scope by `config.surfaces.gatedReader.scopeBy` taxonomy dim; `reference` items show no completion CTA; completion recorded + emitted to the progression module |
| **Admin authoring** — the six-format writer | `Admin_Methods.html` | format-aware field show/hide + `figures[]` editor stay; the `belt`/`role`/`path` selects become **generated from `config.taxonomy`**; curriculum-health table generalizes to "per first-taxonomy-value counts" |

All three read **one shared six-format renderer** (extracted once) — which is also how the §5b
"three fields unread by Training Center" gap closes by construction (§9).

## 6. Backend contract

- **Collection:** `config.collection`, provisioned from the `dataModels` entry; rules generated
  from `owner:"app"` / `access:"public"` (authoring gated to admin by the shell's RBAC).
- **Authoring callable:** writes an item by `kind`, `deleteField()`-ing the fields the chosen
  format doesn't use (today's `saveMethod()` behaviour, generalized).
- **Completion:** the gated reader records a completion (`{itemId, uid, at, completionMode}`) and
  **emits a signal** the progression module consumes. Content-library does **not** know about
  Badge 5 — it only knows "this required item was completed." Progression decides the meaning.
  This decoupling is the key to both modules staying general.
- **Impact preview:** publishing a `required` item can revoke progression standing — that preview
  is the **progression module's** concern, triggered by the gating interface (mirrors today's
  `previewRequiredImpact`, but owned by progression, not hardcoded here).

## 7. Shell-reuse map

| Reuse verdict | Pieces |
|---|---|
| **Shell, verbatim** | the six-format renderer (extract to a shared `content-render` module), `dojo-upload.js` (media), palette/`--el-*` tokens, `figures[]`/`stats[]` rendering |
| **Shell, after a generalize pass** | the authoring form (taxonomy selects → config-generated), catalogue grouping (any dim), gated reader (config-scoped, generic completion) |
| **New (small)** | `cleanContentConfig` (module config validator), the completion-signal contract to progression, per-format `completionMode` enforcement (§9) |
| **Does NOT come along** | anything referencing `belt`/`role`/`path`/`Badge 5` literally — all replaced by config/interface |

## 8. The Dojo, re-expressed (reference-app proof)

The Dojo keeps working with **zero behaviour change**: its `methods` collection, its
Library/Training pages, and its authoring form are now the content-library module *configured*
with `taxonomy:[belt,role,path]` and `gating→progression`. Nothing a member or admin sees
changes; the code underneath is now general. That is the proof the harvest is honest.

## 9. Resolves two long-standing `methods` gaps (CONTEXT §5b)

- **`eyebrow`/`caption`/`figureDesc` unread by the Training Center** → gone by construction: both
  surfaces share **one** renderer, so a field renders everywhere or nowhere.
- **`durationMin`/`expectedMin` written but never enforced** → the module adds a per-format
  `completionMode` (video: played-range not just `ended`; pdf/article: dwell ≥ `expectedMin`) and
  records `completionMode` per completion — the time gate the field always implied.

## 10. Open questions

1. **Gating ownership** (recommend as written): content-library marks `required`/`reference` +
   emits completion; the progression module owns the *meaning* and the impact preview. Confirm the
   modules stay decoupled this way.
2. **Taxonomy generality:** v0 dims are `select`-over-values or `valuesFrom:module:*`. Enough, or
   also free-tag / hierarchical taxonomies in v0?
3. **Module-contributed pages:** does content-library **ship default** catalogue/reader pages the
   owner can override (per `APP_SPEC.md` open-Q4), or must the wizard generate them? (Leaning:
   ship sensible defaults.)
4. **Completion store:** a module-owned `completions` collection vs reusing the app's activity
   model — decide when the activity-log module is specced (they're adjacent).
