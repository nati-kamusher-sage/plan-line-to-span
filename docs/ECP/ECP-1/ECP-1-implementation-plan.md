# ECP-1 Implementation Plan

| Document attribute | Value |
|---|---|
| Status | E0 merged; E1 implemented on `ecp-1-e1-spans-only`; review and merge pending |
| Purpose | Apply the two ECP-1 architectural changes to the engineering specification and the code |
| Governing input | [ECP-1](ECP-1.md), as clarified 2026-08-04 |
| Predecessor | [Implementation Execution Plan](../../implementation-plan.md), Phase 1 complete (T1–T13, T8 skipped) |
| Execution model | Four sequential branches and pull requests, one each for E0–E3; every PR is regression-gated, reviewed, and merged before its successor starts |
| Repository | https://github.com/nati-kamusher-sage/plan-line-to-span |

## 1. What ECP-1 changes

**EC-1 — the utility knows only spans.** Formula, benefit, and employee are removed as
concepts entirely: not relocated, not made optional, but absent from the code, the
contract, and the specification. The R*-tree stores spans only. Terminology changes to
match: *plan line* replaces *employee*, `querySpan` replaces `queryBenefit`, and
`queryPlanLine` replaces `queryEmployee`.

**EC-2 — optimistic execution.** The application prefers performance over correctness: no
validation, no exception handling. Data is assumed correct and valid; if it is not, the
application fails.

Both are reductions. Neither adds a capability. The work is predominantly deletion, and
the main risk is deleting something a surviving path still depends on.

## 2. What EC-1 means, precisely

EC-1 as clarified is not a storage change. Removing formula from the index would be a
storage change; removing *benefit* as a concept changes what the utility is.

Today the utility is a benefit-lookup service: a benefit is the association of a span with
a formula (OC 6.6), spans identify benefits, and every query returns benefits. After
EC-1 it is a **span-matching service**: it stores spans, and answers which stored spans
apply to a given plan line. Nothing is associated with a span, so nothing is returned
beside it.

This is the correct reading of the architect's point taken to its conclusion. If the
index need not know about formula, and formula is the only thing that made a span a
"benefit," then the benefit concept has no remaining content and the utility's vocabulary
should say so.

### 2.1 Consequences to accept explicitly

These follow necessarily from EC-1. They are listed so they are accepted deliberately
rather than discovered during implementation.

**The response payloads shrink to spans.** `createBenefit` returned
`{ benefit: { span, formula } }`; `createSpan` returns `{ span }`. A successful
`updateSpan` likewise returns `{ span }` for the replacement. `queryEmployee` returned
`matches: [{ span, formula }]`; `queryPlanLine` returns `matches: [span]`.

**`AC-BEN-11` is retired, not reworded.** It asserts that a submitted formula is returned
structurally identical, with no interpretation or transformation. With no formula there is
nothing to preserve, and the case has no meaning under the new concept model.

**`AC-VAL-07` is retired.** It asserts `INVALID_FORMULA` for a null or oversized formula.
`INVALID_FORMULA` ceases to exist as a code. (It was already unreachable, since T8 was
skipped.)

**The remaining `AC-BEN-*` and `AC-MATCH-*` cases survive but change shape.** Their
assertions about *which* spans are returned are unaffected — that is the matching
semantics EC-1 preserves. Only the formula half of each expected result drops away. They
are renamed `AC-SPAN-*` and keep their numbering so traceability to the OC survives.

**Update replaces one span with another.** `updateBenefit` becomes `updateSpan`. Its
payload is `{ span, replacementSpan }`: `span` identifies the stored span to remove and
`replacementSpan` is the new span to create. A missing source returns `NOT_FOUND`; a
replacement occupied by a different stored span returns `DUPLICATE_SPAN`. Both state
conditions are checked before mutation. Success returns `{ span: replacementSpan }` and
leaves the count unchanged. This is a real replacement operation, not a no-op.

**All operation and count names follow the concept change.** In addition to the specified
`queryBenefit`→`querySpan` and `queryEmployee`→`queryPlanLine`, the E0 ruling is
`createBenefit`→`createSpan`, `updateBenefit`→`updateSpan`,
`deleteBenefit`→`deleteSpan`, and `benefitCount`→`spanCount`.

