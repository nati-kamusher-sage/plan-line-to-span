# Requirements Readiness Completion Plan

| Document attribute | Value |
|---|---|
| Status | Draft |
| Purpose | Close the remaining elicitation gaps before the requirements specification is drafted and baselined |
| Scope | Plan Line to Span demo |
| Governing input | [Operational Concept](operational-concept.md) |
| Historical inputs | [Operational Concept Context](archive/operational-concept-context.md) and [Reflections](archive/reflectsions.md) |

## 1. Objective

The business behavior of the Plan Line to Span utility is substantially understood. This plan defines the remaining work needed to:

1. Remove contradictory or obsolete decisions.
2. Define externally observable interfaces and failure behavior.
3. Confirm that settled behavior is technically feasible.
4. Convert the elicited behavior into measurable acceptance criteria.
5. Establish traceability before the requirements specification is approved.

Requirements elicitation is complete only when an implementation team can build and test the demo without inventing externally observable behavior.

## 2. Current readiness

| Area | Readiness |
|---|---|
| Business concepts and scope | Ready |
| Matching semantics | Ready |
| Benefit identity and mutation behavior | Ready |
| Empty-span semantics | Ready; zero-dimensional feasibility confirmed |
| Initialization and reinitialization | Ready; WP-1 resolution adopted |
| Document authority and consolidation | Ready; WP-2 completed |
| Interface contract | Ready; WP-4 completed |
| Observability contract | Ready; WP-5 completed with local console logging |
| Acceptance criteria | Ready; WP-6 completed |
| Readiness and consistency review | Ready; WP-7 completed with all issues closed |
| Requirements baselining | WP-8 tailored out; the current document set is the baseline, pending owner approval |

## 3. Completion sequence

The work packages must be completed in the following order:

1. ~~Resolve initialization and reinitialization semantics.~~ **Completed.**
2. ~~Consolidate settled decisions into the governing documents.~~ **Completed.**
3. ~~Confirm zero-dimensional model feasibility.~~ **Completed.**
4. ~~Define the interface contract.~~ **Completed.**
5. ~~Define the observability contract.~~ **Completed.**
6. ~~Formalize acceptance criteria.~~ **Completed.**
7. ~~Run the readiness and consistency review.~~ **Completed.**
8. ~~Draft and baseline the requirements specification.~~ **Tailored out.** Replaced by a normative-language pass and a recorded baseline decision; see the [Requirements Baseline Decision](requirements-baseline-decision.md).

## 4. Work packages

### WP-1: Resolve initialization and reinitialization

**Status: Complete.** The recommended resolution was accepted and incorporated into the operational concept and reflections.

#### Problem

The reflections currently contain two incompatible statements:

- Reinitialization is allowed, atomically replaces the dimension model, and clears indexed benefits.
- Reinitialization is not applicable because the application is not persistent.

Persistence and reinitialization are independent concerns. The behavior of a second initialization request in the same process must be defined.

#### Recommended resolution

- A first initialization failure transitions the utility to `Failed`, with no usable model or index.
- Initialization may be retried from `Failed`.
- A successful reinitialization atomically replaces the dimension model and creates an empty benefit index.
- A failed reinitialization preserves the previous valid dimension model and benefits and returns the utility to `Ready`.
- Operations received while initialization is in progress are rejected.
- No caller may observe a partially initialized model or partially cleared index.

#### Deliverables

- One approved initialization and reinitialization decision.
- Updated lifecycle and state-transition descriptions.
- Acceptance cases for first initialization, retry, successful reinitialization, and failed reinitialization.

#### Exit criteria

- Every initialization outcome has one defined resulting state.
- The timing of validation, model replacement, and benefit clearing is explicit.
- No contradictory initialization statements remain.

### WP-2: Consolidate the governing documents

**Status: Complete.** The operational concept is the sole active behavioral authority. The reflections and original context have been archived as non-normative history, all accepted decisions have been incorporated, and document precedence has been established.

#### Actions

- Update the operational concept with every settled demo decision.
- Express accepted question-and-answer decisions as normative prose in the operational concept.
- Archive the reflections and original context as non-normative history.
- Ensure the source-context contradiction is retained only as background, with the governing interpretation clearly identified.
- State document precedence explicitly.

