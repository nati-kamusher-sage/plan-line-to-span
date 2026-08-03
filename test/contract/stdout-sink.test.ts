/**
 * The `capture-stdout` test-only capability DT-9 named: proves the default
 * STDOUT_SINK actually writes real JSON Lines to the real process.stdout,
 * which test/contract/observability.test.ts's injectable-sink tests
 * deliberately do not exercise (they verify the emitter's own logic against
 * a fake sink, not the production sink's wiring to the real stream).
 *
 * Captured by temporarily replacing process.stdout.write, restored in a
 * try/finally so a failing assertion cannot leave the real stream patched
 * for the rest of the suite.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OperationDispatcher } from '../../src/dispatch/operation-dispatcher.ts';
import { ObservabilityEmitter } from '../../src/observability/observability-emitter.ts';
import { D1_FILE } from '../support/d1.ts';

const V = 'plan-line-to-span/v1';

function captureRealStdout(fn: () => void): string[] {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join('').split('\n').filter(line => line.length > 0);
}

test('ObservabilityEmitter with the default sink writes one JSON Lines record per operation to real stdout', () => {
  const lines = captureRealStdout(() => {
    const emitter = new ObservabilityEmitter(new OperationDispatcher());
    emitter.dispatch(JSON.stringify({ contractVersion: V, operation: 'initialize', payload: D1_FILE }));
    emitter.dispatch(JSON.stringify({
      contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 1 } },
    }));
  });

  assert.equal(lines.length, 2);
  for (const line of lines) {
    const record = JSON.parse(line) as Record<string, unknown>;
    assert.equal(record['event'], 'plan_line_to_span.operation_completed');
  }
});

test('an unparseable request produces no stdout output at all (DEC-59)', () => {
  const lines = captureRealStdout(() => {
    const emitter = new ObservabilityEmitter(new OperationDispatcher());
    emitter.dispatch('not json');
  });
  assert.deepEqual(lines, []);
});
