// src/intake/cost.mjs — the COST CALCULATOR (docs/EXPERIENCE.md; Will 2026-08-10). Because the
// product is clone-first + BYO key, the owner pays their own infra + AI bills directly — so an honest,
// up-front estimate is a real selling point AND a trust builder (no hidden platform tax). Pure +
// deterministic like the rest of the engine: derive usage from the Spec + the owner's "how many
// members / how active" inputs, price it against published list rates, and return a RANGE with named
// assumptions. This is a BALLPARK, not a bill — every line is labelled and every assumption is shown.
//   estimateCost(spec, inputs) → { assumptions, oneTime, monthly, disclaimer }
//   summarizeCost(estimate)    → a plain-English, jargon-free one-liner

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const clampNum = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : dflt;
const round = n => Math.round(n * 100) / 100;

// Published list prices (USD), rough as of 2026-08. Estimates only — kept in one place so they're easy
// to update, and surfaced as assumptions so the number is never a black box.
const PRICE = {
  firestoreReadPer: 0.06 / 100000,     // per document read
  firestoreWritePer: 0.18 / 100000,    // per document write
  firestoreStorageGB: 0.18,            // per GB-month
  cloudStorageEgressGB: 0.12,          // per GB downloaded
  functionsPerMillion: 0.40,           // per invocation beyond the free grant
  domainMonthly: 1.0,                  // ~$12/yr amortised
  // approximate monthly free grants (from Firebase's daily quotas)
  freeReads: 1500000, freeWrites: 600000, freeStorageGB: 1, freeEgressGB: 30, freeFunctions: 2000000,
  // one-time AI build conversation on the owner's key (BYO) — a guided build is many model calls
  aiBuildLow: 1, aiBuildHigh: 8
};

const MEDIA_FORMATS = ['image', 'video', 'audio', 'pdf', 'file'];
const MEDIA_FIELDS = ['image', 'file'];

function usageFromSpec(spec) {
  const s = isObj(spec) ? spec : {};
  const models = Array.isArray(s.dataModels) ? s.dataModels : [];
  const modules = new Set((Array.isArray(s.modules) ? s.modules : []).map(m => m && m.type));
  const cl = (Array.isArray(s.modules) ? s.modules : []).find(m => m && m.type === 'content-library');
  const formats = (cl && isObj(cl.config) && Array.isArray(cl.config.formats)) ? cl.config.formats : [];

  const memberModels = models.filter(m => isObj(m) && m.owner === 'member').length || 1;
  const hasVideo = formats.includes('video');
  const hasMedia = modules.has('content-library') && formats.some(f => MEDIA_FORMATS.includes(f));
  // per-member uploads (e.g. screenshot/file evidence) if any member-owned model stores media
  const hasUploads = models.some(m => isObj(m) && m.owner === 'member' && Array.isArray(m.fields)
    && m.fields.some(f => isObj(f) && MEDIA_FIELDS.includes(f.type)));
  return { memberModels, hasVideo, hasMedia, hasUploads, aiRuntime: isObj(s.integrations) && isObj(s.integrations.ai) };
}

export function estimateCost(spec, inputs = {}) {
  const members = Math.round(clampNum(inputs.members, 1, 10000000, 100));
  const activity = clampNum(inputs.activityPerMonth, 0, 100000, 20);   // member actions/visits per month
  const u = usageFromSpec(spec);

  // ---- derive monthly usage --------------------------------------------------
  const visits = members * activity;
  const writes = visits * u.memberModels;                    // each action writes to the member's models
  const reads = visits * 40;                                  // a visit reads dashboards, lists, progression, etc.
  const uploadGB = u.hasUploads ? (visits * 0.5) / 1024 : 0;  // ~0.5 MB per upload
  const contentGB = u.hasMedia ? (u.hasVideo ? 5 : 1) : 0.2;  // owner-published content
  const storageGB = round(contentGB + uploadGB);
  const egressGB = round(visits * (u.hasMedia ? 0.003 : 0.0005));  // downloads (the most variable line)

  // ---- price it (after free grants) ------------------------------------------
  const line = (label, amount, note) => ({ label, amount: round(Math.max(0, amount)), note });
  const cReads = Math.max(0, reads - PRICE.freeReads) * PRICE.firestoreReadPer;
  const cWrites = Math.max(0, writes - PRICE.freeWrites) * PRICE.firestoreWritePer;
  const cStorage = Math.max(0, storageGB - PRICE.freeStorageGB) * PRICE.firestoreStorageGB;
  const cEgress = Math.max(0, egressGB - PRICE.freeEgressGB) * PRICE.cloudStorageEgressGB;
  const cFns = Math.max(0, writes - PRICE.freeFunctions) / 1e6 * PRICE.functionsPerMillion;

  const lines = [
    line('Database reads', cReads, `~${Math.round(reads).toLocaleString()} reads/mo`),
    line('Database writes', cWrites, `~${Math.round(writes).toLocaleString()} writes/mo`),
    line('File storage', cStorage, `~${storageGB} GB stored`),
    line('File downloads', cEgress, `~${egressGB} GB/mo (most variable)`),
    line('Server functions', cFns, 'notifications, admin actions'),
    line('Domain', PRICE.domainMonthly, 'a custom web address (~$12/yr)')
  ];
  const total = round(lines.reduce((a, l) => a + l.amount, 0));
  const freeTier = round(cReads + cWrites + cStorage + cEgress + cFns) === 0;   // only the domain is billable

  // ---- one-time build (mostly the AI conversation on the owner's key) ---------
  const oneTime = {
    lines: [
      { label: 'AI build conversation', low: PRICE.aiBuildLow, high: PRICE.aiBuildHigh, note: 'on your own AI key (BYO) — one guided build' }
    ],
    low: PRICE.aiBuildLow, high: PRICE.aiBuildHigh
  };

  return {
    assumptions: {
      members, activityPerMonth: activity,
      note: `Assumes ${members.toLocaleString()} members doing ~${activity} things each per month.`,
      pricingNote: 'Priced against published Firebase + AI list rates (2026-08) on a fresh project; your key, your bill — we add no markup. If you bring accounts you already pay for, or choose a different provider, your added cost can be lower.'
    },
    monthly: {
      lines,
      total,
      low: round(total * 0.7),           // ±uncertainty band
      high: round(total * 1.6),
      freeTier
    },
    oneTime,
    disclaimer: 'A ballpark, not a bill. Real cost depends on how members actually use the app. Everything here runs on your own accounts — you own it, and we take no cut.'
  };
}

