// src/intake/starters.mjs — the STARTER GALLERY (docs/EXPERIENCE.md §3 "clone-a-vibe"). A set of
// ready-made App Specs the owner starts FROM and walks before customizing — the fastest path to a
// working app. Each is a real, valid Spec (it passes cleanSpec) and each leans on a DIFFERENT part
// of the module library, so the gallery is honest: we only offer what the platform can actually build.
//   listStarters()  → gallery cards (name, tagline, who it's for, pitch) each WITH a live preview
//   getStarter(id)  → a fresh clone of the Spec to refine (or null)
// Pure, zero-dependency, inline data (no I/O — the engine invariant). Specs mirror spec/dojo.spec.json.

import { buildPreview } from './preview.mjs';

// ── Academy — a course platform: a library of lessons + levels earned by finishing them ──────────
const ACADEMY = {
  spec: '0',
  app: { id: 'academy', name: 'Academy', tagline: 'Learn, level up, get certified', branding: { logoUrl: '', faviconUrl: '' } },
  concepts: {
    member: { label: 'Student', plural: 'Students' },
    progressionUnit: { label: 'Level', plural: 'Levels', ordered: true },
    contentItem: { label: 'Lesson', plural: 'Lessons' },
    activity: { label: 'Completion', plural: 'Completions' }
  },
  theme: {
    color: { 'surface-page': '#0E1116', 'surface-sunken': '#161A22', 'text-primary': '#F4F6FB', 'text-secondary': '#9AA3B2', 'accent': '#5B6CFF', 'accent-text': '#B7C0FF' }
  },
  auth: {
    provider: 'firebase',
    roles: [
      { id: 'owner', label: 'Owner', rank: 100, builtin: true },
      { id: 'instructor', label: 'Instructor', rank: 60 },
      { id: 'student', label: 'Student', rank: 0, default: true }
    ],
    signup: { open: true, invite: false, defaultRole: 'student' },
    grant: { granter: 'owner', audit: true, guardLastOwner: true, revokeOnDowngrade: true }
  },
  dataModels: [
    { id: 'lessons', concept: 'contentItem', owner: 'app', access: 'public', fields: [
      { id: 'title', type: 'text' }, { id: 'level', type: 'select' }, { id: 'body', type: 'longtext' }, { id: 'required', type: 'bool' }, { id: 'video', type: 'file' }
    ] },
    { id: 'completions', concept: 'activity', owner: 'member', access: 'owner-read', fields: [
      { id: 'lessonId', type: 'ref', ref: 'lessons' }, { id: 'ts', type: 'timestamp' }, { id: 'included', type: 'bool', default: true }
    ] }
  ],
  modules: [
    { type: 'content-library', config: {
      collection: 'lessons', itemConcept: 'contentItem', formats: ['video', 'article', 'pdf', 'interactive'],
      taxonomy: [{ id: 'level', concept: 'progressionUnit', valuesFrom: 'module:progression.units', required: true }],
      gating: { progressionModule: 'progression', requiredFlag: 'required', referenceFlag: 'reference' },
      surfaces: {
        catalogue: { pageId: 'catalog', audience: { who: 'members' }, showAll: true, groupBy: 'level' },
        gatedReader: { pageId: 'learn', audience: { who: 'members' }, scopeBy: 'level', tracksCompletion: true }
      }
    } },
    { type: 'progression', config: {
      unitConcept: 'progressionUnit', units: ['Foundations', 'Beginner', 'Intermediate', 'Advanced', 'Expert'], badgesPerUnit: 4,
      tracks: [{ id: 'progress', label: 'Progress', score: { source: 'activity:completions' }, default: true }],
      evidence: { activityModel: 'completions', contentModule: 'content-library' }, retroactive: false, viz: 'list',
      rules: { Foundations: { badges: [{ slot: 1, mechanic: 'required-content', params: { contentModule: 'content-library', scope: 'unit' } }] } }
    } },
    { type: 'rbac', config: {} }
  ],
  pages: [
    { id: 'catalog', title: 'Catalog', audience: { who: 'members' }, nav: { section: 'main', icon: 'book', label: 'Catalog' }, layout: 'single', blocks: [] },
    { id: 'learn', title: 'Learn', audience: { who: 'members' }, nav: { section: 'main', icon: 'play', label: 'Learn' }, layout: 'single', blocks: [] }
  ],
  notifications: { categories: [] },
  integrations: { ai: { provider: 'anthropic', keyRef: 'secret://ANTHROPIC_KEY' } },
  meta: { authoredBy: 'starter', note: 'Academy — course platform' }
};

