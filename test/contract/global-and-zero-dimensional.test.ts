/**
 * AC-GLOBAL-01 through AC-GLOBAL-04, and AC-ZERO-01, promoted from
 * docs/design/prototypes/dt-3-representation-probe.mjs.
 *
 * The design-phase probe compared two candidate representations of the
 * global benefit — inside the index as an all-axis-covering box (DEC-14), or
 * outside it in a dedicated slot — and found them observably identical, so
 * DEC-14 chose the in-index form on structural grounds (fewer branches,
 * uniform benefitCount and duplicate detection). It used a stand-in index,
 * not RTree.
 *
 * These tests run the same scenarios against the real DimensionModel,
 * IndexAdapter, and BenefitStore. Unlike T1 through T4, no production code
 * changed to make them pass: DEC-14 and DEC-15 (the empty span is the
 * omitted-dimension wildcard applied to every axis, not a special case) were
 * already realized by construction once spanToBox existed, and DEC-16 (a
 * zero-axis model has vacuous containment) was already covered by RTree's
 * own zero-axis support from T1. This file is the acceptance-level
 * confirmation that composition, not a missing feature.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildD1, buildBenefitStore } from '../support/d1.ts';
import { buildDimensionModel, DIMENSION_FILE_FORMAT } from '../../src/model/dimension-model.ts';
import { resolveSpan } from '../../src/model/span.ts';
import { DuplicateSpanError, BenefitNotFoundError } from '../../src/store/benefit-store.ts';

test('AC-GLOBAL-01: the global benefit matches a non-empty employee plan line', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({}, model), 'F1');
  assert.deepEqual(store.match({ location: '20' }).map(b => b.formula), ['F1']);
  assert.equal(store.count, 1);
});

test('AC-GLOBAL-02: the global benefit matches the empty employee plan line', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({}, model), 'F1');
  assert.deepEqual(store.match({}).map(b => b.formula), ['F1']);
});

test('AC-GLOBAL-03: a duplicate global create is rejected; the original remains', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  const global = resolveSpan({}, model);
  store.create(global, 'F1');
  assert.throws(() => store.create(resolveSpan({}, model), 'F2'), DuplicateSpanError);
  assert.deepEqual(store.exact(global).formula, 'F1');
  assert.equal(store.count, 1);
});

test('AC-GLOBAL-04: exact query, update, exact query again, delete, then not found', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  const global = resolveSpan({}, model);

  store.create(global, 'F1');
  assert.deepEqual(store.exact(global).formula, 'F1');

  store.update(global, 'F2');
  assert.deepEqual(store.exact(global).formula, 'F2');

  store.delete(global);
  assert.equal(store.count, 0);
  assert.throws(() => store.exact(global), BenefitNotFoundError);
});

test('AC-ZERO-01: a zero-dimensional model accepts the global benefit and matches the empty plan line', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  assert.equal(model.dimensionCount, 0);
  const store = buildBenefitStore(model);

  const global = resolveSpan({}, model);
  store.create(global, 'F1');
  assert.deepEqual(store.match({}).map(b => b.formula), ['F1']);
  assert.equal(store.count, 1);
});

// ---- coexistence and the negative case, from the prototype but not named
// as their own case IDs in the catalogue ----

test('the global benefit coexists with an ordinary benefit and both are independently addressable', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  const global = resolveSpan({}, model);
  const usa = resolveSpan({ location: '4' }, model);

  store.create(global, 'G');
  store.create(usa, 'B1');

  assert.equal(store.count, 2);
  assert.deepEqual(store.match({ location: '4' }).map(b => b.formula).sort(), ['B1', 'G']);
  assert.deepEqual(store.exact(global).formula, 'G');
  assert.deepEqual(store.exact(usa).formula, 'B1');
});

test('exact lookup for a non-empty span never returns the global benefit (OC 9.1 applies to it too)', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({}, model), 'G');
  assert.throws(() => store.exact(resolveSpan({ location: '4' }, model)), BenefitNotFoundError);
});
