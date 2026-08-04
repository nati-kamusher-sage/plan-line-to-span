import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpan } from '../../src/model/span.ts';

test('resolves a valid span', () => {
  const span = resolveSpan({ location: '4' });
  assert.deepEqual(span.dimensions, { location: '4' });
});

test('canonicalization trusts the supplied dimension map', () => {
  assert.deepEqual(resolveSpan({ unknown: 'caller-owned' }).dimensions, { unknown: 'caller-owned' });
  assert.deepEqual(resolveSpan({}).dimensions, {});
});

// ---- canonical identity: member order does not matter (AC-SPAN-04) ----

test('member order does not affect the canonical key', () => {
  const a = resolveSpan({ location: '4', department: 'rnd' });
  const b = resolveSpan({ department: 'rnd', location: '4' });
  assert.equal(a.key, b.key);
  assert.equal(a.equals(b), true);
});

test('different spans have different keys', () => {
  const a = resolveSpan({ location: '4' });
  const b = resolveSpan({ location: '20' });
  assert.notEqual(a.key, b.key);
  assert.equal(a.equals(b), false);
});

test('a span with an extra dimension is not equal to a subset span', () => {
  const narrow = resolveSpan({ location: '4' });
  const wide = resolveSpan({ location: '4', department: 'rnd' });
  assert.equal(narrow.equals(wide), false, 'additional dimension makes a different identity');
});

test('the empty span has a stable, distinct key', () => {
  const empty1 = resolveSpan({});
  const empty2 = resolveSpan({});
  const nonEmpty = resolveSpan({ location: '4' });
  assert.equal(empty1.equals(empty2), true);
  assert.equal(empty1.equals(nonEmpty), false);
});
