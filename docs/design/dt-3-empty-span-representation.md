# DT-3: Empty-Span and Zero-Dimensional Representation

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-3 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Operational Concept](../operational-concept.md) 6.4, 7, 15.1, and 16.1.6–7 |
| Depends on | [DT-1](dt-1-architectural-context.md), [DT-2a](dt-2a-index-library-evaluation.md) |
| Retires | RISK-2 |
| Prototypes | [representation probe](prototypes/dt-3-representation-probe.mjs), [zero-dimensional probe](prototypes/dt-3-zero-dimensional-probe.mjs) |

## 1. Decision

**Store the global benefit inside the index as an all-axis-covering box. Do not give it a dedicated slot outside the index.**

A zero-dimensional model is represented as an index with zero axes, holding at most one entry whose box is the empty list of intervals. No special case is needed for it.

This resolves what WP-3 confirmed as feasible but deliberately left unspecified.

## 2. What the baseline requires

| Requirement | Source |
|---|---|
| An empty span is valid and represents the one possible global benefit. | OC 6.4, 16.1.6 |
| The global benefit applies to every valid plan line, including an empty one. | OC 6.4 |
| `{}` is the canonical empty span and works for exact query, update, and delete. | OC 6.4 |
| At most one global benefit can exist, because a span is the benefit's identity. | OC 6.6 |
| A dimension model with zero dimensions is valid; the only possible span is `{}`. | OC 7, 16.1.7 |
| No externally observable behavior may depend on whether the global benefit is stored inside or outside the index. | OC 15.1, restated as the DT-3 constraint in the design plan |

## 3. The mapping this rests on

DT-3 needs only the general shape of the span-to-geometry mapping, not the specific hierarchy interval-labelling scheme that DT-2's main body will fix. The shape is:

- A dimension constrained by a span occupies the interval belonging to that dimension value.
- **A dimension omitted from a span occupies the entire axis.** OC 6.4 already states that an omitted dimension is unconstrained and behaves as a wildcard.

The empty span omits every dimension. It is therefore not a special case at all: it is the ordinary rule applied to all axes at once, producing the box that covers the whole coordinate space. Every plan-line point lies inside that box, which is precisely the required "applies to every valid plan line."

This is the central observation of DT-3. The global benefit looks exceptional in the prose but is the natural limit of a rule the design already needs.

## 4. Options considered

### Option A — inside the index, full-cover box (recommended)

The global benefit is an ordinary entry whose box spans every axis. Creation, exact lookup, update, delete, and employee matching all use the same code paths as any other benefit.

### Option B — a dedicated slot outside the index

The engine holds a nullable `global` field. Every operation branches on whether the span is empty, and employee-query results are the index results with the global benefit appended.

### 4.1 Both satisfy the observable-behavior constraint

OC 15.1 requires that the choice not be externally detectable. Both options were implemented and driven through the acceptance-derived scenarios.

The probe runs `AC-GLOBAL-01` through `AC-GLOBAL-04`, `AC-ZERO-01`, coexistence of the global benefit with an ordinary benefit, and the negative case where an exact query for a different span must not return the global benefit. It then replays identical operation sequences against both implementations and diffs every response.

```
34/34 checks passed

--- observable-equivalence diff (A vs B) ---
  no observable difference between A and B
```

Responses, `benefitCount`, and error codes are identical across both representations for every sequence tested. OC 15.1 is satisfied either way, so the constraint does not decide the question. Structure does.

### 4.2 Why Option A

**It removes branching rather than adding it.** Option B introduces an `isEmpty(span)` test at the head of create, exact query, update, delete, and employee query — five branches, each a place where the global benefit could diverge from ordinary behavior. Option A has none. The probe made this concrete: `RepB` needed roughly 40 percent more code than `RepA` to produce identical results.

**It keeps `benefitCount` honest.** Obs 3 requires `benefitCount` on every log record. Option A reads the index size. Option B computes `index.size + (global ? 1 : 0)`, which is a second place to get the count wrong and is exactly the kind of drift `AC-OBS-03` would have to catch.

**Duplicate detection stays uniform.** `AC-GLOBAL-03` requires a second `{}` create to fail with `DUPLICATE_SPAN`. Under Option A this is the ordinary canonical-span identity check that OC 6.6 already mandates for every benefit; the "at most one global benefit" property follows from span uniqueness rather than needing separate enforcement.

**Reinitialization stays atomic for free.** OC 8.3 requires that a successful reinitialization clear all benefits atomically. Option A discards one index reference. Option B must also clear the separate global slot, and a design that forgets to do so would leave a stale global benefit alive across reinitialization — a defect that `AC-INIT-04` would catch, but only because someone thought to write it.

**Ordering insignificance is preserved.** OC 14.3 and `AC-MATCH-09` state that result ordering is not significant. Option B's append places the global benefit last by construction, which is not wrong but quietly creates an ordering an implementer might come to rely on. Option A leaves ordering to the index, where it is genuinely unspecified.

