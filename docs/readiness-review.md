# Plan Line to Span Readiness and Consistency Review

| Document attribute | Value |
|---|---|
| Status | Historical Phase 1 review; superseded by ECP-1 |
| Purpose | Record the WP-7 readiness and consistency review of the active governing documents |
| Review date | 2026-07-31 |
| Revision | Second pass, re-run after the first pass's issues were resolved |
| Reviewer role | Independent review |
| Governing input | [Operational Concept](operational-concept.md) |
| Documents reviewed | [Operational Concept](operational-concept.md), [Interface Contract](interface-contract.md), [JSON Schema](schemas/plan-line-to-span-v1.schema.json), [Observability Contract](observability-contract.md), [Acceptance Cases](acceptance-cases.md) |

> **ECP-1 note:** The findings below describe the Phase 1 documents as they existed on
> 2026-07-31. They are retained as review evidence, not as a review of the ECP-1 target.
> The revised cross-record review is [DT-10](design/dt-10-design-review.md).

## 1. Method

The review covered the four active governing documents and the machine-readable schema. Archived reflections and operational-concept context were treated as non-normative and were checked only for the presence of a clear non-normative marker.

Three checks were mechanical rather than editorial:

1. Every fenced JSON example in the interface contract was validated against `plan-line-to-span-v1.schema.json` with a Draft 2020-12 validator.
2. Twelve constructed invalid messages, covering each documented validation and state-error category, were run against the same schema to confirm that structural rejection and semantic rejection fall where the contract assigns them.
3. The acceptance-case catalog's requirement traces were extracted and compared against the twenty operational acceptance outcomes in Operational Concept section 17.

Results appear in section 2 and the issues they raised appear in the register in section 3.

The first pass raised six issues, four of them severity two. All six were resolved and the three mechanical checks were re-run against the corrected documents. Section 3 records each issue with its resolution; section 6 records the residual risk that the re-run does not eliminate.

## 2. Review checklist

| # | Checklist item | Result | Evidence and remarks |
|---|---|---|---|
| 1 | Every concept has one authoritative definition. | Pass | Section 6 defines dimension, hierarchy, plan line, span, formula, benefit, and R*-tree; section 18 repeats them as a glossary without conflict. Document precedence is stated in section 1.1. |
| 2 | Every operation has defined preconditions, input, result, error, and state effects. | Pass | Operational Concept section 10 defines all six operations; the interface contract defines the request, success envelope, and error codes for each. |
| 3 | Every lifecycle transition is defined. | Pass | Section 8.4 now restricts `Failed` to entry from `Initializing`, states that an index error leaves the utility Ready, and the diagram carries the `Ready --> Ready` rejection edge. Interface Contract section 6.1 tabulates acceptance for all four states. Resolved ISSUE-01. |
| 4 | Every settled decision appears in the operational concept. | Pass | The sixteen decisions in section 16.1 cover every resolution recorded in WP-1 through WP-6. |
| 5 | Every interface example conforms to a schema. | Pass | All eight fenced JSON examples in the interface contract validate against the revised schema. The operational concept's snippets are conceptual payload fragments, not envelopes, and section 13 says so explicitly; they are correctly out of the schema's scope. |
| 6 | Every functional requirement has an acceptance case. | Pass | All twenty section 17 outcomes are traced across 48 cases with no duplicate identifier. `AC-MATCH-10` and `AC-MATCH-11` now cover outcome 17.5 and the section 12.2 scenario. Resolved ISSUE-02. |
| 7 | Every out-of-scope item is explicit. | Pass | Section 3.2 lists eight exclusions, including persistence, idempotency, and concurrency; the observability contract excludes external telemetry. |
| 8 | Demo-only constraints are not presented as production guarantees. | Pass | Sections 3.2, 15.2, and 16.1.15 state the demo's limits. The observability contract section 1 states that logs are not durable telemetry. |
| 9 | No externally observable behavior is left to implementation choice. | Pass | The schema no longer constrains `formula` or `format`, so the semantic codes cannot be pre-empted, and Interface Contract section 7 states the precedence. Section 6.1 defines acceptance per state. All twelve constructed invalid messages now resolve at the layer the contract assigns. Resolved ISSUE-03 and ISSUE-04. |
| 10 | No implementation-critical `TBD` remains. | Pass | The only deferred item is the performance target in section 15.2, which section 16.2 owns as non-behavioral. It does not block implementation. |

