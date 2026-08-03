# DT-10: Preliminary Design Consolidation and Review

| Document attribute | Value |
|---|---|
| Status | Approved 2026-07-31 |
| Design task | DT-10 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Review date | 2026-07-31 |
| Reviewer role | Independent review, in the form used for WP-7 |
| Documents reviewed | DT-1 through DT-9 and their fourteen prototypes |
| Prototype | [mechanical checks](prototypes/dt-10-design-review.mjs) |

## 1. Method

The review follows WP-7's method deliberately, because that method caught four contradictions careful reading had missed. Checks are split into those **demonstrated by execution** and those that rest on **reading**, and the distinction is stated rather than blurred.

Seven mechanical checks run over the whole design set: decision-record integrity, error-code ownership, acceptance-case coverage, risk retirement, task completeness, cross-document reference integrity, and open-item ownership. All prototypes are re-runnable with `npm run prototypes`.

## 2. The consolidated design

| Task | Decides | Record |
|---|---|---|
| DT-1 | Node with TypeScript; backend service with in-memory state; the pattern catalogue | [dt-1](dt-1-architectural-context.md) |
| DT-2a | No library is adaptable; implement the index, generalizing `rbush` under MIT | [dt-2a](dt-2a-index-library-evaluation.md) |
| DT-2 | Nested-interval labelling makes ancestor-or-self exactly interval containment | [dt-2](dt-2-dimension-to-axis-mapping.md) |
| DT-3 | The global benefit is an all-axis-covering box inside the index | [dt-3](dt-3-empty-span-representation.md) |
| DT-4 | Eleven components; each error code owned once; pipeline order | [dt-4](dt-4-component-structure.md) |
| DT-5 | Intake gate derived from IC 6.1; intake and completion are distinct events | [dt-5](dt-5-lifecycle.md) |
| DT-6 | Structural validation compiles the project's own schema | [dt-6](dt-6-validation-and-errors.md) |
| DT-7 | Comparison-count growth metric with a validated method | [dt-7](dt-7-performance-evaluation.md) |
| DT-8 | Closed-field log builder; privacy enforced by signature | [dt-8](dt-8-observability.md) |
| DT-9 | Three test layers; 48 cases mapped; four test-only capabilities | [dt-9](dt-9-test-approach.md) |

Sixty-five decisions are recorded, numbered sequentially without gaps or duplicates.

## 3. Mechanical check results

```
=== 1. decision-record integrity ===
pass  DEC ids sequential from 1 :: DEC-1..DEC-65
pass  no duplicate DEC ids

=== 2. every error code owned exactly once ===
pass  all 9 contract codes present
pass  each code has exactly one owning row :: all singly owned

=== 3. acceptance-case coverage ===
pass  catalogue has 48 cases
pass  DT-9 states the same count

=== 4. risks all retired ===
pass  RISK-1 / RISK-2 / RISK-3 / RISK-4 marked retired

=== 5. every design task recorded ===
pass  DT-1 through DT-10 have design records

=== 6. cross-document reference integrity ===
pass  no design doc cites a nonexistent case :: 22 distinct cases cited
pass  no design doc cites an undefined decision :: 65 distinct decisions cited

=== 7. open items have owners ===
pass  open-item tables name an owner :: 52 owned open items

all mechanical checks passed
```

Check 2 initially failed. The cause was the check itself: its column-counting regex did not account for escaped pipes inside interface signatures, so it read zero owners where there were one. The design was correct; the check was wrong. Recorded because a review that silently repairs its own tooling is not reporting honestly.

## 4. Review checklist

The plan's section 7 defined twelve items, seven mechanical and five by reading.

