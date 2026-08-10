// test/intake-narrator.test.mjs — the co-builder voice. The load-bearing guarantee: every proactive
// suggestion is itself a VALID, buildable proposal (its ops pass the gate) — the app never offers
// something it can't actually deliver. Plus: warm framing on success, a kind honest boundary on
// refusal, and jargon-free copy throughout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { narrateProposal, checkpoint, greeting, suggestNext, renderNarration, consequenceOf, decisionRecord, explainRecord } from '../src/intake/narrator.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));
const minimal = { spec: '0', app: { id: 'blank', name: 'Blank' }, auth: { roles: [{ id: 'owner', label: 'Owner', rank: 100 }] } };

test('narrateProposal celebrates a good change and invites confirmation', () => {
  const r = reviewProposal(getStarter('knowledgebase'), suggestNext(getStarter('knowledgebase'))[0].ops);
  const n = narrateProposal(r);
  assert.equal(n.tone, 'ready');
  assert.ok(n.bullets.length >= 1);
  assert.match(n.prompt, /Build it\?/);
  assert.ok(n.milestones.some(m => /levels/i.test(m)));   // add-levels crosses a milestone
});

test('narrateProposal frames a refusal kindly (the honest boundary)', () => {
  const r = reviewProposal(dojo, [{ target: 'modules', op: 'add', value: { type: 'chatroom', config: {} } }]);
  const n = narrateProposal(r);
  assert.equal(n.tone, 'blocked');
  assert.ok(n.bullets.some(b => /unknown type "chatroom"/.test(b)));
  assert.match(n.prompt, /note it|different way/i);
});

test('checkpoint and greeting speak the app in plain language', () => {
  const c = checkpoint(dojo);
  assert.match(c.summary, /Belts members climb/);
  assert.match(c.prompt, /keep going/i);
  const g = greeting(dojo);
  assert.match(g.headline, /Let's build The Dojo/);
});

test('EVERY suggestion is a buildable proposal (passes the gate)', () => {
  for (const spec of [minimal, getStarter('knowledgebase'), dojo]) {
    for (const s of suggestNext(spec)) {
      const r = reviewProposal(spec, s.ops);
      assert.equal(r.ok, true, `suggestion "${s.id}" must build cleanly, errors: ${(r.errors || []).join('; ')}`);
    }
  }
});

test('suggestions target what is MISSING, never what is present', () => {
  // the Dojo already has progression + a content library → neither is suggested
  const ids = suggestNext(dojo).map(s => s.id);
  assert.ok(!ids.includes('add-levels'));
  assert.ok(!ids.includes('add-library'));
  // a near-blank app is offered the big building blocks first
  const blankIds = suggestNext(minimal).map(s => s.id);
  assert.ok(blankIds.includes('add-levels') && blankIds.includes('add-library'));
});

test('suggestions are capped and jargon-free', () => {
  const s = suggestNext(minimal);
  assert.ok(s.length <= 3);
  s.forEach(x => {
    assert.ok(x.label && x.why && Array.isArray(x.ops) && x.ops.length);
    assert.doesNotMatch(x.label + x.why, /module|dataModel|cleanSpec|mechanic|Spec/);
  });
});

test('consequenceOf names the real effect of a change; empty for a refusal', () => {
  const levels = reviewProposal(getStarter('knowledgebase'), suggestNext(getStarter('knowledgebase')).find(s => s.id === 'add-levels').ops);
  assert.match(consequenceOf(levels), /climb levels/i);
  const bad = reviewProposal(dojo, [{ target: 'modules', op: 'add', value: { type: 'nope', config: {} } }]);
  assert.equal(consequenceOf(bad), '');
});

test('decisionRecord captures title, details, and consequence for the ledger', () => {
  const review = reviewProposal(getStarter('knowledgebase'), [{ target: 'pages', op: 'add', value: { id: 'about', title: 'About', audience: { who: 'members' }, blocks: [] } }]);
  const rec = decisionRecord({ title: 'Add an About page', review });
  assert.equal(rec.title, 'Add an About page');
  assert.ok(rec.details.some(d => /About/.test(d)));
  assert.match(rec.consequence, /page/i);
});

test('explainRecord gives a plain-English read that always ends reversible + jargon-free', () => {
  const rec = { title: 'The Bold & Vibrant look', details: ['Changed the accent colour'], consequence: 'Changes how your whole app looks for every member.' };
  const txt = explainRecord(rec);
  assert.match(txt, /Bold & Vibrant/);
  assert.match(txt, /reversible|rewind/i);
  assert.doesNotMatch(txt, /theme|token|module|dataModel|Spec/);
});

test('renderNarration produces readable text', () => {
  const txt = renderNarration(narrateProposal(reviewProposal(minimal, suggestNext(minimal)[0].ops)));
  assert.match(txt, /Here's what I'll set up:/);
  assert.match(txt, /Build it\?/);
});
