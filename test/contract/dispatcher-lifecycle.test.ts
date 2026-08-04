/**
 * AC-INIT-01 through AC-INIT-08, and AC-SERIAL-01, driving the real
 * OperationDispatcher end to end: raw JSON string in, Response out.
 *
 * AC-INIT-09 (INDEX_FAILURE via fault injection) is deliberately not covered
 * here -- DT-9's inject-index-failure capability is what makes it
 * executable, and that seam is T9's/T11's to build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { D1_FILE } from '../support/d1.ts';

const V = 'plan-line-to-span/v1';

function initRequest(payload: unknown = D1_FILE, requestId?: string): string {
  return JSON.stringify({ contractVersion: V, operation: 'initialize', payload, ...(requestId ? { requestId } : {}) });
}

const DANGLING_PARENT_FILE = {
  format: 'plan-line-to-span-dimensions/v1',
  dimensions: [{ id: 'location', name: 'L', values: [{ key: '20', name: 'NYC', parentKey: '999' }] }],
};

test('AC-INIT-01: first initialize succeeds with dimensionCount and empty spanCount', () => {
  const d = new OperationDispatcher();
  const res = d.dispatch(initRequest());
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.data, { state: 'ready', dimensionCount: 2, spanCount: 0 });
  }
  assert.equal(d.state, 'ready');
});

test('AC-INIT-02: an invalid dimension hierarchy (dangling parentKey) enters Failed', () => {
  const d = new OperationDispatcher();
  const res = d.dispatch(initRequest(DANGLING_PARENT_FILE));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'INVALID_DIMENSION_DEFINITION');
  assert.equal(d.state, 'failed');
  assert.equal(d.spanCount, 0, 'no usable model or spans');
});

test('AC-INIT-03: initialize is accepted from Failed and succeeds', () => {
  const d = new OperationDispatcher();
  d.dispatch(initRequest(DANGLING_PARENT_FILE));
  assert.equal(d.state, 'failed');

  const res = d.dispatch(initRequest());
  assert.equal(res.ok, true);
  assert.equal(d.state, 'ready');
});

test('AC-INIT-04: reinitialization atomically clears all prior spans', () => {
  const d = new OperationDispatcher();
  d.dispatch(initRequest());
  d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createSpan', payload: { span: { location: '4' } },
  }));
  assert.equal(d.spanCount, 1);

  const res = d.dispatch(initRequest());
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.data, { state: 'ready', dimensionCount: 2, spanCount: 0 });
  assert.equal(d.state, 'ready');
  assert.equal(d.spanCount, 0);
});

test('AC-INIT-05: a failed reinitialization returns to Ready with the previous spans intact', () => {
  const d = new OperationDispatcher();
  d.dispatch(initRequest());
  d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createSpan', payload: { span: { location: '4' } },
  }));
  assert.equal(d.spanCount, 1);

  const res = d.dispatch(initRequest(DANGLING_PARENT_FILE));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'INVALID_DIMENSION_DEFINITION');
  assert.equal(d.state, 'ready', 'a failed reinitialization returns to Ready, not Failed');
  assert.equal(d.spanCount, 1, 'the prior span remains');

  const queried = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'querySpan', payload: { span: { location: '4' } },
  }));
  assert.equal(queried.ok, true, 'the prior span is still queryable');
});

test('AC-INIT-06: an operation submitted while initializing is rejected with INVALID_STATE', () => {
  // Handlers are synchronous end to end (DEC-39), so "initializing" as an
  // externally observable state for a SECOND concurrent request does not
  // arise from genuine concurrency in this implementation -- there is no
  // event-loop yield during dispatch for another call to interleave through.
  // This test instead verifies the gate's own reaction to that state
  // directly, which is what AC-INIT-06 is actually about: LifecycleState is
  // a distinct, inspectable component (DT-9's stated seam) precisely so this
  // is checkable without needing to fabricate real concurrency.
  const d = new OperationDispatcher();
  d.testOnlyLifecycle.beginInitializing();
  assert.equal(d.state, 'initializing');

  const res = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryPlanLine', payload: { dimensions: {} },
  }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'INVALID_STATE');
  assert.equal(d.state, 'initializing', 'rejection does not change state or storage');
});

test('AC-INIT-07: a span operation before initialization is rejected with INVALID_STATE', () => {
  const d = new OperationDispatcher();
  const res = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createSpan', payload: { span: {} },
  }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'INVALID_STATE');
  assert.equal(d.state, 'uninitialized');
  assert.equal(d.spanCount, 0);
});

test('AC-INIT-08: from Failed, only initialize is accepted; every other operation is INVALID_STATE with details.state', () => {
  const d = new OperationDispatcher();
  d.dispatch(initRequest(DANGLING_PARENT_FILE));
  assert.equal(d.state, 'failed');

  const attempts = [
    { contractVersion: V, operation: 'createSpan', payload: { span: {} } },
    { contractVersion: V, operation: 'querySpan', payload: { span: {} } },
    { contractVersion: V, operation: 'queryPlanLine', payload: { dimensions: {} } },
  ];
  for (const req of attempts) {
    const res = d.dispatch(JSON.stringify(req));
    assert.equal(res.ok, false, `${req.operation} should be rejected`);
    if (!res.ok) {
      assert.equal(res.error.code, 'INVALID_STATE');
      assert.equal(res.error.details?.state, 'failed');
    }
  }
  assert.equal(d.state, 'failed', 'state remains Failed throughout');

  // AC-INIT-03's confirmation that initialize IS accepted from here.
  const retry = d.dispatch(initRequest());
  assert.equal(retry.ok, true);
});

// ---- serial processing ----

test('AC-SERIAL-01: a create response precedes the query that follows it, and the query observes it', () => {
  const d = new OperationDispatcher();
  d.dispatch(initRequest());

  const createRes = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createSpan', payload: { span: { location: '4' } },
  }));
  assert.equal(createRes.ok, true, 'create response is produced before the query is dispatched at all');

  const queryRes = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'querySpan', payload: { span: { location: '4' } },
  }));
  assert.equal(queryRes.ok, true);
  if (queryRes.ok) {
    assert.deepEqual(queryRes.data, { span: { location: '4' } });
  }
});

// ---- requestId echoing, per IC 2 ----

test('requestId is echoed on both success and failure', () => {
  const d = new OperationDispatcher();
  const ok = d.dispatch(initRequest(D1_FILE, 'req-1'));
  assert.equal(ok.requestId, 'req-1');

  const err = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'querySpan', payload: { span: { unknown: 'x' } }, requestId: 'req-2',
  }));
  assert.equal(err.requestId, 'req-2');
});
