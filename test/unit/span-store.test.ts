import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDimensionModel, DIMENSION_FILE_FORMAT } from '../../src/model/dimension-model.ts';
import { resolveSpan, type CanonicalSpan } from '../../src/model/span.ts';
import { RTree } from '../../src/index/rtree.ts';
import { IndexAdapter } from '../../src/store/index-adapter.ts';
import { SpanStore } from '../../src/store/span-store.ts';

function makeStore() {
  const model = buildDimensionModel({
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{ id: 'location', name: 'Location', values: [
      { key: '4', name: 'USA' },
      { key: '20', name: 'NYC', parentKey: '4' },
    ] }],
  });
  const store = new SpanStore(new IndexAdapter(new RTree<CanonicalSpan>(model.axisCount), model));
  return { model, store };
}

test('create and exact use canonical span identity', () => {
  const { store } = makeStore();
  const span = resolveSpan({ location: '4' });
  assert.deepEqual(store.create(span), { ok: true, value: span });
  assert.deepEqual(store.exact(span), { ok: true, value: span });
  assert.equal(store.count, 1);
});

test('duplicate create preserves the original', () => {
  const { store } = makeStore();
  const original = resolveSpan({ location: '4' });
  store.create(original);
  const duplicate = store.create(resolveSpan({ location: '4' }));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, 'DUPLICATE_SPAN');
  assert.deepEqual(store.exact(original), { ok: true, value: original });
});

test('exact lookup remains exact across hierarchy', () => {
  const { store } = makeStore();
  store.create(resolveSpan({ location: '4' }));
  const result = store.exact(resolveSpan({ location: '20' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'NOT_FOUND');
});

test('update replaces the source span', () => {
  const { store } = makeStore();
  const source = resolveSpan({ location: '4' });
  const replacement = resolveSpan({ location: '20' });
  store.create(source);
  assert.deepEqual(store.update(source, replacement), { ok: true, value: replacement });
  assert.equal(store.exact(source).ok, false);
  assert.deepEqual(store.exact(replacement), { ok: true, value: replacement });
  assert.equal(store.count, 1);
});

test('update checks source and collision before mutation', () => {
  const { store } = makeStore();
  const source = resolveSpan({ location: '4' });
  const occupied = resolveSpan({ location: '20' });
  store.create(source);
  store.create(occupied);
  const missing = store.update(resolveSpan({}), occupied);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'NOT_FOUND');
  const collision = store.update(source, occupied);
  assert.equal(collision.ok, false);
  if (!collision.ok) assert.equal(collision.code, 'DUPLICATE_SPAN');
  assert.deepEqual(store.exact(source), { ok: true, value: source });
  assert.deepEqual(store.exact(occupied), { ok: true, value: occupied });
});

test('same-identity update succeeds', () => {
  const { store } = makeStore();
  const source = resolveSpan({ location: '4' });
  const equivalent = resolveSpan({ location: '4' });
  store.create(source);
  assert.deepEqual(store.update(source, equivalent), { ok: true, value: equivalent });
  assert.equal(store.count, 1);
});

test('delete and match operate on spans directly', () => {
  const { store } = makeStore();
  const span = resolveSpan({ location: '4' });
  store.create(span);
  assert.deepEqual(store.match({ location: '20' }), [span]);
  store.delete(span);
  assert.deepEqual(store.match({ location: '20' }), []);
  const missing = store.delete(span);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'NOT_FOUND');
});

test('global span works through a zero-axis store', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  const store = new SpanStore(new IndexAdapter(new RTree<CanonicalSpan>(0), model));
  const global = resolveSpan({});
  store.create(global);
  assert.deepEqual(store.match({}), [global]);
  const duplicate = store.create(resolveSpan({}));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, 'DUPLICATE_SPAN');
});
