<!-- MODULE_COMMERCE.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. Fourth capability module + the first CONNECTOR-backed one (see PLATFORM.md / APP_SPEC.md / MODULE_CONTENT_LIBRARY.md). -->

# Module: commerce (schema v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** The **"build a shop" module** — products, cart, checkout,
orders, fulfilment — and the **first module that needs an external service** (a payments processor).
So it's two firsts: a fourth capability beyond content-library / progression / rbac, *and* the
proving ground for the **connector layer** (Stripe/Shopify/QuickBooth/Zapier). Design-first: no code
until sign-off.

**What it proves:** that a capability which *moves money* stays **safe by construction** — the pure
engine never touches a payment; it only emits **intents**, which a **connector-bound executor**
performs server-side with the owner's keys. Same discipline as `applyPlan`'s executor seam, now with
real-world side effects. If commerce is safe, anything is.

---

## 1. The general capability

> A **catalogue of things for sale** (physical, digital, or a subscription), a **cart + checkout**
> that takes payment through a connected processor, and an **order lifecycle** (placed → paid →
> fulfilled) visible to the buyer and manageable by staff — optionally syncing to accounting /
> fulfilment / automation platforms.

"A shop" is one of the most-requested apps. Note the elegant overlap: **a product catalogue is a
content-library** (an ordered, categorized, multi-format collection) with **price + inventory +
buy** added on top. Commerce reuses content-library for the storefront rather than reinventing it.

## 2. Generic-enough split (module vs connector vs config)

Commerce isn't harvested from the Dojo (it has no shop) — so the test here is *what belongs in the
module vs what belongs behind a connector vs what's config*:

| Concern | Verdict | Where it lives |
|---|---|---|
| Products, prices, inventory, variants | **general** | module core (a content-library-backed `products` collection + price fields) |
| Cart, checkout flow, order lifecycle/states | **general** | module core (surfaces + `orders` model) |
| Taking payment, refunds, payouts, tax calc, shipping rates | **external, per-provider** | a **payments connector** (Stripe / Shopify / …) behind an abstract contract (§7) |
| Accounting sync, fulfilment/tracking, marketing automation | **external, per-provider** | **connectors** (QuickBooks / ShipStation / Zapier) — optional |
| Currency, pricing model (one-off/subscription), order states, which connectors | **config** | the module config block (§4) |
| Who can manage products/orders | **general, delegated** | the **rbac** module (staff/admin) |

**Nothing payment-provider-specific enters the module.** The module speaks one abstract payments
contract; each processor is a vetted connector that implements it. Swap Stripe→Shopify = swap the
connector, module untouched.

## 3. Data models (generalized, bounded)

Module-owned collections (`dataModels` entries, `APP_SPEC.md` field types). Money is stored in
**minor units (integer cents)** to avoid float drift.

```jsonc
// products  (owner:"app", access:"public")  — IS a content-library collection + commerce fields
title, description, images[],            // content-library core (reused)
priceCents (number), currency (select),  // commerce
sku (text), inventory (number),          // commerce; inventory omitted for digital/subscription
kind (select: physical|digital|subscription),
active (bool), sortOrder (number)

// orders  (owner:"member", access:"owner-read"; staff read via rbac)
buyer (ref: members), status (select: pending|paid|fulfilled|refunded|canceled),
subtotalCents, taxCents, shippingCents, totalCents (number), currency (select),
placedAt (timestamp), paidAt (timestamp),
connectorRef (text),          // opaque processor id (e.g. the checkout/session id) — NOT a secret
fulfilment (select: none|pending|shipped|delivered), trackingUrl (text)

// orderItems  (subcollection of an order, or a bounded line-item list)
productRef (ref: products), qty (number), unitPriceCents (number), titleSnapshot (text)
```

*Open (schema):* line items are a 1-to-many — a subcollection, or a structured field once APP_SPEC
supports bounded arrays-of-objects (content-library already has `figures[]`/`stats[]`, so a bounded
list type is precedented). §10.

## 4. Module config (the App Spec `config` block)

```jsonc
{ "type": "commerce",
  "config": {
    "productCollection": "products",
    "itemConcept": "product",                 // "Product" (from spec.concepts)
    "currency": "USD",
    "pricingModel": "one-off",                // one-off | subscription | mixed
    "catalogueFrom": "module:content-library",// reuse the storefront/grid + categories
    "payments":   { "connector": "stripe", "keyRef": "secret://STRIPE_KEY" },
    "accounting": { "connector": "quickbooks", "keyRef": "secret://QBO_KEY", "optional": true },
    "automation": { "connector": "zapier", "webhookRef": "secret://ZAPIER_HOOK", "optional": true },
    "tax":      { "mode": "connector" },      // connector | flat | none
    "shipping": { "mode": "flat", "flatCents": 500 },
    "orderStates": ["pending","paid","fulfilled","refunded","canceled"],
    "surfaces": {
      "storefront": { "pageId":"shop",   "audience":{"who":"members"}, "groupBy":"category" },
      "checkout":   { "pageId":"cart",   "audience":{"who":"members"} },
      "myOrders":   { "pageId":"orders", "audience":{"who":"members"}, "scopeBy":"buyer" },
      "admin":      { "pageId":"manage-shop", "audience":{"who":"staff"} }
    }
  }
}
```

