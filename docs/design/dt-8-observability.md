# DT-8: Observability Implementation

| Document attribute | Value |
|---|---|
| Status | ECP-1 revised design |
| Governing input | [Observability Contract](../observability-contract.md), [Operational Concept](../operational-concept.md) 15.3 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-6](dt-6-validation-and-errors.md) |
| Historical prototype | [log builder](prototypes/dt-8-log-builder.mjs) |

## 1. Decision

One decorator around dispatch emits one closed-shape record for each operation reaching a
contract success or declared state outcome. The record surface contains only bounded
primitive fields; there is no path for span or plan-line data.

ECP-1 retains privacy and centralized emission but removes runtime validation of values
the program constructs and removes sink-failure isolation.

## 2. Placement and ordering

```text
record monotonic start
  -> dispatch and execute synchronously
  -> obtain declared result
  -> read resulting lifecycle and span count
  -> construct and write record
  -> return response
```

Successful mutations are visible before their record is written. An uncaught operation
failure does not produce a declared result and is not guaranteed a completion record.

## 3. Field production

| Field | Source |
|---|---|
| `timestamp` | Completion wall clock in RFC 3339 UTC. |
| `event` | Fixed constant. |
| `sequence` | Process-scoped counter, incremented per emitted record. |
| `level` | `info` for success, `warn` for a declared failure. |
| `operation`, `outcome`, `state` | Closed unions from dispatch/lifecycle. |
| `durationMs` | Monotonic-clock difference. |
| `spanCount` | Read from `SpanStore` after completion. |
| `errorCode` | Optional declared interface code. |
| `matchCount` | Successful `queryPlanLine` only. |
| `dimensionCount`, `dimensionValueCount` | Successful `initialize` only. |

TypeScript types and closed construction prevent extra fields. E2 removes defensive
runtime checks such as non-negative assertions for program-produced counts/durations.

## 4. Privacy mechanism

The builder accepts no unbounded caller string and no domain map. It creates a fresh
object from named fields, so unknown properties passed by an internal caller are ignored.
Recognized fields are typed as bounded unions or numbers. Records are frozen after
construction.

The source-wide `emitter-sole-stdout-writer` check prevents a second output path from
bypassing this builder. AC-OBS-04 uses sentinel dimension values in both a stored span and
a plan line and proves neither reaches stdout.

## 5. Failure posture

The Phase 1 emitter swallowed sink exceptions to isolate dispatch. ECP-1 supersedes that
behavior: no emission try/catch remains, and sink failure may propagate after the domain
operation has completed. This is the direct consequence of “no exception handling.”

The emitter does not manufacture an internal-error record for an uncaught exception.

## 6. Structurally unparseable messages

No operation-completion record is emitted when the parser cannot determine a supported
operation. When the operation is known but another structural field is malformed, the
normal `MALFORMED_REQUEST` record may be emitted.

## 7. Acceptance verification

| Case | Design consequence |
|---|---|
| AC-OBS-01 | Create, plan-line query, and delete each produce a complete record. |
| AC-OBS-02 | Duplicate and absence outcomes are `warn`, omit `matchCount`, and retain `spanCount`. |
| AC-OBS-03 | Delete and reinitialize both report zero; initialize carries dimension counts. |
| AC-OBS-04 | Closed construction and sole-writer check exclude domain payload. |

## 8. Decisions recorded

| ID | ECP-1 status |
|---|---|
| DEC-52 | Retained: one decorator covers every operation. |
| DEC-53 | Retained: closed primitive fields prevent payload leakage. |
| DEC-54 | Retained: unknown builder fields are discarded. |
| DEC-55 | Revised: level is `info` or `warn`; the removed internal-error code has no escalation. |
| DEC-56 | Retained: sequence increments per emitted record. |
| DEC-57 | Retained: duration uses a monotonic clock. |
| DEC-58 | Retained: records are frozen. |
| DEC-59 | Retained: no record when no operation can be determined. |
| DEC-70 | Added: log-sink exceptions propagate under optimistic execution. |

## 9. Limitations

Privacy covers the structured stdout path. It does not make process stderr or an uncaught
runtime exception part of the observability contract. The historical prototype validates
the Phase 1 builder and must be reconciled with renamed fields and removed guards in E2.
