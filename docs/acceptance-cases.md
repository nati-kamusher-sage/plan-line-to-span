# Plan Line to Span Acceptance Cases

| Catalog attribute | Value |
|---|---|
| Version | ECP-1 target for `v1` |
| Status | 39 active, 9 retired; implementation follows in E1/E2 |
| Governing behavior | [Operational Concept](operational-concept.md) |
| Interface messages | [Interface Contract](interface-contract.md) |
| Observable output | [Observability Contract](observability-contract.md) |

## 1. Test conventions

Unless stated otherwise, initialize with fixture `D1` and use valid
`plan-line-to-span/v1` envelopes. `S({...})` denotes one stored span.

`D1` has `location` and `department`. Location keys are `4` (USA), `20` (New
York City, parent `4`), `21` (Los Angeles, parent `4`), `22` (Manhattan, parent
`20`), and `30` (Brooklyn, parent `20`). Department keys are `rnd` and `eng`.

Each completed contract operation produces one JSON Lines record. `log: success` means
the record carries the operation, resulting state, `spanCount`, and required
operation-specific fields. `log: failure CODE` means it carries `errorCode: CODE`, the
unchanged `spanCount`, and level `warn`.

Retired identifiers remain in section 8 so Phase 1 traceability is never silently lost.

## 2. Initialization and lifecycle

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-INIT-01 | OC 8, 10, 17 | Start Uninitialized; initialize with `D1`. | Success `{state: ready, dimensionCount: 2, spanCount: 0}`; Ready; empty index; `log: success`. |
| AC-INIT-03 | OC 8 | Place the lifecycle in Failed through the test-only state hook; initialize with `D1`. | Success; Ready; empty index; `log: success`. |
| AC-INIT-04 | OC 8, 11.1 | Ready with `S({location: 4})`; initialize valid replacement model `D1`. | Success with `spanCount: 0`; Ready; all prior spans atomically cleared; `log: success`. |
| AC-INIT-06 | OC 8, IC 6.1 | Hold initialization in progress; submit `queryPlanLine`. | `INVALID_STATE`; no state or storage change; `log: failure INVALID_STATE`. |
| AC-INIT-07 | OC 8, IC 6.1 | Start Uninitialized; submit `createSpan`. | `INVALID_STATE`; Uninitialized; empty storage; `log: failure INVALID_STATE`. |
| AC-INIT-08 | OC 8, IC 6.1 | Place lifecycle in Failed; submit `createSpan`, `querySpan`, and `queryPlanLine`. | Each returns `INVALID_STATE` with `details.state: failed`; Failed remains; only `initialize` is accepted. |

## 3. Span lifecycle and exact lookup

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-SPAN-01 | OC 10–11 | Ready; create `{location: 4}`. | Success `{span: {location: 4}}`; one stored span; `spanCount: 1`. |
| AC-SPAN-02 | OC 11.2, 14 | Ready with `S({location: 4})`; create the same canonical span. | `DUPLICATE_SPAN`; original remains; `spanCount: 1`. |
| AC-SPAN-03 | OC 9.1 | Ready with `S({location: 4})`; exact-query it. | Success returning exactly `{location: 4}`. |
| AC-SPAN-04 | OC 6.4, 9.1 | Store `{location: 4, department: rnd}`; query `{department: rnd, location: 4}`. | Success; member order does not affect identity. |
| AC-SPAN-05 | OC 9.1 | Ready with `S({location: 4})`; exact-query `{location: 20}`. | `NOT_FOUND`; hierarchy does not broaden exact lookup. |
| AC-SPAN-06 | OC 11.3, IC 6.2 | Ready with `S({location: 4})`; update it to `{location: 20}`; query both identities. | Update returns `{location: 20}`; old identity is `NOT_FOUND`; replacement query succeeds; `spanCount` remains `1`. Replacing the new span with itself also succeeds. |
| AC-SPAN-07 | OC 11.3, IC 6.2 | Ready with `S({location: 4})` and `S({location: 20})`; update the first to `{location: 20}`. | `DUPLICATE_SPAN`; both original spans remain; `spanCount: 2`. |
| AC-SPAN-08 | OC 11.4 | Ready with `S({location: 4})`; delete it; query it. | Delete succeeds, then query returns `NOT_FOUND`; storage is empty. |
| AC-SPAN-09 | OC 14 | Ready with empty index; update and delete `{location: 4}`. | Each returns `NOT_FOUND`; storage remains empty. |
| AC-SPAN-10 | OC 14, IC 6.2 | Ready with `S({location: 4})`; attempt duplicate create, update from an absent source, update to an occupied identity, and absent delete. | Each returns its declared state code; after each, exact query confirms the original stored set is unchanged. |