#### Adopted document precedence

1. Requirements specification
2. Interface contract
3. Operational concept
4. Reflections and decision records
5. Operational-concept context

Higher-ranked documents govern when two documents conflict.

#### Deliverables

- Updated operational concept.
- Archived, explicitly non-normative reflections and source context.
- Explicit document-precedence statement.

#### Exit criteria

- Settled behavior is expressed normatively in the operational concept.
- Archived sources are clearly marked non-normative and are not active authorities.
- No implementation-critical decision is promised only as future work without an owner or deliverable.
- Searches of active governing documents for `TBD`, `unresolved`, `not applicable`, and `will be defined` reveal no unowned implementation-critical gap.

### WP-3: Confirm zero-dimensional model feasibility

**Status: Complete.** Feasibility has been confirmed for the required zero-dimensional model and its empty-span behavior.

#### Problem

The settled behavior permits:

- A dimension model containing zero dimensions.
- One benefit with an empty span.
- An empty span that applies to every valid plan line, including an empty plan line.
- Exact query, update, and delete operations using `{}`.

An R*-tree implementation may require at least one dimension.

#### Resolution

The feasibility study confirms that the zero-dimensional model is implementable. Its implementation approach belongs in the solution design, provided it preserves the required external behavior: one empty-span global benefit, exact operations using `{}`, and matching against every valid plan line.

#### Deliverables

- A recorded feasibility conclusion.
- A concise clarification in the governing operational concept.
- Operational acceptance outcomes 18 and 19 covering the zero-dimensional model and global benefit.

#### Exit criteria

- The zero-dimensional requirement has an implementable design.
- No externally observable behavior depends on whether the global benefit is stored inside or outside the R*-tree.

### WP-4: Define the interface contract

**Status: Complete.** The versioned JSON contract, machine-readable schema, examples, response envelopes, and stable error codes are defined in [Plan Line to Span Interface Contract](interface-contract.md).

#### Required content

The interface contract must define:

- Contract name and version.
- Operation or event discriminator.
- Initialization request.
- Create, update, delete, and exact benefit-query requests.
- Employee-query request.
- Required and optional fields.
- Canonical span representation and normalization.
- Formula type, nullability, supported JSON values, and maximum size.
- Unknown and additional field handling.
- Empty-span and empty-plan-line representations.
- Success response envelopes.
- Empty-result and not-found behavior.
- Error envelope, categories, and stable error codes.
- Malformed payload and invalid dimension/value behavior.
- State-related failures, including operations before initialization.

Machine-readable JSON Schemas should be supplied if JSON is the selected representation.

#### Deliverables

- Versioned interface-contract document.
- Request, response, and error schemas.
- Valid examples for every operation.
- Invalid examples for each validation and state-error category.
- Reference from the operational concept to the interface contract.

#### Exit criteria

- Every example validates or fails against the schemas as intended.
- No implementer must invent a field, response envelope, or error category.
- Not-found, malformed-input, validation, duplicate, and invalid-state outcomes are distinguishable.

### WP-5: Define the observability contract

**Status: Complete.** The demo uses structured JSON Lines on the local process console. The record format, required signals, privacy rules, and verification approach are defined in [Plan Line to Span Observability Contract](observability-contract.md).

#### Required signals

- Operation count.
- Operation duration.
- Operation success and failure count.
- Indexed-benefit count.
- Employee-query match count.
- Initialization state.
- Validation-error category.

#### Adopted decisions

- Output is structured JSON Lines on the local process console; no telemetry provider or endpoint is used.
- One completion record is emitted for each successful or failed operation.
- Counts and durations are derived from captured records for the current process run; they are not retained across restart.
- Successful reinitialization records an indexed-benefit count of zero; failed operations do not change the reported count.
- Raw spans, formulas, employee values, request IDs, and unrestricted dimension values are excluded from logs.

Raw spans, formulas, employee values, and unrestricted dimension values must not be emitted in console logs.

#### Deliverables

- Console-log field catalog.
- Console output definition.
- Example JSON Lines output.
- Acceptance cases for successful and failed operations.

#### Exit criteria