All ten items pass on the second pass. The first pass recorded seven passes and three failures yielding six issues; every one is resolved in section 3.

## 3. Open-issue register

Severity one blocks the requirements specification. Severity two must be resolved before baselining. Severity three is editorial.

No severity-one issue was found in either pass. All six issues raised by the first pass are closed.

| ID | Severity | Area | Issue | Resolution | Status |
|---|---|---|---|---|---|
| ISSUE-01 | 2 | Lifecycle | Operational Concept section 8.4 allowed `Failed` to be entered from an unrecoverable index error, but the state diagram defined no `Ready --> Failed` transition. The condition was observable through `INDEX_FAILURE` but its resulting state was undefined. | Section 8.4 now restricts `Failed` to entry from `Initializing` when no preceding valid Ready model exists, and states that an index error rejects the operation while the utility remains Ready. The diagram carries a `Ready --> Ready` rejection edge, and `AC-INIT-09` verifies it. The narrower reading was chosen because `INDEX_FAILURE` already guarantees that no partial mutation is committed, so a single failed operation has no reason to discard a valid model. | Closed |
| ISSUE-02 | 2 | Traceability | Acceptance outcome 17.5, returning Benefits 1, 2, and 3 for a New York City R&D plan line, had no acceptance case. `AC-MATCH-01` through `AC-MATCH-09` each exercised a single matching rule in isolation. | `AC-MATCH-10` loads the four section 12 benefits and asserts the exact returned set for the 17.5 plan line. `AC-MATCH-11` covers the remaining section 12.2 rows, including the case where the New York City span must not match a Los Angeles employee. | Closed |
| ISSUE-03 | 2 | Error contract | The contract assigned `INVALID_FORMULA` to `formula: null` and `INVALID_DIMENSION_DEFINITION` to an unsupported `format`, but the schema rejected both structurally, which section 6 maps to `MALFORMED_REQUEST`. A schema-first implementation returned a different code than the contract's own table required. | The schema now leaves `formula` structurally unconstrained and types `format` as a string rather than a constant, each with a comment naming the semantic code that owns the check. Interface Contract section 7 states the precedence rule in a table. Both conditions now reach semantic validation. | Closed |
| ISSUE-04 | 2 | Error contract | The `INVALID_STATE` row rejected operations whenever the utility was "uninitialized, failed, initializing, or reinitializing," with no exception for `initialize`, contradicting the retry path that section 8.4 and `AC-INIT-03` require. | New Interface Contract section 6.1 tabulates acceptance for every state and operation pair: `initialize` is accepted unless the utility is already initializing; every other operation requires `ready`. `AC-INIT-08` verifies that only `initialize` is accepted from `Failed`. | Closed |
| ISSUE-05 | 3 | Acceptance cases | The `D1` fixture defined key `21` as Manhattan, a child of `20`, while the operational concept's dimension example defined key `21` as Los Angeles, a child of `4`. | The fixture now uses `21` for Los Angeles, matching the operational concept, and introduces `22` (Manhattan) and `30` (Brooklyn) as the second hierarchy level. `AC-MATCH-03` and `AC-MATCH-04` were repointed to `22` so they still exercise multi-level ancestry. Keys `4`, `20`, and `21` now denote the same values in both documents. | Closed |
| ISSUE-06 | 3 | Observability | The observability contract required `dimensionValueCount` on a successful `initialize` record, but no acceptance case asserted it. | `AC-OBS-03` now reinitializes with `D1` and asserts `dimensionCount: 2` and `dimensionValueCount: 7`. | Closed |

## 4. Initial requirements traceability matrix

The matrix traces each operational acceptance outcome to its governing behavior and its verifying cases. It is the input to the WP-8 bidirectional matrix, which will add `SCOPE-*` through `AC-*` requirement identifiers.

