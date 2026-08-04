import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { D1_FILE } from '../support/d1.ts';
import type { Response } from '../../src/dispatch/response.ts';

const V = 'plan-line-to-span/v1';

function ready(): OperationDispatcher {
  const dispatcher = new OperationDispatcher();
  const response = dispatcher.dispatch(JSON.stringify({
    contractVersion: V, operation: 'initialize', payload: D1_FILE,
  }));
  assert.equal(response.ok, true);
  return dispatcher;
}

function request(
  dispatcher: OperationDispatcher,
  operation: 'createSpan' | 'deleteSpan' | 'querySpan',
  span: Record<string, string>,
): Response {
  return dispatcher.dispatch(JSON.stringify({ contractVersion: V, operation, payload: { span } }));
}

function update(
  dispatcher: OperationDispatcher,
  span: Record<string, string>,
  replacementSpan: Record<string, string>,
): Response {
  return dispatcher.dispatch(JSON.stringify({
    contractVersion: V, operation: 'updateSpan', payload: { span, replacementSpan },
  }));
}

function errorCode(response: Response): string {
  assert.equal(response.ok, false);
  return response.ok ? '' : response.error.code;
}

test('AC-SPAN-01: create stores and returns a span', () => {
  const dispatcher = ready();
  const response = request(dispatcher, 'createSpan', { location: '4' });
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.data, { span: { location: '4' } });
  assert.equal(dispatcher.spanCount, 1);
});

test('AC-SPAN-02: duplicate create is rejected without changing the stored span', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  assert.equal(errorCode(request(dispatcher, 'createSpan', { location: '4' })), 'DUPLICATE_SPAN');
  assert.equal(dispatcher.spanCount, 1);
  const response = request(dispatcher, 'querySpan', { location: '4' });
  if (response.ok) assert.deepEqual(response.data, { span: { location: '4' } });
});

test('AC-SPAN-03: exact query returns the matching span', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  const response = request(dispatcher, 'querySpan', { location: '4' });
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.data, { span: { location: '4' } });
});

test('AC-SPAN-04: member order does not affect identity', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4', department: 'rnd' });
  const response = request(dispatcher, 'querySpan', { department: 'rnd', location: '4' });
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.data, { span: { location: '4', department: 'rnd' } });
});

test('AC-SPAN-05: hierarchy does not broaden exact lookup', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  assert.equal(errorCode(request(dispatcher, 'querySpan', { location: '20' })), 'NOT_FOUND');
});

test('AC-SPAN-06: update removes the source and creates the replacement', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  const response = update(dispatcher, { location: '4' }, { location: '20' });
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.data, { span: { location: '20' } });
  assert.equal(errorCode(request(dispatcher, 'querySpan', { location: '4' })), 'NOT_FOUND');
  assert.equal(request(dispatcher, 'querySpan', { location: '20' }).ok, true);
  assert.equal(dispatcher.spanCount, 1);
});

test('AC-SPAN-07: update rejects an occupied replacement without mutation', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  request(dispatcher, 'createSpan', { location: '20' });
  assert.equal(errorCode(update(dispatcher, { location: '4' }, { location: '20' })), 'DUPLICATE_SPAN');
  assert.equal(request(dispatcher, 'querySpan', { location: '4' }).ok, true);
  assert.equal(request(dispatcher, 'querySpan', { location: '20' }).ok, true);
  assert.equal(dispatcher.spanCount, 2);
});

test('AC-SPAN-08: delete removes the span', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  const response = request(dispatcher, 'deleteSpan', { location: '4' });
  assert.equal(response.ok, true);
  if (response.ok) assert.deepEqual(response.data, { deleted: true, span: { location: '4' } });
  assert.equal(dispatcher.spanCount, 0);
  assert.equal(errorCode(request(dispatcher, 'querySpan', { location: '4' })), 'NOT_FOUND');
});

test('AC-SPAN-09: update and delete against an empty index are NOT_FOUND', () => {
  const dispatcher = ready();
  assert.equal(errorCode(update(dispatcher, { location: '4' }, { location: '20' })), 'NOT_FOUND');
  assert.equal(errorCode(request(dispatcher, 'deleteSpan', { location: '4' })), 'NOT_FOUND');
  assert.equal(dispatcher.spanCount, 0);
});

test('AC-SPAN-10: failed mutations preserve the prior state', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  assert.equal(errorCode(request(dispatcher, 'createSpan', { location: '4' })), 'DUPLICATE_SPAN');
  assert.equal(errorCode(update(dispatcher, { location: '21' }, { location: '20' })), 'NOT_FOUND');
  assert.equal(errorCode(request(dispatcher, 'deleteSpan', { location: '21' })), 'NOT_FOUND');
  assert.equal(request(dispatcher, 'querySpan', { location: '4' }).ok, true);
  assert.equal(dispatcher.spanCount, 1);
});

test('updating a span to the same identity succeeds and keeps one entry', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4', department: 'rnd' });
  const response = update(
    dispatcher,
    { location: '4', department: 'rnd' },
    { department: 'rnd', location: '4' },
  );
  assert.equal(response.ok, true);
  assert.equal(dispatcher.spanCount, 1);
});

test('queryPlanLine returns matching dimension maps directly', () => {
  const dispatcher = ready();
  request(dispatcher, 'createSpan', { location: '4' });
  request(dispatcher, 'createSpan', { location: '20' });
  request(dispatcher, 'createSpan', { location: '21' });

  const response = dispatcher.dispatch(JSON.stringify({
    contractVersion: V,
    operation: 'queryPlanLine',
    payload: { dimensions: { location: '20', department: 'rnd' } },
  }));
  assert.equal(response.ok, true);
  if (response.ok) {
    const matches = response.data['matches'] as Record<string, string>[];
    assert.deepEqual(matches.map(span => span.location).sort(), ['20', '4']);
  }
});
