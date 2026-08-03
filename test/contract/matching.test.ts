/**
 * AC-MATCH-01 through AC-MATCH-11, driving the real DimensionModel,
 * IndexAdapter, and BenefitStore stack rather than the design prototype's
 * linear-filter stand-in.
 *
 * "End to end" for T4 means the domain composition — resolve a span, store
 * it, resolve a plan line, match it — not the HTTP/dispatch surface, which is
 * T6/T7's job. These are contract-layer tests in DT-9's sense: they exercise
 * the public behavior an acceptance case describes, without reaching into
 * index internals.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildD1, buildBenefitStore } from '../support/d1.ts';
import { resolveSpan } from '../../src/model/span.ts';
import type { BenefitStore } from '../../src/store/benefit-store.ts';

function formulasOf(store: BenefitStore, planLine: Readonly<Record<string, string>>): unknown[] {
  return store.match(planLine).map(b => b.formula).sort();
}

test('AC-MATCH-01: direct equality matches', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '20' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '20' }), ['F1']);
});

test('AC-MATCH-02: one-level ancestor match', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '20' }), ['F1']);
});

test('AC-MATCH-03: multi-level ancestor match across two levels, 4 -> 20 -> 22', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '22' }), ['F1']);
});

test('AC-MATCH-04: a child span does not match a parent employee', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '22' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '4' }), []);
});

test('AC-MATCH-05: an employee-only dimension does not prevent a match', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '20', department: 'rnd' }), ['F1']);
});

test('AC-MATCH-06: a missing required employee dimension prevents a match', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4', department: 'rnd' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '20' }), []);
});

test('AC-MATCH-07: span constraints use AND semantics', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4', department: 'rnd' }, model), 'F1');
  assert.deepEqual(formulasOf(store, { location: '20', department: 'eng' }), []);
});

test('AC-MATCH-08: a valid query with no applicable benefits returns an empty collection', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '21' }, model), 'F1'); // Los Angeles
  assert.deepEqual(formulasOf(store, { location: '20' }), []); // New York City
});

test('AC-MATCH-09: repeated queries return the same set; ordering is not asserted', () => {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4' }, model), 'A');
  store.create(resolveSpan({ location: '20' }, model), 'B');
  const first = formulasOf(store, { location: '22' });
  const second = formulasOf(store, { location: '22' });
  assert.deepEqual(first, second);
  assert.deepEqual(first, ['A', 'B']);
});

// AC-MATCH-10 / AC-MATCH-11: the section 12 scenario (OC 12, 12.2).
// B1{location:4} B2{location:4,department:rnd} B3{location:20} B4{location:4,department:eng}
function section12Store(): { model: ReturnType<typeof buildD1>; store: BenefitStore } {
  const model = buildD1();
  const store = buildBenefitStore(model);
  store.create(resolveSpan({ location: '4' }, model), 'B1');
  store.create(resolveSpan({ location: '4', department: 'rnd' }, model), 'B2');
  store.create(resolveSpan({ location: '20' }, model), 'B3');
  store.create(resolveSpan({ location: '4', department: 'eng' }, model), 'B4');
  return { model, store };
}

test('AC-MATCH-10: New York City R&D employee matches exactly {B1, B2, B3}', () => {
  const { store } = section12Store();
  assert.deepEqual(formulasOf(store, { location: '20', department: 'rnd' }), ['B1', 'B2', 'B3']);
});

test('AC-MATCH-11: the New York City span never matches a Los Angeles employee', () => {
  const { store } = section12Store();
  assert.deepEqual(formulasOf(store, { location: '21', department: 'rnd' }), ['B1', 'B2']);
  assert.deepEqual(formulasOf(store, { location: '21', department: 'eng' }), ['B1', 'B4']);
  assert.deepEqual(formulasOf(store, { location: '4' }), ['B1']);
});
