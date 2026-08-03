# DT-8: Observability Implementation

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-8 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Observability Contract](../observability-contract.md); [Operational Concept](../operational-concept.md) 15.4 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-6](dt-6-validation-and-errors.md) |
| Prototype | [log builder](prototypes/dt-8-log-builder.mjs) |

## 1. Decision

One decorator around `OperationDispatcher` emits exactly one record per completed operation. Records are constructed by a **closed-field builder** that accepts only primitives from bounded sets, so no field exists through which a span, formula, or dimension value could travel.

The privacy prohibition is enforced by the builder's signature, not by review.

## 2. Instrumentation placement

`ObservabilityEmitter` decorates dispatch rather than being called from each handler (DT-4's DEC-32 and DT-1's decorator pattern). One wrapper covers every operation, so a new operation cannot be added without instrumentation, and no handler can forget to emit.

Obs 2 requires the record to be emitted "after the operation reaches its final observable outcome," and specifically that a successful mutation is logged only once it is visible to the next accepted operation. The decorator satisfies this by construction: it runs after the handler returns, and DT-5's synchronous-handler obligation (DEC-39) means a returned handler has already completed its mutation.

The ordering is therefore:

1. Decorator records the start time.
2. Dispatcher gates, validates, and executes.
3. Handler returns a result — the mutation is now visible.
4. Decorator computes duration, builds the record, writes it.
5. Response returns to the caller.

## 3. Field production

| Field | Source |
|---|---|
| `timestamp` | Wall clock at completion, RFC 3339 UTC. |
| `event` | The fixed constant. |
| `sequence` | A process-scoped counter incremented per emitted record. Starts at 1, resets on restart, per Obs 3. |
| `level` | Derived, not supplied: `info` on success, `error` for `INDEX_FAILURE`, `warn` otherwise. |
| `operation`, `outcome`, `state` | From bounded sets. |
| `durationMs` | `performance.now()` difference — monotonic, so a clock adjustment cannot produce a negative value. |
| `benefitCount` | Read from `BenefitStore` after completion. |
| `errorCode`, `matchCount`, `dimensionCount`, `dimensionValueCount` | Optional; omitted rather than null, per Obs 3. |

`level` being derived rather than passed removes a class of mistake: a caller cannot log a failure at `info`, and the `INDEX_FAILURE` escalation cannot be forgotten.

`sequence` increments per *emitted record*, not per received request, so the counter and the record stream cannot diverge.

## 4. The privacy mechanism

The exit criterion is that `AC-OBS-04` should be unable to fail by accident. That requires more than not writing payload data — it requires that writing it be impossible through the normal path.

The builder accepts a fixed parameter set. Every field is either a non-negative integer, a number, or a member of an enumerated set. There is **no string field of unbounded content**. A span, formula, or dimension value has nowhere to go.

Verified adversarially rather than by demonstration:

```
--- adversarial: attempts to smuggle payload data ---
pass  accepted  span object as extra field
pass  rejected  formula in a known field
pass  rejected  sentinel as operation
pass  rejected  sentinel as errorCode
pass  rejected  sentinel as state
pass  rejected  dimension value as matchCount
pass  rejected  negative benefitCount
pass  rejected  negative durationMs
pass  rejected  null instead of omitted

--- the sentinel never reaches the output ---
  emitted: {"timestamp":"...","event":"plan_line_to_span.operation_completed","sequence":1,
            "level":"info","operation":"createBenefit","outcome":"success","durationMs":0.4,
            "state":"ready","benefitCount":3}
pass  AC-OBS-04: sentinel absent from the record
```

The first row is the important one. Passing an extra `span` field is **accepted but discarded** — the builder constructs its output from named parameters, so an unrecognized field is simply never read. Rejecting it would arguably be stricter, but silently dropping it is the safer failure mode: a caller who mistakenly passes payload data gets a clean record rather than an exception that might be caught and worked around.

Every attempt to place payload data in a *recognized* field is rejected, because each recognized field is type- and domain-constrained.

Records are frozen after construction, so nothing can be added between building and writing.