// ── Coaching Program — a membership where progress is driven by ACTIVITY (sessions), not lessons ──
const COACHING = {
  spec: '0',
  app: { id: 'coaching', name: 'Coaching Program', tagline: 'Show up, build the habit, level up', branding: { logoUrl: '', faviconUrl: '' } },
  concepts: {
    member: { label: 'Client', plural: 'Clients' },
    progressionUnit: { label: 'Stage', plural: 'Stages', ordered: true },
    contentItem: { label: 'Workout', plural: 'Workouts' },
    activity: { label: 'Session', plural: 'Sessions' }
  },
  theme: {
    color: { 'surface-page': '#14100C', 'surface-sunken': '#1E1811', 'text-primary': '#FBF3EA', 'text-secondary': '#B6A895', 'accent': '#E8873B', 'accent-text': '#FFC591' }
  },
  auth: {
    provider: 'firebase',
    roles: [
      { id: 'owner', label: 'Owner', rank: 100, builtin: true },
      { id: 'coach', label: 'Coach', rank: 60 },
      { id: 'client', label: 'Client', rank: 0, default: true }
    ],
    signup: { open: false, invite: true, defaultRole: 'client' },
    grant: { granter: 'owner', audit: true, guardLastOwner: true, revokeOnDowngrade: true }
  },
  dataModels: [
    { id: 'workouts', concept: 'contentItem', owner: 'app', access: 'public', fields: [
      { id: 'title', type: 'text' }, { id: 'stage', type: 'select' }, { id: 'body', type: 'longtext' }, { id: 'video', type: 'file' }
    ] },
    { id: 'sessions', concept: 'activity', owner: 'member', access: 'owner-read', fields: [
      { id: 'score', type: 'number', min: 0, max: 100 }, { id: 'durationSec', type: 'number' }, { id: 'ts', type: 'timestamp' }, { id: 'included', type: 'bool', default: true }
    ] }
  ],
  modules: [
    { type: 'content-library', config: {
      collection: 'workouts', itemConcept: 'contentItem', formats: ['video', 'article', 'image'],
      taxonomy: [{ id: 'stage', concept: 'progressionUnit', valuesFrom: 'module:progression.units', required: true }],
      surfaces: { catalogue: { pageId: 'programs', audience: { who: 'members' }, showAll: true, groupBy: 'stage' } }
    } },
    { type: 'progression', config: {
      unitConcept: 'progressionUnit', units: ['Bronze', 'Silver', 'Gold', 'Platinum'], badgesPerUnit: 3,
      tracks: [{ id: 'fitness', label: 'Fitness', score: { source: 'activity:sessions.score' }, default: true }],
      evidence: { activityModel: 'sessions', contentModule: 'content-library' }, retroactive: false, viz: 'strip',
      rules: { Bronze: { badges: [
        { slot: 1, mechanic: 'count-threshold', params: { target: 5 } },
        { slot: 2, mechanic: 'consecutive-days', params: { days: 3 } },
        { slot: 3, mechanic: 'duration-floor', params: { minSec: 600 } }
      ] } }
    } },
    { type: 'rbac', config: {} }
  ],
  pages: [
    { id: 'today', title: 'Today', audience: { who: 'members' }, nav: { section: 'main', icon: 'target', label: 'Today' }, layout: 'single', blocks: [] },
    { id: 'programs', title: 'Programs', audience: { who: 'members' }, nav: { section: 'main', icon: 'book', label: 'Programs' }, layout: 'single', blocks: [] }
  ],
  notifications: { categories: [] },
  integrations: { ai: { provider: 'anthropic', keyRef: 'secret://ANTHROPIC_KEY' } },
  meta: { authoredBy: 'starter', note: 'Coaching Program — activity-driven membership' }
};

