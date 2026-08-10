// src/modules/messaging.mjs — the messaging module's config validator (docs/MODULE_MESSAGING.md §3).
// Bounded + pure, like the other module cleaners. Conversations (DMs + channels); moderation via rbac,
// engagement events via activity-log, alerts via the notification engine — all decoupled signals. This
// validates only the messaging-owned config; sending/moderation happen at the executor seam.

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const SLUG = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const MODES = { dm: 1, channel: 1 };
const MAX_CHANNELS = 100, MAX_EMITS = 20;

function cleanChannel(c) {
  if (!isObj(c) || !SLUG.test(c.id || '')) return null;
  const out = { id: c.id };
  if (isStr(c.label)) out.label = String(c.label).slice(0, 60);
  if (isObj(c.audience)) out.audience = c.audience;   // { who: … } validated with block audiences elsewhere
  return out;
}

export function cleanMessagingConfig(config) {
  const c = isObj(config) ? config : {};
  const out = {};
  out.threadCollection = isStr(c.threadCollection) ? c.threadCollection : 'threads';
  out.messageCollection = isStr(c.messageCollection) ? c.messageCollection : 'messages';
  out.modes = Array.isArray(c.modes) ? [...new Set(c.modes.filter(m => MODES[m]))] : [];
  if (!out.modes.length) out.modes = ['dm'];
  out.channels = Array.isArray(c.channels) ? c.channels.map(cleanChannel).filter(Boolean).slice(0, MAX_CHANNELS) : [];
  const mod = isObj(c.moderation) ? c.moderation : {};
  out.moderation = { staffCanRemove: mod.staffCanRemove !== false, membersCanDelete: mod.membersCanDelete === true };
  if (Array.isArray(c.emitsTo)) out.emitsTo = c.emitsTo.filter(m => SLUG.test(m || '')).slice(0, MAX_EMITS);
  out.notifyOnMessage = c.notifyOnMessage !== false;   // default on
  if (isObj(c.surfaces)) out.surfaces = c.surfaces;
  return out;
}

export const MESSAGING_MODES = Object.keys(MODES);
