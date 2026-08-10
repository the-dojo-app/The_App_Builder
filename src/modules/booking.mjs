// src/modules/booking.mjs — the booking module's config validator (docs/MODULE_BOOKING.md §3).
// Bounded + pure, like the other module cleaners. Scheduling: bookables + bookings. Paid bookings
// reuse the payments connector (gated in cleanSpec, like commerce); attendance emits to activity-log.
// This validates only the booking-owned config; the capacity-guarded reserve happens at the seam.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && isFinite(v);
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const MODES = { appointment: 1, class: 1, resource: 1 };
const DEFAULT_STATUSES = ['pending', 'confirmed', 'canceled', 'attended', 'no-show'];
const MAX_STATUSES = 20, MAX_EMITS = 20;
const clampInt = (v, lo, hi, dflt) => isNum(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt;

export function cleanBookingConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  out.bookableCollection = isStr(c.bookableCollection) ? c.bookableCollection : 'bookables';
  out.bookingCollection = isStr(c.bookingCollection) ? c.bookingCollection : 'bookings';
  if (isStr(c.itemConcept)) out.itemConcept = c.itemConcept;
  out.mode = MODES[c.mode] ? c.mode : 'appointment';
  out.slotMinutes = clampInt(c.slotMinutes, 5, 1440, 30);
  out.capacityDefault = clampInt(c.capacityDefault, 1, 100000, 1);
  out.leadTimeHours = clampInt(c.leadTimeHours, 0, 8760, 0);
  out.cancelWindowHours = clampInt(c.cancelWindowHours, 0, 8760, 24);
  out.paid = c.paid === true;
  out.statuses = Array.isArray(c.statuses) ? c.statuses.filter(s => SLUG.test(s || '')).slice(0, MAX_STATUSES) : DEFAULT_STATUSES.slice();
  if (!out.statuses.length) out.statuses = DEFAULT_STATUSES.slice();
  if (Array.isArray(c.emitsTo)) out.emitsTo = c.emitsTo.filter(m => SLUG.test(m || '')).slice(0, MAX_EMITS);
  if (isObj(c.surfaces)) out.surfaces = c.surfaces;
  return out;
}

export const BOOKING_MODES = Object.keys(MODES);
