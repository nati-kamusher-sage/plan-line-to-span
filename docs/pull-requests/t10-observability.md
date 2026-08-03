# T10: observability

| Attribute | Value |
|---|---|
| Task | T10 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t10-observability` |
| Design records | [DT-8](../design/dt-8-observability.md), [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | DEC-52, DEC-53, DEC-54, DEC-55, DEC-56, DEC-57, DEC-58, DEC-59 |
| Acceptance cases now passing | `AC-OBS-01` through `AC-OBS-04`. Cumulative 42/48 (of 48; T8's 5 `AC-VAL-*` cases remain open). |

## What this changes

Three new modules: `src/observability/log-record.ts` (`buildLogRecord`, the closed-field builder DT-8 section 1 specifies), `src/observability/observability-emitter.ts` (`ObservabilityEmitter`, the decorator wrapping `OperationDispatcher.dispatch`, plus the default `STDOUT_SINK`). `OperationDispatcher` gains two small read-only getters, `dimensionCount` and `dimensionValueCount`, alongside the existing `benefitCount`, so the emitter can read every Obs 3/4 field it needs from dispatcher state rather than parsing a `Response`'s untyped `data`.

## Design decisions implemented

**DEC-52 — one decorator around dispatch.** `ObservabilityEmitter.dispatch` wraps `OperationDispatcher.dispatch` and is the only thing tests or a future entry point call. A new operation cannot be added without instrumentation, because every operation already passes through `OperationDispatcher.dispatch` (DEC-30); the decorator sees all of them by construction.

**DEC-53, DEC-54 — the closed-field builder.** `buildLogRecord`'s parameter type has no field of unbounded string content — every field is a non-negative integer, a number, or a member of an enumerated set (`OPERATIONS`, `OUTCOMES`, `ERROR_CODES`, `STATES`). A span, formula, dimension value, `requestId`, or raw error message has nowhere to go; passing one is a type error, not a leak. An unrecognized property is silently discarded (verified adversarially in `log-record.test.ts`), which is the safer failure mode DT-8 chose over throwing.

**DEC-55 — level is derived, never supplied.** `deriveLevel` computes `info`/`warn`/`error` from `outcome` and `errorCode`; there is no `level` parameter a caller could set incorrectly.

**DEC-56, DEC-57 — sequence and duration.** `ObservabilityEmitter` owns a private `sequence` counter incremented once per **emitted** record (not per received request), and times each dispatch with `performance.now()`, a monotonic clock immune to wall-clock adjustment.

**DEC-58 — frozen records.** `Object.freeze` at the end of `buildLogRecord`; nothing can be added between construction and the sink write.

**DEC-59 — no record for an unparseable request.** `ObservabilityEmitter.emit` returns immediately when `response.operation === undefined`, which is exactly the case `RequestParser` produces for a request rejected before an operation was known.

## Why `dimensionCount`/`dimensionValueCount` became dispatcher getters

`benefitCount` was already exposed this way (T7/T9). The alternative — parsing `Response.data.dimensionCount` out of an `initialize` success response — would work but couples the emitter to response *shape* rather than dispatcher *state*, and DT-8 section 3 already describes these as things to read after the operation completes, the same framing as `benefitCount`. Adding the two getters keeps `ObservabilityEmitter` reading a consistent, typed surface for all three counts instead of reading two of them one way and one the other.

`matchCount` did not get the same treatment: it is only meaningful for `queryEmployee`, and `OperationDispatcher` has no persistent "last match count" to expose (unlike a count of live benefits or configured dimensions, a match count is a property of one specific query, not of dispatcher state). The emitter reads it from `response.data.matches.length` instead, which is the correct place for a value that exists only in the context of the operation that just ran.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/log-record.test.ts` | Unit, 17 tests | Promoted from `dt-8-log-builder.mjs`: all nine adversarial smuggling attempts, the sentinel-absence check, field-shape closure (Obs 3), frozen output, and level derivation for all three cases. |
| `test/contract/observability.test.ts` | Contract, 4 tests | `AC-OBS-01` through `AC-OBS-04` against the real `OperationDispatcher` wrapped by the real `ObservabilityEmitter`, using an injectable `LogSink` fake. |
| `test/contract/stdout-sink.test.ts` | Contract, 2 tests | The `capture-stdout` capability DT-9 named: the default `STDOUT_SINK` writes real JSON Lines to the real `process.stdout`, restored via `try`/`finally` regardless of assertion outcome; an unparseable request produces no output at all. |
| `test/static/emitter-sole-stdout-writer.test.ts` | Static, 3 tests | DT-8 section 9's open item: no file under `src/` outside `src/observability` calls `console.*` or `process.std{out,err}.write`, and `observability-emitter.ts` is the only file inside `src/observability` that does. Comments and string literals are stripped first, the same technique `handlers-never-await.test.ts` uses (DEC-64), with a self-check that stripping does not hide a genuine offender. |

## A test bug caught by my own adversarial assertion, not a production defect

`AC-OBS-04`'s first draft asserted that no captured record's JSON contains the bare substring `"span"`. That failed immediately — not because a span leaked, but because the event name itself, `plan_line_to_span.operation_completed`, contains `"span"` as a substring of `plan_line_to_span`. Fixed by checking for the *field name* `'span' in record` instead of a bare substring, which is what the case actually requires. Caught before merge by running the test, not assumed correct from reading it.

## Full suite result

```
ℹ tests 187
ℹ suites 0
ℹ pass 187
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 675.904875
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **42/48** (of 48; `AC-VAL-01`, `-02`, `-04`, `-05`, `-07` remain open pending T8, which was skipped by explicit instruction).

## Deviations from the design

None from DT-8. The two new `OperationDispatcher` getters are an extension in the same spirit as the existing `benefitCount`, not a departure from DT-4's component boundaries — `OperationDispatcher` does not know `ObservabilityEmitter` exists, and the getters are ordinary read-only state accessors already following the pattern the class established.

## Open items resolved

| Item | Resolution |
|---|---|
| Test that the emitter is the only writer to stdout (DT-8 section 9) | `emitter-sole-stdout-writer.test.ts`, a static source-text scan. |
| Capturing and parsing stdout in tests (DT-8 section 9) | `stdout-sink.test.ts`, using a temporary `process.stdout.write` replacement restored in `try`/`finally`. |

## Follow-ups

**T8's five `AC-VAL-*` cases remain open**, unchanged from T9's PR. `INVALID_FORMULA` still cannot occur, so no test here exercises `ObservabilityEmitter`'s handling of that error code specifically, though `deriveLevel`'s `warn` branch covers it identically to every other validation failure — there is nothing code-path-specific about `INVALID_FORMULA` that this design or implementation treats differently.

**`AC-INIT-09` (`INDEX_FAILURE`) still has no exercised path**, as before T7/T9 — T11's `inject-index-failure` seam is what will let a test actually reach the emitter's `error`-level branch through the real dispatch path rather than only through `log-record.test.ts`'s direct unit-level check.
