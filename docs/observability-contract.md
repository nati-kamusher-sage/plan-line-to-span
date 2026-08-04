# Plan Line to Span Observability Contract

| Contract attribute | Value |
|---|---|
| Contract name | `plan-line-to-span-observability` |
| Version | ECP-1 target `v1` |
| Status | Target contract; implementation follows in E1/E2 |
| Governing behavior | [Operational Concept](operational-concept.md) |

## 1. Scope

Instrumentation is one local JSON Lines stream on standard output. There are no metrics,
dashboards, traces, durable telemetry, or external providers. Counters are derived from
captured records.

## 2. Output format and delivery

- Emit one UTF-8 JSON object per line for each operation that reaches a contract success
  or declared state outcome.
- The event name is `plan_line_to_span.operation_completed`.
- Emit after the final observable outcome; a successful mutation is logged only after it
  is visible to the next accepted operation.
- An invalid input or unexpected implementation failure outside the interface contract
  may fail uncaught and is not guaranteed to emit a completion record.
- Log-sink failure is not isolated under optimistic execution and may propagate.
- No startup, heartbeat, or periodic summary is required.

## 3. Common record fields

Fields not listed for a record are omitted rather than set to `null`.

| Field | Type | Meaning |
|---|---|---|
| `timestamp` | string | UTC RFC 3339 completion timestamp. |
| `event` | string | `plan_line_to_span.operation_completed`. |
| `sequence` | integer | Positive, monotonically increasing within the process. |
| `level` | string | `info` for success; `warn` for declared state outcomes. |
| `operation` | string | `initialize`, `createSpan`, `updateSpan`, `deleteSpan`, `querySpan`, or `queryPlanLine`. |
| `outcome` | string | `success` or `failure`. |
| `durationMs` | number | Non-negative elapsed duration in milliseconds. |
| `state` | string | Resulting `uninitialized`, `initializing`, `ready`, or `failed` state. |
| `spanCount` | integer | Non-negative stored-span count after completion. |

## 4. Operation-specific fields

| Operation and outcome | Additional required field(s) |
|---|---|
| Successful `initialize` | `dimensionCount` and `dimensionValueCount`, both non-negative integers. |
| Successful `queryPlanLine` | `matchCount`, a non-negative integer; no-match records `0`. |
| Declared failure | `errorCode`: `MALFORMED_REQUEST`, `DUPLICATE_SPAN`, `NOT_FOUND`, or `INVALID_STATE`. |

`matchCount` is omitted from every other operation and from failed plan-line queries.
Declared failures do not change `spanCount`.

## 5. Examples

Successful plan-line query with two matches:

```json
{"timestamp":"2026-08-04T10:15:30.123Z","event":"plan_line_to_span.operation_completed","sequence":14,"level":"info","operation":"queryPlanLine","outcome":"success","durationMs":1.7,"state":"ready","spanCount":5,"matchCount":2}
```

Rejected duplicate create:

```json
{"timestamp":"2026-08-04T10:16:02.400Z","event":"plan_line_to_span.operation_completed","sequence":15,"level":"warn","operation":"createSpan","outcome":"failure","durationMs":0.4,"state":"ready","spanCount":5,"errorCode":"DUPLICATE_SPAN"}
```

Successful reinitialization:

```json
{"timestamp":"2026-08-04T10:17:11.005Z","event":"plan_line_to_span.operation_completed","sequence":16,"level":"info","operation":"initialize","outcome":"success","durationMs":3.1,"state":"ready","spanCount":0,"dimensionCount":2,"dimensionValueCount":7}
```

## 6. Signal interpretation

| Required signal | Interpretation |
|---|---|
| Operation count | Count records by `operation`. |
| Operation duration | Read `durationMs`; aggregate only for the captured local run. |
| Success/state-failure count | Count by `operation` and `outcome`. |
| Indexed-span count | Read `spanCount` from the latest record. |
| Plan-line match count | Read `matchCount` on successful `queryPlanLine` records. |
| Initialization state | Read `state` from the latest record. |
| State-outcome category | Count failed records by `errorCode`. |

After restart, `sequence` and all derived counts restart. Successful reinitialization
reports `spanCount: 0`.

## 7. Privacy and cardinality

Records must never include a span, plan-line map, dimension identifier or value, request
payload, response payload, raw error text, or caller-supplied `requestId`. Only the stable
`errorCode` is recorded for declared failures.

This keeps the shape bounded and avoids exposing planning data. Implementations may add
process-managed fields such as build version only when values are bounded and
non-sensitive.

## 8. Verification

Tests capture stdout, parse every line as JSON, and assert closed field sets. They cover
a successful mutation, duplicate/absence/state failures, plan-line queries with zero and
nonzero matches, successful reinitialization, monotonic sequencing, and privacy sentinels
in both stored spans and plan lines.