## 4. Plan-line matching

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-MATCH-01 | OC 9.2 | Store `S({location: 20})`; query plan line `{location: 20}`. | `matches` is exactly `[{location: 20}]`; `matchCount: 1`. |
| AC-MATCH-02 | OC 6.2, 9.2 | Store `S({location: 4})`; query `{location: 20}`. | Stored ancestor span matches; `matchCount: 1`. |
| AC-MATCH-03 | OC 6.2, 9.2 | Store `S({location: 4})`; query `{location: 22}`. | Multi-level ancestor match across `4` → `20` → `22`; `matchCount: 1`. |
| AC-MATCH-04 | OC 9.2 | Store `S({location: 22})`; query `{location: 4}`. | `{matches: []}`; a child constraint does not match a parent value. |
| AC-MATCH-05 | OC 9.2 | Store `S({location: 4})`; query `{location: 20, department: rnd}`. | Plan-line-only dimension does not prevent match; `matchCount: 1`. |
| AC-MATCH-06 | OC 9.2 | Store `S({location: 4, department: rnd})`; query `{location: 20}`. | `{matches: []}`; required plan-line dimension is missing. |
| AC-MATCH-07 | OC 9.2 | Store `S({location: 4, department: rnd})`; query `{location: 20, department: eng}`. | `{matches: []}`; constraints use AND semantics. |
| AC-MATCH-08 | OC 9.2, 14 | Ready with no applicable spans; query a valid plan line. | Success `{matches: []}`, not `NOT_FOUND`; `matchCount: 0`. |
| AC-MATCH-09 | OC 15.4 | Store several spans matching one plan line; query twice and compare sets. | Both responses contain the same complete set; order is not asserted. |
| AC-MATCH-10 | OC 12 | Store `S1({location: 4})`, `S2({location: 4, department: rnd})`, `S3({location: 20})`, and `S4({location: 4, department: eng})`; query `{location: 20, department: rnd}`. | `matches` is exactly `{S1,S2,S3}` as a set; `matchCount: 3`. |
| AC-MATCH-11 | OC 12 | From AC-MATCH-10, query `{location: 21, department: rnd}`, then `{location: 21, department: eng}`, then `{location: 4}`. | Results are exactly `{S1,S2}`, `{S1,S4}`, and `{S1}`; counts are `2`, `2`, and `1`. |

## 5. Empty spans and zero-dimensional models

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-GLOBAL-01 | OC 6.4, 9.2 | Create `S({})`; query `{location: 20}`. | Create succeeds; result contains `{}`; `matchCount: 1`. |
| AC-GLOBAL-02 | OC 6.4, 9.2 | Ready with `S({})`; query plan line `{}`. | Result contains `{}`; `matchCount: 1`. |
| AC-GLOBAL-03 | OC 6.4, 14 | Ready with `S({})`; create `{}` again. | `DUPLICATE_SPAN`; one global span remains. |
| AC-GLOBAL-04 | OC 11.3–11.4 | Ready with `S({})`; exact-query it; update `{}` to `{location: 4}`; query both; delete replacement; query again. | Initial query returns `{}`; update returns replacement; old identity is `NOT_FOUND`; replacement query and delete succeed; final query is `NOT_FOUND`. |
| AC-ZERO-01 | OC 7, 16 | Initialize `{format: plan-line-to-span-dimensions/v1, dimensions: []}`; create `S({})`; query plan line `{}`. | Initialization, create, and query succeed; `dimensionCount: 0`, `spanCount: 1`, `matchCount: 1`. |

## 6. Structural boundary and serial processing

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-VAL-03 | IC 2, 7 | Ready; send raw JSON containing duplicate `location` members in `span`. | `MALFORMED_REQUEST`; storage unchanged. |
| AC-VAL-06 | IC 2, 7 | Ready; submit a request missing `payload` or containing an undeclared field. | `MALFORMED_REQUEST`; state and storage unchanged. |
| AC-SERIAL-01 | OC 8, 15.2 | Ready; submit accepted create `S({location: 4})`, then exact query in that order. | Create response precedes query processing; query returns the span; success logs have increasing `sequence`. |

## 7. Observability and privacy

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-OBS-01 | Observability Contract 2–6 | Perform successful create, one-match plan-line query, and delete. | Three valid JSON Lines records with correct operation/outcome and non-negative duration; query record has `matchCount: 1`. |
| AC-OBS-02 | Observability Contract 4, 6 | Ready with one span; submit a duplicate create and an absent delete. | Two `warn` records with `DUPLICATE_SPAN` and `NOT_FOUND`, no `matchCount`, and unchanged `spanCount: 1`. |
| AC-OBS-03 | Observability Contract 6 | Ready with one span; delete it; successfully reinitialize with `D1`. | Records report `spanCount: 0` after both; initialize also carries `dimensionCount: 2` and `dimensionValueCount: 7`. |
| AC-OBS-04 | Observability Contract 7 | Use span and plan-line values containing distinctive sentinel strings; capture create and plan-line-query logs. | No record contains either sentinel, any span or plan-line map, request ID, or raw dimension value. |

## 8. Retired Phase 1 cases

Retirement means the asserted behavior no longer exists in the ECP-1 target. The row
stays in the catalogue for auditability and is not counted as passing.

| Retired ID | Reason |
|---|---|
| AC-INIT-02 | Semantic rejection of a dangling hierarchy parent is removed by optimistic execution. |
| AC-INIT-05 | Controlled failed reinitialization for a hierarchy cycle is removed; invalid models are outside the contract. |
| AC-INIT-09 | Exception-to-`INDEX_FAILURE` translation and its rollback guarantee are removed. |
| AC-BEN-11 | The asserted payload concept is removed entirely; there is nothing to preserve or return. |
| AC-VAL-01 | Unknown-dimension validation is removed. |
| AC-VAL-02 | Unknown-dimension-value validation is removed. |
| AC-VAL-04 | Semantic dangling-parent validation is removed. |
| AC-VAL-05 | Semantic cycle validation is removed. |
| AC-VAL-07 | The asserted payload concept and `INVALID_FORMULA` code are removed entirely. |

## 9. Coverage statement

The catalogue retains all 48 Phase 1 case lineages: **39 active and 9 retired**. The active
set comprises 6 lifecycle cases, 10 span lifecycle/exact cases, 11 matching cases, 5
empty/zero-dimensional cases, 3 structural/serial cases, and 4 observability cases.

Active cases cover every declared ECP-1 state outcome, all state/operation gates, span
replacement precedence, exact identity, hierarchical matching, global and
zero-dimensional behavior, the structural request boundary, serial processing, and every
required log field. E1 and E2 rename or retire implementation tests to match this target;
until then, the Phase 1 regression suite remains the gate for E0.
