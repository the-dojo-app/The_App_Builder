// test/intake-cost.test.mjs — the cost calculator. It's a ballpark, so the tests assert SHAPE,
// MONOTONICITY (more members ⇒ more cost), determinism, honest ranges, input-clamping, and jargon-free
// output — not exact dollar figures (those track list prices).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateCost, summarizeCost, estimateBusiness, summarizeBusiness } from '../src/intake/cost.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('estimate has the expected shape and honest ranges', () => {
  const e = estimateCost(dojo, { members: 100, activityPerMonth: 20 });
  assert.equal(e.assumptions.members, 100);
  assert.ok(Array.isArray(e.monthly.lines) && e.monthly.lines.length >= 5);
  assert.ok(e.monthly.low <= e.monthly.total && e.monthly.total <= e.monthly.high);   // range brackets the point
  assert.ok(e.oneTime.low <= e.oneTime.high);
  e.monthly.lines.forEach(l => assert.ok(typeof l.amount === 'number' && l.amount >= 0 && l.label && l.note));
  assert.ok(e.disclaimer && /own/.test(e.disclaimer));
});

test('cost scales up with members (monotonic)', () => {
  const small = estimateCost(dojo, { members: 50, activityPerMonth: 20 }).monthly.total;
  const big = estimateCost(dojo, { members: 50000, activityPerMonth: 20 }).monthly.total;
  assert.ok(big > small, `big (${big}) should exceed small (${small})`);
});

test('a tiny app lands in the free tier (only the domain is billable)', () => {
  const e = estimateCost(getStarter('knowledgebase'), { members: 5, activityPerMonth: 5 });
  assert.equal(e.monthly.freeTier, true);
  // the only non-zero monthly line is the domain
  const billable = e.monthly.lines.filter(l => l.amount > 0);
  assert.deepEqual(billable.map(l => l.label), ['Domain']);
});

test('a media-heavy app costs more storage than a text-only one at the same scale', () => {
  const media = estimateCost(getStarter('coaching'), { members: 1000, activityPerMonth: 30 });   // workouts + video
  const text = estimateCost(getStarter('knowledgebase'), { members: 1000, activityPerMonth: 30 }); // articles
  const storLine = e => e.monthly.lines.find(l => l.label === 'File storage').amount;
  assert.ok(storLine(media) >= storLine(text));
});

test('deterministic and input-clamping', () => {
  const a = estimateCost(dojo, { members: 100, activityPerMonth: 20 });
  const b = estimateCost(dojo, { members: 100, activityPerMonth: 20 });
  assert.deepEqual(a, b);
  const junk = estimateCost(dojo, { members: 'lots', activityPerMonth: 'many' });
  assert.equal(junk.assumptions.members, 100);            // non-numbers fall back to defaults
  assert.equal(junk.assumptions.activityPerMonth, 20);
  const neg = estimateCost(dojo, { members: -5, activityPerMonth: 20 });
  assert.equal(neg.assumptions.members, 1);               // out-of-range numbers clamp to the floor
});

test('summarizeCost is plain-English, has dollars, and no jargon', () => {
  const txt = summarizeCost(estimateCost(dojo, { members: 200, activityPerMonth: 20 }));
  assert.match(txt, /\$/);
  assert.match(txt, /month/);
  assert.doesNotMatch(txt, /Firestore|egress|invocation|dataModel|Spec/);
});

test('business view: profit = revenue − cost, and it is feasible at a real price', () => {
  const b = estimateBusiness(dojo, { members: 1000, activityPerMonth: 20, pricePerMonth: 10, percentPaying: 100 });
  assert.equal(b.payingMembers, 1000);
  assert.equal(b.revenue, 10000);
  assert.equal(b.profit, round2(b.revenue - b.cost));
  assert.equal(b.breakEven.feasible, true);
  assert.ok(b.breakEven.members >= 1);
});

test('business view: a $0 price is never feasible (each member is pure cost)', () => {
  const b = estimateBusiness(dojo, { members: 1000, activityPerMonth: 20, pricePerMonth: 0, percentPaying: 100 });
  assert.equal(b.breakEven.feasible, false);
  assert.equal(b.breakEven.members, null);
});

test('business view: fewer paying members ⇒ less revenue', () => {
  const full = estimateBusiness(dojo, { members: 1000, activityPerMonth: 20, pricePerMonth: 10, percentPaying: 100 });
  const half = estimateBusiness(dojo, { members: 1000, activityPerMonth: 20, pricePerMonth: 10, percentPaying: 50 });
  assert.ok(half.revenue < full.revenue);
  assert.equal(half.payingMembers, 500);
});

test('summarizeBusiness is plain-English with dollars and no jargon', () => {
  const txt = summarizeBusiness(estimateBusiness(dojo, { members: 500, activityPerMonth: 20, pricePerMonth: 8, percentPaying: 80 }));
  assert.match(txt, /\$/);
  assert.match(txt, /break even/i);
  assert.doesNotMatch(txt, /Firestore|contribution|dataModel|Spec/);
});

function round2(n) { return Math.round(n * 100) / 100; }
