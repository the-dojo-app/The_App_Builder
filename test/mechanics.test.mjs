// test/mechanics.test.mjs — the mechanic library: the pure evaluators (criterion logic) and
// cleanParams bounding, plus cleanRules validating a rules doc against the library + appMechanics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MECHANICS } from '../src/modules/mechanics.mjs';
import { cleanRules } from '../src/modules/rules.mjs';
import { cleanSpec } from '../src/assembler.mjs';

const DAY = 86400000;
const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));
const ev = activities => ({ activities });
const met = (type, params, evidence) => MECHANICS[type].evaluate(evidence, MECHANICS[type].cleanParams(params)).met;

test('count-threshold counts activities', () => {
  assert.equal(met('count-threshold', { target: 3 }, ev([{ ts: 1 }, { ts: 2 }])), false);
  assert.equal(met('count-threshold', { target: 3 }, ev([{ ts: 1 }, { ts: 2 }, { ts: 3 }])), true);
});

test('continuity-chain uses the CURRENT run and RESETS on a gap', () => {
  const within = [{ ts: 0 }, { ts: DAY - 1 }, { ts: 2 * DAY - 2 }];       // 3-in-a-row within 24h
  assert.equal(met('continuity-chain', { window: DAY, target: 3 }, ev(within)), true);
  const gapped = [{ ts: 0 }, { ts: DAY - 1 }, { ts: 10 * DAY }];          // big gap → current run is 1
  assert.equal(met('continuity-chain', { window: DAY, target: 2 }, ev(gapped)), false);
});

test('consecutive-days finds the longest run of adjacent days', () => {
  const threeDays = [{ ts: 0 }, { ts: DAY }, { ts: 2 * DAY }];
  assert.equal(met('consecutive-days', { days: 3 }, ev(threeDays)), true);
  const broken = [{ ts: 0 }, { ts: DAY }, { ts: 5 * DAY }];
  assert.equal(met('consecutive-days', { days: 3 }, ev(broken)), false);
});

test('score-floor and duration-floor read the best activity', () => {
  assert.equal(met('score-floor', { min: 90 }, ev([{ ts: 1, score: 88 }, { ts: 2, score: 91 }])), true);
  assert.equal(met('score-floor', { min: 90 }, ev([{ ts: 1, score: 88 }])), false);
  assert.equal(met('duration-floor', { minSec: 300 }, ev([{ ts: 1, durationSec: 320 }])), true);
});

test('required-content consumes the completion signal (not activities)', () => {
  assert.equal(MECHANICS['required-content'].evaluate({ completedRequired: true }, { scope: 'unit' }).met, true);
  assert.equal(MECHANICS['required-content'].evaluate({ completedRequired: { unit: true } }, { scope: 'unit' }).met, true);
  assert.equal(MECHANICS['required-content'].evaluate({}, { scope: 'unit' }).met, false);
});

test('cleanParams bounds every mechanic (no unbounded values reach evaluate)', () => {
  assert.equal(MECHANICS['count-threshold'].cleanParams({ target: 1e9 }).target, 100000);
  assert.equal(MECHANICS['consecutive-days'].cleanParams({ days: -5 }).days, 1);
  assert.equal(MECHANICS['continuity-chain'].cleanParams({}).window, DAY);   // default
});

test('cleanRules: library mechanics kept, unknown dropped, appspecific needs registration', () => {
  const doc = {
    White: { badges: [
      { slot: 1, mechanic: 'continuity-chain', params: { window: DAY, target: 1 } },
      { slot: 2, mechanic: 'teleport', params: {} },                  // unknown → dropped
      { slot: 3, mechanic: 'appspecific:ghost', params: {} }          // unregistered → dropped
    ] },
    Mystery: { badges: [] }                                           // unit not declared → dropped
  };
  const out = cleanRules(doc, { units: ['White', 'Black'], appMechanics: ['wing-time'] });
  assert.deepEqual(Object.keys(out), ['White']);
  assert.equal(out.White.badges.length, 1);
  assert.equal(out.White.badges[0].mechanic, 'continuity-chain');
});

test('the Dojo spec inline rules validate through cleanSpec (incl. appspecific:wing-time)', () => {
  const { spec, errors } = cleanSpec(dojoSpec);
  assert.deepEqual(errors, []);
  const prog = spec.modules.find(m => m.type === 'progression');
  assert.equal(prog.config.rules.White.badges.length, 3);
  assert.equal(prog.config.rules.Black.badges[0].mechanic, 'appspecific:wing-time');  // registered → kept
  assert.equal(prog.config.rules.Black.badges[1].params.min, 90);                     // score-floor cleaned
});