### 2.2 Scale

The concepts are pervasive, so this is a wide rename rather than a local edit:

| Term | Hits in `src`+`test`+`frontend` | Hits in `docs` |
|---|---|---|
| benefit | 359 | 465 |
| formula | 140 | 220 |
| employee | 50 | 174 |

`BenefitStore` becomes `SpanStore`; `IndexedBenefit` disappears in favor of
`CanonicalSpan`; `benefit-operations.test.ts` becomes `span-operations.test.ts`. The
mechanical scale is the reason E1 is split from E2 in the task sequence: a rename this
broad landing at the same time as EC-2's deletions would make review impossible.

## 3. What EC-2 means, precisely

Taken to its limit, EC-2 deletes the error half of the interface contract: nine error
codes (`src/dispatch/response.ts:17`), the error envelope (IC 6), and roughly twenty
acceptance cases that assert specific codes.

The selected reading and the rejected alternative are retained here for decision
traceability:

| Reading | What it means | Effect |
|---|---|---|
| **E1 (selected)** | Keep the structural request boundary needed to select a typed operation. Remove semantic checks, internal invariant assertions, re-validation of program-produced values, and catch/translate layers. Keep genuine state behavior — `DUPLICATE_SPAN`, `NOT_FOUND`, `INVALID_STATE`. | Four declared codes remain including `MALFORMED_REQUEST`; 39 cases are active and 9 are retired. |
| E2 | Remove all validation and exception handling, including duplicate and not-found detection. Errors become crashes. | IC 6 collapses. `querySpan` on a missing span returns undefined or throws uncaught; create-over-existing silently corrupts. ~20 cases retired. |

**E0 ruling: use E1.** `DUPLICATE_SPAN` and `NOT_FOUND` are not validation of input
correctness — they answer questions the caller legitimately asks about state, and OC 6.6's
"at most one span" is an invariant the index depends on. Under EC-1 this matters more, not
less: with formula gone, the span *is* the entire stored object, so duplicate detection is
the only thing preventing the store from silently accumulating identical entries.

**This plan assumes E1.** Under E2, section 4.2 becomes "delete the error path" and the
acceptance catalogue is reopened.

T8 (the validation pipeline) was skipped in Phase 1, so `FormulaValidator` never existed
and `INVALID_FORMULA` has always been unreachable. EC-1 removes the code entirely and EC-2
makes the skip permanent — E0 records that as a decision rather than leaving it an open
Phase 1 item.

## 4. Code changes

Answering ECP-1 question 2.

### 4.1 EC-1 — spans only, and the rename

| File | Change |
|---|---|
| `src/store/index-adapter.ts` | `IndexedBenefit` is deleted; the tree becomes `RTree<CanonicalSpan>`. `insert(span, formula)` → `insert(span)`. `IndexPort` narrows accordingly: `findExact` and `searchMatching` return spans. |
| `src/store/benefit-store.ts` | Renamed `src/store/span-store.ts`; `BenefitStore` → `SpanStore`. `create(span, formula)` → `create(span)`; `update(span, formula)` → `update(span, replacementSpan)`, implemented as removal of the source followed by creation of the replacement after both state checks; `exact`/`match` return spans. `DuplicateSpanError` and `SpanNotFoundError` (renamed from `BenefitNotFoundError`) survive under E1. |
| `src/dispatch/operation-dispatcher.ts` | The largest single file change (49 hits). Handlers renamed to `handleCreateSpan`, `handleUpdateSpan`, `handleDeleteSpan`, `handleQuerySpan`, `handleQueryPlanLine`. Response construction drops `formula` and the `benefit` wrapper. An update returns the replacement span. `benefitCount` → `spanCount`. |
| `src/dispatch/response.ts` | Operation union renamed, including `updateSpan`; `INVALID_FORMULA` removed from the error-code union. |
| `src/transport/request-parser.ts` | `BenefitPayload` is replaced by span-only payloads. Create, delete, and exact query carry `{ span }`; update carries `{ span, replacementSpan }`. The DEC-28/DEC-42 comments about never judging `formula` are deleted with the concept. |
| `docs/schemas/plan-line-to-span-v1.schema.json` | Operation enums renamed; `benefitData`/`employeeData`/`employeePayload` `$defs` renamed and their `formula` properties removed. The schema is compiled at runtime (DEC-40), so this is a code change, not only a document change. |
| `src/observability/log-record.ts` | `INVALID_FORMULA` removed from both code lists. The privacy comment's mention of formula goes. |
| `src/model/span.ts`, `src/index/rtree.ts` | Comment-level only. `RTree` is generic over its payload and never referenced formula. |
| `frontend/index.html`, `frontend/app.js` | Formula input removed; labels and operation names follow the rename. |
| `test/**` | All contract, unit, and property tests follow. `benefit-operations.test.ts` → `span-operations.test.ts`; `test/support/d1.ts` fixtures drop formulas. |
| `test/performance/volumes.ts`, `growth-harness.ts` | Fixtures drop formulas. Volume span counts must stay identical, or T12's numbers are not comparable. |

