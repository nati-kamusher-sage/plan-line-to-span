# E3: re-measure and reconcile

| Attribute | Value |
|---|---|
| Task | E3 of the [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Branch | `ecp-1-e3-measure-reconcile` |
| Governing proposal | [ECP-1](../ECP/ECP-1/ECP-1.md) |
| Predecessor | E2 optimistic-execution PR #19, merged |
| Scope | Re-measure DT-7, reconcile acceptance coverage, and publish the final repository status |

## What this changes

Closes ECP-1 with evidence rather than another runtime change. The deterministic DT-7
harness was rerun against the spans-only, optimistic implementation and recorded beside
the Phase 1 result. The coverage checker now distinguishes the 39 active cases from the
9 deliberately retired lineages while proving that all 48 historical identifiers are
accounted for exactly once.

The README now describes the current span-only problem, six-operation interface,
optimistic contract boundary, project status, and verification commands instead of the
superseded formula/benefit/employee model.

## Performance result

Command: `npm run performance`

| Volume | Operation | Phase 1 N→8N | Phase 1 ratio | ECP-1 N→8N | ECP-1 ratio |
|---|---|---:|---:|---:|---:|
| V1 minimal | `queryPlanLine` | 13→35 | 2.69 | 13→35 | 2.69 |
| V1 minimal | `querySpan` | 13→35 | 2.69 | 13→35 | 2.69 |
| V2 nominal | `queryPlanLine` | 29→62 | 2.14 | 29→62 | 2.14 |
| V2 nominal | `querySpan` | 29→62 | 2.14 | 29→62 | 2.14 |
| V3 wide | `queryPlanLine` | 44→54 | 1.23 | 44→54 | 1.23 |
| V3 wide | `querySpan` | 44→54 | 1.23 | 44→54 | 1.23 |
| V4 deep | `queryPlanLine` | 45→51 | 1.13 | 45→51 | 1.13 |
| V4 deep | `querySpan` | 45→51 | 1.13 | 45→51 | 1.13 |

All eight real checks remain sublinear under the `< 4` threshold. The V2 naive-scan
control measured 500→4,000 comparisons, ratio 8.00, and correctly failed.

The identical Phase 1 and ECP-1 counts are expected: comparison counts measure R\*-tree
box traversal, while E1/E2 removed stored payload and work outside traversal without
changing tree geometry or search. The result proves there is no pruning regression; it
does not claim unchanged payload size or total latency.

## Coverage reconciliation

Command: `node docs/implementation/task-coverage-check.mjs`

```text
active ECP-1 cases       39/39
retired Phase 1 lineages  9/9
catalogue total          48/48
duplicates: none
missing   : none
invented  : none
ECP-1 coverage allocation reconciled: 39 active and 9 retired, all 48 exactly once
```

The checker parses active and retired catalog sections independently, allocates active
cases by current capability, and records retirement ownership as E1 concept removal or
E2 optimistic execution. A count drift, duplicate allocation, missing catalog ID, or
invented ID now fails the command.

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
ℹ duration_ms 749.5895
```

The suite includes type checking, unit, contract, property, static, observability, and
real-socket HTTP tests.

## Additional audits

```text
formula/benefit/employee in src/test/frontend/schema: none
git diff --check: clean
```

## Deviations

No deviation from the approved E3 scope. Mutation-path comparison instrumentation
remains the deliberate gap already recorded by T12; E3 reruns the comparable query-path
volumes and does not reopen the index algorithm.

## Follow-up

None. Merging this PR completes the four-stage ECP-1 implementation sequence.
