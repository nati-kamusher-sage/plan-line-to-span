# E0: ECP-1 specification update

| Attribute | Value |
|---|---|
| Task | E0 of the [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Branch | `ecp-1-e0-specification` |
| Governing proposal | [ECP-1](../ECP/ECP-1/ECP-1.md) |
| Design records | DT-1 through DT-10, revised for ECP-1 |
| Decisions implemented | E0 rulings; DEC-66 through DEC-70; Phase 1 decision dispositions recorded in each DT |
| Acceptance catalogue | 39 active cases, 9 retired cases, 48 historical case lineages total |

## What this changes

Makes the engineering specification describe a span-matching utility. The target stores
canonical spans directly, accepts plan lines as match queries, replaces one span with
another through `updateSpan`, and removes semantic validation and exception translation
while retaining the structural request boundary and declared lifecycle/stored-state
outcomes.

This PR changes no production implementation. E1 applies the spans-only contract to code,
schema, tests, and frontend; E2 applies optimistic execution; E3 re-measures and
reconciles mechanical traceability.

## E0 rulings realized

- `updateBenefit` becomes `updateSpan({span, replacementSpan})`. A missing source returns
  `NOT_FOUND`; a replacement occupied by another stored span returns `DUPLICATE_SPAN`.
  Both are checked before source removal. Same-identity replacement succeeds.
- Remaining operation/count names become `createSpan`, `deleteSpan`, and `spanCount`;
  query names are `querySpan` and `queryPlanLine`.
- `DUPLICATE_SPAN` and `NOT_FOUND` remain stored-state outcomes.
- E0 also makes two consequences explicit: `INVALID_STATE` and the structural
  `MALFORMED_REQUEST` boundary remain, and the unreleased draft contract is revised in
  place as `plan-line-to-span/v1` rather than introducing `/v2`.

## Specification and design updates

- Rewrote the operational concept around dimension definitions, spans, plan lines,
  exact identity, hierarchical matching, span replacement, and optimistic execution.
- Rewrote the interface contract with six target operations, direct span response
  payloads, `matches: [span]`, four declared codes, update precedence, and the explicit
  E0-to-E1 schema transition.
- Reconciled the acceptance catalogue to 39 active and 9 retired cases. Active
  `AC-BEN-01` through `-10` become `AC-SPAN-01` through `-10`; the nine retired IDs remain
  visible with reasons.
- Rewrote the observability contract for renamed operations, `spanCount`, bounded state
  codes, direct-span privacy, and propagating sink failures.
- Revised DT-1 through DT-10. Geometry and index selection remain; components,
  lifecycle, validation/error posture, logging, performance vocabulary, and test mapping
  now match ECP-1.
- Marked the preliminary design plan and Phase 1 readiness review as historical and
  added the ECP-1 supersession note to the Phase 1 implementation plan.

## Acceptance-case reconciliation

```text
active rows   39
retired rows   9
total         48
```

Retired:

- `AC-INIT-02`, `AC-INIT-05`: controlled semantic dimension-definition failures.
- `AC-INIT-09`: exception-to-`INDEX_FAILURE` translation and rollback guarantee.
- `AC-BEN-11`: preservation of a removed payload concept.
- `AC-VAL-01`, `AC-VAL-02`: unknown dimension/value checks.
- `AC-VAL-04`, `AC-VAL-05`: dangling-parent and cycle checks.
- `AC-VAL-07`: validation of a removed payload concept.

## Executable-schema transition

The JSON Schema is compiled by the current runtime. Updating it in docs-first E0 would
make the Phase 1 parser and full regression suite fail before E1 exists. Therefore:

- E0 prose is the target authority.
- The executable schema stays Phase 1-shaped in this PR.
- The interface-example test verifies valid target JSON and the exact six target
  operation shapes, guarded by an explicit E1-transition status marker.
- E1 changes schema, parser, dispatcher, responses, and tests together, removes the
  marker, and restores validation of every example through the real parser/schema.

## Tests changed

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/request-parser.test.ts` interface examples | Transitional documentation assertion | Exactly eight examples remain; six requests are valid JSON with the exact ECP-1 operation vocabulary; the two response examples carry success/failure envelope shapes. The rest of the file continues testing the Phase 1 parser until E1. |

No production code or executable schema changed.

## Documentation checks

```text
acceptance rows: 39 active, 9 retired
valid JSON fences: 12
relative Markdown links resolve in 20 E0 documents
git diff --check: clean
```

The existing implementation coverage checker remains Phase 1-shaped by plan and is
reconciled after E1/E2 in E3.

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
ℹ duration_ms 932.547
```

The suite includes type checking, unit, contract, property, static, observability, and
real-socket HTTP tests. Phase 1 runtime behavior remains green; E0 changes the target
specification, not current production behavior.

## Deviations and plan refinements

The initial E0 label said “docs only.” A pre-push regression run correctly failed one
documentation-example assertion because the new interface examples cannot pass through
the intentionally old parser/schema. Rather than change executable production behavior
early or leave the branch red, E0 adds the bounded transition assertion described above.
The implementation plan now labels E0 “docs + transition assertion” and assigns restoration
of parser/schema example validation to E1.

No other deviation from the approved ECP-1 plan.

## Open items resolved

- Exact update request, precedence, success payload, and same-identity behavior.
- Complete operation/count naming.
- Retained state outcomes versus removed semantic/internal errors.
- Active and retired acceptance-case counts.
- Draft contract version treatment: revise `v1` in place.
- Executable schema sequencing: update atomically in E1.
- Optimistic implications for invalid hierarchy cycles, unexpected index failures, and
  observability sink failures.

## Follow-ups

- E1 implements direct span storage and the complete operation/payload rename, updates
  schema and frontend, reshapes tests, and restores example validation through the parser.
- E2 removes semantic guards, defensive assertions, runtime record validators, and
  catch/translate layers; its PR lists every retired test ID.
- E3 reruns DT-7 performance volumes and reconciles the coverage checker with 39 active
  and 9 retired cases.
