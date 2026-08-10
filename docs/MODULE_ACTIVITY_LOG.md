<!-- MODULE_ACTIVITY_LOG.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Fifth capability module — the connective event stream (see PLATFORM.md / APP_SPEC.md / MODULE_PROGRESSION.md). -->

# Module: activity-log (schema v0, DRAFT)

**Status: DRAFT, 2026-08-10.** The **event stream** — a typed, timestamped record of what members and
the app do. The fifth module, and the most **connective**: it's the shared store the others already
imply. Design-first: no code beyond the validator until sign-off.

**What it resolves:** three "where does this live?" open questions across the existing specs —
progression's **evidence** activity model, content-library's **completions** store
(`MODULE_CONTENT_LIBRARY.md` §10.4), and commerce's **order events** — all become *event types* in
one activity log. It also generalizes the Dojo's `sessions` (member activity) **and** `auditLogs`
(admin actions) into a single, config-shaped stream.

---

## 1. The general capability

> A **stream of typed events** — each with an actor, a timestamp, a type, and a small bounded
> payload — that other modules **emit to** and **read from**, surfaced as a member **timeline/feed**,
> an admin **analytics/audit** view, and **evidence** for progression.

Almost every app has this underneath: a fitness app's sessions, a course app's lesson completions, a
shop's orders, a community's posts, an admin's audit trail. They're all events in one log.

## 2. The decoupled-signal spine (why it's connective, not coupling)

activity-log is the **hub of the decoupled-signal pattern** the platform already uses
(content→progression, commerce→accounting). Modules don't call each other; they **emit events** the
log records, and **read** the ones they care about:

| Producer | Emits event type | Consumer |
|---|---|---|
| content-library | `content.completed` | **progression** (`required-content` mechanic) |
| commerce | `order.paid` | accounting connector, progression (entitlement) |
| the app / any module | `session`, `login`, … | **progression** (evidence), analytics |
| rbac / admin actions | `admin.action` | the **audit** view |

Progression's `evidence.activityModel` simply points at the activity-log collection. Nothing reaches
into another module's internals — the log is the interface.

## 3. Data model (generalized, bounded)

One module-owned collection (`dataModels` entry). Payload is a bounded `list`/scalar set, not free JSON.

```jsonc
// activity  (owner:"member" for member events; app-written system events allowed)
actor (ref: members), type (select: <config.eventTypes ids>),
ts (timestamp), subjectRef (ref),          // what it was about (a lesson, product, …)
value (number), unit (text),               // e.g. a score, a duration, an amount — optional
visibility (select: private|staff|public), // drives the feed vs analytics vs audit surfaces
meta (list: { key (text), value (text) }), // small bounded extra payload
included (bool, default true)              // the lever progression/eviction reads (like Dojo sessions)
```

`included:false` pulls an event out of qualification without deleting it — the same evidence-review
lever the Dojo already uses (`inspectMember`/`reviewEvidence`).

## 4. Module config (the App Spec `config` block)

```jsonc
{ "type": "activity-log",
  "config": {
    "collection": "activity",
    "itemConcept": "activity",                 // "Session" / "Event" (from spec.concepts)
    "eventTypes": [                            // the vetted types THIS app records
      { "id": "session",         "label": "Session" },
      { "id": "content.completed","label": "Lesson completed" },
      { "id": "order.paid",      "label": "Purchase" },
      { "id": "admin.action",    "label": "Admin action", "visibility": "staff" }
    ],
    "visibilityDefault": "private",            // private | staff | public
    "retentionDays": 0,                        // 0 = keep forever; else auto-expire
    "emitsTo": ["progression"],                // which modules consume this log's events
    "surfaces": {
      "feed":      { "pageId":"activity",  "audience":{"who":"members"}, "scope":"actor" },
      "analytics": { "pageId":"insights",  "audience":{"who":"staff"} },
      "audit":     { "pageId":"audit-log", "audience":{"who":"staff"}, "typeFilter":"admin.action" }
    }
  }
}
```

The Dojo re-expressed: `sessions` = activity-log with `eventTypes:[session]`, `evidence` pointed here;
`auditLogs` = the same log filtered to `admin.action` on the `audit` surface. One module, two Dojo
collections.

## 5. Surfaces

| Surface | What it is | Generalizes |
|---|---|---|
| **Feed / timeline** | a member's own activity (or a public community feed if `visibility:public`) | Dojo dashboard activity, a community feed |
| **Analytics** | staff view of activity over time, by type/actor | Dojo Member Inspector's activity section |
| **Audit** | the same log filtered to `admin.action` | Dojo `auditLogs` / Audit Log page |

## 6. Backend contract

- **Collection:** `config.collection`, rules from `owner:"member"` (owner-read) — a member reads their
  own events; staff read via rbac; system events are app-written.
- **Emit:** any module (or the executor, post-connector-webhook) appends an event. Appends are the
  only write in the hot path; events are **immutable** except the `included` flag (evidence review).
- **Read/consume:** progression reads `included` events of the configured types as evidence; the
  audit/analytics surfaces query by type/actor/time. No module imports another — the log is the seam.
- **Retention:** `retentionDays>0` → an executor-side sweep expires old events (server-side).

## 7. Shell-reuse map

| Reuse verdict | Pieces |
|---|---|
| **Shell, after generalize** | Dojo `sessions` shape → the `activity` model; `inspectMember` activity/upload sections → the analytics surface; the Audit Log page → the audit surface (a typeFilter view) |
| **New (small)** | `cleanActivityConfig` (event-type + visibility + retention bounds); the emit/consume event contract (already the decoupled-signal pattern, now named) |
| **Does NOT come along** | anything hardcoding `sessions`/`auditLogs`/Muse specifics — all become event types + config |

## 8. Ties to the rest

- **progression** — this is its evidence store; `evidence.activityModel` → the activity collection.
- **content-library** — completion writes a `content.completed` event (closes §10.4).
- **commerce** — `order.paid` events feed accounting/entitlement + analytics.
- **cost calculator** — a busy activity log is the main driver of write/read volume, already what
  `estimateCost` scales on (member activity/month) — so it's honestly priced.
- **marketing** — engagement events inform who to re-engage.

## 9. Open questions

1. **Feed vs evidence split** — one collection with `visibility`, or separate private-evidence vs
   public-feed stores? (Leaning: one collection + `visibility` — simpler, and `included` already
   separates "counts" from "shown".)
2. **Event-type registry** — fixed per-app in config (as above), or a global vetted type catalog like
   connectors? (Leaning: config-defined per app in v0; a shared catalog if patterns repeat.)
3. **Analytics depth** — v0 = counts/timeline over `type`/`actor`; do we add rollups/retention
   cohorts, or leave richer analytics to a later BI surface? (Leaning: counts/timeline v0.)
4. **Immutability enforcement** — rules make events append-only + `included`-updatable; confirm no
   edit/delete path (mirrors the Dojo config-history append-only guard).
