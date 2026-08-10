<!-- MODULE_MESSAGING.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Sixth capability module — conversations (see PLATFORM.md / APP_SPEC.md / MODULE_RBAC.md). -->

# Module: messaging (schema v0, DRAFT)

**Status: DRAFT, 2026-08-10.** **Conversations** — direct messages between members and/or community
channels. The sixth module. Generalizes the Dojo's DMs / Chat / Community messaging into a
config-shaped capability. Design-first: no code beyond the validator until sign-off.

**What it adds to the library:** the first **member-to-member** capability (the others are
member↔content or member↔system). It leans on rbac for moderation, emits to activity-log for
engagement, and fires the notification engine on new messages — reusing seams, not reinventing.

---

## 1. The general capability

> **Threads of messages** between people — either **direct** (1:1 / small group) or **channels**
> (named, audience-scoped community rooms) — with a composer, an inbox, and staff **moderation**.

Community apps, coaching (coach↔client DMs), a course cohort's channels, a marketplace's
buyer↔seller thread — all the same two collections: threads + messages.

## 2. Two collections (generalized)

```jsonc
// threads  (a conversation)
kind (select: dm|channel),
participants (list: { memberRef (ref: members) }),   // dm: the parties; channel: members/audience
title (text),                                        // channels only
lastAt (timestamp), createdAt (timestamp)

// messages
threadRef (ref: threads), sender (ref: members),
body (longtext), ts (timestamp),
attachments (list: { url (file), kind (text) }),     // optional
removed (bool, default false)                        // moderation soft-delete (never hard-delete)
```

`removed:true` is a moderation soft-delete — the audit trail stays (mirrors the platform's
append-only / `included` discipline), and staff removal is gated by rbac.

## 3. Module config (the App Spec `config` block)

```jsonc
{ "type": "messaging",
  "config": {
    "threadCollection": "threads",
    "messageCollection": "messages",
    "modes": ["dm", "channel"],                 // direct, channels, or both
    "channels": [                               // predefined channels (channel mode); owners add more
      { "id": "general", "label": "General", "audience": { "who": "members" } },
      { "id": "coaches", "label": "Coaches",  "audience": { "who": "staff" } }
    ],
    "moderation": { "staffCanRemove": true, "membersCanDelete": false },
    "emitsTo": ["activity-log"],                // a sent message = an engagement event (decoupled)
    "notifyOnMessage": true,                    // fire the notification engine on new messages
    "surfaces": {
      "inbox":  { "pageId": "messages", "audience": { "who": "members" } },
      "thread": { "pageId": "thread",   "audience": { "who": "members" } }
    }
  }
}
```

Dojo re-expressed: its DMs = `modes:["dm"]`; a community adds `modes:["dm","channel"]` + channels.

## 4. Surfaces

| Surface | What it is | Generalizes |
|---|---|---|
| **Inbox** | a member's threads (DMs + channels they're in), newest first | Dojo Messages / Community DM list |
| **Thread** | one conversation: messages + composer | Dojo Chat / DM thread |
| **Moderation** | staff remove messages / manage channels (rbac-gated) | Dojo community moderation |

The inbox is a natural home for the planned member-directory-accordion DM surface (an existing Dojo
idea) — the module owns the thread; a page can embed it.

## 5. Backend contract

- **Collections:** `threadCollection` / `messageCollection`; rules from rbac — a member reads threads
  they participate in (or channels their audience allows); staff moderate.
- **Send:** append a message + bump the thread's `lastAt`. Messages are **immutable except `removed`**
  (moderation soft-delete). No hard-delete path.
- **Signals (decoupled):** on send → emit an `activity-log` event (`message.sent`) and, if
  `notifyOnMessage`, fire the notification engine — the same emit pattern content→progression uses.
- **Abuse / rate limits:** enforced at the executor seam (per-sender rate cap, block list) — a
  server concern, not the pure engine.

## 6. Shell-reuse map

| Reuse verdict | Pieces |
|---|---|
| **Shell, COPY VERBATIM** | the Dojo's **`Chat.html` / DM thread implementation** — its CSS *and* its scroll/layout JS. See the note below. |
| **Shell, after generalize** | Messages list → the inbox; the notification engine (already exists) → `notifyOnMessage` |
| **New (small)** | `cleanMessagingConfig` (modes/channels/moderation bounds); the send→activity-log + notification signals |
| **Does NOT come along** | anything hardcoding Dojo DM specifics — all become config (modes/channels) |

> **⚠ Copy the Dojo chat, don't reinvent it (Will, 2026-08-10).** The Dojo's chat took real effort to
> get right — **message alignment, scroll jumpiness, sticking to the bottom, keyboard/compose resize,
> and the app-shell-scroller quirk** were all solved there the hard way. When the thread/inbox
> surfaces are built, **lift `Chat.html`'s markup, CSS, and scroll JS as-is** and only parameterize
> the data source — do not rewrite the layout/scroll logic from scratch. The relevant gotcha: an
> internal element scrolls, **not** the window (reset *its* `scrollTop`, and anchor-to-bottom on new
> messages) — the same "app-shell scroller is not the window" trap the Dojo already learned.

## 7. Ties to the rest

- **rbac** — moderation + channel audiences; who can post where.
- **activity-log** — `message.sent` events feed engagement analytics (module #5).
- **notifications** — new-message alerts reuse the existing engine.
- **cost calculator** — messages are writes; volume already scales `estimateCost` (member activity).
- **marketing** — a broadcast channel could seed announcements (staff→members).

## 8. Open questions

1. **Group DMs vs channels** — is a small-group DM just a `dm` thread with >2 participants, or its own
   mode? (Leaning: `dm` with N participants; `channel` = named + audience-scoped. Two modes cover it.)
2. **Read state** — per-message `readBy` (accurate, heavier) vs per-thread `lastReadAt` per member
   (cheap unread counts). (Leaning: per-thread `lastReadAt` in v0.)
3. **Real-time** — live updates via the provider's realtime (Firestore listeners) vs poll. (Leaning:
   provider realtime where available; the module is transport-agnostic.)
4. **Attachments** — reuse the storage provider + content-library's media handling, or messaging-owned?
   (Leaning: reuse storage; keep attachments a bounded `list` of `{url,kind}`.)