### 4.2 EC-2 — optimistic execution

| File | Change |
|---|---|
| `src/model/span.ts` | `resolveSpan`'s `UnknownDimensionError`/`UnknownDimensionValueError` checks (lines 97–98) are defensive validation and are removed per the settled optimistic posture. |
| `src/model/dimension-model.ts` | Builder validation — format, duplicate ids, dangling parents, cycle detection with a step budget — is what EC-2 targets. Cycle-detection removal has a non-obvious cost: a cyclic definition becomes an infinite loop rather than an error (ER-3). |
| `src/dispatch/operation-dispatcher.ts` | The seven try/catch blocks collapse. `mapBenefitError` shrinks to the surviving codes and is renamed. |
| `src/index/rtree.ts` | The `TypeError` guards on axis count and box arity (lines 81, 104) and the DEC-17 split assertion (line 264) are internal invariant checks on data the utility controls. Removed. |
| `src/observability/log-record.ts` | Field validators (lines 68, 75, 101) validate values the emitter itself constructs. Removed. |
| `src/transport/request-parser.ts` | Under E1 the schema check stays — it is the trust boundary, the one place data genuinely arrives untrusted. Under E2 it goes, and `ajv` leaves the dependency list. |
| `src/observability/observability-emitter.ts` | The emission try/catch (line 71) is removed. A sink failure may propagate after domain work completes; the target contract no longer promises isolation. |

### 4.3 Resolved optimistic boundary

`resolveSpan`'s unknown-dimension and unknown-dimension-value checks sit exactly on the
line EC-2 draws. They are validation, so they are removed. This follows from the settled
optimistic posture and is not a fourth E0 ruling.

Removing them means `{department: "NoSuchValue"}` silently produces a span matching
nothing, rather than returning `UNKNOWN_DIMENSION_VALUE`. This is called out because it is
the change with the most visible behavioral consequence.

## 5. Documents to be updated

Answering ECP-1 question 1.

