# ECP-1: implementation plan

| Attribute | Value |
|---|---|
| Task | Planning prerequisite for E0–E3 of the [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Branch | `ecp-1-plan` |
| Governing proposal | [ECP-1](../ECP/ECP-1/ECP-1.md) |
| Decisions recorded | Spans-only concept model; optimistic execution; E0 rulings for update, naming, and retained state errors |
| Acceptance cases now passing | None — planning documentation only |

## What this changes

Adds ECP-1 and its implementation plan. The proposal removes formula, benefit, and
employee as concepts; renames the utility around spans and plan lines; and adopts
optimistic execution while retaining `DUPLICATE_SPAN` and `NOT_FOUND` as state outcomes.

The plan divides execution into four sequential, regression-gated pull requests: E0
updates the specification, E1 applies the spans-only model and rename, E2 removes
defensive validation and exception handling, and E3 re-measures performance and
reconciles traceability.

## Decisions recorded

- `updateBenefit` becomes `updateSpan`, with `{ span, replacementSpan }`. It removes the
  current span and creates the requested replacement. A missing source produces
  `NOT_FOUND`; a replacement already occupied by another stored span produces
  `DUPLICATE_SPAN`.
- `createBenefit`, `deleteBenefit`, and `benefitCount` become `createSpan`, `deleteSpan`,
  and `spanCount`. The previously directed query renames remain `querySpan` and
  `queryPlanLine`.
- Formula, benefit, and employee are removed rather than relocated or made optional.
- Optimistic execution removes defensive validation and exception handling, while
  `DUPLICATE_SPAN` and `NOT_FOUND` remain because they describe stored state.
- E0–E3 each use a separate branch and PR. Every stage requires a committed PR
  description, a green full regression suite before push, review, green required GitHub
  checks, and merge before its successor begins.

## Tests added

None. This pull request adds planning documentation only.

## Full suite result

Command: `npm test`

```text
ℹ tests 196
ℹ suites 0
ℹ pass 196
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 770.819
```

The first sandboxed run passed 189 tests and could not bind the temporary HTTP server,
causing seven `listen EPERM` failures. Re-running the same complete suite with local
socket permission produced the green result above.

Cumulative acceptance-case behavior is unchanged by this documentation-only PR.

## Deviations from the proposal

None. The implementation plan makes the three architect rulings explicit and does not
change production code or the current specification.

## Open items resolved

- The fate of `updateBenefit`: resolved as a real `updateSpan` replacement operation.
- The remaining benefit-oriented operation and count names: resolved as span names.
- Whether optimistic execution removes `DUPLICATE_SPAN` and `NOT_FOUND`: resolved; both
  remain state outcomes.

## Follow-ups

- E0 updates every specification and design document named in the implementation plan.
- E1 removes formula, benefit, and employee from code, tests, frontend, and schema.
- E2 applies optimistic execution.
- E3 reruns the performance volumes and reconciles acceptance-case traceability.
