# Plan Line to Span Utility

## Operational Concept

| Document attribute | Value |
|---|---|
| Status | ECP-1 target specification |
| Revision | 2026-08-04 |
| Governing change | [ECP-1](ECP/ECP-1/ECP-1.md) |
| Interface detail | [Interface Contract](interface-contract.md) |
| Acceptance evidence | [Acceptance Cases](acceptance-cases.md) |

## 1. Purpose

The utility stores spans and answers which stored spans apply to a supplied plan line.
It is a deterministic, in-memory demonstration of hierarchical span matching backed by
an R*-tree.

The utility knows only dimension definitions, spans, and plan lines. A span is both the
stored value and its identity. Nothing is attached to or interpreted from a span.

### 1.1 Authority and normative language

This document is the behavioral authority. The interface contract defines exact JSON
shapes; design records define implementation structure. If they conflict, this document
governs. **Must**, **must not**, **required**, and **shall** are normative.

ECP-1 supersedes the Phase 1 concept model and error posture. Historical planning,
prototype, and pull-request records remain evidence of Phase 1 and are not current
behavioral authority.

## 2. Operational objectives

The utility must:

1. load a dimension model;
2. store at most one entry for each canonical span;
3. create, replace, delete, and retrieve exact spans;
4. return every stored span that applies to a supplied plan line;
5. support hierarchical and non-hierarchical dimensions uniformly;
6. support the empty span and a zero-dimensional model without a special external path;
7. process accepted operations serially; and
8. prefer performance over defensive correctness checks.

## 3. Scope

### 3.1 In scope

- In-memory initialization and reinitialization.
- Canonical span identity independent of JSON member order.
- Exact span lookup.
- Hierarchical plan-line matching using ancestor-or-equal semantics.
- Span creation, replacement, and deletion.
- Local JSON Lines operation-completion records.
- Deterministic behavior for well-formed, semantically valid inputs.

### 3.2 Out of scope

- Persistence, durability, recovery, replication, or distributed concurrency.
- Authentication, authorization, tenancy, or caller identity.
- Transport selection and deployment topology.
- Interpretation or storage of any value associated with a span.
- Defensive semantic validation of dimension definitions, spans, or plan lines.
- Translation of unexpected implementation failures into contract responses.
- Ordering guarantees for match collections.

## 4. Operational context

```text
dimension definition ──initialize──▶ dimension model
                                         │
span operations ─────────────────────────┼──▶ span store ──▶ R*-tree
                                         │
plan line ───────────queryPlanLine────────┘             └──▶ matching spans
```

All state is process-local. Successful reinitialization atomically replaces the model
and creates a new empty span store.

## 5. Users and external participants

The caller supplies dimension definitions, spans, and plan lines. The caller is
responsible for semantic correctness. The utility does not repair, normalize, or reject
semantically invalid domain data. A local operator may observe the JSON Lines stream.

## 6. Core concepts

### 6.1 Dimension

A dimension is a named axis such as `location` or `department`. Its values have stable
string keys.

### 6.2 Hierarchical dimension

A value may name a parent in the same dimension. The transitive parent relation defines
ancestor-or-equal matching. Multiple roots are allowed.

### 6.3 Plan line

A plan line is a dimension map describing one subject of a match query. It may omit
dimensions. It is query input and is never stored.

### 6.4 Span

A span is a dimension map describing constraints. A stored span is the complete stored
object and its canonical identity. JSON member order does not affect identity.

A span applies to a plan line when every constrained dimension is present in the plan
line and the plan-line value is equal to or a descendant of the span value. Dimensions
present only on the plan line do not prevent a match. The empty span `{}` constrains no
dimensions and therefore applies to every plan line.

### 6.5 R*-tree

Each dimension maps to one axis. Hierarchy intervals turn spans into boxes and plan lines
into points. The tree stores canonical spans directly and returns all boxes containing a
query point.

## 7. Dimension definition

Initialization accepts:

