// test/data-model-list.test.mjs — the bounded `list(<shape>)` field type (APP_SPEC ruling 2026-08-10;
// used by MODULE_COMMERCE order line items). Bounded by construction: element shape uses the same
// type set, NO nested lists, and the item count is capped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDataModel, FIELD_TYPES } from '../src/shell/data-model.mjs';

const field = (model, id) => model.fields.find(f => f.id === id);

test('a list field validates its element shape and clamps the item cap', () => {
  const m = cleanDataModel({
    id: 'orders', owner: 'member', access: 'owner-read',
    fields: [
      { id: 'total', type: 'number' },
      { id: 'items', type: 'list', max: 9999, of: [
        { id: 'productRef', type: 'ref', ref: 'products' },
        { id: 'qty', type: 'number', min: 1 },
        { id: 'titleSnapshot', type: 'text' }
      ] }
    ]
  });
  const items = field(m, 'items');
  assert.equal(items.type, 'list');
  assert.equal(items.max, 500);                              // clamped to MAX_LIST_ITEMS
  assert.deepEqual(items.of.map(f => f.id), ['productRef', 'qty', 'titleSnapshot']);
  assert.equal(items.of.find(f => f.id === 'productRef').ref, 'products');
  assert.equal(items.of.find(f => f.id === 'qty').min, 1);
});

test('nested lists are forbidden — a list inside a list becomes text', () => {
  const m = cleanDataModel({ id: 'x', fields: [
    { id: 'rows', type: 'list', of: [{ id: 'nested', type: 'list', of: [] }, { id: 'ok', type: 'text' }] }
  ] });
  const rows = field(m, 'rows');
  assert.equal(rows.of.find(f => f.id === 'nested').type, 'text');   // coerced, not nested
  assert.equal(rows.of.find(f => f.id === 'ok').type, 'text');
});

test('a list with no shape is a harmless empty list; bad element ids drop', () => {
  const m = cleanDataModel({ id: 'x', fields: [
    { id: 'a', type: 'list' },                                        // no `of`
    { id: 'b', type: 'list', of: [{ id: '1bad', type: 'text' }, { id: 'good', type: 'text' }] }
  ] });
  assert.deepEqual(field(m, 'a').of, []);
  assert.equal(field(m, 'a').max, 500);
  assert.deepEqual(field(m, 'b').of.map(f => f.id), ['good']);        // invalid id dropped
});

test('list is in the bounded field-type set; a list carries no scalar default', () => {
  assert.ok(FIELD_TYPES.list);
  const m = cleanDataModel({ id: 'x', fields: [{ id: 'l', type: 'list', of: [], default: 'nope' }] });
  assert.equal('default' in field(m, 'l'), false);
});
