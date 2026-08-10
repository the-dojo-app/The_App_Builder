// src/shell/providers.mjs — the PROVIDER CATALOG (docs; Will 2026-08-10, "Appgnostic = provider-
// agnostic"). Where the built app's OWN infrastructure lives — database, auth, storage, hosting, AI —
// with a vetted set of choices per capability so an owner is NEVER forced onto one stack and can bring
// accounts they already have. Sibling of the module catalog (capabilities) and the future connector
// catalog (external SaaS the app talks to — Stripe/Shopify/…, see the connectors memory).
//
// Pure data + selectors + a bounded validator. The engine stays provider-neutral: a provider choice is
// just config in the Spec; the ACTUAL binding happens at the executor seam (applyPlan) + a per-target
// rules/artifact generator. Firebase is the default because that's what reference app #1 proved.
//   listProviders(capability) → the choices for a capability, each with a card
//   getProvider(id)           → one provider (or null)
//   cleanProviders(block)     → validate a Spec `providers` block: known ids per capability, else default
//   DEFAULT_PROVIDERS         → the safe defaults (all Firebase + Anthropic)

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// Each provider: { id, capability, name, summary, default?, byoAccount, freeTier }. `byoAccount` = the
// owner can connect an account they already have (the whole point). Kept deliberately small + vetted;
// the AI may only choose from here (unknown → dropped to the capability default).
export const PROVIDERS = [
  // — database —
  { id: 'firebase-firestore', capability: 'database', name: 'Firebase (Firestore)', summary: 'Google’s managed NoSQL. What reference app #1 runs on; generous free tier.', default: true, byoAccount: true, freeTier: 'yes' },
  { id: 'supabase-postgres', capability: 'database', name: 'Supabase (Postgres)', summary: 'Open-source Postgres with realtime + row-level security. SQL, not NoSQL.', byoAccount: true, freeTier: 'yes' },
  { id: 'mongodb-atlas', capability: 'database', name: 'MongoDB Atlas', summary: 'Managed MongoDB document database.', byoAccount: true, freeTier: 'yes' },
  { id: 'postgres-self', capability: 'database', name: 'Your own Postgres', summary: 'Bring a Postgres you already run or host anywhere.', byoAccount: true, freeTier: 'n/a' },

  // — auth —
  { id: 'firebase-auth', capability: 'auth', name: 'Firebase Auth', summary: 'Email, social, and custom-claim roles. Pairs with Firestore.', default: true, byoAccount: true, freeTier: 'yes' },
  { id: 'supabase-auth', capability: 'auth', name: 'Supabase Auth', summary: 'Postgres-native auth with row-level security.', byoAccount: true, freeTier: 'yes' },
  { id: 'auth0', capability: 'auth', name: 'Auth0', summary: 'Enterprise-grade identity, many providers + SSO.', byoAccount: true, freeTier: 'yes' },
  { id: 'clerk', capability: 'auth', name: 'Clerk', summary: 'Drop-in auth + user management with polished UIs.', byoAccount: true, freeTier: 'yes' },

  // — storage —
  { id: 'firebase-storage', capability: 'storage', name: 'Firebase Storage', summary: 'Managed object storage for images/video/files.', default: true, byoAccount: true, freeTier: 'yes' },
  { id: 'supabase-storage', capability: 'storage', name: 'Supabase Storage', summary: 'S3-compatible storage with access policies.', byoAccount: true, freeTier: 'yes' },
  { id: 'aws-s3', capability: 'storage', name: 'Amazon S3', summary: 'The industry-standard object store.', byoAccount: true, freeTier: 'limited' },
  { id: 'cloudflare-r2', capability: 'storage', name: 'Cloudflare R2', summary: 'S3-compatible storage with no egress fees.', byoAccount: true, freeTier: 'yes' },

  // — hosting —
  { id: 'firebase-hosting', capability: 'hosting', name: 'Firebase Hosting', summary: 'Fast static/SPA hosting on Google’s CDN.', default: true, byoAccount: true, freeTier: 'yes' },
  { id: 'vercel', capability: 'hosting', name: 'Vercel', summary: 'Front-end hosting with previews + edge.', byoAccount: true, freeTier: 'yes' },
  { id: 'netlify', capability: 'hosting', name: 'Netlify', summary: 'Static hosting + serverless functions.', byoAccount: true, freeTier: 'yes' },
  { id: 'cloudflare-pages', capability: 'hosting', name: 'Cloudflare Pages', summary: 'Static hosting on Cloudflare’s edge.', byoAccount: true, freeTier: 'yes' },

  // — ai (the intake + any in-app AI features; BYO key) —
  { id: 'anthropic', capability: 'ai', name: 'Anthropic (Claude)', summary: 'Powers the co-builder + any in-app AI. Bring your own key.', default: true, byoAccount: true, freeTier: 'no' },
  { id: 'openai', capability: 'ai', name: 'OpenAI', summary: 'Alternative model provider. Bring your own key.', byoAccount: true, freeTier: 'no' }
];

export const CAPABILITIES = ['database', 'auth', 'storage', 'hosting', 'ai'];

// The safe defaults per capability (all Firebase + Anthropic) — what a Spec falls back to.
export const DEFAULT_PROVIDERS = Object.fromEntries(
  CAPABILITIES.map(cap => [cap, (PROVIDERS.find(p => p.capability === cap && p.default) || PROVIDERS.find(p => p.capability === cap)).id])
);

export function listProviders(capability) {
  return PROVIDERS.filter(p => p.capability === capability).map(p => ({ ...p }));
}

export function getProvider(id) {
  const p = PROVIDERS.find(x => x.id === id);
  return p ? { ...p } : null;
}

// Validate a Spec `providers` block: each capability resolves to a KNOWN provider of that capability,
// else the capability default. Unknown ids are never trusted (dropped to default). Total, pure.
export function cleanProviders(block) {
  const b = isObj(block) ? block : {};
  const out = {};
  for (const cap of CAPABILITIES) {
    const chosen = b[cap];
    const ok = typeof chosen === 'string' && PROVIDERS.some(p => p.id === chosen && p.capability === cap);
    out[cap] = ok ? chosen : DEFAULT_PROVIDERS[cap];
  }
  return out;
}