## 5. The zero-dimensional model

This is the part WP-3 flagged as the feasibility question, and it is where an off-the-shelf R*-tree would have caused trouble. Since DT-2a settled on implementing the index directly, the design controls the degenerate case rather than inheriting a library's assumptions about it.

The second probe exercises the R*-tree primitives at zero dimensions:

```
zero-dim area  = 1   (product over no axes)
zero-dim margin= 0   (sum over no axes)
contains(point=[]) = true   (vacuous truth -> global matches all)
chooseSplitAxis over 0 axes = -1   (no axis to split on)
```

Three of the four primitives behave correctly without special-casing. Area is the empty product, margin the empty sum, and containment is vacuously true for a box with no constraints — which yields exactly the required behavior that the global benefit matches an empty plan line.

Only the split heuristic is undefined, because it must choose among axes and there are none. **That path is unreachable.** In a zero-dimensional model the only expressible span is `{}`, and OC 6.6 permits at most one benefit per canonical span. The index can therefore hold at most one entry and can never reach the node capacity that triggers a split.

The design records this as an explicit invariant rather than leaving it to chance:

> In a model with zero dimensions, the index holds at most one entry. Node splitting is unreachable. The implementation shall assert this invariant rather than rely on it silently.

The assertion matters. If a future change made a second zero-dimensional span expressible, an assertion fails loudly instead of the split heuristic reading an undefined axis.

### 5.1 Requirements on the index implementation

DT-2's main body and the implementation must honor these:

1. Axis count is fixed at initialization from the dimension model and may be zero.
2. Boxes are coordinate arrays whose length equals the axis count; length zero is valid.
3. Area, margin, and enlargement use the empty product and empty sum conventions.
4. Containment over zero axes returns true.
5. Node splitting asserts a non-zero axis count.

## 6. How each operation behaves

With Option A, no operation needs an empty-span branch.

| Operation with `{}` | Mechanism | Verifying case |
|---|---|---|
| Create | Canonical span `{}` maps to the full-cover box; ordinary duplicate check applies. | `AC-GLOBAL-01`, `AC-GLOBAL-03` |
| Exact query | Canonical-span identity lookup. Hierarchy does not broaden it, so no other span can be returned for `{}` and `{}` is not returned for any other span. | `AC-GLOBAL-04` |
| Update | Identity lookup, then complete formula replacement; the span is unchanged. | `AC-GLOBAL-04` |
| Delete | Identity lookup, then removal; `benefitCount` falls to the index size. | `AC-GLOBAL-04` |
| Employee query, non-empty plan line | The full-cover box contains every point. | `AC-GLOBAL-01` |
| Employee query, empty plan line | Containment over zero axes is vacuously true. | `AC-GLOBAL-02`, `AC-ZERO-01` |
| Coexistence with ordinary benefits | The global benefit is one entry among others; results compose naturally. | Probe coexistence checks |

## 7. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-14 | The global benefit is stored inside the index as an all-axis-covering box | Removes five conditional branches; keeps `benefitCount`, duplicate detection, and reinitialization uniform. |
| DEC-15 | The empty span is not special-cased; it is the omitted-dimension rule applied to every axis | OC 6.4 already defines an omitted dimension as unconstrained. |
| DEC-16 | A zero-dimensional model is an index with zero axes | Containment is vacuously true, which is the required behavior. |
| DEC-17 | Node splitting asserts a non-zero axis count; the zero-dimensional split path is unreachable by the one-benefit invariant | Fails loudly if the invariant is ever broken. |
| DEC-18 | Empty product and empty sum conventions for area and margin at zero axes | Mathematically correct and requires no special case. |

## 8. RISK-2 retirement

RISK-2 was that an R*-tree implementation may require at least one dimension, while a zero-dimensional model and an empty global span are both valid.

The risk is retired. The zero-dimensional model is representable, the degenerate primitives behave correctly under standard conventions, the one path that is undefined is provably unreachable and is guarded by an assertion, and both candidate representations were shown to satisfy the acceptance-derived scenarios with no observable difference between them.

The retirement rests on prototypes rather than argument, as the design plan requires. Two qualifications are recorded honestly.

The probe's index is a linear-scan stand-in with correct containment semantics, not an R*-tree. It settles representation and observable equivalence, which is what DT-3 owns. It does not demonstrate the pruning behavior OC 15.2 requires; that is DT-2's prototype and DT-7's measurement.

The probe covers the five `AC-GLOBAL-*` and `AC-ZERO-*` cases plus coexistence and one negative case. The full catalogue runs against the real implementation in DT-9.

## 9. Open items

| Item | Owner task |
|---|---|
| Hierarchy interval labelling that gives each dimension value its axis interval | DT-2, main body |
| Node capacity and split parameters for the non-degenerate case | DT-2 |
| Where the zero-axis invariant assertion lives | DT-4 |
| Running the full acceptance catalogue against the real index | DT-9 |