`keyRef`s are **references, never literal secrets** (so the Spec stays safe to export/template/seed).
Cleaner rule: `cleanCommerceConfig` drops any `keyRef` that isn't a `secret://…` reference.

## 5. Surfaces

| Surface | What it is | Reuse |
|---|---|---|
| **Storefront** | browse products, grouped/sorted by category | content-library **catalogue**, + price + "Add to cart" |
| **Product** | one product's detail + buy | content-library item renderer + buy CTA |
| **Cart / checkout** | review, then pay via the connector | new; delegates payment to the payments connector (§7) |
| **My orders** | a buyer's order history + status/tracking | new; scoped to `buyer` |
| **Admin** | product authoring + order management (mark fulfilled, refund) | content-library **authoring** for products + a new orders table (rbac-gated to staff) |

## 6. Backend contract — money never touches the pure engine

The rule that keeps commerce safe: **the engine emits intents; the connector-bound executor performs
them.** No `src/` code ever calls a payment API or holds a secret.

- **Checkout:** the module produces a `createCheckout` **intent** (cart → line items + amounts). The
  executor (Firebase Function bound to the payments connector) creates a processor checkout session
  and returns its URL. The buyer pays **on the processor** (or an embedded element) — we never handle
  card data (global safety rule: never enter card numbers).
- **Confirmation via webhook, not trust:** the order flips to `paid` only when the processor's
  **signed webhook** says so (verified server-side) — never from a client "success" redirect. Order
  writes are **idempotent** on the processor event id (a webhook may fire twice).
- **Refunds / cancels:** an intent an admin explicitly confirms; the executor calls the connector.
  Never automatic. (Mirrors the global "irreversible action needs confirmation" rule.)
- **Accounting / automation:** on `paid`, emit an event the (optional) accounting/Zapier connectors
  consume — the same decoupled-signal pattern content-library→progression uses (`MODULE_CONTENT_LIBRARY` §6).
- **Inventory:** decremented server-side on `paid`, guarded against oversell.

## 7. The connector interface (new — commerce is its first consumer)

Commerce defines the first **connector contract**. A connector = a vetted adapter with a config
schema + a set of capabilities the executor calls. Payments contract (v0):

```
createCheckout(order, ctx) → { url | clientSecret, connectorRef }
verifyWebhook(rawBody, sig, ctx) → { event, orderRef, status }     // server-side signature check
refund(order, amountCents, ctx) → { ok, connectorRef }
```

- **Vetted catalog, bounded like everything else:** `payments`∈{stripe, shopify, …}, `accounting`∈
  {quickbooks, xero, …}, `automation`∈{zapier}. Unknown connector → refused by `cleanCommerceConfig`
  (the AI can't invent one; outside the catalog → an honest module/connector request).
- **Zapier is the breadth escape hatch:** one `automation:zapier` webhook connector reaches thousands
  of downstream apps without a bespoke adapter (per the connectors plan). Native connectors
  (Stripe/QuickBooks) exist where a first-class integration beats a generic webhook.
- A general **CONNECTORS.md** should generalize this contract once a second module needs connectors;
  for now it lives here, where it's first used.

## 8. Composition & shell-reuse

- **"A shop" = `commerce` module + a payments connector** (+ optional accounting / fulfilment /
  Zapier). It shows up in the **module picker** as one tile; picking it prompts for the payments
  connector (the "you'll also need this tool" nudge).
- **Reuses content-library** (storefront/grid/authoring), **rbac** (staff manage orders), the
  **executor seam** (payments), and the **decoupled-signal** pattern (paid → accounting/automation).
- **Feeds the cost calculator dynamically:** a payments connector carries a **%-fee + per-txn** cost
  (e.g. 2.9% + 30¢), which registers as a billable service line — exactly the "any service with a
  cost shows up automatically" directive (`app-builder-cost-calculator`). Break-even math then
  reflects processing fees.

## 9. Safety & money invariants (do not break)

1. **The pure engine never moves money or holds a secret** — intents only; the connector-bound
   executor performs, server-side, with `keyRef`-resolved keys.
2. **Secrets are `keyRef`s, never literals** in the Spec; `cleanCommerceConfig` strips non-references.
3. **`paid` comes from a verified webhook, never a client redirect**; order writes idempotent on the
   event id.
4. **Refunds/cancels require explicit admin confirmation** (never automatic).
5. **Money in integer minor units.** No floats.
6. **The AI proposes commerce *config*, never a transaction** — same envelope as every other module.

## 10. Open questions

1. **Line items** — subcollection now, or add a bounded `list<object>` field type to APP_SPEC
   (precedented by `figures[]`)? (Leaning: bounded list type — keeps an order one document.)
2. **Subscriptions** — model recurring billing in v0, or ship one-off first and add subscription as a
   fast follow? (Leaning: one-off v0; subscription needs the connector's recurring APIs + a member
   entitlement check that overlaps progression/rbac.)
3. **Digital delivery / entitlement** — a digital product grants access to gated content
   (content-library) or a role (rbac). Define the "purchase → entitlement" bridge, or defer?
4. **Tax/shipping** — connector-computed vs flat vs none in v0. (Leaning: flat + none in v0;
   connector-computed when the payments connector supports it.)
5. **First payments connector to build** — Stripe (best docs, embedded elements) vs Shopify (owners
   with an existing store)? (Leaning: Stripe first; Zapier alongside for breadth.)