| # | Item | Kind | Result |
|---|---|---|---|
| 1 | Every acceptance case maps to the components that satisfy it | Mechanical | **Pass.** 48 of 48 mapped, derived from the catalogue rather than transcribed. |
| 2 | The mapping prototype produces correct results for all `AC-MATCH-*` cases | Mechanical | **Pass.** 29 of 29, plus 12,000 differential comparisons. |
| 3 | The empty-span prototype covers all `AC-GLOBAL-*` and `AC-ZERO-*` cases | Mechanical | **Pass.** 34 of 34, with two representations shown observably identical. |
| 4 | Each of the nine error codes has exactly one owning component | Mechanical | **Pass.** Verified in check 2. |
| 5 | The twelve invalid messages resolve to their documented codes | Mechanical | **Pass.** 18 of 18 against the real schema. |
| 6 | Query cost does not grow linearly with benefit count | Mechanical | **Qualified.** The method is validated against known-linear and known-sublinear implementations, but no real index exists to measure. See ISSUE-D1. |
| 7 | No log record can structurally contain a span, formula, or dimension value | Mechanical | **Pass.** Verified adversarially; the builder exposes no unbounded string field. |
| 8 | Every inherited constraint has an identified mechanism | Reading | **Pass.** Section 5. |
| 9 | Every lifecycle transition and per-state acceptance rule is realized | Reading | **Pass.** All 24 IC 6.1 cells verified in DT-5. |
| 10 | No externally observable behavior is left to implementer choice | Reading | **Pass.** One deferral is recorded and bounded; see ISSUE-D2. |
| 11 | Demo-only decisions are not presented as production-ready | Reading | **Pass.** DT-7 sets no target; DT-1 excludes persistence and scaling. |
| 12 | Every departure from a baseline expectation is recorded with rationale | Reading | **Pass.** DT-2a is the significant one. |

Eleven pass outright. Item 6 is qualified, not failed.

## 5. Inherited constraints and their mechanisms

| Constraint | Mechanism |
|---|---|
| Matching semantics (OC 9.1, 9.2) | Nested-interval containment for employee queries; canonical-key lookup for benefit queries (DT-2). |
| Span identity, one global benefit (OC 6.6) | Canonical span key; the at-most-one property follows from uniqueness (DT-3). |
| Empty span matches everything (OC 6.4) | The omitted-dimension wildcard applied to every axis (DT-3). |
| Zero-dimensional model (OC 7) | Index with zero axes; split path unreachable and asserted (DT-3). |
| Atomic reinitialization (OC 8.2, 8.3) | Candidate built before any live change; swap is one reference assignment (DT-4, DT-5). |
| Failed operations change nothing (OC 14.2, 14.3) | Validation precedes mutation; only `BenefitStore` mutates (DT-4, DT-5). |
| Serial processing (OC 16.1.14) | Single dispatcher on a single-threaded runtime; handlers never await (DT-5). |
| Nine error codes (IC 6) | One owning component each, ordered so precedence emerges (DT-4, DT-6). |
| Console JSON Lines with privacy rules (Obs) | Decorator plus closed-field builder (DT-8). |
| Index must not scan (OC 15.2) | Interval encoding supports MBR pruning; growth metric defined (DT-2, DT-7). |
| R*-tree as demonstration objective | Implemented directly, since no library supports arbitrary dimensions (DT-2a). |

## 6. Design issue register

| ID | Severity | Issue | Disposition |
|---|---|---|---|
| ISSUE-D1 | 2 | The OC 15.2 efficiency claim is designed-for but not demonstrated. No index exists to measure, so the pass condition has never been applied to real code. | **Accepted as a phase boundary.** DT-7 defines volumes, metric, and pass condition, and validates the method against known-linear and known-sublinear implementations. First execution belongs to implementation. This is the one item that cannot close before code exists. |
| ISSUE-D2 | 3 | Whether an error envelope carries a non-200 HTTP status is deferred to implementation. | **Accepted.** DT-1 DEC-4 makes `error.code` authoritative regardless, so either choice is conformant. Bounded and cannot affect contract behavior. |
| ISSUE-D3 | 3 | Four test-only seams exist in production code. | **Accepted.** Each sits at a port rather than inside an algorithm; `inject-index-failure` leaves `RTreeIndex` unaware of testing. The cost is real and recorded. |
| ISSUE-D4 | 3 | A request whose operation cannot be parsed produces no log record. | **Accepted.** DT-8 DEC-59. No operation completed, and `AC-VAL-06` already anticipated this. A production system would want a transport-level counter, which OC 3.2 excludes. |

No severity-one issue was found. ISSUE-D1 is severity two but is a phase boundary rather than a gap in the design.

## 7. Traceability

