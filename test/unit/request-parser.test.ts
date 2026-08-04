import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRequest, type ParsedRequest } from '../../src/transport/request-parser.ts';

const CONTRACT_PATH = fileURLToPath(new URL('../../docs/interface-contract.md', import.meta.url));
const CONTRACT_TEXT = readFileSync(CONTRACT_PATH, 'utf8');

function parseValidRequest(raw: string): ParsedRequest {
  const result = parseRequest(raw);
  if (!result.ok) assert.fail(result.message);
  return result.request;
}

function assertMalformed(raw: string): void {
  const result = parseRequest(raw);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.message.length > 0);
}

/** Promoted from the design-phase validate.py script (WP-7 readiness review). */
function extractJsonExamples(markdown: string): string[] {
  const blocks: string[] = [];
  const fence = /```json\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    blocks.push(match[1]!);
  }
  return blocks;
}

test('the interface contract still contains exactly eight JSON examples', () => {
  // A change in this count means an example was added or removed without
  // updating this promotion, per WP-7's finding that four contradictions
  // were caught by exactly this kind of mechanical check.
  assert.equal(extractJsonExamples(CONTRACT_TEXT).length, 8);
});

test('all six request examples parse with the target operations', () => {
  const examples = extractJsonExamples(CONTRACT_TEXT);
  const operations = examples.slice(0, 6).map((raw) => parseValidRequest(raw).operation);
  assert.deepEqual(operations, [
    'initialize', 'createSpan', 'updateSpan', 'deleteSpan', 'querySpan', 'queryPlanLine',
  ]);
});

test('the two response examples are valid JSON success and failure envelopes', () => {
  const examples = extractJsonExamples(CONTRACT_TEXT);
  const responses = examples.slice(6, 8).map((raw) => JSON.parse(raw) as { ok?: unknown });
  assert.deepEqual(responses.map((response) => response.ok), [true, false]);
});

// ---- AC-VAL-03: duplicate object members ----

test('AC-VAL-03: a duplicate object member is rejected as MALFORMED_REQUEST', () => {
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"querySpan",' +
    '"payload":{"span":{"location":"4","location":"20"}}}';
  assertMalformed(raw);
});

test('a duplicate top-level envelope member is rejected', () => {
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"querySpan",' +
    '"operation":"createSpan","payload":{"span":{}}}';
  assertMalformed(raw);
});

test('the same key name in sibling objects at the same depth is not a false positive', () => {
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"updateSpan",' +
    '"payload":{"span":{"a":"1"},"replacementSpan":{"a":"2"}}}';
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('the same key name at a different nesting depth is not a false positive', () => {
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"initialize",' +
    '"payload":{"format":"location","dimensions":[{"id":"location","name":"Location","values":[]}]}}';
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('structural-looking characters inside a string value do not confuse duplicate detection', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'updateSpan',
    payload: { span: { location: '4' }, replacementSpan: { location: 'a{b}c,d:e"f' } },
  });
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('an array of objects, each with their own keys, is not a false positive', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'initialize',
    payload: { format: 'x', dimensions: [{ id: 'a', name: 'A', values: [] }, { id: 'b', name: 'B', values: [] }] },
  });
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('a string array element sharing a name with a real object key is not a false positive', () => {
  // Adversarial case for the duplicate-member scanner: an array whose string
  // elements happen to equal a real key name elsewhere in the same object.
  // Safe because JSON grammar guarantees a ':' always precedes every object
  // value -- including an array's contents -- resetting the scanner's
  // key-detection state before any array element is examined.
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"initialize",' +
    '"payload":{"format":"x","dimensions":[{"id":"x","name":"x","values":[]}]}}';
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('a string array element as the first sibling value after a real key is not a false positive', () => {
  const raw = '{"contractVersion":"plan-line-to-span/v1","operation":"initialize",' +
    '"payload":{"format":"a","dimensions":[{"id":"a","name":"a","values":[]}]}}';
  assert.doesNotThrow(() => parseValidRequest(raw));
});

test('malformed JSON text is rejected, not thrown as a raw SyntaxError', () => {
  assertMalformed('{not json');
});

// ---- AC-VAL-06: missing payload or an undeclared field ----

test('AC-VAL-06: a request missing payload is rejected', () => {
  const raw = JSON.stringify({ contractVersion: 'plan-line-to-span/v1', operation: 'createSpan' });
  assertMalformed(raw);
});

test('AC-VAL-06: a request with an undeclared top-level field is rejected', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'querySpan',
    payload: { span: {} }, bogus: 1,
  });
  assertMalformed(raw);
});

// ---- DEC-28: format is judged by the model builder, not the parser ----

test('an unsupported format value passes the structural boundary', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'initialize',
    payload: { format: 'wrong/v1', dimensions: [] },
  });
  const parsed = parseValidRequest(raw);
  assert.equal(parsed.operation, 'initialize');
  if (parsed.operation === 'initialize') {
    assert.equal(parsed.payload.format, 'wrong/v1');
  }
});

// ---- other structural rejections, per IC 2 and IC 6 ----

test('an unsupported contractVersion is rejected', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v2', operation: 'querySpan', payload: { span: {} },
  });
  assertMalformed(raw);
});

test('a numeric dimension value is rejected structurally', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'querySpan', payload: { span: { location: 4 } },
  });
  assertMalformed(raw);
});

test('an unrecognized operation is rejected', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'destroyEverything', payload: {},
  });
  assertMalformed(raw);
});

test('a requestId over 128 characters is rejected', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'querySpan',
    payload: { span: {} }, requestId: 'x'.repeat(129),
  });
  assertMalformed(raw);
});

test('queryPlanLine requires a dimensions map, not a bare object', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'queryPlanLine', payload: { location: '20' },
  });
  assertMalformed(raw);
});

test('updateSpan requires both source and replacement spans', () => {
  const raw = JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'updateSpan',
    payload: { span: { location: '4' } },
  });
  assertMalformed(raw);
});

// ---- the discriminated ParsedRequest type narrows correctly ----

test('a parsed initialize request exposes format and dimensions', () => {
  const parsed = parseValidRequest(JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'initialize',
    payload: { format: 'plan-line-to-span-dimensions/v1', dimensions: [] },
  }));
  assert.equal(parsed.operation, 'initialize');
  if (parsed.operation === 'initialize') {
    assert.equal(parsed.payload.format, 'plan-line-to-span-dimensions/v1');
    assert.deepEqual(parsed.payload.dimensions, []);
  }
});

test('a parsed queryPlanLine request exposes payload.dimensions', () => {
  const parsed = parseValidRequest(JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'queryPlanLine',
    payload: { dimensions: { location: '20' } },
  }));
  assert.equal(parsed.operation, 'queryPlanLine');
  if (parsed.operation === 'queryPlanLine') {
    assert.deepEqual(parsed.payload.dimensions, { location: '20' });
  }
});

test('requestId is echoed when supplied and is optional', () => {
  const withId = parseValidRequest(JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'querySpan',
    payload: { span: {} }, requestId: 'abc-123',
  }));
  assert.equal(withId.requestId, 'abc-123');

  const withoutId = parseValidRequest(JSON.stringify({
    contractVersion: 'plan-line-to-span/v1', operation: 'querySpan', payload: { span: {} },
  }));
  assert.equal(withoutId.requestId, undefined);
});