- Every required log field has a stable name, type, and meaning.
- Log records can be verified by automated tests.
- Sensitive or high-cardinality data is excluded from logs.

### WP-6: Formalize acceptance criteria

**Status: Complete.** The [Plan Line to Span Acceptance Cases](acceptance-cases.md) catalog provides stable identifiers, traces, preconditions, sequences, expected responses, resulting state and storage, and expected console-log records.

Each acceptance case must include:

- Stable identifier.
- Related requirement or decision.
- Preconditions and initial state.
- Input or event sequence.
- Expected response or error.
- Expected resulting state and index contents.
- Expected observable console-log record, when relevant.

#### Minimum acceptance-case set

##### Initialization

- First initialization succeeds.
- First initialization fails and enters `Failed`.
- Initialization is retried from `Failed`.
- Reinitialization succeeds and clears benefits atomically.
- Reinitialization fails without exposing partial state.
- Operations during initialization are rejected.

##### Benefit lifecycle

- Benefit creation succeeds.
- Creating a duplicate span fails.
- Exact benefit lookup succeeds.
- Exact lookup is independent of dimension order.
- Exact lookup does not broaden through hierarchy.
- Formula update performs complete replacement.
- Attempting to change a span through update fails.
- Exact delete succeeds.
- Update and delete return not found for an absent span.
- Failed mutations leave index contents unchanged.

##### Employee matching

- Direct equality matches.
- One-level ancestor matching succeeds.
- Multi-level ancestor matching succeeds.
- Reversed parent-to-child direction does not match.
- Additional employee dimensions do not prevent a match.
- A missing required employee dimension prevents a match.
- Multiple span constraints use AND semantics.
- A valid query with no matches returns an empty collection.
- Result ordering is not significant.

##### Empty and global spans

- An empty span matches a non-empty plan line.
- An empty span matches an empty plan line.
- Only one global benefit can exist.
- The global benefit can be queried, updated, and deleted using `{}`.
- A zero-dimensional model is accepted.

##### Validation and operation processing

- Unknown dimensions fail.
- Unknown dimension values fail.
- Duplicate dimension entries fail.
- Invalid hierarchy parents fail.
- Hierarchy cycles fail.
- Malformed payloads fail.
- Operations before initialization fail.
- Operations are processed serially in accepted order.

##### Observability

- Required console-log records are emitted after successful operations.
- Required failure records are emitted after rejected operations.
- Indexed-benefit counts in logs reflect mutations and reinitialization.
- Formula and employee data do not appear in logs.

#### Deliverables

- [Acceptance-case catalog](acceptance-cases.md).
- Trace from every case to its governing requirement.

#### Exit criteria

- Every externally observable behavior has at least one acceptance case.
- Boundary and failure behavior have explicit negative cases.
- All newly settled decisions are covered.

### WP-7: Run the readiness and consistency review

**Status: Complete.** The [Plan Line to Span Readiness and Consistency Review](readiness-review.md) records the completed checklist, the issue register, and the initial traceability matrix. The first pass raised six issues; all were resolved and the review was re-run against the corrected documents. All ten checklist items pass and no issue remains open. WP-8 may begin once the document owner records approval.

#### Review checklist

- Every concept has one authoritative definition.
- Every operation has defined preconditions, input, result, error, and state effects.
- Every lifecycle transition is defined.
- Every settled decision appears in the operational concept.
- Every interface example conforms to a schema.
- Every functional requirement has an acceptance case.
- Every out-of-scope item is explicit.
- Demo-only constraints are not presented as production guarantees.
- No externally observable behavior is left to implementation choice.
- No implementation-critical `TBD` remains.

#### Deliverables

