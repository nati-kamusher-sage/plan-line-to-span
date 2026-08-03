# Plan Line to Span Observability Contract

| Contract attribute | Value |
|---|---|
| Contract name | `plan-line-to-span-observability` |
| Version | `v1` |
| Status | Draft |
| Governing behavior | [Operational Concept](operational-concept.md) |

## 1. Scope

The demo's instrumentation is local structured logging to the process console. It does not expose Prometheus metrics, an HTTP metrics endpoint, dashboards, traces, or an external observability provider.

The console-log stream is intended for local development, demonstration, and automated tests that capture process output. Logs are not durable telemetry and counters are derived by counting records in the captured stream.

## 2. Output format and delivery

- Emit one UTF-8 JSON object per line (JSON Lines) to standard output for every completed operation, whether it succeeds or fails.
- The event name is always `plan_line_to_span.operation_completed`.
- Emit the record after the operation reaches its final observable outcome. A successful mutation is logged only after it is visible to the next accepted operation.
- Log emission failure must not alter the operation response, state, or index contents.
- No startup, heartbeat, or periodic summary log is required.

## 3. Common record fields

Every operation-completion record has these fields. Fields not listed for a given record must be omitted rather than set to `null`.

| Field | Type | Meaning |
|---|---|---|
| `timestamp` | string | UTC RFC 3339 timestamp at completion. |
| `event` | string | Always `plan_line_to_span.operation_completed`. |
| `sequence` | integer | Positive, monotonically increasing number within the running process; it resets on restart. |
| `operation` | string | `initialize`, `createBenefit`, `updateBenefit`, `deleteBenefit`, `queryBenefit`, or `queryEmployee`. |
| `outcome` | string | `success` or `failure`. |
| `durationMs` | number | Non-negative elapsed operation duration in milliseconds. |
| `state` | string | Resulting state: `uninitialized`, `initializing`, `ready`, or `failed`. |
| `benefitCount` | integer | Non-negative count of benefits after the operation completes. |

Success records use log level `info`. Expected validation, conflict, absence, and state failures use `warn`. `INDEX_FAILURE` uses `error`.

## 4. Operation-specific fields

| Operation and outcome | Additional required field(s) |
|---|---|
| Successful `initialize` | `dimensionCount` and `dimensionValueCount`, both non-negative integers. |
| Failed `initialize` | `errorCode`. |
| Successful `queryEmployee` | `matchCount`, a non-negative integer. A no-match query records `0`. |
| Failed operation | `errorCode`, one of the interface-contract error codes. |

`matchCount` is omitted for non-employee operations and failed employee queries. Failed operations do not change `benefitCount`; failed employee queries do not emit a match count.

## 5. Examples

Successful employee query with two matches:

```json
{"timestamp":"2026-07-31T10:15:30.123Z","event":"plan_line_to_span.operation_completed","sequence":14,"level":"info","operation":"queryEmployee","outcome":"success","durationMs":1.7,"state":"ready","benefitCount":5,"matchCount":2}
```

Rejected create due to an unknown dimension:

```json
{"timestamp":"2026-07-31T10:16:02.400Z","event":"plan_line_to_span.operation_completed","sequence":15,"level":"warn","operation":"createBenefit","outcome":"failure","durationMs":0.4,"state":"ready","benefitCount":5,"errorCode":"UNKNOWN_DIMENSION"}
```

Successful reinitialization:

```json
{"timestamp":"2026-07-31T10:17:11.005Z","event":"plan_line_to_span.operation_completed","sequence":16,"level":"info","operation":"initialize","outcome":"success","durationMs":3.1,"state":"ready","benefitCount":0,"dimensionCount":2,"dimensionValueCount":7}
```

## 6. Signal interpretation

| Required signal | Console-log interpretation |
|---|---|
| Operation count | Count records by `operation`. |
| Operation duration | Read `durationMs`; aggregate externally only for the captured local run. |
| Success and failure count | Count records by `operation` and `outcome`. |
| Indexed-benefit count | Read `benefitCount` from the latest record. |
| Employee-query match count | Read or aggregate `matchCount` on successful `queryEmployee` records. |
| Initialization state | Read `state` from the latest `initialize` record or subsequent operation record. |
| Validation-error category | Count failed records by `errorCode`. |

After process restart, `sequence` restarts and no prior counts are retained. After successful reinitialization, `benefitCount` is `0`; after failed reinitialization, it reflects the retained Ready model's benefit count. Failed operations never change the reported count.

## 7. Privacy and cardinality

Records must never include a span, plan-line dimension map, dimension identifier or value, formula, request payload, response payload, raw error text, employee identifier, or caller-supplied `requestId`. The only error detail recorded is the stable `errorCode`.

This keeps the log shape fixed and avoids exposing planning data or creating unbounded field values. Implementations may add process-managed fields such as a build version only if their values come from a bounded, non-sensitive set.

## 8. Verification

Automated tests capture standard output, parse each line as JSON, and assert the required fields and operation-specific fields. Tests must verify a successful operation, a validation failure, an invalid-state failure, an employee query with zero and nonzero matches, and successful and failed reinitialization.
