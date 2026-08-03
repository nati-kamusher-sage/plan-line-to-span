# Requirements Baseline Decision

| Document attribute | Value |
|---|---|
| Status | Approved 2026-07-31 |
| Decision | Tailor the separate requirements specification out of the process and adopt the current document set as the implementation baseline |
| Date raised | 2026-07-31 |
| Supersedes | WP-8 of the [Requirements Readiness Completion Plan](requirements-readiness-completion-plan.md) |
| Deciding roles | Product owner and technical lead, per the plan's section 5 responsibility model |

## 1. Decision

The Plan Line to Span demo will not produce a separate requirements specification. The following documents together form the approved implementation baseline:

| Document | Role in the baseline |
|---|---|
| [Operational Concept](operational-concept.md) | Sole authority for business behavior, lifecycle, matching semantics, and validation obligations |
| [Interface Contract](interface-contract.md) | Wire format, response envelopes, stable error codes, and per-state operation acceptance |
| [JSON Schema](schemas/plan-line-to-span-v1.schema.json) | Machine-readable structural contract |
| [Observability Contract](observability-contract.md) | Console-log record format, required signals, and privacy rules |
| [Acceptance Cases](acceptance-cases.md) | 48 test-ready cases tracing to the governing statements |
| [Readiness Review](readiness-review.md) | Evidence that the set is internally consistent and complete |

Work proceeds from here to preliminary design.

## 2. Rationale

### 2.1 The completion gate is already satisfied

The completion plan's section 6 gate lists eight conditions for declaring elicitation complete. None requires a requirements specification to exist. Seven are satisfied by the current document set, and the eighth — that no implementer must invent externally observable behavior — was tested mechanically by the readiness review rather than asserted.

The gate is written around elicitation being finished. It is finished.

### 2.2 The specification would largely re-encode settled content

WP-8's deliverables are a specification, a bidirectional traceability matrix, and an approval record. The behavior is already settled in the operational concept, the wire format is already pinned by a machine-readable schema that all interface examples validate against, the failure modes already have stable codes, and 48 acceptance cases already trace to governing statements.

Restating roughly 11,000 words of reviewed prose as numbered `shall` statements would create a second normative document covering the same behavior. That reintroduces the divergence risk that WP-2 eliminated by making the operational concept the sole authority.

### 2.3 The demo's scope does not earn the artifact

The operational concept's section 3.2 excludes persistence, recovery, idempotency, authorization, tenancy, auditing, and concurrency. A baselined specification is most valuable as a contractual artifact between separated parties or as a control on long-lived production behavior. Neither applies to this demo.

## 3. What the decision gives up, and how each gap is closed

Tailoring the specification out removes three things WP-8 would have delivered. Two are closed by this work package; one is accepted as a residual limitation.

| Lost from WP-8 | Disposition |
|---|---|
| Normative `shall` language for every obligation | **Closed.** Operational concept sections 14.1, 14.2, 14.3, 15.4, 7, and 10 were converted from `should` and `is expected to` into obligations, and section 1.2 now defines the normative-language convention. Section 14.2 additionally binds each rejection to its required error code. |
| Requirement identifiers grouped by subject (`SCOPE-*`, `MATCH-*`, and so on) | **Accepted.** Forward traceability from acceptance outcome to case exists in the readiness review's matrix. Reverse lookup across 48 cases in one file is adequately served by search. If the demo becomes a product, identifiers should be introduced then. |
| A recorded approval decision | **Closed by this document.** Section 5 carries the approval record. |

## 4. Conditions that would reverse this decision

This decision is scoped to the demo. Any of the following should reopen it:

1. The utility moves toward production use, or acquires any capability listed as out of scope in operational concept section 3.2.
2. Implementation is contracted to a party outside the team that authored these documents, such that the baseline becomes a contractual artifact.
3. A second interface version is introduced, making per-requirement change control necessary.
4. A regulatory, audit, or procurement obligation requires a specification as a named deliverable.

## 5. Approval record

The completion plan's section 5 assigns final readiness approval jointly to the product owner and technical lead. This decision tailors out a planned work package, so it requires the same approval.

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | Nati Kamusher | Approved | 2026-07-31 |
| Technical lead | Nati Kamusher | Approved | 2026-07-31 |

Both approvals are recorded. This document is no longer a recommendation: the current document set is the approved implementation baseline, and the operational concept's section 1.1 reference to this record is accurate.

One person holds both roles for this demo, which the completion plan's section 5 permits. The two approvals are therefore not independent of one another, and the authorship-independence limitation in section 6 applies to them as it does to the documents themselves.

## 6. Known limitations of the baseline

Two limitations carried forward from the readiness review remain true of the baseline and are restated here so approval is informed.

`AC-INIT-09` requires a fault-injection hook to execute. `INDEX_FAILURE` is therefore specified but not verifiable by an executable case unless the implementation provides that hook.

Every document in the baseline was authored and reviewed within a single authorship chain. The readiness review's mechanical checks are reproducible and caught defects in that chain's own work, but no reviewer outside it has examined the set. Approving parties should weigh that when deciding whether to accept the baseline as-is.
