import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDimensionModel, DIMENSION_FILE_FORMAT } from '../../src/model/dimension-model.ts';
import { resolveSpan, type CanonicalSpan } from '../../src/model/span.ts';
import { RTree } from '../../src/index/rtree.ts';
import { IndexAdapter } from '../../src/store/index-adapter.ts';
import { SpanStore, DuplicateSpanError, SpanNotFoundError } from '../../src/store/span-store.ts';

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
  const { model, store } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  assert.equal(store.create(span), span);
  assert.equal(store.exact(span), span);
  assert.equal(store.count, 1);
});

test('duplicate create preserves the original', () => {
  const { model, store } = makeStore();
  const original = resolveSpan({ location: '4' }, model);
  store.create(original);
  assert.throws(() => store.create(resolveSpan({ location: '4' }, model)), DuplicateSpanError);
  assert.equal(store.exact(original), original);
});

test('exact lookup remains exact across hierarchy', () => {
  const { model, store } = makeStore();
  store.create(resolveSpan({ location: '4' }, model));
  assert.throws(() => store.exact(resolveSpan({ location: '20' }, model)), SpanNotFoundError);
});

test('update replaces the source span', () => {
  const { model, store } = makeStore();
  const source = resolveSpan({ location: '4' }, model);
  const replacement = resolveSpan({ location: '20' }, model);
  store.create(source);
  assert.equal(store.update(source, replacement), replacement);
  assert.throws(() => store.exact(source), SpanNotFoundError);
  assert.equal(store.exact(replacement), replacement);
  assert.equal(store.count, 1);
});

test('update checks source and collision before mutation', () => {
  const { model, store } = makeStore();
  const source = resolveSpan({ location: '4' }, model);
  const occupied = resolveSpan({ location: '20' }, model);
  store.create(source);
  store.create(occupied);
  assert.throws(() => store.update(resolveSpan({}, model), occupied), SpanNotFoundError);
  assert.throws(() => store.update(source, occupied), DuplicateSpanError);
  assert.equal(store.exact(source), source);
  assert.equal(store.exact(occupied), occupied);
});

test('same-identity update succeeds', () => {
  const { model, store } = makeStore();
  const source = resolveSpan({ location: '4' }, model);
  const equivalent = resolveSpan({ location: '4' }, model);
  store.create(source);
  assert.equal(store.update(source, equivalent), equivalent);
  assert.equal(store.count, 1);
});

test('delete and match operate on spans directly', () => {
  const { model, store } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span);
  assert.deepEqual(store.match({ location: '20' }), [span]);
  store.delete(span);
  assert.deepEqual(store.match({ location: '20' }), []);
  assert.throws(() => store.delete(span), SpanNotFoundError);
});

test('global span works through a zero-axis store', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  const store = new SpanStore(new IndexAdapter(new RTree<CanonicalSpan>(0), model));
  const global = resolveSpan({}, model);
  store.create(global);
  assert.deepEqual(store.match({}), [global]);
  assert.throws(() => store.create(resolveSpan({}, model)), DuplicateSpanError);
});
