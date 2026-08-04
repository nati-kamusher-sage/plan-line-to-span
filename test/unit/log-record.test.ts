/**
 * Promoted from docs/design/prototypes/dt-8-log-builder.mjs: the closed-field
 * builder's adversarial defense against payload-data smuggling (DEC-53,
 * AC-OBS-04's exit criterion), plus level derivation (DEC-55), field shape
 * (Obs 3), and frozen output (DEC-58).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLogRecord, type LogRecordInput } from '../../src/observability/log-record.ts';

const BASE: LogRecordInput = {
  sequence: 1, operation: 'createSpan', outcome: 'success',
  durationMs: 0.4, state: 'ready', spanCount: 3,
};

test('a well-formed record is accepted', () => {
  assert.doesNotThrow(() => buildLogRecord(BASE));
});

test('an extra span-shaped field is ignored, not carried (structurally impossible to pass, verified at the value level)', () => {
  const withExtra = { ...BASE, span: { location: '4' } } as LogRecordInput;
  const record = buildLogRecord(withExtra);
  assert.ok(!('span' in record));
});

test('the sentinel never reaches the output even when passed as an unrecognized field', () => {
  const SENTINEL = 'SEKRIT-PLANNING-DATA';
  const withSmuggled = { ...BASE, span: { location: SENTINEL }, planLine: { secret: SENTINEL } } as LogRecordInput;
  const record = buildLogRecord(withSmuggled);
  const line = JSON.stringify(record);
  assert.ok(!line.includes(SENTINEL), 'AC-OBS-04: sentinel must be absent from the record');
});

test('only contract-defined fields are present (Obs 3)', () => {
  const record = buildLogRecord(BASE);
  const allowed = new Set([
    'timestamp', 'event', 'sequence', 'level', 'operation', 'outcome',
    'durationMs', 'state', 'spanCount', 'errorCode', 'matchCount',
    'dimensionCount', 'dimensionValueCount',
  ]);
  const extra = Object.keys(record).filter(k => !allowed.has(k));
  assert.deepEqual(extra, []);
});

test('a record is frozen after construction', () => {
  const record = buildLogRecord(BASE);
  assert.ok(Object.isFrozen(record));
});

test('level: success maps to info', () => {
  assert.equal(buildLogRecord({ ...BASE, outcome: 'success' }).level, 'info');
});

test('level: a declared state outcome maps to warn', () => {
  const record = buildLogRecord({ ...BASE, outcome: 'failure', errorCode: 'DUPLICATE_SPAN' });
  assert.equal(record.level, 'warn');
});

test('optional fields are omitted, not present as undefined, when not supplied', () => {
  const record = buildLogRecord(BASE);
  assert.ok(!('errorCode' in record));
  assert.ok(!('matchCount' in record));
  assert.ok(!('dimensionCount' in record));
  assert.ok(!('dimensionValueCount' in record));
});
