import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDimensionModel, InvalidDimensionDefinitionError,
  DIMENSION_FILE_FORMAT, type DimensionFile,
} from '../../src/model/dimension-model.ts';
import { contains } from '../../src/index/box.ts';

const D1: DimensionFile = {
  format: DIMENSION_FILE_FORMAT,
  dimensions: [
    {
      id: 'location', name: 'Location',
      values: [
        { key: '4', name: 'USA' },
        { key: '20', name: 'New York City', parentKey: '4' },
        { key: '21', name: 'Los Angeles', parentKey: '4' },
        { key: '22', name: 'Manhattan', parentKey: '20' },
        { key: '30', name: 'Brooklyn', parentKey: '20' },
      ],
    },
    {
      id: 'department', name: 'Department',
      values: [
        { key: 'rnd', name: 'R&D' },
        { key: 'eng', name: 'Engineering' },
      ],
    },
  ],
};

test('rejects an unsupported format', () => {
  assert.throws(
    () => buildDimensionModel({ format: 'wrong/v1', dimensions: [] }),
    InvalidDimensionDefinitionError,
  );
});

test('rejects a missing format', () => {
  assert.throws(
    () => buildDimensionModel({ format: '', dimensions: [] }),
    InvalidDimensionDefinitionError,
  );
});

test('rejects duplicate dimension identifiers', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [
      { id: 'location', name: 'A', values: [] },
      { id: 'location', name: 'B', values: [] },
    ],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('rejects duplicate value keys within a dimension', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'L',
      values: [{ key: '4', name: 'USA' }, { key: '4', name: 'Also USA' }],
    }],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('rejects a parentKey that does not identify a value in the same dimension', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'L',
      values: [{ key: '20', name: 'NYC', parentKey: '999' }],
    }],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('rejects a two-value cycle', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'L',
      values: [
        { key: 'a', name: 'A', parentKey: 'b' },
        { key: 'b', name: 'B', parentKey: 'a' },
      ],
    }],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('rejects a self-referential cycle', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'L',
      values: [{ key: 'a', name: 'A', parentKey: 'a' }],
    }],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('rejects a longer cycle', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'L',
      values: [
        { key: 'a', name: 'A', parentKey: 'c' },
        { key: 'b', name: 'B', parentKey: 'a' },
        { key: 'c', name: 'C', parentKey: 'b' },
      ],
    }],
  };
  assert.throws(() => buildDimensionModel(file), InvalidDimensionDefinitionError);
});

test('a zero-dimensional model is valid', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  assert.equal(model.axisCount, 0);
  assert.equal(model.dimensionCount, 0);
  assert.equal(model.dimensionValueCount, 0);
  assert.deepEqual(model.spanToBox({}), []);
  assert.deepEqual(model.planLineToPoint({}), []);
});

test('reports dimension and value counts (Obs 4)', () => {
  const model = buildDimensionModel(D1);
  assert.equal(model.dimensionCount, 2);
  assert.equal(model.dimensionValueCount, 7);
});

test('hasDimension and hasValue reflect the loaded model', () => {
  const model = buildDimensionModel(D1);
  assert.equal(model.hasDimension('location'), true);
  assert.equal(model.hasDimension('nonexistent'), false);
  assert.equal(model.hasValue('location', '4'), true);
  assert.equal(model.hasValue('location', 'not-a-key'), false);
  assert.equal(model.hasValue('nonexistent', '4'), false);
});

// ---- interval containment: the property the whole design rests on ----

test('an ancestor interval contains every descendant interval', () => {
  const model = buildDimensionModel(D1);
  const usa = model.spanToBox({ location: '4' })[0]!;
  const nyc = model.spanToBox({ location: '20' })[0]!;
  const manhattan = model.spanToBox({ location: '22' })[0]!;
  const la = model.spanToBox({ location: '21' })[0]!;

  assert.ok(usa[0] <= nyc[0] && nyc[1] <= usa[1], 'USA contains NYC');
  assert.ok(usa[0] <= manhattan[0] && manhattan[1] <= usa[1], 'USA contains Manhattan');
  assert.ok(nyc[0] <= manhattan[0] && manhattan[1] <= nyc[1], 'NYC contains Manhattan');
  assert.ok(!(nyc[0] <= la[0] && la[1] <= nyc[1]), 'NYC does not contain LA (siblings)');
});

test('non-hierarchical values receive disjoint intervals', () => {
  const model = buildDimensionModel(D1);
  const rnd = model.spanToBox({ department: 'rnd' })[1]!;
  const eng = model.spanToBox({ department: 'eng' })[1]!;
  const overlap = Math.max(rnd[0], eng[0]) <= Math.min(rnd[1], eng[1]);
  assert.equal(overlap, false, 'disjoint department values cannot contain one another');
});

