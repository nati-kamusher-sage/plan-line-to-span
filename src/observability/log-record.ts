/**
 * The closed-field log-record builder (DT-8 section 1, DEC-53).
 *
 * `AC-OBS-04`'s exit criterion is that leaking payload data should be
 * impossible by construction, not merely avoided by review. This builder
 * accepts only typed primitives from bounded domains. There is no field of
 * unbounded string content, so a span, plan-line value, request ID,
 * or raw error message has nowhere to go -- passing one is a type error, not
 * a leak (DEC-53).
 *
 * Per Observability Contract section 7, `requestId` and raw error text are
 * excluded from records even though `Response` carries both; this builder's
 * parameter list simply has no field for either.
 */

const EVENT = 'plan_line_to_span.operation_completed';

export type LogOperation = 'initialize' | 'createSpan' | 'updateSpan' | 'deleteSpan' | 'querySpan' | 'queryPlanLine';
export type LogOutcome = 'success' | 'failure';
export type LogErrorCode = 'MALFORMED_REQUEST' | 'DUPLICATE_SPAN' | 'NOT_FOUND' | 'INVALID_STATE';
export type LogState = 'uninitialized' | 'initializing' | 'ready' | 'failed';
export type LogLevel = 'info' | 'warn';

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

function deriveLevel(outcome: LogOutcome): LogLevel {
  return outcome === 'success' ? 'info' : 'warn';
}

/**
 * Builds one frozen log record from typed fields produced by the application.
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

  const record: {
    timestamp: string; event: 'plan_line_to_span.operation_completed'; sequence: number;
    level: LogLevel; operation: LogOperation; outcome: LogOutcome; durationMs: number;
    state: LogState; spanCount: number;
    errorCode?: LogErrorCode; matchCount?: number; dimensionCount?: number; dimensionValueCount?: number;
  } = {
    timestamp: new Date().toISOString(),
    event: EVENT,
    sequence,
    level: deriveLevel(outcome),
    operation,
    outcome,
    durationMs,
    state,
    spanCount,
  };

  // Optional typed fields are omitted, never null (Obs 3).
  if (errorCode !== undefined) record.errorCode = errorCode;
  if (matchCount !== undefined) record.matchCount = matchCount;
  if (dimensionCount !== undefined) record.dimensionCount = dimensionCount;
  if (dimensionValueCount !== undefined) record.dimensionValueCount = dimensionValueCount;

  return Object.freeze(record);
}
