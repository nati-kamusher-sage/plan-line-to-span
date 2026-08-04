import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import type { IndexPort } from '../../src/store/index-adapter.ts';
import type { CanonicalSpan } from '../../src/model/span.ts';
import { D1_FILE } from '../support/d1.ts';

const V = 'plan-line-to-span/v1';

function failingIndex(): IndexPort {
  return {
    size: 0,
    insert(): void {},
    remove(): boolean { return false; },
    findExact(): CanonicalSpan | undefined { throw new Error('unexpected index failure'); },
    searchMatching(): CanonicalSpan[] { return []; },
    all(): CanonicalSpan[] { return []; },
  };
}

test('unexpected index failures propagate instead of becoming response envelopes', () => {
  const dispatcher = new OperationDispatcher(failingIndex);
  const initialized = dispatcher.dispatch(JSON.stringify({
    contractVersion: V, operation: 'initialize', payload: D1_FILE,
  }));
  assert.equal(initialized.ok, true);

  assert.throws(() => dispatcher.dispatch(JSON.stringify({
    contractVersion: V, operation: 'querySpan', payload: { span: { location: '4' } },
  })), /unexpected index failure/);
});
