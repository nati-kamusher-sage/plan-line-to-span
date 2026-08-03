import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSpan, UnknownDimensionError, UnknownDimensionValueError,
} from '../../src/model/span.ts';
import { buildDimensionModel, DIMENSION_FILE_FORMAT } from '../../src/model/dimension-model.ts';

const model = buildDimensionModel({
  format: DIMENSION_FILE_FORMAT,
  dimensions: [
    { id: 'location', name: 'Location', values: [
      { key: '4', name: 'USA' }, { key: '20', name: 'NYC', parentKey: '4' },
    ]},
    { id: 'department', name: 'Department', values: [
      { key: 'rnd', name: 'R&D' }, { key: 'eng', name: 'Engineering' },
    ]},
  ],
});

test('resolves a valid span', () => {
  const span = resolveSpan({ location: '4' }, model);
  assert.deepEqual(span.dimensions, { location: '4' });
});

test('throws UnknownDimensionError for an unrecognized dimension', () => {
  assert.throws(() => resolveSpan({ unknown: 'x' }, model), UnknownDimensionError);
});

test('throws UnknownDimensionValueError for an unrecognized value', () => {
  assert.throws(() => resolveSpan({ location: 'not-a-key' }, model), UnknownDimensionValueError);
});

test('the empty span resolves against any model, including zero dimensions', () => {
  const zero = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  assert.doesNotThrow(() => resolveSpan({}, model));
  assert.doesNotThrow(() => resolveSpan({}, zero));
});

// ---- canonical identity: member order does not matter (AC-BEN-04) ----

test('member order does not affect the canonical key', () => {
  const a = resolveSpan({ location: '4', department: 'rnd' }, model);
  const b = resolveSpan({ department: 'rnd', location: '4' }, model);
  assert.equal(a.key, b.key);
  assert.equal(a.equals(b), true);
});

test('different spans have different keys', () => {
  const a = resolveSpan({ location: '4' }, model);
  const b = resolveSpan({ location: '20' }, model);
  assert.notEqual(a.key, b.key);
  assert.equal(a.equals(b), false);
});

test('a span with an extra dimension is not equal to a subset span', () => {
  const narrow = resolveSpan({ location: '4' }, model);
  const wide = resolveSpan({ location: '4', department: 'rnd' }, model);
  assert.equal(narrow.equals(wide), false, 'additional dimension makes a different identity');
});

test('the empty span has a stable, distinct key', () => {
  const empty1 = resolveSpan({}, model);
  const empty2 = resolveSpan({}, model);
  const nonEmpty = resolveSpan({ location: '4' }, model);
  assert.equal(empty1.equals(empty2), true);
  assert.equal(empty1.equals(nonEmpty), false);
});

