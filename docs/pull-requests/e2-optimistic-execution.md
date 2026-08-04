# E2: optimistic execution

| Attribute | Value |
|---|---|
| Task | E2 of the [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Branch | `ecp-1-e2-optimistic-execution` |
| Governing proposal | [ECP-1](../ECP/ECP-1/ECP-1.md) |
| Predecessor | E1 spans-only PR #18, merged |
| Scope | EC-2: remove semantic validation, defensive guards, and exception translation |

## What this changes

Applies the optimistic-execution posture to the spans-only runtime. Domain input is
trusted after the schema-driven structural request boundary. The four declared outcomes
remain: `MALFORMED_REQUEST`, `INVALID_STATE`, `DUPLICATE_SPAN`, and `NOT_FOUND`.
Unexpected implementation failures propagate rather than becoming response envelopes.

## Production changes

- Removed dimension-definition checks for format meaning, duplicate identifiers/keys,
  dangling parents, and hierarchy cycles.
- Removed span and plan-line checks for known dimensions and values; canonicalization now
  derives identity directly from the supplied map.
- Removed R*-tree axis-count, box-arity, and zero-axis split guards.
- Removed lifecycle programming-error guards.
- Replaced thrown store exceptions with ordinary `StoreResult` branches for
  `DUPLICATE_SPAN` and `NOT_FOUND`.
- Removed every dispatcher `try/catch` and the general error-mapping method. Initialization
  and all five span operations execute directly.
- Removed index-failure types, translation, fault-injection support, and the
  `INDEX_FAILURE` response path.
- Reduced runtime, schema, and observability error vocabularies to the four contract
  outcomes.
- Removed log-record runtime field validators; the builder consumes application-produced
  typed fields directly.
- Removed observability sink isolation so sink failures propagate.
- Removed the HTTP adapter's top-level conversion of unexpected dispatch failures to a
  generic 500 response.
- Changed structural parsing to return a result value, allowing the dispatcher to retain
  `MALFORMED_REQUEST` without a catch/translate layer.

## Retained boundaries and outcomes

- JSON syntax, duplicate members, envelope shape, operation selection, payload JSON
  types, and request ID shape remain enforced by the structural parser/schema.
- Lifecycle rejection remains a direct `INVALID_STATE` branch.
- Duplicate and absent stored identities remain direct store result branches.
- Update still checks missing source before replacement collision and performs both
  checks before mutation.
- The request parser's malformed-JSON catch is the declared structural boundary, not a
  domain or implementation-exception translation path.
- Static-file read failures still map to transport-level 404 responses; this is outside
  domain execution and the transport-neutral interface contract.

## Retired acceptance cases

Every ECP-1 retired identifier is accounted for explicitly:

| Retired ID | E2 disposition |
|---|---|
| `AC-INIT-02` | Deleted the controlled invalid-hierarchy initialization response test and `INVALID_DIMENSION_DEFINITION` path. |
| `AC-INIT-05` | Deleted the controlled failed-reinitialization preservation test; unexpected initialization failure is outside the contract. |
| `AC-INIT-09` | Deleted index-fault translation/rollback tests and their test-only adapter; unexpected index failures now propagate. |
| `AC-BEN-11` | Already retired in E1 because its asserted payload concept was removed; remains absent. |
| `AC-VAL-01` | Deleted unknown-dimension validation assertions and response/log paths. |
| `AC-VAL-02` | Deleted unknown-dimension-value validation assertions and response paths. |
| `AC-VAL-04` | Deleted dangling-parent rejection tests and builder guard. |
| `AC-VAL-05` | Deleted hierarchy-cycle rejection tests and cycle detector. |
| `AC-VAL-07` | Already retired in E1 with its removed payload concept and code; remains absent. |

Historical lifecycle failure transitions remain unit-tested without claiming the retired
acceptance identifiers; Failed remains a declared observable state and retry gate.

## New and reshaped verification

- Added a contract test proving an unexpected index error propagates instead of becoming
  an error envelope.
- Added a contract test proving observability sink failure propagates.
- Reworked store tests around direct success/failure results.
- Reworked parser tests around its structural result value.
- Changed observability failure coverage from removed semantic errors to duplicate and
  absence outcomes.
- Preserved all active lifecycle, span, matching, global, zero-dimensional, property,
  HTTP, privacy, static, and serialization coverage.

## Absence audits

```text
E1 concept absence across src/test/frontend/schema: clean
retired acceptance IDs in test/: clean
retired error codes/types in executable paths: clean
catch/explicit-throw in dispatch/model/index/store/observability: clean
git diff --check: clean
```

The remaining production catches are limited to malformed JSON at the structural request
boundary and missing static files at the HTTP transport boundary.

## Full suite result

Command: `npm test`

```text
ℹ tests 158
ℹ suites 0
ℹ pass 158
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 787.293875
```

The suite includes type checking, unit, contract, property, static, observability, and
real-socket HTTP tests.

## Deviations

No deviation from the settled E2 scope. The structural parser/schema remains by the E0
ruling; E2 removes semantic and defensive validation rather than the boundary required
to select a typed operation.

## Follow-up

E3 reruns the DT-7 performance volumes against the E1/E2 runtime and reconciles the
implementation coverage checker with the 39 active and 9 retired acceptance cases.
