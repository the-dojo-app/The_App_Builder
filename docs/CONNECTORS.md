<!-- CONNECTORS.md · v0 · 2026-08-10 · DRAFT for sign-off -->
<!-- Owner: Will Genske. Author: assistant. The connector layer — generalized from MODULE_COMMERCE.md's payments contract. See PLATFORM.md / APP_SPEC.md. -->

# The Connector Layer (v0, DRAFT)

**Status: PROPOSED / DRAFT, 2026-08-10.** How an Appgnostic-built app talks to **any modern external
platform** — payments (Stripe/Shopify), accounting (QuickBooks/Xero), fulfilment, email, CRM, and
**Zapier** (→ thousands more). Generalized from the payments contract commerce introduced
(`MODULE_COMMERCE.md` §7), now that it's the layer, not a commerce detail. Design-first: no code
until sign-off.

**The one idea:** a connector is a **vetted adapter** that binds the app to one external service
through a **bounded contract**. The AI may only choose from the vetted catalog; every key is a
`keyRef`, never a literal; and **every call happens at the executor seam, server-side** — the pure
engine never touches an external API or a secret. Safe by construction, at the edge of the system.

---

## 1. Three layers, one discipline

Appgnostic composes from three **vetted, bounded catalogs** — same shape, different jobs:

| Layer | What it is | Doc | Where it binds |
|---|---|---|---|
| **Providers** | where the app's OWN infra lives (db/auth/storage/hosting/ai) | provider catalog (`shell/providers.mjs`) | executor + target generator |
| **Modules** | the app's capabilities (content/progression/rbac/commerce) | `MODULE_*.md` | in the assembled app |
| **Connectors** | external SaaS the app TALKS TO (Stripe/QuickBooks/Zapier) | **this doc** | the executor seam, server-side |

Providers = your foundation; modules = your rooms; connectors = the doors to the outside world.

## 2. What a connector is

A connector declares four things — and nothing else touches the engine:

```jsonc
{
  "id": "stripe",
  "category": "payments",                 // payments | accounting | fulfilment | email | crm | automation
  "name": "Stripe",
  "config":       { "keyRef": "secret://STRIPE_KEY" },   // BYO key, a reference — never a literal
  "capabilities": ["createCheckout","verifyWebhook","refund"],  // functions the executor may call
  "events":       ["payment.succeeded","payment.refunded"]      // signed webhooks it emits
}
```

- **Capabilities** are the verbs a module's executor calls (a per-category contract, §4).
- **Events** are inbound: the connector's signed webhooks, verified server-side, turned into the
  decoupled signals modules consume (`MODULE_CONTENT_LIBRARY.md` §6 pattern).
- **config** carries only `keyRef`/`webhookRef` references. `cleanIntegrations` drops any non-`secret://` value.

## 3. The Spec representation (`integrations`)

Connectors live in the Spec's existing `integrations` block (`APP_SPEC.md`), keyed by category, each
naming a vetted connector id + its refs:

```jsonc
"integrations": {
  "ai":       { "provider": "anthropic", "keyRef": "secret://ANTHROPIC_KEY" },   // (a provider, not a connector)
  "payments":   { "connector": "stripe",     "keyRef": "secret://STRIPE_KEY" },
  "accounting": { "connector": "quickbooks",  "keyRef": "secret://QBO_KEY", "optional": true },
  "automation": { "connector": "zapier",      "webhookRef": "secret://ZAPIER_HOOK", "optional": true }
}
```

A module references a category (`config.payments.connector`), not a specific vendor — so swapping
Stripe→Shopify is an `integrations` edit, module untouched.

## 4. Per-category contracts (v0)

Each category is an abstract interface every connector in it implements. The executor calls these;
the connector adapts to the vendor API. Payments is the proven one (from commerce):

```
payments:    createCheckout(order, ctx) → { url|clientSecret, connectorRef }
             verifyWebhook(raw, sig, ctx) → { event, orderRef, status }
             refund(order, amountCents, ctx) → { ok, connectorRef }
accounting:  recordSale(order, ctx) → { ok, ref }         // on paid
             recordRefund(order, ctx) → { ok, ref }
fulfilment:  createShipment(order, ctx) → { trackingUrl, ref }
             getStatus(ref, ctx) → { status }
email:       send(template, to, data, ctx) → { ok, id }
automation:  emit(event, payload, ctx) → { ok }           // Zapier: POST to the webhook
```

