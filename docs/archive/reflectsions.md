# Archived Reflections on the Operational Concept

> **Status: Archived and non-normative.** This file preserves elicitation history. The governing behavioral document is the [Operational Concept](../operational-concept.md).

## Purpose

This document records the settled understanding of the Plan Line to Span utility described in the applicable operational-concept document. It distinguishes behavior defined by that document from design decisions that the document explicitly leaves unresolved.

## Applicable document

- [Operational Concept](../operational-concept.md) — defines the utility's intended behavior, scope, matching semantics, operations, and acceptance outcomes.

## Utility responsibility

The utility associates employee plan lines with applicable benefit definitions by comparing their dimensions. It does not maintain direct employee-to-benefit links. Instead, it derives those relationships when an employee plan line is queried.

The utility:

- Loads and validates a dimension model.
- Creates a multidimensional R*-tree index using the model's dimensions as axes.
- Stores and maintains benefit definitions as span-formula associations.
- Retrieves a benefit by its exact span.
- Finds every benefit applicable to an employee plan line.
- Returns formulas without interpreting or executing them.

A downstream planning component applies the returned formulas, creates or updates benefit rows, and calculates or aggregates values in the planning grid.

## Core concepts

### Dimension

A dimension is a classification axis, such as `location` or `department`. The dimension-definition file specifies each dimension's stable identifier, allowed values, stable value keys, display names, and optional parent-child relationships.

Stable keys are the canonical service representation. Names are display metadata.

### Hierarchical dimension

A hierarchical dimension relates more-general values to more-specific values. For example, `USA` may be the parent of `New York City`.

For employee matching, a value matches itself and all of its descendants. Therefore, a benefit constrained to `USA` can apply to an employee in `New York City`. The reverse is not true: a benefit constrained to `New York City` does not apply to a plan line whose location is only `USA`.

Each value is currently assumed to have at most one parent within its dimension.

### Employee plan line

An employee is represented to the utility as a plan line containing one value for each supplied dimension:

```json
{
  "location": "20",
  "department": "rnd"
}
```

The utility uses these dimension values for matching. It does not maintain employee master data or the planning grid.

### Span

A span is a set of dimension-value constraints describing the population to which a benefit applies:

```json
{
  "location": "4",
  "department": "rnd"
}
```

All constraints in the span must match an employee plan line. A dimension omitted from a span is unconstrained and behaves as a wildcard. A dimension required by a span but absent from the employee plan line prevents a match. Dimensions present only on the employee plan line do not prevent a match.

### Formula

A formula is JSON-compatible opaque data associated with a span. The utility stores and returns it unchanged. Formula validation is limited to whether the payload can be stored in the supported opaque-data format; formula meaning and execution are outside the utility.

### Benefit

For this utility, a benefit is one association between a span and a formula:

```json
{
  "span": {
    "location": "4",
    "department": "rnd"
  },
  "formula": {
    "some": "data"
  }
}
```

### R*-tree

The R*-tree is the internal multidimensional index used to store benefit spans and find matches efficiently. Its axes are created from the loaded dimension model, and formulas are stored as payloads associated with indexed spans.

Callers depend on the matching behavior, not on the tree's internal representation.

## Matching semantics

The utility supports two different query operations. They must not be treated as interchangeable.

### Query Benefit: exact lookup

`Query Benefit` is an administrative lookup using a span. A stored benefit matches only when:

1. The query span and stored span contain exactly the same dimensions.
2. Every corresponding value is equal.

Dimension order is irrelevant. Hierarchies do not broaden this lookup, and a stored span with an additional or omitted dimension is not an exact match.

For example, querying `{location: USA}` finds a stored `{location: USA}` benefit, but it does not find `{location: New York City}` or `{location: USA, department: R&D}`.

The result is one benefit or a not-found result under the current assumption that a span uniquely identifies a benefit.

### Query Employee: applicability lookup

`Query Employee` receives an employee plan line and returns every stored benefit whose span applies to it.

A benefit span applies when, for every dimension constrained by the span:

1. The employee plan line contains that dimension.
2. The employee value equals the span value or is a descendant of it.

Formally:

```text
applies(span, planLine) =
  for every dimension d in span:
    d exists in planLine
    and (
      span[d] = planLine[d]
      or span[d] is an ancestor of planLine[d]
    )
```

Consequences of this rule:

