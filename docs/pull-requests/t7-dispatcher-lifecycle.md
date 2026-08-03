# T7: Dispatcher and lifecycle

| Attribute | Value |
|---|---|
| Task | T7 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t7-dispatcher-lifecycle` |
| Design records | [DT-5](../design/dt-5-lifecycle.md), [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | DEC-29, DEC-30, DEC-34, DEC-35, DEC-36, DEC-37, DEC-38, DEC-39 |
| Acceptance cases now passing | `AC-INIT-01` through `AC-INIT-08`, `AC-SERIAL-01`. Cumulative 27/48. |

## What this changes

Three new modules: `src/dispatch/lifecycle-state.ts` (`LifecycleState`, and the pure `accepts`/`completionTransition` functions DT-5 specifies), `src/dispatch/response.ts` (success/error envelope construction per IC 5-6), and `src/dispatch/operation-dispatcher.ts` (`OperationDispatcher`, the single entry point routing a raw request through the gate to `initialize` or a benefit operation).

T7's scope is the gate and the initialize lifecycle, not the full validation pipeline (T8) or complete benefit-operation error mapping (T9). `OperationDispatcher` wires enough of both to demonstrate correct state gating and serial ordering without pre-empting either later task.

## Design decisions implemented

**DEC-34, DEC-35 — the intake gate is one expression; intake and completion are distinct.** `accepts(state, operation)` is the single rule from IC 6.1. `LifecycleState.beginInitializing()`/`completeInitialization()` separate the two events explicitly — completion is never passed through the gate, which is what the design-phase prototype's first version got wrong (documented in DT-5 section 3) and what this implementation deliberately does not repeat.

**DEC-36 — the transition function takes `priorState`.** `beginInitializing()` returns the state the utility was in before transitioning to `initializing`, and the caller (`OperationDispatcher`) must pass it back to `completeInitialization`. This is what distinguishes `AC-INIT-02` (first initialization failure → `Failed`) from `AC-INIT-05` (reinitialization failure → `Ready`, previous benefits intact).

**DEC-37 — candidate-then-swap reinitialization.** `handleInitialize` builds the candidate `DimensionModel` before touching `this.model`/`this.store`. On failure, neither field is written, so nothing about the live state changes. On success, both are assigned together with a fresh empty index, which is why `AC-INIT-04`'s `benefitCount: 0` requires no separate clearing step.

**DEC-38, DEC-39 — no queue or lock; handlers never await.** `dispatch` and every handler it calls are synchronous, with no `async` anywhere in `src/dispatch/`. Serial processing (`AC-SERIAL-01`) holds because there is no point during `dispatch` where control returns to the event loop for another call to interleave through.

## AC-INIT-06: a deliberate testing choice, not a design deviation

`AC-INIT-06` asks what happens when an operation is submitted while `initializing`. With DEC-39's synchronous handlers, there is no event-loop yield during `dispatch` for a second call to genuinely interleave through — "holding initialization open" as the case describes cannot arise from real concurrency in this implementation, by design.

DT-9's test-approach document already anticipated this: `pause-during-initialize` is listed as needing no new seam, because `LifecycleState` is already a distinct, inspectable component. This PR adds `OperationDispatcher.testOnlyLifecycle`, a narrow test-only accessor exposing that seam directly, and the `AC-INIT-06` test uses it to force the dispatcher into `initializing` and assert that `dispatch` rejects a subsequent request with `INVALID_STATE`. This tests the gate's actual reaction to the state precisely, rather than fabricating concurrency that the synchronous design does not have.

## Two defects found while writing this task, neither in the design

**A type-design flaw in T6's `ParsedRequest` union.** The dispatcher's handler methods needed per-operation parameter types via `Extract<ParsedRequest, { operation: 'createBenefit' }>`. This failed to type-check (`Argument ... is not assignable to parameter of type 'never'`) because T6's original `CreateOrUpdateBenefitRequest` and `SpanRequest` interfaces each covered *two* operations under one union-valued `operation` field. `Extract` matches structurally, not by discriminant, so it cannot narrow a type whose discriminant field is itself already a union. Fixed by splitting into one interface per operation (`CreateBenefitRequest`, `UpdateBenefitRequest`, `DeleteBenefitRequest`, `QueryBenefitRequest`), each with a single-literal `operation`. This is a correction to `request-parser.ts`, which T6 introduced; T6's own tests needed no changes, since none of them relied on `Extract`.

**A TypeScript comprehension error in a test I wrote for this task.** `if (parsed.operation === 'a' || parsed.operation === 'b') { parsed.payload... }` looks like it should narrow `parsed` to the union of the two matching branches, the way a single `===` check narrows a discriminated union. It does not: TypeScript narrows each side of `||` independently, but the combined condition's body sees the original, unnarrowed union again. Confirmed with an isolated three-line reproduction before accepting it as a real TypeScript behavior rather than a project misconfiguration. Fixed by using a single equality check per assertion instead of combining two operations in one `if`.

## `exactOptionalPropertyTypes` friction, resolved rather than disabled

Passing `request.requestId` (typed `string | undefined`, since it is an optional request field) into `failure()`'s options object failed under `exactOptionalPropertyTypes`, which distinguishes "key absent" from "key present with value `undefined`" strictly. Rather than loosen the compiler setting DT-1 chose deliberately, `failure()`'s options type was widened to accept `| undefined` explicitly on each field, since forwarding an already-optional value is exactly the case a response-construction helper exists to support.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/lifecycle-state.test.ts` | Unit, 16 tests | Promoted from `dt-5-lifecycle.mjs`: all 24 IC 6.1 gate cells, the `failed`/`initialize` cell (ISSUE-04) specifically, completion transitions for both failure branches, and `LifecycleState`'s stateful wrapper including the two programming-error guards. |
| `test/contract/dispatcher-lifecycle.test.ts` | Contract, 10 tests | `AC-INIT-01` through `AC-INIT-08` and `AC-SERIAL-01` against the real `OperationDispatcher`, raw JSON string in, `Response` out. `requestId` echoing on both outcomes. |
| `test/static/handlers-never-await.test.ts` | Static, 2 tests | DEC-64: scans `src/dispatch/*.ts` with comments and string/template literals stripped, asserting no `async` keyword appears anywhere. Includes a self-check that the stripping does not itself hide a genuine `async`. |