New categories are added deliberately (a doc + a contract), never invented by the AI.

## 5. The vetted catalog (v0)

Bounded, like the module + provider catalogs. Unknown ids are refused by `cleanIntegrations`.

| Category | Connectors (v0) | Notes |
|---|---|---|
| **payments** | `stripe` (first), `shopify` | Stripe first — best docs, embedded elements, we never touch card data |
| **accounting** | `quickbooks`, `xero` | optional; consumes the `paid` signal |
| **fulfilment** | `shipstation` | optional; tracking back into orders |
| **email** | `resend`, `mailchimp` | transactional + campaigns (ties to marketing, `app-builder-marketing-campaigns`) |
| **crm** | `hubspot` | optional |
| **automation** | `zapier` | **the breadth escape hatch** — one webhook → thousands of downstream apps |

**Zapier's role:** rather than build a bespoke adapter per platform, `automation:zapier` reaches
almost anything through a single verified webhook. Native connectors (Stripe, QuickBooks) exist where
a first-class integration genuinely beats a generic webhook; Zapier covers the long tail.

## 6. `cleanIntegrations` — the safety-spine addition

A new validator composed into `cleanSpec` (mirroring `cleanProviders`/module cleaners):

- Each `integrations[category]` names a **known connector** for that category, else the entry is
  dropped (never trusted). Unknown category or connector → dropped + surfaced.
- Every key is a `secret://…` **reference**; any literal-looking secret is **stripped** (a Spec must
  stay safe to export/template/seed).
- `optional:true` entries may be absent; a module that *requires* a category (commerce needs
  payments) errors at plan time if it's missing — a clear "you also need to connect Stripe" prompt.

## 7. Execution — only at the seam

- No `src/` code imports a vendor SDK or reads a secret. Connectors are invoked **only** through the
  injected executor (`applyPlan`'s seam), server-side, with `keyRef`s resolved from the owner's
  secret store at call time.
- **Inbound** (webhooks) are verified by signature server-side before any state change; writes are
  **idempotent** on the event id.
- **Irreversible outbound** (refund, send-campaign, delete) require the same confirmation the global
  safety rules demand — never auto-fired.
- **The AI proposes connector *config*, never a call** — identical envelope to modules/theme/etc.

## 8. The honest boundary & growth

- **Inside the catalog:** the AI wires it — pick a connector, supply the `keyRef`, done.
- **Outside the catalog:** the AI does **not** invent an adapter. It surfaces a **connector request**
  (like the module-request escape hatch) — a vetted, human-built addition to the catalog. The
  platform grows by adding *vetted connectors*, never by the AI writing raw integration code into
  someone's app. This is the integrity guarantee at the system's edge.

## 9. Ties to the rest

- **Cost calculator** (`app-builder-cost-calculator`): a connector can carry a cost — a payments
  connector's **%-fee + per-txn**, an email connector's per-send — which registers as a **billable
  line automatically** (the "any service with a cost shows up" directive). Break-even reflects fees.
- **Marketing** (`app-builder-marketing-campaigns`): generate campaigns with the AI, **send** them
  through the email/automation connectors.
- **Reference-by-URL / function** (`app-builder-design-by-reference-url`): "make it do what that site
  does" may resolve to *connect a connector* (e.g. that site takes Stripe payments).

## 10. Open questions

1. **Secret store** — where `keyRef`s resolve (Google Secret Manager for Firebase; per-provider
   otherwise). Confirm the resolution boundary lives entirely in the executor. (Leaning: yes, Secret
   Manager for the Firebase target; the seam abstracts it.)
2. **OAuth connectors** — QuickBooks/HubSpot use OAuth, not a static key. v0 keyRef model or an OAuth
   grant flow? (Leaning: keyRef/API-key connectors first; OAuth as a connector sub-type once one
   needs it.)
3. **Connector-owned pages/blocks** — does a connector ever contribute UI (a Stripe checkout element),
   or only backend capabilities? (Leaning: capabilities only in v0; the module owns the UI.)
4. **Rate limits / retries / dead-letter** — the executor's responsibility per connector; spec the
   retry/idempotency policy when the first executor is built.
