/**
 * AC-BEN-01 through AC-BEN-11, driving the real OperationDispatcher end to
 * end: raw JSON string in, Response out. Full lifecycle sequences (create,
 * query, update, delete, and their failure modes) against the D1 fixture,
 * plus AC-BEN-11's opaque-formula preservation.
 *
 * T8 (validation pipeline / FormulaValidator) was skipped by explicit
 * instruction, so `formula` is currently unvalidated end to end: any JSON
 * value round-trips through create/update/query unchanged. That is
 * incidentally what AC-BEN-11 needs, but it also means INVALID_FORMULA
 * (formula null, oversized, array) is not exercised here or anywhere yet.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { D1_FILE } from '../support/d1.ts';
import type { Response } from '../../src/dispatch/response.ts';

const V = 'plan-line-to-span/v1';

function ready(): OperationDispatcher {
  const d = new OperationDispatcher();
  const res = d.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  assert.equal(res.ok, true, 'fixture dispatcher must reach Ready');
  return d;
}

function create(d: OperationDispatcher, span: Record<string, string>, formula: unknown): Response {
  return d.dispatch(JSON.stringify({ contractVersion: V, operation: 'createBenefit', payload: { span, formula } }));
}
function update(d: OperationDispatcher, span: Record<string, string>, formula: unknown): Response {
  return d.dispatch(JSON.stringify({ contractVersion: V, operation: 'updateBenefit', payload: { span, formula } }));
}
function del(d: OperationDispatcher, span: Record<string, string>): Response {
  return d.dispatch(JSON.stringify({ contractVersion: V, operation: 'deleteBenefit', payload: { span } }));
}
function query(d: OperationDispatcher, span: Record<string, string>): Response {
  return d.dispatch(JSON.stringify({ contractVersion: V, operation: 'queryBenefit', payload: { span } }));
}

function errorCode(res: Response): string {
  assert.equal(res.ok, false, 'expected a failure response');
  return !res.ok ? res.error.code : '';
}

test('AC-BEN-01: creating a benefit succeeds, returns it, and is counted', () => {
  const d = ready();
  const res = create(d, { location: '4' }, { r: 'F1' });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.data, { benefit: { span: { location: '4' }, formula: { r: 'F1' } } });
  assert.equal(d.state, 'ready');
  assert.equal(d.benefitCount, 1);
});

test('AC-BEN-02: creating the same span twice is DUPLICATE_SPAN, and the original is preserved', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const res = create(d, { location: '4' }, { r: 'F2' });
  assert.equal(errorCode(res), 'DUPLICATE_SPAN');
  assert.equal(d.benefitCount, 1);
  const q = query(d, { location: '4' });
  if (q.ok) assert.deepEqual(q.data['benefit'], { span: { location: '4' }, formula: { r: 'F1' } });
});

test('AC-BEN-03: an exact query returns only the matching benefit', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const res = query(d, { location: '4' });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.data, { benefit: { span: { location: '4' }, formula: { r: 'F1' } } });
});

test('AC-BEN-04: span member order does not affect identity', () => {
  const d = ready();
  create(d, { location: '4', department: 'rnd' }, { r: 'F1' });
  const res = query(d, { department: 'rnd', location: '4' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.data['benefit'], { span: { location: '4', department: 'rnd' }, formula: { r: 'F1' } });
  }
});

test('AC-BEN-05: hierarchy does not broaden exact lookup', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const res = query(d, { location: '20' });
  assert.equal(errorCode(res), 'NOT_FOUND');
});

test('AC-BEN-06: update replaces the formula; span is unchanged; the query reflects it', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const upd = update(d, { location: '4' }, { r: 'F2' });
  assert.equal(upd.ok, true);
  if (upd.ok) assert.deepEqual(upd.data, { benefit: { span: { location: '4' }, formula: { r: 'F2' } } });

  const q = query(d, { location: '4' });
  assert.equal(q.ok, true);
  if (q.ok) assert.deepEqual(q.data, { benefit: { span: { location: '4' }, formula: { r: 'F2' } } });
});

test('AC-BEN-07: an update payload with an undeclared replacementSpan is MALFORMED_REQUEST', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const raw = JSON.stringify({
    contractVersion: V, operation: 'updateBenefit',
    payload: { span: { location: '4' }, formula: { r: 'F2' }, replacementSpan: { location: '20' } },
  });
  const res = d.dispatch(raw);
  assert.equal(errorCode(res), 'MALFORMED_REQUEST');

  const q = query(d, { location: '4' });
  if (q.ok) assert.deepEqual(q.data['benefit'], { span: { location: '4' }, formula: { r: 'F1' } });
});

test('AC-BEN-08: delete succeeds, then the same span is NOT_FOUND', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });
  const delRes = del(d, { location: '4' });
  assert.equal(delRes.ok, true);
  if (delRes.ok) assert.deepEqual(delRes.data, { deleted: true, span: { location: '4' } });
  assert.equal(d.benefitCount, 0);

  const q = query(d, { location: '4' });
  assert.equal(errorCode(q), 'NOT_FOUND');
});

test('AC-BEN-09: update and delete against an empty index are both NOT_FOUND', () => {
  const d = ready();
  assert.equal(d.benefitCount, 0);

  const updRes = update(d, { location: '4' }, { r: 'F1' });
  assert.equal(errorCode(updRes), 'NOT_FOUND');
  assert.equal(d.benefitCount, 0);

  const delRes = del(d, { location: '4' });
  assert.equal(errorCode(delRes), 'NOT_FOUND');
  assert.equal(d.benefitCount, 0);
});

test('AC-BEN-10: duplicate create, malformed update, and absent delete each fail without disturbing the one stored benefit', () => {
  const d = ready();
  create(d, { location: '4' }, { r: 'F1' });

  assert.equal(errorCode(create(d, { location: '4' }, { r: 'F2' })), 'DUPLICATE_SPAN');
  assert.equal(d.benefitCount, 1);

  const malformedUpdate = JSON.stringify({
    contractVersion: V, operation: 'updateBenefit',
    payload: { span: { location: '4' }, formula: { r: 'F2' }, replacementSpan: { location: '20' } },
  });
  assert.equal(errorCode(d.dispatch(malformedUpdate)), 'MALFORMED_REQUEST');
  assert.equal(d.benefitCount, 1);

  assert.equal(errorCode(del(d, { location: '21' })), 'NOT_FOUND');
  assert.equal(d.benefitCount, 1);

  const q = query(d, { location: '4' });
  assert.equal(q.ok, true);
  if (q.ok) assert.deepEqual(q.data['benefit'], { span: { location: '4' }, formula: { r: 'F1' } });
});

test('AC-BEN-11: an opaque formula with nested arrays, booleans, null, and a sentinel round-trips structurally identical', () => {
  const d = ready();
  const SENTINEL = 'do-not-log-me-2f8a91';
  const formula: Record<string, unknown> = {
    rate: 0.15,
    tiers: [{ upTo: 1000, pct: 0.1 }, { upTo: null, pct: 0.2 }],
    active: true,
    disabled: false,
    notes: null,
    sentinel: SENTINEL,
    nested: { deeply: { value: [1, 2, [3, 4, { five: 5 }]] } },
  };

  const createRes = create(d, { location: '4' }, formula);
  assert.equal(createRes.ok, true);
  if (createRes.ok) assert.deepEqual((createRes.data['benefit'] as { formula: unknown }).formula, formula);

  const queryRes = query(d, { location: '4' });
  assert.equal(queryRes.ok, true);
  if (queryRes.ok) {
    assert.deepEqual((queryRes.data['benefit'] as { formula: unknown }).formula, formula);
  }

  // No interpretation occurs: the formula is opaque data the utility never
  // inspects beyond structural preservation, and the Response is exactly
  // where the caller's own formula is supposed to reappear.
  const responseText = JSON.stringify(createRes) + JSON.stringify(queryRes);
  assert.ok(responseText.includes(SENTINEL), 'the sentinel is legitimately present in the response payload itself');

  // AC-BEN-11's other half -- "log: success records do not contain the
  // sentinel" -- is ObservabilityEmitter's privacy guarantee (DT-8 DEC-52 to
  // DEC-59), not yet built. There is no log record to check until T10 exists;
  // that half of this case is T10's to close, not silently assumed here.
});
