/**
 * AC-MATCH-01 through AC-MATCH-11, driving the real DimensionModel,
 * IndexAdapter, and SpanStore stack rather than the design prototype's
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
import { buildD1, buildSpanStore } from '../support/d1.ts';
import { resolveSpan } from '../../src/model/span.ts';
import type { SpanStore } from '../../src/store/span-store.ts';

function keysOf(store: SpanStore, planLine: Readonly<Record<string, string>>): string[] {
  return store.match(planLine).map(span => span.key).sort();
}

test('AC-MATCH-01: direct equality matches', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const span = resolveSpan({ location: '20' });
  store.create(span);
  assert.deepEqual(keysOf(store, { location: '20' }), [span.key]);
});

test('AC-MATCH-02: one-level ancestor match', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const span = resolveSpan({ location: '4' });
  store.create(span);
  assert.deepEqual(keysOf(store, { location: '20' }), [span.key]);
});

test('AC-MATCH-03: multi-level ancestor match across two levels, 4 -> 20 -> 22', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const span = resolveSpan({ location: '4' });
  store.create(span);
  assert.deepEqual(keysOf(store, { location: '22' }), [span.key]);
});

test('AC-MATCH-04: a child span does not match a parent planLine', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({ location: '22' }));
  assert.deepEqual(keysOf(store, { location: '4' }), []);
});

test('AC-MATCH-05: an planLine-only dimension does not prevent a match', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const span = resolveSpan({ location: '4' });
  store.create(span);
  assert.deepEqual(keysOf(store, { location: '20', department: 'rnd' }), [span.key]);
});

test('AC-MATCH-06: a missing required planLine dimension prevents a match', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({ location: '4', department: 'rnd' }));
  assert.deepEqual(keysOf(store, { location: '20' }), []);
});

test('AC-MATCH-07: span constraints use AND semantics', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({ location: '4', department: 'rnd' }));
  assert.deepEqual(keysOf(store, { location: '20', department: 'eng' }), []);
});

test('AC-MATCH-08: a valid query with no applicable spans returns an empty collection', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({ location: '21' })); // Los Angeles
  assert.deepEqual(keysOf(store, { location: '20' }), []); // New York City
});

test('AC-MATCH-09: repeated queries return the same set; ordering is not asserted', () => {
  const model = buildD1();
  const store = buildSpanStore(model);
  const broad = resolveSpan({ location: '4' });
  const narrow = resolveSpan({ location: '20' });
  store.create(broad);
  store.create(narrow);
  const first = keysOf(store, { location: '22' });
  const second = keysOf(store, { location: '22' });
  assert.deepEqual(first, second);
  assert.deepEqual(first, [broad.key, narrow.key].sort());
});

// AC-MATCH-10 / AC-MATCH-11: the section 12 scenario (OC 12, 12.2).
// B1{location:4} B2{location:4,department:rnd} B3{location:20} B4{location:4,department:eng}
function section12Store(): { model: ReturnType<typeof buildD1>; store: SpanStore } {
  const model = buildD1();
  const store = buildSpanStore(model);
  store.create(resolveSpan({ location: '4' }));
  store.create(resolveSpan({ location: '4', department: 'rnd' }));
  store.create(resolveSpan({ location: '20' }));
  store.create(resolveSpan({ location: '4', department: 'eng' }));
  return { model, store };
}

test('AC-MATCH-10: New York City R&D planLine matches exactly {B1, B2, B3}', () => {
  const { store } = section12Store();
  assert.equal(keysOf(store, { location: '20', department: 'rnd' }).length, 3);
});

test('AC-MATCH-11: the New York City span never matches a Los Angeles planLine', () => {
  const { store } = section12Store();
  assert.equal(keysOf(store, { location: '21', department: 'rnd' }).length, 2);
  assert.equal(keysOf(store, { location: '21', department: 'eng' }).length, 2);
  assert.equal(keysOf(store, { location: '4' }).length, 1);
});
