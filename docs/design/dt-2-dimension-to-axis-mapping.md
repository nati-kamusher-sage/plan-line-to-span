# DT-2: Dimension-to-Axis Mapping

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-2 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md), main body |
| Governing input | [Operational Concept](../operational-concept.md) 6.2, 9.1, 9.2, 15.2 |
| Depends on | [DT-1](dt-1-architectural-context.md), [DT-2a](dt-2a-index-library-evaluation.md), [DT-3](dt-3-empty-span-representation.md) |
| Retires | RISK-1 |
| Prototypes | [mapping](prototypes/dt-2-mapping.mjs), [verification](prototypes/dt-2-verify.mjs), [differential test](prototypes/dt-2-differential.mjs), [pruning](prototypes/dt-2-pruning.mjs) |

## 1. Decision

**Label each hierarchical dimension with nested intervals from a depth-first traversal.** Each dimension value receives an interval `[enter, leave]`, assigned so that a value's interval strictly contains every descendant's interval.

This converts the ancestor relationship into interval containment:

> `v` is an ancestor-or-self of `w` **if and only if** `interval(v)` contains `interval(w)`.

OC 9.2's hierarchical matching then becomes a pure geometric containment test, which is exactly what an R*-tree evaluates natively. No hierarchy walk occurs at query time.

## 2. The mapping

### 2.1 One axis per dimension

Each dimension in the validated model becomes exactly one axis. Axis order is the dimension order in the dimension file, fixed at initialization. A model with `n` dimensions yields an `n`-dimensional coordinate space; `n` may be zero, per DT-3.

Non-hierarchical dimensions are the degenerate case of the same rule: every value is its own root, so each receives a disjoint interval and containment reduces to equality.

### 2.2 Interval labelling

A depth-first traversal assigns each value an entering and a leaving number from a single counter:

```
visit(v):
    enter[v] = counter++
    for each child c of v:  visit(c)
    leave[v] = counter++
```

Because a node's children are visited entirely between its own enter and leave, the containment property holds by construction.

Applied to the `D1` fixture, the prototype produces:

```
location    4:[0,9]  20:[1,6]  22:[2,3]  30:[4,5]  21:[7,8]
department  rnd:[0,1]  eng:[2,3]
```

Read this against the fixture's hierarchy — USA `4` is the root; New York City `20` and Los Angeles `21` are its children; Manhattan `22` and Brooklyn `30` are children of `20`:

- `4:[0,9]` contains every other location interval. USA is an ancestor of all of them.
- `20:[1,6]` contains `22:[2,3]` and `30:[4,5]` but not `21:[7,8]`. New York City is an ancestor of Manhattan and Brooklyn, not of Los Angeles.
- `22:[2,3]` contains nothing else. Manhattan is a leaf.

`department` has no parent relationships, so `rnd` and `eng` receive disjoint intervals and can never contain one another.

### 2.3 Forests

A hierarchy need not be a single rooted tree. OC 14.1 rejects cycles and dangling parents, but a dimension may legitimately have several roots.

The traversal sweeps each root in turn on the same shared counter. Because a root's subtree is fully numbered before the next root begins, sibling root subtrees occupy disjoint ranges and cannot contain one another. No sentinel root is introduced — adding one would create a value that callers never supplied.

The prototype covers this with a two-root `region` dimension (`eu` with child `de`, `us` with child `ca`) and confirms that `de` matches only the `eu` span and `ca` only the `us` span.

### 2.4 Spans become boxes

A span becomes a box with one interval per axis:

| Axis case | Interval |
|---|---|
| The span constrains this dimension | The value's own `[enter, leave]` |
| The span omits this dimension | The whole axis |

The omitted-dimension rule is DT-3's wildcard, unchanged. The empty span omits every dimension and therefore covers the entire space, which is how the global benefit is represented.

### 2.5 Plan lines become query points

A plan-line value maps to that value's interval, and the axis carries a marker where the plan line has no value for a dimension.

Matching evaluates, per axis:

| Span constraint | Plan-line value | Result |
|---|---|---|
| Whole axis (omitted) | anything, including absent | Satisfied |
| An interval | Absent | **Not** satisfied |
| An interval `C` | An interval `P` | Satisfied when `C` contains `P` |

The second row is the mechanism behind OC 9.2's rule that every dimension present in the span must also be present in the plan line, and it is what makes `AC-MATCH-06` fail correctly.

The third row is the whole design: containment means ancestor-or-self, so equality and hierarchical matching are one operation rather than two.

## 3. How the two query operations differ

`Query Employee` is the containment test above, evaluated by the index.

`Query Benefit` does **not** use the geometry. It looks up the canonical span key directly, as OC 9.1 requires exact equality that hierarchy cannot broaden.

This separation is deliberate and load-bearing. Two distinct spans can never share an interval pair, so geometry-based identity would happen to work — but it would couple exact lookup to the hierarchy encoding, and a later change to the labelling scheme could silently start broadening exact lookups. Keeping identity on the canonical key makes OC 9.1's guarantee structural rather than incidental.

The prototype asserts this directly: with only `{location: 4}` stored, an exact query for `{location: 20}` returns `NOT_FOUND` even though 4 is 20's parent.

## 4. Verification