| Document | Change | Driver |
|---|---|---|
| `docs/operational-concept.md` | The deepest edit. **OC 6.5 (Formula) and 6.6 (Benefit) are deleted outright**; 6.4's "global benefit" becomes "global span". OC 1 and 3 restate the purpose as span matching, not benefit lookup. OC 9 matching semantics keeps its rules and drops formula from every result description. OC 10–12 operation tables and workflows renamed. OC 13 data contracts. OC 14 rewritten around the optimistic posture. OC 15 states the performance-over-correctness trade. OC 16 records EC-1 and EC-2. OC 18 glossary loses three terms and gains *plan line*. | EC-1, EC-2 |
| `docs/interface-contract.md` | **IC 3.2 (Formula) deleted.** IC 4 operations renamed with examples rewritten; `updateSpan` documents `{ span, replacementSpan }` plus its `NOT_FOUND` and `DUPLICATE_SPAN` outcomes. IC 5 success-response table loses the `benefit` wrapper. IC 6 error codes reduce to the E1-surviving set. IC 6.1 state table keeps its shape with renamed operations. IC 7 states that only envelope structure is checked. IC 8 compatibility: this is a breaking change to `plan-line-to-span/v1`. | EC-1, EC-2 |
| `docs/schemas/plan-line-to-span-v1.schema.json` | Deferred to E1 because it is executable and compiled by the Phase 1 runtime. E1 changes schema, parser, dispatcher, and tests atomically. | EC-1 |
| `docs/acceptance-cases.md` | `AC-BEN-01` through `-10` → `AC-SPAN-*`; 39 active cases are reshaped and 9 retired identifiers remain with reasons. | EC-1, EC-2 |
| `docs/design/dt-1-architectural-context.md` | Retains runtime/topology; removes the semantic validation chain and revises result/exception principles. | EC-1, EC-2 |
| `docs/design/dt-2a-index-library-evaluation.md` | Keeps the direct-index decision; updates stored-count and query vocabulary. | EC-1 |
| `docs/design/dt-4-component-structure.md` | Section 3 responsibilities and section 4 error-code ownership; `BenefitStore` → `SpanStore` throughout. Amend DEC-31. | EC-1 |
| `docs/design/dt-6-validation-and-errors.md` | Most affected design record. Its pipeline, precedence argument, and DEC-40 to DEC-44 are largely superseded — DEC-42 (the schema not constraining `formula`) becomes vacuous. Rewrite as the optimistic-execution record rather than deleting, so the history of why validation existed survives. | EC-2 |
| `docs/design/dt-2-dimension-to-axis-mapping.md` | DEC-24 (identity by canonical key) is simplified, not changed: the canonical key is now the whole stored object. | EC-1 |
| `docs/design/dt-3-empty-span-representation.md` | "Global benefit" → "global span" throughout; the representation decisions themselves stand. | EC-1 |
| `docs/design/dt-5-lifecycle.md` | Retains state gating; removes invalid-input failure guarantees and rewrites mutation isolation for span replacement. | EC-1, EC-2 |
| `docs/design/dt-9-test-approach.md` | Records the validation-pipeline promotion as retired by ECP-1. | EC-2 |
| `docs/design/dt-7-performance-evaluation.md` | Method unchanged. Note that T12's numbers were measured with formula-carrying entries, so the re-run is a comparison point, not a new threshold. | EC-1 |
| `docs/design/dt-8-observability.md` | Renames fields/operations and removes sink-failure isolation and defensive record validation. | EC-1, EC-2 |
| `docs/design/dt-10-design-review.md` | Re-reviews cross-record consistency and records 39 active/9 retired cases. | EC-1, EC-2 |
| `docs/observability-contract.md` | Check and likely light edit: it forbids formula in log records, and that prohibition becomes vacuous. Obs 3/4 `benefitCount` field renamed. | EC-1 |
| `docs/implementation-plan.md` | Closing note that Phase 1 is superseded in these respects, pointing here. T8 formally retired. | EC-1, EC-2 |

## 6. Task sequence

Answering ECP-1 question 3. Each task is one session, one branch, and one pull request,
following the Phase 1 workflow in `docs/implementation-plan.md` section 3.1.

```
E0  rulings + specification update      docs + transition assertion
E1  spans only, and the rename          EC-1
E2  optimistic execution                EC-2
E3  re-measure and reconcile            evidence
```

### 6.1 Pull-request gate for every stage

E0, E1, E2, and E3 are delivered as four separate pull requests. For each stage:

1. Branch from the merged `main` produced by the preceding stage. E0 branches from the
   current `main`; no later stage begins before its predecessor is merged.
2. Implement only that stage's scope and add or update its regression coverage.
3. Run the complete regression suite locally. The branch must be green before it is
   pushed; a stage-specific test alone is not sufficient.
4. Write and commit `docs/pull-requests/<stage>-<short-slug>.md` with the implementation
   summary, decisions, deviations, and actual test output. This committed file is the
   pull-request description.
5. Push the branch to GitHub, then create the pull request with `gh pr create`, using the
   committed stage description as the PR body via `--body-file`.
6. Use `gh` to inspect review status and checks. Address review findings on the same
   branch and rerun the complete regression suite after changes.
7. Before merge, confirm both the latest local regression run and required GitHub checks
   are green. Merge through `gh` only after review approval.