Acceptance-case families to the components that satisfy them:

| Family | Cases | Components |
|---|---:|---|
| `AC-INIT-*` | 9 | `OperationDispatcher`, `LifecycleState`, `DimensionModelBuilder` |
| `AC-BEN-*` | 11 | `BenefitStore`, `SpanResolver`, `FormulaValidator` |
| `AC-MATCH-*` | 11 | `DimensionModel`, `IndexAdapter`, `RTreeIndex` |
| `AC-GLOBAL-*`, `AC-ZERO-*` | 5 | `DimensionModel`, `BenefitStore`, `RTreeIndex` |
| `AC-VAL-*` | 7 | `RequestParser`, `SpanResolver`, `FormulaValidator`, `DimensionModelBuilder` |
| `AC-SERIAL-*` | 1 | `OperationDispatcher` |
| `AC-OBS-*` | 4 | `ObservabilityEmitter` |

All 48 accounted for. The reverse direction — component to cases — is covered by DT-9's mapping, which is derived from the catalogue and fails on drift.

## 8. Exit criteria assessment

| Criterion | Status |
|---|---|
| All ten design tasks complete or explicitly deferred with an owner | **Met.** Ten records; no task deferred. |
| RISK-1 and RISK-2 retired by working prototypes | **Met.** Both closed with executable evidence. RISK-3 and RISK-4 also retired, RISK-3 with the ISSUE-D1 qualification. |
| No severity-one or severity-two design issue remains open | **Qualified.** No severity-one. ISSUE-D1 is severity two and accepted as a phase boundary rather than resolved. |
| The section 7 checklist passes, mechanical items demonstrated | **Met for eleven of twelve;** item 6 qualified by ISSUE-D1. |
| Product owner and technical lead approve progression | **Met.** Approved 2026-07-31; see section 8.1. |

The technical criteria are met with one explicit qualification. Whether ISSUE-D1 blocks progression is an owner judgment: the alternative to accepting it is building the index during the design phase, which would make the phase boundary meaningless.

### 8.1 Approval record

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | Nati Kamusher | Approved | 2026-07-31 |
| Technical lead | Nati Kamusher | Approved | 2026-07-31 |

**ISSUE-D1 is accepted as a phase boundary and does not block progression.** The efficiency claim remains designed-for rather than demonstrated until T12 of the [Implementation Execution Plan](../implementation-plan.md) runs the DT-7 harness against the real index. If that harness fails the pass condition, the index is at fault and DEC-48 is not to be relaxed.

Preliminary design is approved. Implementation may begin.

## 9. Residual risk

Three limitations, restated so a clean checklist is not read as more than it is.

**No design has been executed.** Fourteen prototypes validate mappings, orderings, representations, and mechanisms, but none is the system. Every prototype's own limitations section says which stand-ins it used. The design is as well-evidenced as a design can be before code, which is not the same as verified.

**The efficiency claim rests on a validated method, not a measurement.** ISSUE-D1. The method demonstrably distinguishes linear from sub-linear behavior, so it will detect a failure — but it has not yet been pointed at the thing it exists to judge.

**Authorship independence remains unaddressed.** This was recorded in the WP-7 readiness review and in the design plan's section 10, and it is still true: every baseline document, every design record, and this review were produced within a single authorship chain. The mechanical checks caught defects in that chain's own work — a wrong DT-5 transition function, a wrong DT-2 test expectation, and a wrong check in this review — which is evidence the method has some self-correcting power, not that it substitutes for an outside reader. This remains the weakest point in the process and is a staffing decision.

## 10. Recommendation

Preliminary design is complete. The three structural unknowns that motivated the phase are retired with executable evidence, sixty-five decisions are recorded with rationale, all 48 acceptance cases have owning components and mapped tests, and the four open issues are bounded and accepted.

Recommend progression to detailed design and implementation, with two conditions:

1. The DT-7 harness runs against the real index as soon as one exists, closing ISSUE-D1. If it fails the pass condition, the index is at fault, not the threshold.
2. An implementation increment order that front-loads risk: the index and mapping first, since they carry the retired-but-unexecuted risks, then the dispatcher and validation, then observability, then the frontend.