## Full suite result

```
ℹ tests 150
ℹ suites 0
ℹ pass 150
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 516.371208
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **27/48**.

## Deviations from the design

None from DT-4/DT-5. `OperationDispatcher.testOnlyLifecycle` is an addition the design anticipated needing (DT-9's "no new seam is needed" reasoning) rather than a departure from it.

## Open items resolved

| Item | Resolution |
|---|---|
| Where `priorState` is stored during initialization | A `beginInitializing()` return value threaded through `OperationDispatcher.handleInitialize` to `completeInitialization`, exactly the "dispatcher local suffices" DT-5 anticipated. |
| Whether an error envelope carries a non-200 status (ISSUE-D2) | Resolved for the demo: no HTTP status is modelled at this layer at all. `OperationDispatcher.dispatch` returns a `Response` value directly; `error.code` is the sole authority per DT-1 DEC-4, and a future transport adapter maps `Response` to whatever status convention it likes without this layer caring. |

## Follow-ups

**`AC-INIT-09` (INDEX_FAILURE) is not covered by this task**, as scoped: it needs T9's/T11's `inject-index-failure` capability. `mapBenefitError` already recognizes `IndexFailureError` and maps it to the `INDEX_FAILURE` code without any lifecycle transition, consistent with DT-3's DEC-17 and the operational concept's `Ready --> Ready` edge, but nothing yet exercises that path.

**The static `async`-scan in `handlers-never-await.test.ts` is a source-text heuristic, not a real parser.** It is precise enough for this codebase's current style (verified by inspection that no string literal anywhere contains the word "async"), but if a future file legitimately needs the word "async" inside a string or comment in a way that could confuse the stripping regex, this should be revisited — ideally by replacing it with a proper AST-based check if the project ever adopts a parser dependency for other reasons.