8. Confirm the merge completed and `main` is green before starting the next stage.

A red regression run or required GitHub check blocks push or merge, respectively. Test
failures are fixed within the current stage; they are not deferred to a later ECP pull
request.

### E0 — settle the rulings, then update the specification

The three rulings were settled on 2026-08-04: update becomes span replacement, all
remaining benefit operation/count names become span names, and the E1 reading of
optimistic execution retains `DUPLICATE_SPAN` and `NOT_FOUND`.

Then apply every prose-document change in section 5 in one pass, so the specification is
coherent before code moves against it. The executable JSON Schema is deliberately part of
E1 rather than E0 because changing it alone would break the Phase 1 runtime. E0 makes the
interface-example unit test transition-aware: it checks target JSON and operation shapes
without asking the old parser to accept them. E1 restores parser/schema validation after
both move together.

**Done when:** the settled rulings are reflected consistently, every prose document in
section 5 is updated, the schema deferral is explicit, all 9 retired cases have reasons,
and the 39-case active count is stated explicitly.

### E1 — spans only, and the rename

Section 4.1, code and tests together. Sequenced before E2 deliberately: while EC-2's
checks still exist, a mistake in a rename this broad surfaces as a loud failure rather
than as silently wrong output (ER-1).

Land the concept removal and the rename in one task rather than two. Separating them would
mean an intermediate state with `BenefitStore` storing no benefit — more churn and a
larger total diff than doing both at once.

**Done when:** no occurrence of formula, benefit, or employee remains in `src/`, `test/`,
`frontend/`, or the schema; `updateSpan` replaces the source span with the requested
replacement; the interface examples again validate through the real parser/schema; the
suite passes; and the surviving matching cases assert the same span sets as before.

### E2 — optimistic execution

Section 4.2, including the resolved 4.3 outcome.

**Done when:** the removals are applied, the surviving suite passes, and every retired
test is listed in the PR with its case id — deleted deliberately, not quietly dropped.

### E3 — re-measure and reconcile

Re-run `npm run performance`. EC-1 removes a payload from every index entry and EC-2
removes per-operation checks; both should help, but the point is evidence, not assumption.

**Done when:** the DT-7 volumes have run against the changed code, the numbers are
recorded beside T12's, and `docs/implementation/task-coverage-check.mjs` is reconciled
against the renamed and reduced catalogue.

## 7. What this plan does not do

It does not restore T8. EC-1 removes `INVALID_FORMULA` and EC-2 makes the skipped
validation pipeline permanent.

It does not re-open the index algorithm. EC-1 changes what the tree stores, not how it
splits or searches. DT-2a parameters stand; only DEC-17's defensive zero-axis assertion
is superseded by optimistic execution.

It does not preserve Phase 1 draft compatibility. The contract changes incompatibly —
operations renamed and payloads reshaped — but E0 rules that the unreleased draft is
revised in place as `plan-line-to-span/v1` rather than introducing `/v2`.

It gives no effort estimates, for the same reason Phase 1 gave none.

## 8. Risks

| ID | Risk | Mitigation |
|---|---|---|
| ER-1 | EC-2 removes the checks that make defects loud, so a defect introduced by EC-1's rename surfaces as wrong output rather than an error. | E1 lands before E2, while the checks still exist. |
| ER-2 | A rename across ~500 code sites and ~850 document mentions silently changes behavior somewhere — a renamed field that no longer matches a schema key, or a test fixture whose meaning shifts. | The suite is the gate; E1's done-condition requires the surviving matching cases to assert the same span sets as before, which a rename must not alter. |
| ER-3 | Cycle-detection removal turns a malformed dimension definition into a hang rather than an error. | Explicitly accepted in E0 as caller-owned under optimistic execution; E2 removes the guard and records the consequence. |
| ER-4 | The regression suite shrinks, so it detects less. | Every retired test is named in its PR with its case id, so the loss is visible rather than inferred from a falling count. |
| ER-5 | A downstream consumer may have assumed the Phase 1 result payload. | E0 resolves the product surface as span matching only and marks Phase 1 compatibility intentionally unsupported. |
