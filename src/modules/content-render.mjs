// src/modules/content-render.mjs — the SIX-FORMAT renderer, extracted from the Dojo's
// content readers (Admin_Methods writer + Training_Center / Method_Library readers). The
// crown-jewel reusable asset of the content-library module: PURE, framework-agnostic. Given a
// stored content item, it resolves the format and returns a normalized RENDER MODEL — what to
// show — which a surface then paints to DOM. Because both the catalogue and the gated reader
// consume this ONE function, a field can never render on one surface and not the other (closes
// the §5b "eyebrow/caption/figureDesc unread by Training Center" gap by construction).
// See docs/MODULE_CONTENT_LIBRARY.md §5, §9.

export const KINDS = ['image', 'video', 'audio', 'pdf', 'article', 'external', 'interactive'];

const str = v => (typeof v === 'string' ? v : '');
const nonEmpty = v => typeof v === 'string' && v.length > 0;

// Resolve the format. Honours an explicit `kind`; otherwise derives it from the populated media
// fields (legacy docs written before `kind` existed — the readers' kindOf() fallback).
export function resolveKind(item) {
  const it = item || {};
  if (KINDS.includes(it.kind)) return it.kind;
  if (it.mediaType === 'video' || nonEmpty(it.videoUrl)) return 'video';
  if (it.mediaType === 'audio' || nonEmpty(it.audioUrl)) return 'audio';
  if (nonEmpty(it.fileUrl)) return 'pdf';
  if (nonEmpty(it.linkUrl)) return 'external';
  if (nonEmpty(it.imageUrl) || (Array.isArray(it.figures) && it.figures.length)) return 'image';
  if (nonEmpty(it.body)) return 'article';
  return 'article';
}

// Normalize figures. Prefer figures[]; otherwise synthesize one from the legacy imageUrl+caption
// (the writer keeps figure 1 in sync with imageUrl for legacy safety — we invert that here).
export function figuresOf(item) {
  const it = item || {};
  if (Array.isArray(it.figures) && it.figures.length) {
    return it.figures
      .filter(f => f && typeof f === 'object')
      .map(f => ({ url: str(f.url), caption: str(f.caption), desc: str(f.desc || f.figureDesc) }));
  }
  if (nonEmpty(it.imageUrl)) return [{ url: it.imageUrl, caption: str(it.caption), desc: str(it.figureDesc) }];
  return [];
}

// The render model. `opts.gating` (from the module config) decides whether a `reference` item is
// completable — reference material shows no completion CTA and is excluded from progress counts.
export function renderContentItem(item, opts = {}) {
  const it = item || {};
  const kind = resolveKind(it);
  const figures = figuresOf(it);

  let media = null;
  let link = null;
  switch (kind) {
    case 'image':       media = { type: 'image', src: str(it.imageUrl) || (figures[0] && figures[0].url) || '' }; break;
    case 'video':       media = { type: 'video', src: str(it.videoUrl), poster: str(it.posterUrl), mediaType: str(it.mediaType) }; break;
    case 'audio':       media = { type: 'audio', src: str(it.audioUrl) }; break;
    case 'pdf':         media = { type: 'pdf',   src: str(it.fileUrl) }; break;
    case 'interactive': media = { type: 'interactive', src: str(it.linkUrl) || str(it.fileUrl) }; break;
    case 'external':    link  = { url: str(it.linkUrl), label: str(it.linkLabel) || 'Open' }; break;
    case 'article':     break;   // body is the content
  }

  const referenceFlag = (opts.gating && opts.gating.referenceFlag) || 'reference';
  const isReference = it[referenceFlag] === true;

  return {
    kind,
    media,
    link,
    figures,
    stats: (Array.isArray(it.stats) ? it.stats : [])
      .filter(s => s && typeof s === 'object')
      .map(s => ({ label: str(s.label), value: str(s.value) })),
    text: {
      eyebrow:     str(it.eyebrow),
      title:       str(it.title),
      description: str(it.description),
      caption:     str(it.caption),
      figureDesc:  str(it.figureDesc),
      body:        str(it.body),
      footnote:    str(it.footnote)
    },
    // gating: reference material is never completable/counted (docs/MODULE_CONTENT_LIBRARY.md §6)
    completable: !isReference,
    reference: isReference
  };
}
