// test/commerce-connectors.test.mjs — the commerce config validator + the connector validator, and
// their wiring into cleanSpec (incl. the "commerce needs a payments connector" gate) and the toolbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanCommerceConfig } from '../src/modules/commerce.mjs';
import { cleanIntegrations, CONNECTORS } from '../src/shell/connectors.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { buildCatalog } from '../src/intake/catalog.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { moduleOffers } from '../src/intake/narrator.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('cleanCommerceConfig bounds currency, pricing, tax/shipping, states', () => {
  const c = cleanCommerceConfig({ productCollection: 'items', currency: 'usd', pricingModel: 'subscription', tax: { mode: 'connector' }, shipping: { mode: 'flat', flatCents: 4.7 }, orderStates: ['ok', '#bad'] });
  assert.equal(c.currency, 'USD');                 // bad case → default
  assert.equal(c.pricingModel, 'one-off');         // subscription not in v0 → clamped
  assert.equal(c.tax.mode, 'none');                // connector mode not in v0 → none
  assert.equal(c.shipping.flatCents, 5);           // rounded
  assert.deepEqual(c.orderStates, ['ok']);         // invalid state id dropped
  assert.equal(cleanCommerceConfig(undefined).productCollection, 'products');
});

test('cleanIntegrations keeps known connectors, drops unknown, strips literal secrets', () => {
  const out = cleanIntegrations({
    ai: { provider: 'anthropic', keyRef: 'secret://AK' },
    payments: { connector: 'stripe', keyRef: 'secret://SK' },
    accounting: { connector: 'not-real', keyRef: 'secret://X' },   // unknown → dropped
    email: { connector: 'resend', keyRef: 'sk_live_LITERAL' },     // literal secret → stripped
    muse: { type: 'evidence-source', moduleRef: 'content-library' } // inert domain → passthrough
  });
  assert.equal(out.payments.connector, 'stripe');
  assert.equal(out.payments.keyRef, 'secret://SK');
  assert.equal(out.accounting, undefined);
  assert.equal(out.email.connector, 'resend');
  assert.equal('keyRef' in out.email, false);                      // literal stripped
  assert.equal(out.ai.provider, 'anthropic');
  assert.ok(out.muse);                                             // inert passthrough kept
});

test('cleanIntegrations drops an unknown key that carries a secret (no trust leak)', () => {
  const out = cleanIntegrations({ sneaky: { connector: 'evil', keyRef: 'secret://X' } });
  assert.deepEqual(out, {});
});

test('cleanSpec: commerce WITHOUT a payments connector is an error', () => {
  const spec = { ...dojo, modules: [...dojo.modules, { type: 'commerce', config: { productCollection: 'products' } }] };
  const { errors } = cleanSpec(spec);
  assert.ok(errors.some(e => /payments connector/.test(e)));
});

test('cleanSpec: commerce WITH a payments connector validates clean', () => {
  const spec = {
    ...dojo,
    modules: [...dojo.modules, { type: 'commerce', config: { productCollection: 'products' } }],
    integrations: { ...dojo.integrations, payments: { connector: 'stripe', keyRef: 'secret://SK' } }
  };
  const { spec: cleaned, errors } = cleanSpec(spec);
  assert.deepEqual(errors, []);
  assert.equal(cleaned.integrations.payments.connector, 'stripe');
  assert.ok(cleaned.modules.some(m => m.type === 'commerce'));
});

test('the AI grounding catalog exposes commerce + the connector categories', () => {
  const cat = buildCatalog(dojo);
  assert.ok(cat.modules.some(m => m.type === 'commerce'));
  const payments = cat.connectors.find(c => c.category === 'payments');
  assert.ok(payments.options.some(o => o.id === 'stripe'));
  assert.equal(cat.connectors.length, 6);   // the 6 connector categories
});

test('toolbox: the Shop (commerce) offer is a buildable proposal (brings its own payments)', () => {
  const kb = getStarter('knowledgebase');
  const shop = moduleOffers(kb).find(o => o.type === 'commerce');
  assert.ok(shop && !shop.installed);
  const r = reviewProposal(kb, shop.addOps);
  assert.equal(r.ok, true, `Shop must build cleanly: ${(r.errors || []).join('; ')}`);
  assert.ok(r.preview.pages.some(p => p.id === 'shop'));
});

test('every connector belongs to a real category', () => {
  const cats = new Set(['payments', 'accounting', 'fulfilment', 'email', 'crm', 'automation']);
  CONNECTORS.forEach(c => assert.ok(cats.has(c.category), `${c.id} has a valid category`));
});