- `{location: USA}` matches an employee in `USA`.
- `{location: USA}` also matches an employee in `New York City` when `USA` is its ancestor.
- `{location: New York City}` does not match an employee whose value is only `USA`.
- `{location: USA}` matches an employee with additional dimensions such as `department`.
- `{location: USA, department: R&D}` does not match a plan line that omits `department`.
- A valid query with no applicable benefits returns an empty collection.

The result contains every matching span together with its complete, unchanged formula. Result order is not significant.

## Operating lifecycle

The utility has four conceptual states:

1. **Uninitialized** — no usable dimension model or index exists.
2. **Initializing** — the dimension file is being validated and the axes and R*-tree are being created.
3. **Ready** — benefit mutations and queries are accepted.
4. **Failed** — initialization or an unrecoverable index failure prevents reliable operation.

Operations that depend on the index are rejected until initialization succeeds.

An invalid first initialization enters `Failed`; initialization may then be retried. During reinitialization, the utility builds and validates a candidate model separately from the active model. Operations are rejected while that work is in progress.

On successful reinitialization, the utility atomically replaces the active model and R*-tree with the validated candidate and an empty benefit index. On failed reinitialization, it discards the candidate, retains the preceding Ready model and benefits, reports the failure, and returns to `Ready`. No caller can observe partially initialized or partially cleared state.

## Supported operations

For the current demo, the coherent behavior adopted by the operational concept is:

- **Initialize / Init** — validate the dimension definition, resolve hierarchies, create axes, and create the R*-tree.
- **Create / Add** — add a span and formula after validating all dimensions and values.
- **Update / Change** — locate an existing benefit by its exact span and replace its formula.
- **Delete** — locate and remove a benefit by its exact span.
- **Query Benefit** — retrieve one benefit by exact span equality.
- **Query Employee / Get** — return zero or more benefits applicable to an employee plan line.

Successful mutations are atomic from the caller's perspective and immediately visible to subsequent queries on the same logical utility instance.

## Validation and failure behavior

Initialization rejects unsupported formats, duplicate identifiers or keys, missing parents, hierarchy cycles, and ambiguous hierarchy definitions.

Operations reject unknown dimensions or values, duplicate values for one dimension, malformed payloads, and calls made before successful initialization.

Not-found results are distinct from malformed-input errors. A failed mutation must not leave the index partially changed, and the same dimension model and ordered mutations must produce deterministic logical results.

## Scope boundaries

The utility does not:

- Execute formulas.
- Calculate payroll, benefit amounts, or budget totals.
- Render or persist the planning grid.
- Maintain employee master data.
- Define durable index storage or restart recovery.
- Define production authorization, tenancy, auditing, or deployment.

## Confirmed relationship model

- A benefit may apply to many employees.
- An employee may receive many benefits.
- The relationship is derived from the benefit span and employee plan-line dimensions at query time.
- A span is a predicate over employee dimensions, not a stored list of employees.
- The hierarchy match runs from a more-general benefit value to an equal or more-specific employee value.
- The formula is returned with the matched span and is applied outside this utility.

## Decisions not settled by the operational concept

The following points remain explicitly unresolved in the applicable document and must not be assumed to be settled implementation behavior:

- Whether creating an existing span fails, replaces the existing benefit, or permits duplicates.
A: Creating an existing span fails.
- Whether benefits need stable identifiers separate from their spans.
A: Benefits are identified by their spans, which must be unique.
A: Update and delete always affect one exact span. Bulk matching is not supported.
- How a span itself can be changed during update.
A: The current demo supports only complete formula replacement. Span changes are not supported. 
- Whether an update formula replaces the complete formula or patches it.
A: An update formula replaces the complete formula.
- Whether an empty span is valid and represents a global benefit.
A: An empty span is valid and represents a global benefit.
- What happens to indexed benefits during reinitialization.
A: Reinitialization is allowed. It builds a candidate model separately; a successful reinitialization atomically replaces the active model and clears indexed benefits, while a failed reinitialization preserves the preceding Ready model and benefits.
- Persistence, restart recovery, concurrency, event ordering, and idempotency requirements.
A: No persistence, restart recovery, concurrency, event ordering, or idempotency requirements are defined in the operational concept. These are not supported in the current demo.
- Production volume, latency, throughput, and memory targets.
A: No production volume, latency, throughput, or memory targets are defined in the operational concept. These are not supported in the current demo. However a proper instrumentation and monitoring framework is expected to be added to the Demo to support evaluation of these metrics in the demo environment.
- Authentication, authorization, tenant isolation, and auditing requirements.
A: No authentication, authorization, tenant isolation, or auditing requirements are defined in the operational concept. These are not supported in the current demo.

