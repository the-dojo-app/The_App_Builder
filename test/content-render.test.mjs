// test/content-render.test.mjs — the six-format renderer: format resolution (explicit + legacy),
// per-kind media/link mapping, figures normalization, and reference gating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderContentItem, resolveKind, figuresOf, KINDS } from '../src/modules/content-render.mjs';

test('all six+ formats resolve when kind is explicit', () => {
  for (const k of KINDS) assert.equal(resolveKind({ kind: k }), k);
});

test('legacy docs (no kind) derive the format from populated fields', () => {
  assert.equal(resolveKind({ videoUrl: 'v.mp4' }), 'video');
  assert.equal(resolveKind({ mediaType: 'video' }), 'video');
  assert.equal(resolveKind({ audioUrl: 'a.mp3' }), 'audio');
  assert.equal(resolveKind({ fileUrl: 'd.pdf' }), 'pdf');
  assert.equal(resolveKind({ linkUrl: 'https://x' }), 'external');
  assert.equal(resolveKind({ imageUrl: 'i.png' }), 'image');
  assert.equal(resolveKind({ body: 'text' }), 'article');
  assert.equal(resolveKind({}), 'article');
});

test('each kind maps to the right media/link', () => {
  assert.deepEqual(renderContentItem({ kind: 'image', imageUrl: 'i.png' }).media, { type: 'image', src: 'i.png' });
  const v = renderContentItem({ kind: 'video', videoUrl: 'v.mp4', posterUrl: 'p.jpg', mediaType: 'video' }).media;
  assert.equal(v.type, 'video'); assert.equal(v.src, 'v.mp4'); assert.equal(v.poster, 'p.jpg');
  assert.equal(renderContentItem({ kind: 'audio', audioUrl: 'a.mp3' }).media.type, 'audio');
  assert.equal(renderContentItem({ kind: 'pdf', fileUrl: 'd.pdf' }).media.type, 'pdf');
  assert.equal(renderContentItem({ kind: 'interactive', linkUrl: 'x' }).media.type, 'interactive');
  const ext = renderContentItem({ kind: 'external', linkUrl: 'https://x', linkLabel: 'Go' });
  assert.equal(ext.media, null);
  assert.deepEqual(ext.link, { url: 'https://x', label: 'Go' });
  assert.equal(renderContentItem({ kind: 'article', body: 'hi' }).media, null);
});

test('figures normalize; legacy imageUrl+caption folds into figure 1', () => {
  assert.deepEqual(figuresOf({ imageUrl: 'i.png', caption: 'cap', figureDesc: 'd' }),
    [{ url: 'i.png', caption: 'cap', desc: 'd' }]);
  const many = figuresOf({ figures: [{ url: 'a', caption: 'A' }, { url: 'b', desc: 'B' }] });
  assert.equal(many.length, 2);
  assert.equal(many[1].desc, 'B');
});

test('eyebrow/caption/figureDesc are ALWAYS carried (the §5b gap is closed by one renderer)', () => {
  const m = renderContentItem({ kind: 'image', imageUrl: 'i.png', eyebrow: 'E', caption: 'C', figureDesc: 'F' });
  assert.equal(m.text.eyebrow, 'E');
  assert.equal(m.text.caption, 'C');
  assert.equal(m.text.figureDesc, 'F');
});

test('reference material is not completable; normal material is', () => {
  assert.equal(renderContentItem({ kind: 'article', reference: true }).completable, false);
  assert.equal(renderContentItem({ kind: 'article', reference: true }).reference, true);
  assert.equal(renderContentItem({ kind: 'article' }).completable, true);
});
