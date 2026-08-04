# E1: spans-only executable surface

| Attribute | Value |
|---|---|
| Task | E1 of the [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Branch | `ecp-1-e1-spans-only` |
| Governing proposal | [ECP-1](../ECP/ECP-1/ECP-1.md) |
| Predecessor | E0 specification PR #17, merged |
| Scope | EC-1 only: direct span storage and complete executable rename |

## What this changes

Converts the runtime from storing span-associated payload objects to storing canonical
spans directly. The parser, dispatcher, responses, schema, frontend, fixtures,
observability fields, performance fixtures, and tests now use the six ECP-1 operations:
`initialize`, `createSpan`, `updateSpan`, `deleteSpan`, `querySpan`, and
`queryPlanLine`.

E1 deliberately retains the existing semantic guards and catch/translate layers. E2 is
the separate optimistic-execution PR that removes those mechanisms and reduces the
declared error set.

## Runtime and contract changes

- Replaced `BenefitStore` with `SpanStore`; the index now stores `CanonicalSpan`
  directly and exact/matching queries return spans.
- Removed the attached payload from request, storage, response, frontend, fixture, and
  test paths.
- Renamed all executable operations and the stored count to the ECP-1 vocabulary.
- Implemented `updateSpan({ span, replacementSpan })` as a real replacement:
  source absence is checked first, an occupied replacement is checked second, both
  checks occur before mutation, and same-identity replacement succeeds.
- Changed create, update, and exact-query success data to `{ span }`; plan-line query
  results are `matches: [span]` with no wrapper object.
- Updated the compiled `plan-line-to-span/v1` JSON Schema atomically with parser types
  and dispatcher behavior.
- Removed `INVALID_FORMULA` from the E1 runtime/schema error union while retaining the
  remaining pre-E2 structural, semantic, lifecycle, stored-state, and index outcomes.
- Removed the E0 schema-transition marker and restored all six interface request
  examples to validation through the real parser and compiled schema.

## Update behavior covered

- source present, replacement free: source is removed and replacement is stored;
- source absent: `NOT_FOUND`, with no mutation;
- replacement occupied by a different span: `DUPLICATE_SPAN`, with no mutation;
- replacement canonically identical to source: success with one stored entry;
- count remains stable across successful replacement.

## Test migration

- Renamed the operation and store suites to `span-operations.test.ts` and
  `span-store.test.ts`.
- Rebuilt store tests around canonical spans rather than attached values.
- Preserved hierarchy, global-span, zero-dimensional, property, R*-tree, lifecycle,
  HTTP, observability, and fault-injection coverage.
- Updated matching oracles to compare canonical span keys and direct dimension maps.
- Added dispatcher-level coverage that `queryPlanLine` returns matching dimension maps
  directly.
- Removed tests whose only subject was preservation of the removed attached payload.

## E1 absence gate

Command:

```text
rg -n -i 'formula|benefit|employee' src test frontend docs/schemas
```

Result: no matches.

The same audit also found no legacy operation/count names in those executable paths.

## Full suite result

Command: `npm test`

```text
ℹ tests 188
ℹ suites 0
ℹ pass 188
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 772.10125
```

The suite includes type checking, unit, contract, property, static, observability, and
real-socket HTTP tests.

## Deviations

No deviation from the approved E1 scope. Semantic validation and exception translation
remain intentionally present for removal in E2, preserving the planned review boundary
between concept removal and optimistic execution.

## Follow-up

E2 removes semantic validation, defensive assertions, record-field validators, and
catch/translate layers while retaining the structural request boundary and the settled
stored-state/lifecycle outcomes.