For the demo, exact single-span update and delete and complete formula replacement are the adopted interpretations described above. Whether the final production contract retains those choices remains open.

The source context also contains a contradictory employee-query example claiming that a plan line containing only `{location: USA}` returns benefits with additional department constraints or a more-specific city constraint. Under the defined subset and ancestor rules, it returns only benefits whose complete spans apply to that plan line. The operational concept's matching rules and acceptance outcomes are therefore the governing interpretation unless that requirement is changed.

# Gaps

The document is sufficient to start drafting the requirements specification, but not yet sufficient to declare requirements elicitation
  complete or baseline the specification.

  The core functional understanding is strong and testable: responsibilities, concepts, hierarchical matching, exact versus applicability
  queries, operations, validation, and scope are all clearly covered in reflectsions.md:11.

  Before completing elicitation, these gaps should be resolved:

  1. Establish one authoritative decision source.
     The section titled “Decisions not settled” now contains settled answers, while the opening and reflectsions.md:219 still describe them
     as open. The operational concept also continues to list them as unresolved. Rename this section to “Settled demo decisions” and
     synchronize the operational concept or introduce a formal decision log.
    A: The settled demo decisions are now documented in this document. The operational concept will be updated to reflect these decisions. This should be done before the requirements specification is drafted.
  2. Define the interface contract.
     The spec still needs contractual request and response schemas for every operation, including:
      - Required and optional fields
      - Event names or operation discriminators
      - Response envelopes
      - Error categories/codes
      - Malformed-input versus not-found behavior
      - Formula payload type and size constraints
    A: The interface contract will be defined in a separate document. The operational concept will be updated to reference this document. This document will be drafted next step.
  3. Complete empty-span semantics.
     reflectsions.md:209 declares an empty span global, but the following still need answers:
      - Does it match every valid plan line, including an empty plan line? A: Yes, an empty span matches every valid plan line, including an empty plan line.
      - Can exactly one global benefit exist? A: Yes, exactly one global benefit can exist.
      - Can it be queried, updated, and deleted using {}? A: Yes, it can be queried, updated, and deleted using {}.
      - Is a dimension model with zero dimensions valid? A: Yes, a dimension model with zero dimensions is valid.

  4. Define reinitialization failure behavior.
     reflectsions.md:211 says reinitialization clears benefits, but it must specify whether clearing happens before or only after successful
     validation. If reinitialization fails, does the old model remain usable, or does the utility enter Failed with an empty index?
     A: Resolved. A candidate model is validated separately. A successful reinitialization atomically replaces the model and clears benefits; a failed reinitialization preserves the preceding Ready model and benefits. An invalid first initialization enters Failed and may be retried.

  5. Clarify sequential processing.
     Saying concurrency, ordering, and idempotency are “not supported” is insufficient for deterministic implementation. For the demo, state
     whether operations are processed serially in received order and whether overlapping operations are rejected or impossible by design.
     A: The app is single-threaded and processes operations serially in received order. Overlapping operations are not possible by design. 
  6. Make observability testable.
     “A proper instrumentation and monitoring framework” at reflectsions.md:215 is not measurable. Identify required signals, such as
     operation count, duration, success/failure, indexed-benefit count, query-match count, initialization status, and validation-error
     category.
     A: The app will be instrumented to provide metrics for operation count, duration, success/failure, indexed-benefit count, query-match count, initialization status, and validation-error category. These metrics will be exposed via a Prometheus endpoint for monitoring and testing.

  7. Add acceptance cases for the new decisions.
     The requirements should explicitly test:
      - Duplicate-span creation fails
      - Span changes through update fail
      - Formula update performs complete replacement
      - Empty/global spans match as intended
      - Reinitialization clears benefits
      - Exact lookup is dimension-order independent
      - Multi-level ancestor matching works
      - Unknown dimensions and values fail
      - Failed mutations leave the index unchanged
    This should be done before the requirements specification begins.
  Authentication, persistence, tenancy, and production performance targets can remain out of scope; they only need clear scope statements.
  The main blockers are authoritative decision alignment, interface contracts, reinitialization semantics, and measurable acceptance
  criteria.

  So the readiness assessment is:

  - Ready to draft the requirements specification: Yes.
  - Ready to finish elicitation and approve the specification: Not yet.
