/**
 * The closed-field log-record builder (DT-8 section 1, DEC-53).
 *
 * `AC-OBS-04`'s exit criterion is that leaking payload data should be
 * impossible by construction, not merely avoided by review. This builder
 * accepts only primitives from bounded sets: every field is a non-negative
 * integer, a number, or a member of an enumerated set. There is no field of
 * unbounded string content, so a span, plan-line value, request ID,
 * or raw error message has nowhere to go -- passing one is a type error, not
 * a leak (DEC-53).
 *
 * Per Observability Contract section 7, `requestId` and raw error text are
 * excluded from records even though `Response` carries both; this builder's
 * parameter list simply has no field for either.
 */

const EVENT = 'plan_line_to_span.operation_completed';

const OPERATIONS = new Set([
  'initialize', 'createSpan', 'updateSpan', 'deleteSpan', 'querySpan', 'queryPlanLine',
]);
const OUTCOMES = new Set(['success', 'failure']);
const ERROR_CODES = new Set([
  'MALFORMED_REQUEST', 'INVALID_DIMENSION_DEFINITION', 'UNKNOWN_DIMENSION',
  'UNKNOWN_DIMENSION_VALUE', 'DUPLICATE_SPAN', 'NOT_FOUND',
  'INVALID_STATE', 'INDEX_FAILURE',
]);
const STATES = new Set(['uninitialized', 'initializing', 'ready', 'failed']);

export type LogOperation = 'initialize' | 'createSpan' | 'updateSpan' | 'deleteSpan' | 'querySpan' | 'queryPlanLine';
export type LogOutcome = 'success' | 'failure';
export type LogErrorCode = 'MALFORMED_REQUEST' | 'INVALID_DIMENSION_DEFINITION' | 'UNKNOWN_DIMENSION'
  | 'UNKNOWN_DIMENSION_VALUE' | 'DUPLICATE_SPAN' | 'NOT_FOUND' | 'INVALID_STATE' | 'INDEX_FAILURE';
export type LogState = 'uninitialized' | 'initializing' | 'ready' | 'failed';
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogRecordInput {
  readonly sequence: number;
  readonly operation: LogOperation;
  readonly outcome: LogOutcome;
  readonly durationMs: number;
  readonly state: LogState;
  readonly spanCount: number;
  readonly errorCode?: LogErrorCode;
  readonly matchCount?: number;
  readonly dimensionCount?: number;
  readonly dimensionValueCount?: number;
}

export interface LogRecord {
  readonly timestamp: string;
  readonly event: 'plan_line_to_span.operation_completed';
  readonly sequence: number;
  readonly level: LogLevel;
  readonly operation: LogOperation;
  readonly outcome: LogOutcome;
  readonly durationMs: number;
  readonly state: LogState;
  readonly spanCount: number;
  readonly errorCode?: LogErrorCode;
  readonly matchCount?: number;
  readonly dimensionCount?: number;
  readonly dimensionValueCount?: number;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function requireMember<T extends string>(value: T, set: ReadonlySet<string>, name: string): T {
  if (!set.has(value)) {
    throw new TypeError(`${name} not in permitted set`);
  }
  return value;
}

/** Success is `info`; `INDEX_FAILURE` escalates to `error`; every other failure is `warn` (DEC-55). */
function deriveLevel(outcome: LogOutcome, errorCode: LogErrorCode | undefined): LogLevel {
  if (outcome === 'success') return 'info';
  return errorCode === 'INDEX_FAILURE' ? 'error' : 'warn';
}

/**
 * Builds one frozen log record from named, individually-validated fields.
 *
 * An unrecognized property on the input object is silently discarded rather
 * than rejected (DEC-54): TypeScript's structural typing already prevents
 * this at the call site, but the destructuring here is what would make it
 * true even for a caller that bypasses the type system.
 */
export function buildLogRecord(input: LogRecordInput): LogRecord {
  const {
    sequence, operation, outcome, durationMs, state, spanCount,
    errorCode, matchCount, dimensionCount, dimensionValueCount,
  } = input;

  if (typeof durationMs !== 'number' || !(durationMs >= 0)) {
    throw new TypeError('durationMs must be a non-negative number');
  }

  const record: {
    timestamp: string; event: 'plan_line_to_span.operation_completed'; sequence: number;
    level: LogLevel; operation: LogOperation; outcome: LogOutcome; durationMs: number;
    state: LogState; spanCount: number;
    errorCode?: LogErrorCode; matchCount?: number; dimensionCount?: number; dimensionValueCount?: number;
  } = {
    timestamp: new Date().toISOString(),
    event: EVENT,
    sequence: requireNonNegativeInteger(sequence, 'sequence'),
    level: deriveLevel(outcome, errorCode),
    operation: requireMember(operation, OPERATIONS, 'operation'),
    outcome: requireMember(outcome, OUTCOMES, 'outcome'),
    durationMs,
    state: requireMember(state, STATES, 'state'),
    spanCount: requireNonNegativeInteger(spanCount, 'spanCount'),
  };

  // Optional fields, each from a bounded domain. Omitted, never null (Obs 3).
  if (errorCode !== undefined) record.errorCode = requireMember(errorCode, ERROR_CODES, 'errorCode');
  if (matchCount !== undefined) record.matchCount = requireNonNegativeInteger(matchCount, 'matchCount');
  if (dimensionCount !== undefined) record.dimensionCount = requireNonNegativeInteger(dimensionCount, 'dimensionCount');
  if (dimensionValueCount !== undefined) {
    record.dimensionValueCount = requireNonNegativeInteger(dimensionValueCount, 'dimensionValueCount');
  }

  return Object.freeze(record);
}
