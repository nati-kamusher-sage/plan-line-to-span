/**
 * ObservabilityEmitter: one decorator around OperationDispatcher.dispatch,
 * emitting exactly one record per completed operation (DT-8 DEC-52).
 *
 * Wrapping dispatch, rather than instrumenting each handler, is what makes
 * the "a new operation cannot be added without instrumentation" property
 * hold structurally: every operation already passes through
 * OperationDispatcher.dispatch (DEC-30), so this decorator sees every one of
 * them by construction, the same argument DT-4's DEC-32 makes.
 *
 * Placement (DT-8 section 2):
 *   1. Record the start time (performance.now(), monotonic -- DEC-57).
 *   2. Call through to dispatch: gate, validate, execute.
 *   3. dispatch returns -- for an accepted operation, DEC-39's synchronous
 *      handlers mean any mutation has already completed and is visible.
 *   4. Compute durationMs, build the record, write it.
 *   5. Return the same Response to the caller, unmodified.
 *
 * Failure isolation (DT-8 section 5, Obs 2): the Response is fully computed
 * in step 2 before emission begins, so a write failure in step 4 cannot
 * influence it. Emission is wrapped in its own try/catch and swallowed --
 * deliberately unobservable, since failing an operation because a log write
 * failed would violate the contract.
 */

import type { OperationDispatcher } from '../dispatch/operation-dispatcher.ts';
import type { Response } from '../dispatch/response.ts';
import { buildLogRecord, type LogErrorCode, type LogOperation, type LogState } from './log-record.ts';

export interface LogSink {
  write(line: string): void;
}

/** The production sink: one JSON Lines record per write, to stdout (Observability Contract section 2). */
export const STDOUT_SINK: LogSink = {
  write(line: string): void {
    process.stdout.write(line + '\n');
  },
};

export class ObservabilityEmitter {
  private readonly dispatcher: OperationDispatcher;
  private readonly sink: LogSink;
  private sequence = 0;

  constructor(dispatcher: OperationDispatcher, sink: LogSink = STDOUT_SINK) {
    this.dispatcher = dispatcher;
    this.sink = sink;
  }

  dispatch(raw: string): Response {
    const start = performance.now();
    const response = this.dispatcher.dispatch(raw);
    const durationMs = performance.now() - start;

    this.emit(response, durationMs);

    return response;
  }

  /**
   * DEC-59: no record is emitted when the operation cannot be determined --
   * `response.operation` is absent exactly when RequestParser rejected the
   * request before an operation was known (e.g. malformed JSON), per IC 6's
   * "operation when available" and AC-VAL-06's own "when an operation is
   * parseable" qualification.
   */
  private emit(response: Response, durationMs: number): void {
    if (response.operation === undefined) return;

    try {
      const record = buildLogRecord({
        sequence: ++this.sequence,
        operation: response.operation as LogOperation,
        outcome: response.ok ? 'success' : 'failure',
        durationMs,
        state: this.dispatcher.state as LogState,
        spanCount: this.dispatcher.spanCount,
        ...(response.ok ? {} : { errorCode: response.error.code as LogErrorCode }),
        ...(response.ok && response.operation === 'queryPlanLine'
          ? { matchCount: (response.data['matches'] as readonly unknown[]).length }
          : {}),
        ...(response.ok && response.operation === 'initialize'
          ? { dimensionCount: this.dispatcher.dimensionCount, dimensionValueCount: this.dispatcher.dimensionValueCount }
          : {}),
      });
      this.sink.write(JSON.stringify(record));
    } catch {
      // Emission failure must not alter the response, state, or index
      // contents (Obs 2) -- the response above is already fixed, and
      // swallowing here is itself unobservable, which is correct for a demo.
    }
  }
}