| Outcome | Governing behavior | Verifying acceptance cases |
|---|---|---|
| 17.1 Load a valid file and enter Ready | OC 8.2, 8.3, 11.1 | AC-INIT-01 |
| 17.2 Reject an invalid hierarchy | OC 8.2, 14.1 | AC-INIT-02, AC-VAL-04, AC-VAL-05 |
| 17.3 Create the example benefits | OC 10, 11.2 | AC-BEN-01 |
| 17.4 Exact benefit query returns one benefit | OC 9.1, 11.5 | AC-BEN-03, AC-BEN-04 |
| 17.5 Multi-benefit employee query | OC 9.2, 12.2 | AC-MATCH-10, AC-MATCH-11 |
| 17.6 Update shows the new formula | OC 11.3 | AC-BEN-06 |
| 17.7 Delete removes from both queries | OC 11.4 | AC-BEN-08 |
| 17.8 Empty collection for no matches | OC 14.3 | AC-MATCH-08 |
| 17.9 Not found for an absent exact span | OC 9.1, 14.3 | AC-BEN-05, AC-BEN-09 |
| 17.10 Formulas preserved unchanged | OC 6.5 | AC-BEN-11 |
| 17.11 Reject operations during initialization | OC 8.2, 14.2 | AC-INIT-06 |
| 17.12 Failed after invalid first init, then Ready | OC 8.4 | AC-INIT-02, AC-INIT-03, AC-INIT-08 |
| 17.13 Reinitialization clears benefits atomically | OC 8.3 | AC-INIT-04 |
| 17.14 Failed reinitialization preserves state | OC 8.3 | AC-INIT-05 |
| 17.15 Reject a duplicate canonical span | OC 6.6, 14.2 | AC-BEN-02, AC-GLOBAL-03 |
| 17.16 Complete formula replacement | OC 11.3 | AC-BEN-06 |
| 17.17 Reject a span change through update | OC 11.3, 14.2 | AC-BEN-07 |
| 17.18 Global benefit through the empty span | OC 6.4 | AC-GLOBAL-01, AC-GLOBAL-02, AC-GLOBAL-03, AC-GLOBAL-04 |
| 17.19 Zero-dimensional model and empty plan line | OC 7, 16.1.7 | AC-ZERO-01 |
| 17.20 Serial processing | OC 10, 15.3 | AC-SERIAL-01 |

Supporting coverage not tied to a single outcome:

| Area | Governing behavior | Verifying acceptance cases |
|---|---|---|
| Hierarchy matching rules | OC 6.2, 9.2 | AC-MATCH-01 through AC-MATCH-07, AC-MATCH-09 |
| Operation acceptance by state | OC 8.1–8.4, IC 6.1 | AC-INIT-06, AC-INIT-07, AC-INIT-08 |
| Index failure leaves Ready intact | OC 8.4, 15.3, IC 6 | AC-INIT-09 |
| Failed mutations leave the index unchanged | OC 14.3 | AC-BEN-10 |
| Structural and semantic validation | IC 2, 3.1, 3.2, 6 | AC-VAL-01 through AC-VAL-07 |
| Console-log records and privacy | Observability Contract 2–7 | AC-OBS-01 through AC-OBS-04 |

## 5. Exit criteria assessment

| Exit criterion | Status |
|---|---|
| No severity-one or severity-two requirements gap remains. | **Met.** No severity-one issue was found in either pass, and all four severity-two issues are closed. |
| All remaining issues are non-blocking editorial or implementation matters. | **Met.** No issue remains open. The two residual risks in section 6 are matters of verification depth, not requirements gaps. |
| The document owner approves progression to the requirements specification. | **Outstanding.** This is an approval decision, not a review finding, and remains with the product owner and technical lead. |

The two technical exit criteria are met. WP-8 may begin once the document owner records approval.

## 6. Residual risk

Two limitations are recorded so that the passing checklist is not read as more than it is.

The mechanical checks constrain structure, not meaning. Schema validation confirms that the eight interface examples are well-formed against the contract and that the twelve invalid messages resolve at the intended layer; it cannot confirm that the matching semantics in Operational Concept section 9 are the semantics the business wants. Checklist items 1, 2, 4, 7, and 8 rest on reading, and reading is fallible in a way a validator is not.

`AC-INIT-09` is not executable without a fault-injection hook, as the acceptance catalog's coverage statement notes. `INDEX_FAILURE` is therefore the one error code in the contract whose behavior is specified but unverified by an executable case. If the demo provides no such hook, the resolution of ISSUE-01 stands on documentation alone.

Both reviewing passes were carried out by the same party that authored the acceptance catalog and the readiness review, so "independent" describes the method rather than the reviewer. Issues 2 and 5 were defects in that authored work, which is evidence the method catches some of its own errors, not evidence that it catches all of them. A reviewer who did not write these documents would materially strengthen the WP-7 result before baselining.
