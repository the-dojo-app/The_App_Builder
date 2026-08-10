// test/block-tree.test.mjs — the page block-tree validator: type whitelist, href safety,
// bucket-scoped media, caps, columns pad-to-count, style whitelist, determinism, and the
// assembler wiring pages through it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanBlockTree } from '../src/shell/block-tree.mjs';
import { cleanSpec, assemble } from '../src/assembler.mjs';

const dojoSpec = JSON.parse(readFileSync(fileURLToPath(new URL('../spec/dojo.spec.json', import.meta.url)), 'utf8'));
const BUCKET = 'the-dojo-app-b7004.firebasestorage.app';

test('unknown block types are dropped; known ones survive', () => {
  const t = cleanBlockTree([
    { type: 'heading', props: { level: 2, text: 'Hi' } },
    { type: 'script', props: { text: 'alert(1)' } },       // not in TYPES → dropped
    { type: 'text', props: { text: 'body' } }
  ]);
  assert.deepEqual(t.map(b => b.type), ['heading', 'text']);
});

test('button hrefs may not carry a scheme (no javascript:/data:)', () => {
  const [btn] = cleanBlockTree([{ type: 'button', props: { label: 'x', href: 'javascript:alert(1)' } }]);
  assert.equal(btn.props.href, '');   // scheme stripped to empty
  const [ok] = cleanBlockTree([{ type: 'button', props: { label: 'x', href: 'https://example.com' } }]);
  assert.equal(ok.props.href, 'https://example.com');
  const [rel] = cleanBlockTree([{ type: 'button', props: { label: 'x', href: '/dashboard' } }]);
  assert.equal(rel.props.href, '/dashboard');
});

test('media is bucket-scoped: only the app’s own storage src survives', () => {
  const good = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/builder-images%2Fx.png?alt=media`;
  const evil = 'https://evil.example.com/x.png';
  assert.equal(cleanBlockTree([{ type: 'image', props: { src: good } }], { bucket: BUCKET }).length, 1);
  assert.equal(cleanBlockTree([{ type: 'image', props: { src: evil } }], { bucket: BUCKET }).length, 0); // dropped
  assert.equal(cleanBlockTree([{ type: 'image', props: { src: good } }]).length, 0);  // no bucket configured → dropped
});

test('stat/chart blocks need a vetted metric from an installed module', () => {
  assert.equal(cleanBlockTree([{ type: 'stat', props: { metric: 'sessions_total' } }]).length, 0); // none allowed
  assert.equal(cleanBlockTree([{ type: 'stat', props: { metric: 'sessions_total' } }], { statMetrics: ['sessions_total'] }).length, 1);
});

test('columns pad/trim to exactly `count` column children', () => {
  const [cols] = cleanBlockTree([{ type: 'columns', props: { count: 3 }, children: [{ type: 'column', children: [] }] }]);
  assert.equal(cols.props.count, 3);
  assert.equal(cols.children.length, 3);
  assert.ok(cols.children.every(c => c.type === 'column'));
});

test('depth is capped (no runaway nesting)', () => {
  let node = { type: 'text', props: { text: 'deep' } };
  for (let i = 0; i < 12; i++) node = { type: 'section', children: [node] };
  const t = cleanBlockTree([node]);
  let d = 0, cur = t[0];
  while (cur && cur.children && cur.children[0]) { d++; cur = cur.children[0]; }
  assert.ok(d <= 6, `depth ${d} should be ≤ 6`);
});

test('missing ids are DETERMINISTIC (assembly stays reproducible)', () => {
  const tree = [{ type: 'text', props: { text: 'a' } }, { type: 'text', props: { text: 'b' } }];
  assert.deepEqual(cleanBlockTree(tree).map(b => b.id), cleanBlockTree(tree).map(b => b.id));
});

test('the assembler validates page blocks and carries them in the Plan', () => {
  const spec = structuredClone(dojoSpec);
  spec.pages[0].blocks = [
    { type: 'heading', props: { level: 1, text: 'Library' } },
    { type: 'evilblock', props: {} }
  ];
  const plan = assemble(cleanSpec(spec));
  const reg = plan.find(o => o.op === 'registerPages');
  const lib = reg.pages.find(p => p.id === 'library');
  assert.equal(lib.blocks.length, 1);           // evilblock dropped
  assert.equal(lib.blocks[0].type, 'heading');
});
