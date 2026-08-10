// src/intake/themes.mjs — DESIGN-DIRECTION presets (docs/EXPERIENCE.md §3 "vibe → design"). The
// "do you want classic or professional, clean or elegant?" question, made concrete: a handful of
// named LOOKS, each a full, contrast-safe theme. Asked EARLY so the owner sets the look and signs off
// before the details (Will, 2026-08-10). Each preset is expressed as a THEME-MERGE proposal, so it
// rides the exact same gate → preview → confirm spine as everything else — and the hover-preview in
// the chrome shows each look live before a single click commits.
// Pure data + two selectors. Every palette is light-text-on-dark (clears the 3:1 contrast floor).

export const THEME_PRESETS = [
  {
    id: 'professional', name: 'Professional', blurb: 'Cool, crisp, corporate. Straight lines and confident blue.',
    swatch: { bg: '#0E141C', accent: '#4C7DF0' },
    theme: {
      color: { 'surface-page': '#0E141C', 'surface-sunken': '#131C28', 'surface-raised-1': '#182334', 'text-primary': '#EEF2F8', 'text-secondary': '#9FB0C6', 'accent': '#4C7DF0', 'accent-text': '#AEC6FF' },
      shape: { radius: 10, radiusBtn: 8, radiusChip: 6 }, cardSurface: 'flat', type: { tracking: 0.2 }
    }
  },
  {
    id: 'classic', name: 'Classic & Warm', blurb: 'Timeless and inviting. Warm charcoal with a gold accent.',
    swatch: { bg: '#16120D', accent: '#D69A3C' },
    theme: {
      color: { 'surface-page': '#16120D', 'surface-sunken': '#201A12', 'surface-raised-1': '#262019', 'text-primary': '#F6EFE4', 'text-secondary': '#C3B49C', 'accent': '#D69A3C', 'accent-text': '#F2CE8E' },
      shape: { radius: 16, radiusBtn: 12, radiusChip: 10 }, cardSurface: 'soft'
    }
  },
  {
    id: 'minimal', name: 'Clean & Minimal', blurb: 'Quiet and uncluttered. Muted graphite, one restrained accent.',
    swatch: { bg: '#101314', accent: '#5F9C8E' },
    theme: {
      color: { 'surface-page': '#101314', 'surface-sunken': '#171B1C', 'surface-raised-1': '#1C2122', 'text-primary': '#ECEFEF', 'text-secondary': '#9AA3A2', 'accent': '#5F9C8E', 'accent-text': '#ADD7CD' },
      shape: { radius: 8, radiusBtn: 6, radiusChip: 4, borderWidth: 1 }, cardSurface: 'flat'
    }
  },
  {
    id: 'vibrant', name: 'Bold & Vibrant', blurb: 'Energetic and modern. Deep ink with an electric violet.',
    swatch: { bg: '#0B0910', accent: '#8B5CF6' },
    theme: {
      color: { 'surface-page': '#0B0910', 'surface-sunken': '#141020', 'surface-raised-1': '#1B1530', 'text-primary': '#F3EEFB', 'text-secondary': '#B0A6C6', 'accent': '#8B5CF6', 'accent-text': '#CBB8FF' },
      shape: { radius: 18, radiusBtn: 14, radiusChip: 12 }, cardSurface: 'gradient'
    }
  },
  {
    id: 'elegant', name: 'Soft & Elegant', blurb: 'Gentle and refined. Warm dusk with a blush rose accent.',
    swatch: { bg: '#14100F', accent: '#E08AA0' },
    theme: {
      color: { 'surface-page': '#14100F', 'surface-sunken': '#1E1815', 'surface-raised-1': '#241C1A', 'text-primary': '#F7EEEC', 'text-secondary': '#C9B4B0', 'accent': '#E08AA0', 'accent-text': '#F6C2CE' },
      shape: { radius: 20, radiusBtn: 16, radiusChip: 14 }, cardSurface: 'soft'
    }
  }
];

// Owner-facing look choices, each a READY theme proposal (ops) — same shape as narrator suggestions,
// so the chrome hover-previews and applies them through reviewProposal.
export function themeProposals() {
  return THEME_PRESETS.map(p => ({
    id: p.id, name: p.name, blurb: p.blurb, swatch: p.swatch,
    ops: [{ target: 'theme', op: 'merge', value: structuredClone(p.theme) }]
  }));
}

export const THEME_IDS = THEME_PRESETS.map(p => p.id);
