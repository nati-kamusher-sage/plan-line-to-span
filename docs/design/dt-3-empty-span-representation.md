# DT-3: Empty-Span and Zero-Dimensional Representation

| Document attribute | Value |
|---|---|
| Status | ECP-1 revised design |
| Governing input | [Operational Concept](../operational-concept.md) 6.4, 7, 15, 16 |
| Depends on | [DT-1](dt-1-architectural-context.md), [DT-2](dt-2-dimension-to-axis-mapping.md) |
| Retires | RISK-2 |
| Historical prototypes | [representation probe](prototypes/dt-3-representation-probe.mjs), [zero-dimensional probe](prototypes/dt-3-zero-dimensional-probe.mjs) |

## 1. Decision

Store the global span inside the index as an all-axis-covering box. Do not give it a
dedicated slot. A zero-dimensional model is an index with zero axes and at most one
entry, whose box is the empty interval list.

ECP-1 changes the stored payload to the span itself and changes update into identity
replacement. Neither change alters the representation decision.

## 2. Required behavior

| Requirement | Source |
|---|---|
| `{}` is the canonical empty span. | OC 6.4 |
| The empty span applies to every plan line, including `{}`. | OC 6.4, 9.2 |
| Exact query and delete address `{}` by canonical identity. | OC 9.1, 11 |
| `updateSpan` may replace `{}` with another span or another span with `{}`. | OC 11.3 |
| At most one `{}` entry exists because span identity is unique. | OC 6.4, 14 |
| A zero-dimensional model is valid and can express only `{}`. | OC 7, 16 |

## 3. Geometry

A constrained dimension occupies its value interval. An omitted dimension occupies the
whole axis. The empty span omits every dimension and therefore covers the entire space.
Every plan-line point lies inside that box.

This is the ordinary omitted-dimension rule applied to all axes, not a special case.

## 4. Representation alternatives

### 4.1 Selected: ordinary in-index entry

`{}` is stored like every other span. Create, exact lookup, update, delete, and matching
use the same paths.

### 4.2 Rejected: dedicated external slot

A separate nullable slot would require an empty-span branch in every store operation and
would require `spanCount`, reinitialization, and result composition to account for two
storage locations.

The Phase 1 prototype drove both representations through the global, zero-dimensional,
coexistence, and negative-exact scenarios:

```text
34/34 checks passed
no observable difference between the two representations
```

The probe used the previous response payload shape, but its relevant evidence is span
identity, counts, duplicate detection, and matching. Those properties survive ECP-1.

## 5. Why the in-index representation remains correct

- **No empty-span branches.** The ordinary wildcard geometry handles `{}`.
- **One authoritative count.** `spanCount` is the index size.
- **Uniform uniqueness.** A second `{}` is the ordinary `DUPLICATE_SPAN` case.
- **Atomic clearing.** Reinitialization discards one index reference.
- **Unspecified result order.** The index composes global and constrained matches without
  manufacturing an append order.
- **Direct payload.** The indexed value is now the canonical span, so the representation
  is smaller without changing geometry.

## 6. Zero-dimensional model

At zero axes:

```text
area([])             = 1   (empty product)
margin([])           = 0   (empty sum)
contains([], [])     = true
chooseSplitAxis([])  = undefined, but unreachable
```

Only `{}` can be expressed, and retained duplicate detection limits the index to one
entry. A node split is therefore unreachable.

Phase 1 DEC-17 required an assertion in the split path. ECP-1's optimistic posture
supersedes that guard: the implementation relies on the one-entry invariant without a
defensive assertion. If invalid internal state reaches zero-axis splitting, behavior is
outside the contract.

### 6.1 Index requirements

1. Axis count is fixed at initialization and may be zero.
2. Box coordinate-array length equals axis count; zero length is valid.
3. Area, margin, and enlargement use empty-product/empty-sum conventions.
4. Containment over zero axes is true.
5. Correct caller data and duplicate detection keep zero-axis splitting unreachable.

## 7. Operation behavior for `{}`

| Operation | Mechanism | Case |
|---|---|---|
| `createSpan` | Insert full-cover box after ordinary duplicate check. | AC-GLOBAL-01, AC-GLOBAL-03 |
| `querySpan` | Canonical-key exact lookup. | AC-GLOBAL-04 |
| `updateSpan` | Remove `{}` and create `replacementSpan` after both state checks. | AC-GLOBAL-04 |
| `deleteSpan` | Canonical-key removal; `spanCount` becomes index size. | AC-GLOBAL-04 |
| `queryPlanLine` | Full-cover box contains every point. | AC-GLOBAL-01, AC-GLOBAL-02 |
| Zero-dimensional query | Empty-box containment is vacuously true. | AC-ZERO-01 |

## 8. Decisions recorded

| ID | Decision | ECP-1 status |
|---|---|---|
| DEC-14 | Store the global span inside the index as an all-axis-covering box. | Retained; payload is now the span itself. |
| DEC-15 | Treat `{}` as the omitted-dimension rule applied to every axis. | Retained. |
| DEC-16 | Represent a zero-dimensional model as an index with zero axes. | Retained. |
| DEC-17 | Assert non-zero axes in the split path. | Superseded by optimistic execution; guard removed. |
| DEC-18 | Use empty product and empty sum at zero axes. | Retained. |

## 9. Risk disposition

RISK-2 remains retired. The zero-dimensional representation is valid, containment has the
required vacuous semantics, and retained duplicate detection makes the undefined split
path unreachable for valid state. ECP-1 deliberately trades the former defensive
assertion for optimistic execution.

The historical probes use a scan stand-in and Phase 1 vocabulary. They establish
representation equivalence, not current contract payloads or R*-tree performance.