Note the limits of this. It prevents accidental leakage through the emitter. It does not prevent a developer from calling `console.log` directly elsewhere in the process, which is a code-review matter that no design can foreclose. DT-9 should include a test asserting the emitter is the only writer to stdout.

## 5. Failure isolation

Obs 2 requires that log-emission failure not alter the operation response, state, or index contents.

The decorator wraps emission in its own error boundary. A write failure is swallowed after the response has been determined; the response is already computed before emission begins, so there is no path by which emission can influence it. Emission is also the last step, so a throw cannot skip business logic.

A swallowed emission failure is itself unobservable, which is correct for a demo: the alternative — failing an operation because a log write failed — would violate the contract.

## 6. The unparseable-request case

DT-6 flagged this as open. Obs 3 requires `operation` on every record, but a request rejected by `RequestParser` may have no recoverable operation — malformed JSON being the clearest example.

**Decision: no record is emitted for a request whose operation cannot be determined.**

The rationale is that the observability contract describes `plan_line_to_span.operation_completed` records. A message that never resolved to an operation did not complete one. Emitting a record with a placeholder operation would introduce a value outside the bounded set that Obs 3 defines, which the builder would reject anyway.

This matches the acceptance catalogue: `AC-VAL-06` already qualifies its expectation with "when an operation is parseable," so the case was anticipated during WP-6.

When the operation *is* parseable but the request is otherwise malformed — an undeclared field, a bad `contractVersion` — a normal failure record is emitted with `errorCode: MALFORMED_REQUEST`.

This is a small observability gap and is recorded honestly: a caller sending pure garbage produces no log evidence. For a demo with no durable telemetry that is acceptable; a production system would want a separate transport-level counter, which OC 3.2 places out of scope.

## 7. Verification against the acceptance cases

| Case | How this design satisfies it |
|---|---|
| `AC-OBS-01` | Three operations produce three records with common fields and non-negative `durationMs`; the employee record carries `matchCount`. |
| `AC-OBS-02` | Two failures produce `warn` records with their codes, no `matchCount`, and unchanged `benefitCount` — the count is read after completion, and a failed operation changed nothing. |
| `AC-OBS-03` | `benefitCount` is read from `BenefitStore`; after reinitialization the store holds a fresh empty index, so zero is reported without explicit clearing logic. `dimensionValueCount` is supplied by `DimensionModelBuilder`. |
| `AC-OBS-04` | Section 4. The sentinel cannot reach a record through the builder. |

## 8. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-52 | One decorator around dispatch emits every record | A new operation cannot be added without instrumentation. |
| DEC-53 | The builder accepts only bounded primitives; no unbounded string field exists | Makes payload leakage impossible rather than merely prohibited. |
| DEC-54 | Unrecognized fields passed to the builder are discarded, not rejected | A clean record is a safer failure mode than a throw that might be worked around. |
| DEC-55 | `level` is derived from outcome and error code, never supplied | A failure cannot be logged at `info`; the `INDEX_FAILURE` escalation cannot be forgotten. |
| DEC-56 | `sequence` increments per emitted record | Counter and record stream cannot diverge. |
| DEC-57 | `durationMs` uses a monotonic clock | A clock adjustment cannot produce a negative duration. |
| DEC-58 | Records are frozen after construction | Nothing can be added between building and writing. |
| DEC-59 | No record is emitted when the operation cannot be determined | No operation completed; a placeholder would violate the bounded `operation` set. |

## 9. Open items

| Item | Owner task |
|---|---|
| Test that the emitter is the only writer to stdout | DT-9 |
| Capturing and parsing stdout in tests | DT-9 |

## 10. Limitations

The prototype implements the builder and attacks it. It does not implement the decorator, the dispatcher integration, or stdout writing, so the placement and failure-isolation claims in sections 2 and 5 are designed but unproven.

The privacy guarantee covers the emitter path only. Nothing in this design prevents direct console writing elsewhere in the process; that is why section 9 asks DT-9 for a test rather than treating the matter as closed.
