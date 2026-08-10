// test/messaging.test.mjs — the messaging config validator + wiring (a known module, a buildable
// toolbox offer). Conversations: DMs + community channels (docs/MODULE_MESSAGING.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanMessagingConfig } from '../src/modules/messaging.mjs';
import { cleanSpec } from '../src/assembler.mjs';
import { reviewProposal } from '../src/intake/intake.mjs';
import { moduleOffers } from '../src/intake/narrator.mjs';
import { getStarter } from '../src/intake/starters.mjs';

const dojo = JSON.parse(readFileSync(new URL('../spec/dojo.spec.json', import.meta.url)));

test('cleanMessagingConfig bounds modes, channels, moderation defaults', () => {
  const c = cleanMessagingConfig({
    modes: ['dm', 'channel', 'telepathy', 'dm'],           // unknown dropped, deduped
    channels: [{ id: 'general', label: 'General' }, { id: '#bad' }],
    moderation: { staffCanRemove: false }
  });
  assert.deepEqual(c.modes, ['dm', 'channel']);
  assert.deepEqual(c.channels.map(x => x.id), ['general']);  // bad id dropped
  assert.equal(c.moderation.staffCanRemove, false);          // explicit false respected
  assert.equal(c.moderation.membersCanDelete, false);        // safe default
  assert.equal(c.notifyOnMessage, true);                     // default on
  assert.deepEqual(cleanMessagingConfig({}).modes, ['dm']);  // default mode
});

test('messaging is a known module — a spec with it validates clean', () => {
  const spec = { ...dojo, modules: [...dojo.modules, { type: 'messaging', config: { modes: ['dm'] } }] };
  const { spec: cleaned, errors } = cleanSpec(spec);
  assert.deepEqual(errors, []);
  assert.ok(cleaned.modules.some(m => m.type === 'messaging'));
});

test('toolbox: the Messaging offer is a buildable proposal', () => {
  const kb = getStarter('knowledgebase');
  const offer = moduleOffers(kb).find(o => o.type === 'messaging');
  assert.ok(offer && !offer.installed);
  const r = reviewProposal(kb, offer.addOps);
  assert.equal(r.ok, true, `Messaging must build cleanly: ${(r.errors || []).join('; ')}`);
  assert.ok(r.preview.pages.some(p => p.id === 'messages'));
});