```json
{
  "format": "plan-line-to-span-dimensions/v1",
  "dimensions": [
    {
      "id": "location",
      "name": "Location",
      "values": [
        { "key": "4", "name": "USA" },
        { "key": "20", "name": "New York City", "parentKey": "4" },
        { "key": "21", "name": "Los Angeles", "parentKey": "4" }
      ]
    }
  ]
}
```

The caller must supply a coherent model: unique identifiers and keys, valid parent
references, and an acyclic hierarchy. ECP-1 removes defensive semantic checks for these
conditions. Behavior for an incoherent model is outside the contract and may include an
uncaught failure or non-termination.

An empty `dimensions` array is valid and creates a zero-dimensional model.

## 8. Operating modes and state

The lifecycle states remain `uninitialized`, `initializing`, `ready`, and `failed`.

- **Uninitialized:** only `initialize` is accepted.
- **Initializing:** no operation is accepted. This makes serial execution observable.
- **Ready:** every operation is accepted; `initialize` is reinitialization.
- **Failed:** only `initialize` is accepted as a retry.

`INVALID_STATE` is contract behavior, not input validation, and remains under ECP-1.
Accepted operations are processed one at a time. A successful mutation is visible to the
next accepted operation.

The contract does not promise a controlled response for invalid data or an unexpected
implementation failure. A test may place the lifecycle in `failed` to verify the retained
retry and gating rules without requiring a malformed request to produce that state.

## 9. Matching semantics

### 9.1 `querySpan`: exact lookup

`querySpan` canonicalizes the supplied dimension map and retrieves only the identical
stored span. Hierarchy never broadens exact lookup. If the span is absent, the operation
returns `NOT_FOUND`.

### 9.2 `queryPlanLine`: applicable-span lookup

For each constrained dimension `d` in stored span `S` and plan line `P`:

```text
matches(S, P) iff for every d in S:
  P contains d
  and P[d] is equal to or a descendant of S[d]
```

All constrained dimensions use AND semantics. Every matching stored span is returned
once. No-match is a successful `{ "matches": [] }`. Match order is not significant.

## 10. Supported operations

| Operation | Purpose | Success result |
|---|---|---|
| `initialize` | Replace the dimension model and clear stored spans. | Ready state, dimension count, and `spanCount: 0`. |
| `createSpan` | Store a new canonical span. | The stored span. |
| `updateSpan` | Replace one stored span with another. | The replacement span. |
| `deleteSpan` | Remove an exact stored span. | Deletion confirmation and removed span. |
| `querySpan` | Retrieve an exact stored span. | The stored span. |
| `queryPlanLine` | Return every stored span applying to a plan line. | An unordered span collection. |

## 11. Primary workflows

### 11.1 Initialize

The utility enters `initializing`, builds the model and empty index, then enters `ready`.
Successful reinitialization replaces the prior model and clears all spans in one visible
step.

### 11.2 Create

The caller supplies `{ span }`. If the canonical identity already exists,
`DUPLICATE_SPAN` is returned. Otherwise the span is inserted and `spanCount` increases by
one.

### 11.3 Update

The caller supplies `{ span, replacementSpan }`. `span` selects the stored source;
`replacementSpan` is the requested new identity. A missing source returns `NOT_FOUND`.
A replacement already occupied by a different stored span returns `DUPLICATE_SPAN`.
Both state conditions are resolved before mutation. Success removes the source, creates
the replacement, returns the replacement, and leaves `spanCount` unchanged. Replacing a
span with the same canonical span succeeds.

### 11.4 Delete and exact query

Both identify a canonical span exactly. An absent span returns `NOT_FOUND`. Delete lowers
`spanCount`; exact query does not mutate state.

### 11.5 Query a plan line

The caller supplies `{ dimensions }`. The utility returns every matching span as defined
in section 9.2 and records the number of matches.

## 12. Example scenario

Store these spans:

```text
S1 = {location: 4}
S2 = {location: 4, department: rnd}
S3 = {location: 20}
S4 = {location: 4, department: eng}
```

