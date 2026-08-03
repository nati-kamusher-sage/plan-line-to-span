/**
 * AC-INIT-09, driving the real OperationDispatcher end to end with a
 * FaultInjectingIndexPort substituted at initialize -- closing the gap the
 * readiness review recorded as unverifiable (DT-9 DEC-63): INDEX_FAILURE
 * cannot be provoked by any valid request, since no production path ever
 * throws IndexFailureError.
 *
 * The case requires a prior benefit to already exist and remain queryable
 * after a *later* create fails, so the port is configured with
 * `failAfter: 1` -- the first `insert` (the prior benefit's own creation)
 * succeeds against the real index underneath, and only the second fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { IndexAdapter } from '../../src/store/index-adapter.ts';
import { RTree } from '../../src/index/rtree.ts';
import { FaultInjectingIndexPort } from '../support/fault-injecting-index-port.ts';
import { D1_FILE } from '../support/d1.ts';
import type { DimensionModel } from '../../src/model/dimension-model.ts';
import type { IndexedBenefit } from '../../src/store/index-adapter.ts';

const V = 'plan-line-to-span/v1';

test('AC-INIT-09: an injected index failure on a second create returns INDEX_FAILURE, stays Ready, and commits no partial mutation', () => {
  const d = new OperationDispatcher((model: DimensionModel) => {
    const real = new IndexAdapter(new RTree<IndexedBenefit>(model.axisCount), model);
    return new FaultInjectingIndexPort(real, 'insert', 1);
  });

  const initRes = d.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
  assert.equal(initRes.ok, true);

  const firstCreate = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 'F1' } },
  }));
  assert.equal(firstCreate.ok, true, 'the first insert must succeed against the real index underneath');
  assert.equal(d.benefitCount, 1);

  const secondCreate = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'createBenefit', payload: { span: { location: '20' }, formula: { r: 'F2' } },
  }));
  assert.equal(secondCreate.ok, false, 'the second insert is the injected failure');
  if (!secondCreate.ok) assert.equal(secondCreate.error.code, 'INDEX_FAILURE');

  // The utility remains Ready rather than entering Failed (OC 8.4): a
  // benefit-operation failure never transitions lifecycle state, unlike an
  // initialize failure.
  assert.equal(d.state, 'ready');

  // No partial mutation: benefitCount is unaffected by the failed create.
  assert.equal(d.benefitCount, 1);

  // The prior benefit is still queryable.
  const query = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryBenefit', payload: { span: { location: '4' } },
  }));
  assert.equal(query.ok, true);
  if (query.ok) assert.deepEqual(query.data, { benefit: { span: { location: '4' }, formula: { r: 'F1' } } });

  // The failed span was never committed.
  const failedQuery = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryBenefit', payload: { span: { location: '20' } },
  }));
  assert.equal(failedQuery.ok, false);
  if (!failedQuery.ok) assert.equal(failedQuery.error.code, 'NOT_FOUND');
});

test('an injected index failure on findExact (queryBenefit) also returns INDEX_FAILURE without disturbing state', () => {
  const d = new OperationDispatcher((model: DimensionModel) => {
    const real = new IndexAdapter(new RTree<IndexedBenefit>(model.axisCount), model);
    return new FaultInjectingIndexPort(real, 'findExact', 0);
  });

  d.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));

  const res = d.dispatch(JSON.stringify({
    contractVersion: V, operation: 'queryBenefit', payload: { span: { location: '4' } },
  }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'INDEX_FAILURE');
  assert.equal(d.state, 'ready');
});
