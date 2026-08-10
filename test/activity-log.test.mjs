// test/activity-log.test.mjs — the activity-log config validator + its wiring (a known module, a
// buildable toolbox offer). The connective event stream (docs/MODULE_ACTIVITY_LOG.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanActivityConfig } from '../src/modules/activity-log.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { moduleOffers } from '../src/intake/narrator.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('cleanActivityConfig bounds event types, visibility, retention, emitsTo', () => {
  const c = cleanActivityConfig({
    collection: 'events',
    eventTypes: [{ id: 'content.completed', label: 'Done' }, { id: '#bad' }, { id: 'admin.action', visibility: 'staff' }],
    visibilityDefault: 'loud', retentionDays: 99999, emitsTo: ['progression', '@nope']
  });
  assert.equal(c.collection, 'events');
  assert.deepEqual(c.eventTypes.map(t => t.id), ['content.completed', 'admin.action']);  // dotted ok, bad id dropped
  assert.equal(c.eventTypes.find(t => t.id === 'admin.action').visibility, 'staff');
  assert.equal(c.visibilityDefault, 'private');       // unknown → default
  assert.equal(c.retentionDays, 3650);                // clamped to max
  assert.deepEqual(c.emitsTo, ['progression']);       // bad module id dropped
  assert.equal(cleanActivityConfig(undefined).collection, 'activity');
});

test('activity-log is a known module — a spec with it validates clean', () => {
  const spec = { ...dojo, modules: [...dojo.modules, { type: 'activity-log', config: { collection: 'activity', eventTypes: [{ id: 'session' }] } }] };
  const { spec: cleaned, errors } = cleanSpec(spec);
  assert.deepEqual(errors, []);
  assert.ok(cleaned.modules.some(m => m.type === 'activity-log'));
});

test('toolbox: the Activity & feed offer is a buildable proposal', () => {
  const kb = getStarter('knowledgebase');
  const offer = moduleOffers(kb).find(o => o.type === 'activity-log');
  assert.ok(offer && !offer.installed);
  const r = reviewProposal(kb, offer.addOps);
  assert.equal(r.ok, true, `Activity must build cleanly: ${(r.errors || []).join('; ')}`);
  assert.ok(r.preview.pages.some(p => p.id === 'activity'));
});