// ── Knowledge Base — a resource library, NO progression (proves progression is optional) ─────────
const KNOWLEDGE_BASE = {
  spec: '0',
  app: { id: 'knowledgebase', name: 'Knowledge Base', tagline: 'Everything your people need, in one place', branding: { logoUrl: '', faviconUrl: '' } },
  concepts: {
    member: { label: 'Reader', plural: 'Readers' },
    contentItem: { label: 'Article', plural: 'Articles' }
  },
  theme: {
    color: { 'surface-page': '#0C1413', 'surface-sunken': '#121B19', 'text-primary': '#EAF4F1', 'text-secondary': '#8FA6A0', 'accent': '#2FB68C', 'accent-text': '#8CE9C8' }
  },
  auth: {
    provider: 'firebase',
    roles: [
      { id: 'owner', label: 'Owner', rank: 100, builtin: true },
      { id: 'editor', label: 'Editor', rank: 60 },
      { id: 'reader', label: 'Reader', rank: 0, default: true }
    ],
    signup: { open: true, invite: false, defaultRole: 'reader' },
    grant: { granter: 'owner', audit: true, guardLastOwner: true, revokeOnDowngrade: true }
  },
  dataModels: [
    { id: 'articles', concept: 'contentItem', owner: 'app', access: 'public', fields: [
      { id: 'title', type: 'text' }, { id: 'category', type: 'select' }, { id: 'body', type: 'longtext' }, { id: 'reference', type: 'bool' }, { id: 'attachment', type: 'file' }
    ] }
  ],
  modules: [
    { type: 'content-library', config: {
      collection: 'articles', itemConcept: 'contentItem', formats: ['article', 'pdf', 'external', 'image'],
      taxonomy: [{ id: 'category', label: 'Category', values: ['Getting Started', 'Guides', 'FAQ', 'Policies'], required: true }],
      surfaces: { catalogue: { pageId: 'help', audience: { who: 'members' }, showAll: true, groupBy: 'category', sortBy: 'title' } }
    } },
    { type: 'rbac', config: {} }
  ],
  pages: [
    { id: 'help', title: 'Help Center', audience: { who: 'members' }, nav: { section: 'main', icon: 'book', label: 'Help Center' }, layout: 'single', blocks: [] }
  ],
  notifications: { categories: [] },
  integrations: { ai: { provider: 'anthropic', keyRef: 'secret://ANTHROPIC_KEY' } },
  meta: { authoredBy: 'starter', note: 'Knowledge Base — resource library (no progression)' }
};

// The gallery. `card` fields are owner-facing (domain language); `spec` is the buildable Spec.
const STARTERS = [
  { id: 'academy', name: 'Academy', tagline: 'A course platform', forWho: 'Teach a subject; students climb levels by finishing lessons.', pitch: 'A library of lessons, levels students earn by completing the required ones, and instructors who publish. Great for courses, training, and certifications.', spec: ACADEMY },
  { id: 'coaching', name: 'Coaching Program', tagline: 'A membership built on showing up', forWho: 'Coach people through a habit; progress comes from doing the work.', pitch: 'Clients climb stages by putting in sessions — streaks, counts, and effort — with a workout library alongside. Great for fitness, wellness, and skills practice.', spec: COACHING },
  { id: 'knowledgebase', name: 'Knowledge Base', tagline: 'A resource library', forWho: 'Give your people a searchable home for how-tos and answers.', pitch: 'A clean, categorized library of articles and files, with editors who keep it current. No levels, no fuss. Great for help centers, wikis, and onboarding.', spec: KNOWLEDGE_BASE }
];

export const STARTER_IDS = STARTERS.map(s => s.id);

// Gallery cards, each with a LIVE preview model so the UI can show a real mini-frame per road.
export function listStarters() {
  return STARTERS.map(s => ({
    id: s.id, name: s.name, tagline: s.tagline, forWho: s.forWho, pitch: s.pitch,
    preview: buildPreview(s.spec)
  }));
}

// A fresh, independent clone to refine — callers may mutate it freely.
export function getStarter(id) {
  const s = STARTERS.find(x => x.id === id);
  return s ? structuredClone(s.spec) : null;
}