// ---- multi-root dimensions ----

test('a dimension with two unrelated roots keeps their subtrees disjoint', () => {
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'region', name: 'Region',
      values: [
        { key: 'eu', name: 'Europe' },
        { key: 'de', name: 'Germany', parentKey: 'eu' },
        { key: 'us', name: 'United States' },
        { key: 'ca', name: 'California', parentKey: 'us' },
      ],
    }],
  };
  const model = buildDimensionModel(file);
  const eu = model.spanToBox({ region: 'eu' })[0]!;
  const us = model.spanToBox({ region: 'us' })[0]!;
  const de = model.spanToBox({ region: 'de' })[0]!;
  const ca = model.spanToBox({ region: 'ca' })[0]!;

  assert.ok(eu[0] <= de[0] && de[1] <= eu[1], 'eu contains de');
  assert.ok(us[0] <= ca[0] && ca[1] <= us[1], 'us contains ca');
  const euRangeOverlapsUs = Math.max(eu[0], us[0]) <= Math.min(eu[1], us[1]);
  assert.equal(euRangeOverlapsUs, false, 'the two root subtrees are disjoint');
  assert.ok(!(eu[0] <= ca[0] && ca[1] <= eu[1]), 'eu does not contain ca');
  assert.ok(!(us[0] <= de[0] && de[1] <= us[1]), 'us does not contain de');
});

test('every value with no parentKey is a root, including an entire non-hierarchical dimension', () => {
  // department has two values, neither declares a parentKey: two single-node
  // roots, which is the common case rather than a special one (DEC-21).
  const model = buildDimensionModel(D1);
  assert.equal(model.hasValue('department', 'rnd'), true);
  assert.equal(model.hasValue('department', 'eng'), true);
});

test('a partly hierarchical dimension can have an unrelated standalone value', () => {
  // A location need not belong to any country-rooted subtree at all.
  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [{
      id: 'location', name: 'Location',
      values: [
        { key: '4', name: 'USA' },
        { key: '20', name: 'NYC', parentKey: '4' },
        { key: '99', name: 'Remote' },
      ],
    }],
  };
  const model = buildDimensionModel(file);
  const usa = model.spanToBox({ location: '4' })[0]!;
  const remote = model.spanToBox({ location: '99' })[0]!;
  const overlap = Math.max(usa[0], remote[0]) <= Math.min(usa[1], remote[1]);
  assert.equal(overlap, false, 'Remote is outside every country subtree');
});

// ---- planLineToPoint: the absent-dimension sentinel (DEC-23) ----

test('a plan line value maps to that value\'s interval', () => {
  const model = buildDimensionModel(D1);
  const span = model.spanToBox({ location: '20' });
  const point = model.planLineToPoint({ location: '20', department: 'rnd' });
  assert.deepEqual(point[0], span[0]);
});

test('a dimension absent from the plan line fails a span that constrains it (DEC-23)', () => {
  const model = buildDimensionModel(D1);
  const point = model.planLineToPoint({ location: '20' }); // no department
  const spanWithDepartment = model.spanToBox({ location: '20', department: 'rnd' });
  assert.equal(contains(spanWithDepartment, point), false,
    'the span requires department, which the plan line does not have');
});

test('a dimension absent from the plan line does not fail a span that also omits it', () => {
  const model = buildDimensionModel(D1);
  const point = model.planLineToPoint({ location: '20' }); // no department
  const spanWithoutDepartment = model.spanToBox({ location: '20' });
  assert.equal(contains(spanWithoutDepartment, point), true,
    'neither the span nor the plan line constrains department, so it is not a mismatch');
});

test('the empty plan line satisfies only the empty span', () => {
  const model = buildDimensionModel(D1);
  const point = model.planLineToPoint({});
  assert.equal(contains(model.spanToBox({}), point), true, 'the global span matches everything');
  assert.equal(contains(model.spanToBox({ location: '4' }), point), false,
    'a span constraining location cannot be satisfied by a plan line with no location');
});

// ---- error paths in span/plan-line resolution ----

test('spanToBox throws on an unknown dimension', () => {
  const model = buildDimensionModel(D1);
  assert.throws(() => model.spanToBox({ unknown: 'x' }));
});

test('spanToBox throws on an unknown value', () => {
  const model = buildDimensionModel(D1);
  assert.throws(() => model.spanToBox({ location: 'not-a-key' }));
});

test('planLineToPoint throws on an unknown dimension or value', () => {
  const model = buildDimensionModel(D1);
  assert.throws(() => model.planLineToPoint({ unknown: 'x' }));
  assert.throws(() => model.planLineToPoint({ location: 'not-a-key' }));
});
