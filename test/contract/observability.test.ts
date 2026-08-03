/**
 * AC-OBS-01 through AC-OBS-04, driving the real OperationDispatcher wrapped
 * by the real ObservabilityEmitter. A fake LogSink captures each written
 * line directly -- the emitter's constructor accepts an injectable sink
 * exactly so a test does not need to intercept the real process.stdout to
 * verify what gets written (real-stdout capture is exercised separately in
 * `stdout-sink.test.ts`, the `capture-stdout` capability DT-9 named).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { ObservabilityEmitter, type LogSink } from '../../src/observability/observability-emitter.ts';
import { D1_FILE } from '../support/d1.ts';

const V = 'plan-line-to-span/v1';

function capturingEmitter(): { emitter: ObservabilityEmitter; records: () => Record<string, unknown>[] } {
  const lines: string[] = [];
  const sink: LogSink = { write: (line: string) => lines.push(line) };
  const emitter = new ObservabilityEmitter(new OperationDispatcher(), sink);
  return { emitter, records: () => lines.map(l => JSON.parse(l) as Record<string, unknown>) };
}

const COMMON_FIELDS = ['timestamp', 'event', 'sequence', 'level', 'operation', 'outcome', 'durationMs', 'state', 'benefitCount'];

function assertCommonFields(record: Record<string, unknown>): void {
  for (const field of COMMON_FIELDS) assert.ok(field in record, `missing common field ${field}`);
  assert.equal(record['event'], 'plan_line_to_span.operation_completed');
  assert.ok((record['durationMs'] as number) >= 0, 'durationMs must be non-negative');
}

test('AC-OBS-01: a successful create, employee query with one match, and delete each produce a valid record', () => {
  const { emitter, records } = capturingEmitter();
  emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 1 } },
  }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryEmployee', payload: { dimensions: { location: '20' } },
  }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'deleteBenefit', payload: { span: { location: '4' } },
  }));

  const recs = records();
  assert.equal(recs.length, 4);
  for (const r of recs) assertCommonFields(r);

  const [, createRec, queryRec, deleteRec] = recs;
  assert.equal(createRec!['operation'], 'createBenefit');
  assert.equal(createRec!['outcome'], 'success');
  assert.equal(queryRec!['operation'], 'queryEmployee');
  assert.equal(queryRec!['outcome'], 'success');
  assert.equal(queryRec!['matchCount'], 1);
  assert.equal(deleteRec!['operation'], 'deleteBenefit');
  assert.equal(deleteRec!['outcome'], 'success');
});

test('AC-OBS-02: an unknown-dimension create and an absent delete each produce a warn record with an unchanged benefitCount', () => {
  const { emitter, records } = capturingEmitter();
  emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 1 } },
  }));

  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { unknown: 'x' }, formula: {} },
  }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'deleteBenefit', payload: { span: { location: '21' } },
  }));

  const recs = records();
  const [, , unknownDimRec, absentDeleteRec] = recs;

  assert.equal(unknownDimRec!['level'], 'warn');
  assert.equal(unknownDimRec!['outcome'], 'failure');
  assert.equal(unknownDimRec!['errorCode'], 'UNKNOWN_DIMENSION');
  assert.equal(unknownDimRec!['benefitCount'], 1);
  assert.ok(!('matchCount' in unknownDimRec!));

  assert.equal(absentDeleteRec!['level'], 'warn');
  assert.equal(absentDeleteRec!['outcome'], 'failure');
  assert.equal(absentDeleteRec!['errorCode'], 'NOT_FOUND');
  assert.equal(absentDeleteRec!['benefitCount'], 1);
});

test('AC-OBS-03: delete then reinitialize each report benefitCount 0; the initialize record carries dimension counts', () => {
  const { emitter, records } = capturingEmitter();
  emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 1 } },
  }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'deleteBenefit', payload: { span: { location: '4' } },
  }));
  emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));

  const recs = records();
  const [initRec, , deleteRec, reinitRec] = recs;

  assert.equal(deleteRec!['outcome'], 'success');
  assert.equal(deleteRec!['benefitCount'], 0);

  assert.equal(reinitRec!['outcome'], 'success');
  assert.equal(reinitRec!['benefitCount'], 0);
  // D1 has 2 dimensions (location, department) and 7 values total:
  // location {4, 20, 21, 22, 30} = 5, department {rnd, eng} = 2.
  assert.equal(reinitRec!['dimensionCount'], 2);
  assert.equal(reinitRec!['dimensionValueCount'], 7);
  assert.equal(initRec!['dimensionCount'], 2);
  assert.equal(initRec!['dimensionValueCount'], 7);
});

test('AC-OBS-04: sentinel formulas and plan-line values never appear in any captured record', () => {
  const { emitter, records } = capturingEmitter();
  const SENTINEL_FORMULA = 'sekrit-formula-9f2b1c';
  const SENTINEL_VALUE = 'sekrit-value-4d8e2a';

  emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit',
    payload: { span: { location: '4' }, formula: { note: SENTINEL_FORMULA } },
  }));
  emitter.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryEmployee', payload: { dimensions: { location: '20' } },
    requestId: SENTINEL_VALUE,
  }));

  const recs = records();
  for (const rec of recs) {
    const line = JSON.stringify(rec);
    assert.ok(!line.includes(SENTINEL_FORMULA), `formula sentinel leaked into a record: ${line}`);
    assert.ok(!line.includes(SENTINEL_VALUE), `requestId sentinel leaked into a record: ${line}`);
    // Field *names*, not a bare substring search: the event name
    // "plan_line_to_span.operation_completed" legitimately contains "span".
    assert.ok(!('span' in rec), `a span field leaked into a record: ${line}`);
    assert.ok(!('formula' in rec), `a formula field leaked into a record: ${line}`);
    assert.ok(!('requestId' in rec), `a requestId field leaked into a record: ${line}`);
  }
});
