<!-- MODULE_BOOKING.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Seventh capability module — scheduling (see PLATFORM.md / APP_SPEC.md / MODULE_COMMERCE.md / MODULE_ACTIVITY_LOG.md). -->

# Module: booking (schema v0, DRAFT)

**Status: DRAFT, 2026-08-10.** **Scheduling** — members reserve time: appointments, classes, or a
shared resource. The seventh module, and the most **cross-cutting** — it optionally takes payment
(commerce), records attendance (activity-log → progression evidence), and reminds (notifications).
Design-first: no code beyond the validator until sign-off.

**What it adds:** the time dimension. Coaching call slots, class signups, a room/equipment booking, a
consultation calendar — all the same shape: a **bookable** with availability, and **bookings** against it.

---

## 1. The general capability

> A **bookable** thing (a person's calendar, a class, a resource) with **availability**, that members
> **reserve** into time-bounded **bookings** — with capacity, lead time, a cancel window, and an
> optional charge.

## 2. Two collections (generalized)

```jsonc
// bookables  (owner:"app", access:"public")  — what/who can be booked
title (text), kind (select: appointment|class|resource),
hostRef (ref: members),                      // the coach/staff/owner of this calendar (optional)
durationMin (number), capacity (number),     // capacity 1 = appointment; >1 = a class
priceCents (number), currency (select),       // set for a PAID booking (needs commerce/payments)
availability (list: { day (select: mon|tue|wed|thu|fri|sat|sun), startMin (number), endMin (number) }),
active (bool, default true)

// bookings  (owner:"member", access:"owner-read"; host/staff read via rbac)
bookableRef (ref: bookables), member (ref: members),
startAt (timestamp), endAt (timestamp),
status (select: pending|confirmed|canceled|attended|no-show),
paymentRef (text)                            // opaque processor ref if paid — NOT a secret
```

Bookable **slots aren't stored** — they're derived at runtime from `availability` windows +
`durationMin`, minus already-booked slots (up to `capacity`). Availability uses the bounded `list`
type (a weekly recurring schedule).

## 3. Module config (the App Spec `config` block)

```jsonc
{ "type": "booking",
  "config": {
    "bookableCollection": "bookables",
    "bookingCollection": "bookings",
    "itemConcept": "booking",
    "mode": "appointment",              // appointment | class | resource
    "slotMinutes": 30,
    "capacityDefault": 1,
    "leadTimeHours": 0,                 // minimum notice before a slot
    "cancelWindowHours": 24,            // free-cancel window
    "paid": false,                      // true → requires a payments connector (like commerce)
    "statuses": ["pending","confirmed","canceled","attended","no-show"],
    "emitsTo": ["activity-log"],        // booking.made / booking.attended events
    "surfaces": {
      "calendar":   { "pageId":"book",       "audience":{"who":"members"} },
      "myBookings": { "pageId":"my-bookings","audience":{"who":"members"}, "scopeBy":"member" },
      "admin":      { "pageId":"schedule",   "audience":{"who":"staff"} }
    }
  }
}
```

`paid:true` is gated exactly like commerce: `cleanSpec` errors if there's no `integrations.payments` —
a clear "connect a payments processor to charge for bookings" prompt.

## 4. Surfaces

| Surface | What it is | Notes |
|---|---|---|
| **Calendar / book** | pick a bookable + an open slot → reserve | slots derived from availability − booked |
| **My bookings** | a member's upcoming/past bookings + cancel | scoped to `member` |
| **Admin / schedule** | manage bookables + availability, view all bookings, mark attended | rbac-gated to staff |

## 5. Backend contract

- **Collections:** `bookableCollection` / `bookingCollection`; rules from rbac (member reads own
  bookings; host/staff read their calendar's bookings).
- **Reserve (the careful bit):** creating a booking is a **capacity-guarded, idempotent** write —
  the executor checks the slot isn't full **transactionally** (no double-booking), respecting
  `leadTimeHours`. This is the booking analogue of commerce's oversell guard.
- **Paid bookings:** if `paid`, reserving produces a `createCheckout` **intent** (like commerce);
  the booking confirms only on the verified `payment.succeeded` webhook. Same money-safety spine —
  the engine never charges; the payments connector does, at the seam.
- **Signals (decoupled):** on confirm → `booking.made`; on attend → `booking.attended` events into
  activity-log (→ progression evidence + analytics); reminders fire the notification engine.
- **Cancel:** within `cancelWindowHours` → free; refunds (if paid) are an explicit admin/rules action
  through the payments connector, never automatic.

## 6. Shell-reuse map

| Reuse verdict | Pieces |
|---|---|
| **Shell, after generalize** | any Dojo calendar/date UI; the notification engine → reminders; commerce's checkout intent → paid bookings; activity-log's event append → attendance |
| **New (small)** | `cleanBookingConfig` (mode/slot/capacity/window bounds + the `paid`→payments gate); the transactional slot-capacity reserve; slot derivation from availability |
| **Does NOT come along** | anything hardcoding a specific calendar/resource — all becomes config |

## 7. Ties to the rest

- **commerce / payments** — paid bookings reuse the payments connector + checkout intent (the
  `paid`→`integrations.payments` gate mirrors commerce's).
- **activity-log** — `booking.attended` is an event; **progression** can count attendance
  (`count-threshold` on attended bookings) as a criterion. Booking → attendance → levels, for free.
- **notifications** — confirmations + reminders.
- **messaging** — an optional host↔attendee thread per booking.
- **cost calculator** — bookings are writes; paid bookings add the payments connector's fee line.

## 8. Open questions

1. **Availability model** — a weekly recurring `list` (as above) is v0. Add date-specific
   overrides/blackouts, or keep recurring-only in v0? (Leaning: recurring-only v0; overrides next.)
2. **Time zones** — store `startAt` in UTC + render in the member's tz (needs a member tz). Confirm tz
   handling lives in the surface, not the engine. (Leaning: UTC store, tz at render.)
3. **Class waitlists** — when a class is full, waitlist + promote on cancel, or just "full"? (Leaning:
   "full" in v0; waitlist a fast-follow.)
4. **Paid-booking refund policy** — tie the cancel window to an auto-refund, or always admin-confirmed?
   (Leaning: admin-confirmed refunds, per the global money-safety rule.)
