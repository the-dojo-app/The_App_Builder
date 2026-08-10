// test/booking.test.mjs — the booking config validator + wiring (known module, the paid→payments
// gate, a buildable toolbox offer). Scheduling: bookables + bookings (docs/MODULE_BOOKING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanBookingConfig } from '../src/modules/booking.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { moduleOffers } from '../src/intake/narrator.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('cleanBookingConfig bounds mode, slot/capacity/windows, statuses', () => {
  const c = cleanBookingConfig({ mode: 'teleport', slotMinutes: 3, capacityDefault: 0, leadTimeHours: -5, cancelWindowHours: 99999, statuses: ['ok', '#bad'], paid: 'yes' });
  assert.equal(c.mode, 'appointment');       // unknown → default
  assert.equal(c.slotMinutes, 5);            // clamped to floor
  assert.equal(c.capacityDefault, 1);        // clamped to floor
  assert.equal(c.leadTimeHours, 0);          // clamped to floor
  assert.equal(c.cancelWindowHours, 8760);   // clamped to ceiling
  assert.deepEqual(c.statuses, ['ok']);      // invalid status dropped
  assert.equal(c.paid, false);               // non-true → false
});

test('booking is a known module — an unpaid booking validates clean', () => {
  const spec = { ...dojo, modules: [...dojo.modules, { type: 'booking', config: { mode: 'class' } }] };
  const { spec: cleaned, errors } = cleanSpec(spec);
  assert.deepEqual(errors, []);
  assert.ok(cleaned.modules.some(m => m.type === 'booking'));
});

test('a PAID booking without a payments connector is an error; with one it validates', () => {
  const paid = { type: 'booking', config: { paid: true } };
  const noPay = cleanSpec({ ...dojo, modules: [...dojo.modules, paid] });
  assert.ok(noPay.errors.some(e => /paid bookings need a payments connector/.test(e)));
  const withPay = cleanSpec({ ...dojo, modules: [...dojo.modules, paid], integrations: { ...dojo.integrations, payments: { connector: 'stripe', keyRef: 'secret://SK' } } });
  assert.deepEqual(withPay.errors, []);
});

test('toolbox: the Booking & scheduling offer is a buildable proposal', () => {
  const kb = getStarter('knowledgebase');
  const offer = moduleOffers(kb).find(o => o.type === 'booking');
  assert.ok(offer && !offer.installed);
  const r = reviewProposal(kb, offer.addOps);
  assert.equal(r.ok, true, `Booking must build cleanly: ${(r.errors || []).join('; ')}`);
  assert.ok(r.preview.pages.some(p => p.id === 'book'));
});
