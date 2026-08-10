// src/shell/connectors.mjs — the CONNECTOR CATALOG + cleanIntegrations (docs/CONNECTORS.md). External
// SaaS a built app talks to, behind a vetted, bounded contract. Pure. Lives in shell/ (core validation
// like providers/auth), composed into cleanSpec. The engine never calls a connector — that happens at
// the executor seam, server-side; this only validates the CHOICE and enforces keyRef-not-literal.

import { PROVIDERS } from './providers.mjs';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const SECRET = /^secret:\/\/.+/;   // a key must be a reference, never a literal secret

export const CONNECTOR_CATEGORIES = ['payments', 'accounting', 'fulfilment', 'email', 'crm', 'automation'];

// The vetted set (v0). The AI may only choose from here; unknown ids are refused.
export const CONNECTORS = [
  { id: 'stripe', category: 'payments', name: 'Stripe' },
  { id: 'shopify', category: 'payments', name: 'Shopify' },
  { id: 'quickbooks', category: 'accounting', name: 'QuickBooks' },
  { id: 'xero', category: 'accounting', name: 'Xero' },
  { id: 'shipstation', category: 'fulfilment', name: 'ShipStation' },
  { id: 'resend', category: 'email', name: 'Resend' },
  { id: 'mailchimp', category: 'email', name: 'Mailchimp' },
  { id: 'hubspot', category: 'crm', name: 'HubSpot' },
  { id: 'zapier', category: 'automation', name: 'Zapier' }   // the breadth escape hatch
];

export function listConnectors(category) {
  return CONNECTORS.filter(c => c.category === category).map(c => ({ ...c }));
}

const knownConnector = (id, category) => CONNECTORS.some(c => c.id === id && c.category === category);
const knownAiProvider = id => PROVIDERS.some(p => p.id === id && p.capability === 'ai');

// Validate the Spec's `integrations` block: keep `ai` (a provider) + known connectors per category;
// every key must be a secret:// reference (literals stripped); unknown connectors dropped. Inert
// domain integrations (an object with no key/connector fields, e.g. Dojo's muse moduleRef) pass through.
export function cleanIntegrations(block) {
  const b = isObj(block) ? block : {};
  const out = {};

  // ai — a provider, not a connector (CONNECTORS.md §3). Keep {provider, keyRef} if the provider is known.
  if (isObj(b.ai) && isStr(b.ai.provider) && knownAiProvider(b.ai.provider)) {
    out.ai = { provider: b.ai.provider };
    if (SECRET.test(b.ai.keyRef)) out.ai.keyRef = b.ai.keyRef;
  }

  // connector categories — validate the connector id + strip non-reference keys
  for (const cat of CONNECTOR_CATEGORIES) {
    const e = b[cat];
    if (!isObj(e) || !isStr(e.connector) || !knownConnector(e.connector, cat)) continue;
    const o = { connector: e.connector };
    if (SECRET.test(e.keyRef)) o.keyRef = e.keyRef;
    if (SECRET.test(e.webhookRef)) o.webhookRef = e.webhookRef;
    if (e.optional === true) o.optional = true;
    out[cat] = o;
  }

  // inert domain integrations (no secret/connector) pass through; anything else is dropped, never trusted
  const known = new Set(['ai', ...CONNECTOR_CATEGORIES]);
  for (const k of Object.keys(b)) {
    if (known.has(k)) continue;
    const e = b[k];
    if (isObj(e) && !('keyRef' in e) && !('webhookRef' in e) && !('connector' in e)) out[k] = e;
  }
  return out;
}