- [Completed readiness checklist](readiness-review.md#2-review-checklist).
- [Open-issue register](readiness-review.md#3-open-issue-register) containing no blocking issue.
- [Initial requirements traceability matrix](readiness-review.md#4-initial-requirements-traceability-matrix).

#### Exit criteria

- No severity-one or severity-two requirements gap remains.
- All remaining issues are non-blocking editorial or implementation matters.
- The document owner approves progression to the requirements specification.

### WP-8: Draft and baseline the requirements specification

**Status: Tailored out.** The [Requirements Baseline Decision](requirements-baseline-decision.md) records the assessment, the rationale, the gaps closed in its place, and the conditions that would reverse it. The current document set is the implementation baseline once the product owner and technical lead record approval.

The work package was replaced by a narrower one:

- Convert every hedged obligation in the governing documents into normative language, and bind each rejection rule to its required error code. **Completed.**
- Record the baseline decision and its approval. **Completed as a document; approval outstanding.**

Subject-grouped requirement identifiers were deliberately not introduced. The rationale and the conditions for revisiting that choice are in section 3 of the decision record.

The original scope is retained below as the record of what was assessed and tailored.

#### Requirement organization

Use stable identifiers grouped by subject:

- `SCOPE-*` — scope and exclusions.
- `DATA-*` — dimensions, values, spans, formulas, and benefits.
- `MATCH-*` — exact and employee matching.
- `STATE-*` — initialization and lifecycle.
- `FUNC-*` — supported operations.
- `VAL-*` — validation and errors.
- `OBS-*` — metrics and diagnostics.
- `QUAL-*` — atomicity, determinism, and serial processing.
- `AC-*` — acceptance outcomes.

Each requirement must:

- Use normative language such as `shall`.
- State one independently testable obligation.
- Identify applicable preconditions.
- Avoid prescribing an internal design unless the design is an explicit constraint.
- Trace to its source decision and one or more acceptance cases.

#### Deliverables

- Requirements specification.
- Completed bidirectional traceability matrix.
- Review record and approval decision.

#### Exit criteria

- Every requirement is uniquely identified, necessary, unambiguous, feasible, and verifiable.
- Every requirement traces to an elicited need or settled decision.
- Every acceptance case traces back to one or more requirements.
- Reviewers approve the specification as the baseline for implementation.

## 5. Responsibility model

| Responsibility | Suggested owner |
|---|---|
| Business and matching decisions | Product or domain owner |
| State, indexing, and feasibility decisions | Technical lead |
| Interface and error contract | API or application architect |
| Metrics contract | Technical lead with test owner |
| Acceptance-case catalog | Test owner with product review |
| Document consistency and traceability | Requirements author |
| Final readiness approval | Product owner and technical lead |

One person may hold multiple roles for the demo, but every deliverable must have an explicitly assigned owner before work begins.

## 6. Completion gate

Requirements elicitation may be declared complete when all of the following are true:

1. Initialization and reinitialization semantics are unambiguous.
2. The operational concept contains all settled demo decisions.
3. The active governing documents do not contradict each other; archived sources are explicitly non-normative.
4. Zero-dimensional behavior has a feasible implementation approach.
5. The interface and observability contracts are complete.
6. Every externally observable behavior has measurable acceptance criteria.
7. All requirements sources and acceptance cases are traceable.
8. No implementation team member must invent externally observable behavior.

### 6.1 Gate assessment

| # | Condition | Status |
|---|---|---|
| 1 | Initialization and reinitialization semantics are unambiguous. | Met by WP-1; the remaining lifecycle gap was closed as ISSUE-01. |
| 2 | The operational concept contains all settled demo decisions. | Met by WP-2; sixteen decisions recorded in section 16.1. |
| 3 | The active governing documents do not contradict each other. | Met; the four contradictions found by WP-7 are closed. |
| 4 | Zero-dimensional behavior has a feasible implementation approach. | Met by WP-3. |
| 5 | The interface and observability contracts are complete. | Met by WP-4 and WP-5. |
| 6 | Every externally observable behavior has measurable acceptance criteria. | Met by WP-6; all twenty outcomes traced across 48 cases. |
| 7 | All requirements sources and acceptance cases are traceable. | Met; forward traceability recorded in the readiness review's matrix. |
| 8 | No implementation team member must invent externally observable behavior. | Met; tested mechanically by WP-7 and reinforced by the WP-8 normative-language pass. |

All eight conditions are met. Requirements elicitation is complete.

No condition in this gate requires a separate requirements specification to exist, which is the primary basis for tailoring WP-8 out. Work proceeds to preliminary design once the [Requirements Baseline Decision](requirements-baseline-decision.md) is approved.