Given the hierarchy `4` (USA) → `20` (New York City):

- `{location: 20, department: rnd}` matches exactly `S1`, `S2`, and `S3`.
- `{location: 21, department: rnd}` matches exactly `S1` and `S2`.
- `{location: 4}` matches exactly `S1`.
- exact `querySpan({location: 20})` returns only `S3`.

## 13. Conceptual data contracts

All operations use the common envelope in the interface contract.

```text
createSpan:    { span }
updateSpan:    { span, replacementSpan }
deleteSpan:    { span }
querySpan:     { span }
queryPlanLine: { dimensions }
```

Create, update, and exact query return `{ span }`. Plan-line query returns
`{ matches: [span, ...] }`, where each array element is a dimension map.

## 14. Optimistic execution and state outcomes

The utility assumes domain data is correct and valid. It does not check hierarchy
coherence, known dimensions, known values, index box arity, internal invariants, or other
conditions whose only purpose is defensive correctness. Unexpected failures are not
translated into a stable JSON error.

The structural request boundary remains schema-driven in the ECP-1 target: invalid JSON,
missing required envelope fields, wrong JSON types, or undeclared fields return
`MALFORMED_REQUEST`. This boundary determines which operation can be invoked; it does not
judge domain correctness.

The following state-dependent outcomes remain:

| Condition | Outcome |
|---|---|
| Create an already stored canonical span. | `DUPLICATE_SPAN` |
| Update or delete a missing source, or exact-query an absent span. | `NOT_FOUND` |
| Submit an operation not accepted in the current lifecycle state. | `INVALID_STATE` |

A failed state outcome does not mutate stored spans. For `updateSpan`, missing-source and
replacement-collision checks occur before removal.

## 15. Operational qualities

### 15.1 Efficiency over defensive correctness

ECP-1 deliberately removes semantic validation and exception translation to avoid their
runtime overhead. This trades diagnostics and safe behavior on invalid data for a smaller
and faster well-formed-data path.

### 15.2 Consistency and serialization

Accepted operations are serial. Reinitialization is an atomic model-and-store swap.
State outcomes do not partially mutate storage.

### 15.3 Observability

Each completed contract operation emits one bounded JSON Lines record. Records include
operation, outcome, duration, state, and `spanCount`, but never span or plan-line data.

### 15.4 Repeatability

For a fixed valid model, stored span set, and plan line, results are deterministic as a
set. Array order is not part of the contract.

## 16. Settled decisions

1. The R*-tree stores spans directly.
2. A span is the complete stored object and its canonical identity.
3. Plan lines replace the prior subject terminology.
4. `querySpan` is exact; `queryPlanLine` performs hierarchical matching.
5. `updateSpan` removes a source span and creates the requested replacement.
6. The empty span is an ordinary all-axis-covering entry in the tree.
7. A zero-dimensional model is supported.
8. `DUPLICATE_SPAN`, `NOT_FOUND`, and `INVALID_STATE` remain state outcomes.
9. Defensive semantic validation and exception-to-response translation are removed.
10. The draft `plan-line-to-span/v1` contract is revised in place before release; ECP-1
    does not introduce a second version string.

## 17. Operational acceptance outcomes

The normative executable catalogue is [Acceptance Cases](acceptance-cases.md). Its 48
Phase 1 case lineages are retained for traceability: 39 are active under ECP-1 and 9 are
marked retired with reasons. Active cases cover lifecycle gating, span replacement,
exact identity, matching, empty/zero-dimensional behavior, structural envelopes,
serialization, and observability.

## 18. Glossary

| Term | Meaning |
|---|---|
| Canonical span | A span identity independent of JSON member order. |
| Dimension | A named matching axis with stable value keys. |
| Global span | The empty span `{}`, which applies to every plan line. |
| Plan line | A dimension map supplied to `queryPlanLine`; never stored. |
| Span | A stored dimension map that is both value and identity. |
| State outcome | A declared result derived from lifecycle or stored state, not domain-data validation. |