The design plan's exit criterion requires the prototype to produce exactly the expected result sets for `AC-MATCH-01` through `AC-MATCH-11`, including the negative cases. Three prototypes were run.

### 4.1 Acceptance-case verification

```
29/29 checks passed
```

Covering: all eleven `AC-MATCH` cases including the section 12 scenario; exactness under OC 9.1 including member-order independence; the global span and zero-dimensional interop from DT-3; the forest case; and an exhaustive check that containment agrees with ancestor-or-self across all 25 location value pairs.

`AC-MATCH-10` and `AC-MATCH-11`, added during the WP-7 review, return `{B1, B2, B3}` for a New York City R&D employee and the correct sets for the three remaining section 12.2 rows.

### 4.2 Differential test against an independent oracle

DEC-13 called for differential testing against a naive implementation. Applied here to the mapping itself, using a parent-link ancestor walk as the oracle:

```
12000/12000 agree with naive ancestor-walk oracle (300 random models)
```

Three hundred randomly generated dimension models, with one to three dimensions, two to eight values each, randomly shaped hierarchies including multi-root forests, and 40 random span-and-plan-line pairs per model. Agreement is exact.

This matters more than the hand-written cases. Hand-picked examples confirm the situations the author thought of; the differential test explores shapes nobody chose, and it is what would surface an off-by-one in the labelling.

### 4.3 The geometry prunes

OC 15.2 requires operations to use the index rather than scanning. That depends on bounding boxes being informative — intervals must aggregate into a meaningful minimum bounding rectangle.

```
probe c7    interval=[15,16]    inMBR=true   matches=1
probe c120  interval=[241,242]  inMBR=false  matches=0  <- pruned: 49 boxes skipped with one comparison
MBR of the 49-leaf group = [1,98]
```

A group of 49 sibling spans aggregates into the MBR `[1,98]`. A query point outside that range is rejected by a single comparison, skipping all 49. This is the property the R*-tree relies on to skip subtrees, and it confirms the encoding is compatible with real pruning rather than merely correct.

Note the limitation: this shows the geometry *supports* pruning. Whether the built index *achieves* sub-linear behavior at scale is DT-7's measurement.

## 5. Properties and consequences

**Labelling cost is linear.** One depth-first traversal of each dimension's values at initialization. The intervals are then immutable for the model's lifetime.

**Coordinates are small integers.** The counter reaches twice the value count per dimension. DT-1's R3 asked for the integer-range assumption to be stated: coordinates are bounded by `2 × (values in the dimension)`, which stays far below the exact-integer limit of 2^53 for any conceivable demo model. No precision concern arises.

**Reinitialization discards labelling with the model.** Intervals belong to the dimension model, so DT-3's candidate-then-swap reinitialization replaces them atomically along with the index.

**The scheme is static.** Nested-interval labelling assumes the hierarchy does not change while the model is loaded, which the baseline guarantees: hierarchies change only through reinitialization, and OC 8.3 makes that a full atomic replacement. A dynamic scheme such as gap-based numbering would be needed only if incremental hierarchy edits were ever in scope, and OC 3.2 excludes them.

## 6. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-19 | One axis per dimension, ordered as in the dimension file | Simple, stable, and matches the caller's mental model. |
| DEC-20 | Nested-interval `[enter, leave]` labelling from a depth-first traversal | Makes ancestor-or-self exactly equivalent to interval containment. |
| DEC-21 | Non-hierarchical dimensions use the same scheme | Each value is its own root; containment degenerates to equality. No separate code path. |
| DEC-22 | Forests are labelled by sweeping roots on a shared counter; no synthetic root | Root subtrees stay disjoint; no value is invented that callers did not supply. |
| DEC-23 | A plan line missing a dimension fails any span constraining it | Implements OC 9.2's presence requirement geometrically. |
| DEC-24 | `Query Benefit` uses the canonical span key, never the geometry | Makes OC 9.1's no-broadening guarantee structural rather than incidental. |
| DEC-25 | Axis coordinates are integers bounded by twice the dimension's value count | Closes DT-1's R3 precision question. |

## 7. RISK-1 retirement

RISK-1 was that hierarchical dimension values must map onto a spatial axis such that ancestor matching becomes a containment query, with nothing in the baseline specifying the mapping, and that a wrong answer means wrong results or a degenerate scan.

The risk is retired. The mapping is specified, the equivalence between containment and ancestor-or-self is verified exhaustively for the fixture and by differential testing across 300 random models, all eleven `AC-MATCH` cases pass, and the encoding demonstrably supports MBR pruning.

Two qualifications, recorded as in DT-3.

The prototype's store is a linear filter over correctly-computed boxes, not an R*-tree. It validates the *mapping*, which is what DT-2 owns. Building the index itself is implementation work, and DT-7 measures whether it prunes in practice.

The differential test used one to three dimensions and up to eight values per dimension. That is adequate to exercise the labelling logic, but the volumes are small by design; DT-7 defines the evaluation volumes.

## 8. Open items

| Item | Owner task |
|---|---|
| Node capacity, split strategy parameters, and reinsertion policy | Implementation, following the `rbush` reference |
| Where the zero-axis split assertion lives | DT-4 |
| Promoting the differential harness to a permanent test | DT-9 |
| Evaluation volumes and the pruning measurement | DT-7 |
