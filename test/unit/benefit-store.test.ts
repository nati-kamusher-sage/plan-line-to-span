import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDimensionModel, DIMENSION_FILE_FORMAT, type DimensionFile } from '../../src/model/dimension-model.ts';
import { resolveSpan } from '../../src/model/span.ts';
import { RTree } from '../../src/index/rtree.ts';
import { IndexAdapter, type IndexedBenefit } from '../../src/store/index-adapter.ts';
import { BenefitStore, DuplicateSpanError, BenefitNotFoundError } from '../../src/store/benefit-store.ts';

const D1: DimensionFile = {
  format: DIMENSION_FILE_FORMAT,
  dimensions: [
    { id: 'location', name: 'Location', values: [
      { key: '4', name: 'USA' },
      { key: '20', name: 'NYC', parentKey: '4' },
      { key: '22', name: 'Manhattan', parentKey: '20' },
    ]},
    { id: 'department', name: 'Department', values: [
      { key: 'rnd', name: 'R&D' }, { key: 'eng', name: 'Engineering' },
    ]},
  ],
};

function makeStore(): { store: BenefitStore; model: ReturnType<typeof buildDimensionModel> } {
  const model = buildDimensionModel(D1);
  const index = new IndexAdapter(new RTree<IndexedBenefit>(model.axisCount), model);
  return { store: new BenefitStore(index), model };
}

test('create then exact returns the stored formula', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span, { rate: 0.1 });
  assert.deepEqual(store.exact(span).formula, { rate: 0.1 });
  assert.equal(store.count, 1);
});

test('creating a duplicate canonical span throws, original is unchanged', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span, { rate: 0.1 });
  assert.throws(() => store.create(span, { rate: 0.2 }), DuplicateSpanError);
  assert.deepEqual(store.exact(span).formula, { rate: 0.1 }, 'original formula survives the rejected duplicate');
  assert.equal(store.count, 1);
});

test('member order does not create a second benefit (AC-BEN-04)', () => {
  const { store, model } = makeStore();
  const a = resolveSpan({ location: '4', department: 'rnd' }, model);
  const b = resolveSpan({ department: 'rnd', location: '4' }, model);
  store.create(a, { rate: 1 });
  assert.throws(() => store.create(b, { rate: 2 }), DuplicateSpanError);
  assert.equal(store.count, 1);
});

test('exact lookup on an absent span throws BenefitNotFoundError', () => {
  const { store, model } = makeStore();
  assert.throws(() => store.exact(resolveSpan({ location: '4' }, model)), BenefitNotFoundError);
});

test('exact lookup is not broadened by hierarchy (OC 9.1, AC-BEN-05)', () => {
  const { store, model } = makeStore();
  store.create(resolveSpan({ location: '4' }, model), { rate: 1 }); // USA
  // Querying the child (NYC) must NOT return the parent's (USA) benefit.
  assert.throws(() => store.exact(resolveSpan({ location: '20' }, model)), BenefitNotFoundError);
});

test('exact lookup on a child span is not confused by a stored ancestor (adversarial)', () => {
  // The index's own search() returns every box that CONTAINS the query box,
  // so searching for a narrow child span can surface a wider ancestor entry
  // at the geometry layer. This is exactly why DEC-24 requires identity to
  // rest on the canonical key: exact() must still resolve correctly here.
  const { store, model } = makeStore();
  store.create(resolveSpan({ location: '4' }, model), { rate: 'USA' });
  store.create(resolveSpan({ location: '22' }, model), { rate: 'Manhattan' });
  assert.deepEqual(store.exact(resolveSpan({ location: '22' }, model)).formula, { rate: 'Manhattan' });
  assert.deepEqual(store.exact(resolveSpan({ location: '4' }, model)).formula, { rate: 'USA' });
});

test('update replaces the formula without changing the span, and is exact', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span, { rate: 1 });
  const updated = store.update(span, { rate: 2 });
  assert.deepEqual(updated.formula, { rate: 2 });
  assert.equal(updated.span.equals(span), true, 'span is unchanged');
  assert.deepEqual(store.exact(span).formula, { rate: 2 });
  assert.equal(store.count, 1, 'update does not create a second entry');
});

test('update on an absent span throws and creates nothing', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  assert.throws(() => store.update(span, { rate: 1 }), BenefitNotFoundError);
  assert.equal(store.count, 0);
});

test('delete removes the benefit; a subsequent exact lookup is not found', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span, { rate: 1 });
  store.delete(span);
  assert.equal(store.count, 0);
  assert.throws(() => store.exact(span), BenefitNotFoundError);
});

test('delete on an absent span throws (AC-BEN-09)', () => {
  const { store, model } = makeStore();
  assert.throws(() => store.delete(resolveSpan({ location: '4' }, model)), BenefitNotFoundError);
});

test('update and delete on an empty store both throw NotFound (AC-BEN-09)', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  assert.throws(() => store.update(span, {}), BenefitNotFoundError);
  assert.throws(() => store.delete(span), BenefitNotFoundError);
  assert.equal(store.count, 0);
});

test('a failed create, update, or delete leaves exact lookup unaffected (OC 14.3)', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  store.create(span, { rate: 1 });

  assert.throws(() => store.create(span, { rate: 99 }), DuplicateSpanError);
  assert.throws(() => store.update(resolveSpan({ location: '20' }, model), {}), BenefitNotFoundError);
  assert.throws(() => store.delete(resolveSpan({ location: '20' }, model)), BenefitNotFoundError);

  assert.deepEqual(store.exact(span).formula, { rate: 1 });
  assert.equal(store.count, 1);
});

test('formula objects are preserved structurally, including nested values (OC 6.5)', () => {
  const { store, model } = makeStore();
  const span = resolveSpan({ location: '4' }, model);
  const formula = { nested: { arr: [1, 'two', null, true] }, sentinel: 'SEKRIT' };
  store.create(span, formula);
  assert.deepEqual(store.exact(span).formula, formula);
});

// ---- matching (thin coverage; full matching semantics are T4) ----

test('match finds a benefit whose span equals the plan line', () => {
  const { store, model } = makeStore();
  store.create(resolveSpan({ location: '4' }, model), { rate: 1 });
  const matches = store.match({ location: '4' });
  assert.equal(matches.length, 1);
});

test('match returns an empty array rather than throwing when nothing applies', () => {
  const { store } = makeStore();
  assert.deepEqual(store.match({ location: '4' }), []);
});

// ---- zero-dimensional model (DT-3): the store composed over a zero-axis index ----

test('the global benefit works through the full store stack at zero dimensions', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  const index = new IndexAdapter(new RTree<IndexedBenefit>(model.axisCount), model);
  const store = new BenefitStore(index);

  const global = resolveSpan({}, model);
  store.create(global, { rate: 'global' });
  assert.equal(store.count, 1);
  assert.deepEqual(store.exact(global).formula, { rate: 'global' });
  assert.deepEqual(store.match({}), [{ span: global, formula: { rate: 'global' } }]);

  assert.throws(() => store.create(resolveSpan({}, model), { rate: 'dup' }), DuplicateSpanError);
  store.delete(global);
  assert.equal(store.count, 0);
});