// ── the BUSINESS view (Will 2026-08-10): "how many members paying how much do I need to cover costs
// and profit — and how much profit will I make?" Unit economics derived from the cost model, honest
// about the case where each member costs more than they pay.
export function estimateBusiness(spec, inputs = {}) {
  const members = Math.round(clampNum(inputs.members, 1, 10000000, 100));
  const activityPerMonth = clampNum(inputs.activityPerMonth, 0, 100000, 20);
  const price = clampNum(inputs.pricePerMonth, 0, 100000, 10);       // what a PAYING member pays/month
  const percentPaying = clampNum(inputs.percentPaying, 0, 100, 100); // freemium share who actually pay

  const costNow = estimateCost(spec, { members, activityPerMonth }).monthly.total;
  const costFixed = estimateCost(spec, { members: 1, activityPerMonth }).monthly.total;   // ~member-independent
  const costPerMember = members > 0 ? Math.max(0, (costNow - costFixed) / members) : 0;

  const payFrac = percentPaying / 100;
  const revenuePerMember = price * payFrac;                          // avg revenue across ALL members
  const contribution = revenuePerMember - costPerMember;            // each member's net toward fixed costs

  const payingMembers = Math.round(members * payFrac);
  const revenue = round(payingMembers * price);
  const profit = round(revenue - costNow);
  const margin = revenue > 0 ? round(profit / revenue * 100) : 0;

  const feasible = contribution > 0;
  const breakEvenMembers = feasible ? Math.ceil(costFixed / contribution) : null;
  const breakEvenPaying = feasible ? Math.ceil(breakEvenMembers * payFrac) : null;

  return {
    inputs: { members, activityPerMonth, pricePerMonth: round(price), percentPaying },
    payingMembers, revenue, cost: round(costNow), profit, margin,
    perMember: { revenue: round(revenuePerMember), cost: round(costPerMember), contribution: round(contribution) },
    breakEven: {
      feasible,
      members: breakEvenMembers,
      payingMembers: breakEvenPaying,
      note: feasible
        ? `Break even at ~${breakEvenMembers.toLocaleString()} members (~${breakEvenPaying.toLocaleString()} paying).`
        : 'At this price, each member costs more than they bring in — raise the price or trim costs to reach profit.'
    }
  };
}

export function summarizeBusiness(b) {
  if (!isObj(b) || !isObj(b.breakEven)) return '';
  if (!b.breakEven.feasible) {
    return `At $${b.inputs.pricePerMonth}/member with ${b.inputs.percentPaying}% paying, each member costs more than they pay — raise the price or trim costs before you can profit.`;
  }
  const verdict = b.profit >= 0
    ? `you'd clear about $${b.profit.toLocaleString()}/month profit (${b.margin}% margin)`
    : `you'd still be about $${Math.abs(b.profit).toLocaleString()}/month short`;
  return `At $${b.inputs.pricePerMonth}/member and ${b.inputs.percentPaying}% paying, you break even around ${b.breakEven.members.toLocaleString()} members. At ${b.inputs.members.toLocaleString()} members, ${verdict}.`;
}

export function summarizeCost(est) {
  if (!isObj(est) || !isObj(est.monthly)) return '';
  const m = est.monthly, a = est.assumptions;
  const run = m.freeTier
    ? `about $${m.high.toFixed(2)}/month or less — small apps like this often stay within the free tier`
    : `roughly $${m.low.toFixed(2)}–$${m.high.toFixed(2)} per month to run`;
  return `At ${a.members.toLocaleString()} members doing ~${a.activityPerMonth} things a month, expect ${run}, plus a one-time ~$${est.oneTime.low}–$${est.oneTime.high} to build it on your own AI key. It's your bill, not ours — we add no markup.`;
}
