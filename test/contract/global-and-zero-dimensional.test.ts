/**
 * AC-GLOBAL-01 through AC-GLOBAL-04, and AC-ZERO-01, promoted from
 * docs/design/prototypes/dt-3-representation-probe.mjs.
 *
 * The design-phase probe compared two candidate representations of the
 * global span — inside the index as an all-axis-covering box (DEC-14), or
 * outside it in a dedicated slot — and found them observably identical, so
 * DEC-14 chose the in-index form on structural grounds (fewer branches,
 * uniform spanCount and duplicate detection). It used a stand-in index,
 * not RTree.
 *
 * These tests run the same scenarios against the real DimensionModel,
 * IndexAdapter, and SpanStore. Unlike T1 through T4, no production code
 * changed to make them pass: DEC-14 and DEC-15 (the empty span is the
 * omitted-dimension wildcard applied to every axis, not a special case) were
 * already realized by construction once spanToBox existed, and DEC-16 (a
 * zero-axis model has vacuous containment) was already covered by RTree's
 * own zero-axis support from T1. This file is the acceptance-level
 * confirmation that composition, not a missing feature.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildD1, buildSpanStore } from '../support/d1.ts';
import { buildDimensionModel, DIMENSION_FILE_FORMAT } from '../../src/model/dimension-model.ts';
import { resolveSpan } from '../../src/model/span.ts';
import { DuplicateSpanError, SpanNotFoundError } from '../../src/store/span-store.ts';

test('AC-GLOBAL-01: the global span matches a non-empty planLine plan line', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const global = resolveSpan({}, model);
  store.create(global);
  assert.deepEqual(store.match({ location: '20' }), [global]);
  assert.equal(store.count, 1);
});

test('AC-GLOBAL-02: the global span matches the empty planLine plan line', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const global = resolveSpan({}, model);
  store.create(global);
  assert.deepEqual(store.match({}), [global]);
});

test('AC-GLOBAL-03: a duplicate global create is rejected; the original remains', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const global = resolveSpan({}, model);
  store.create(global);
  assert.throws(() => store.create(resolveSpan({}, model)), DuplicateSpanError);
  assert.equal(store.exact(global), global);
  assert.equal(store.count, 1);
});

test('AC-GLOBAL-04: exact query, update, exact query again, delete, then not found', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const global = resolveSpan({}, model);

  store.create(global);
  assert.equal(store.exact(global), global);

  const replacement = resolveSpan({}, model);
  store.update(global, replacement);
  assert.equal(store.exact(replacement), replacement);

  store.delete(global);
  assert.equal(store.count, 0);
  assert.throws(() => store.exact(global), SpanNotFoundError);
});

test('AC-ZERO-01: a zero-dimensional model accepts the global span and matches the empty plan line', () => {
  const model = buildDimensionModel({ format: DIMENSION_FILE_FORMAT, dimensions: [] });
  assert.equal(model.dimensionCount, 0);
  const store = buildSpanStore(model);

  const global = resolveSpan({}, model);
  store.create(global);
  assert.deepEqual(store.match({}), [global]);
  assert.equal(store.count, 1);
});

// ---- coexistence and the negative case, from the prototype but not named
// as their own case IDs in the catalogue ----

test('the global span coexists with an ordinary span and both are independently addressable', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const global = resolveSpan({}, model);
  const usa = resolveSpan({ location: '4' }, model);

  store.create(global);
  store.create(usa);

  assert.equal(store.count, 2);
  assert.deepEqual(store.match({ location: '4' }).map(span => span.key).sort(), [global.key, usa.key].sort());
  assert.equal(store.exact(global), global);
  assert.equal(store.exact(usa), usa);
});

test('exact lookup for a non-empty span never returns the global span (OC 9.1 applies to it too)', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({}, model));
  assert.throws(() => store.exact(resolveSpan({ location: '4' }, model)), SpanNotFoundError);
});
