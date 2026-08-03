# T2: Dimension model and interval labelling

| Attribute | Value |
|---|---|
| Task | T2 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t2-dimension-model` |
| Design records | [DT-2](../design/dt-2-dimension-to-axis-mapping.md) |
| Decisions implemented | DEC-19, DEC-20, DEC-21, DEC-22, DEC-23, DEC-25 |
| Acceptance cases now passing | None; foundation task. Cumulative 0/48. |

## What this changes

`src/model/dimension-model.ts` adds `buildDimensionModel` and `DimensionModel`: validation of a dimension definition, and the nested-interval labelling that turns hierarchy into geometry. This is the first consumer of T1's `RTree` geometry primitives (`Box`, `contains`) outside the index itself.

## Design decisions implemented

**DEC-19 — one axis per dimension, ordered as in the dimension file.** `DimensionModel` keeps dimensions in an array in declaration order; `axisOf` maps each id to its array index.

**DEC-20 — nested-interval `[enter, leave]` labelling from a depth-first traversal.** `labelDimension` visits each root's subtree fully before moving to the next value, on a single shared counter, giving the containment property by construction.

**DEC-21 — non-hierarchical dimensions use the same scheme, no special case.** A value with no `parentKey` is a root by definition; a dimension where every value omits `parentKey` is simply a forest of single-node roots, and the same traversal handles it without a branch.

**DEC-22 — forests are labelled by sweeping roots on a shared counter, no synthetic root.** `labelDimension` collects `roots` (every value with no `parentKey`) and calls `visit` on each in turn. Because a root's entire subtree is numbered before the next root starts, sibling root subtrees are provably disjoint. No sentinel value is invented.

**DEC-23 — a plan line missing a dimension fails any span constraining it.** See the defect below; this is the part that was wrong in the first draft and is now covered by both a unit test and the promoted property test.

**DEC-25 — axis coordinates are integers bounded by twice the dimension's value count.** The counter increments twice per value (once on enter, once on leave), so it never exceeds `2 × valueCount`.

## Defect found and fixed during the task

The first version of `planLineToPoint` marked an absent dimension with `[Infinity, -Infinity]` — `emptyBox`'s per-axis identity, reused on the reasoning that an inverted interval "can't be contained by anything."

That reasoning was wrong, and the promoted differential test caught it on the first run:

```
AssertionError: trial 0 span={"d0":"v1","d1":"v1"} line={"d0":"v1"}
true !== false
```

`contains(outer, inner)` checks `outer[0] > inner[0] || inner[1] > outer[1]`. With `inner = [Infinity, -Infinity]`, both operands are infinite in the wrong direction for either half of that check to fire: `lo > Infinity` is always false, and `-Infinity > hi` is always false. The comparison degenerates and returns `true` — the opposite of "uncontainable."

Fixed by using `[Infinity, Infinity]` instead. That interval fails containment against any real, finite span interval (`Infinity > hi` is true for finite `hi`), while still passing against the omitted-dimension wildcard `[-Infinity, Infinity]` (`Infinity > Infinity` is false) — which is required, since a span that does not constrain a dimension must impose no requirement even when the plan line also lacks that dimension.

The unit tests that first accompanied this code asserted the *wrong* shape (`lo > hi` on the marker) and would have passed against the bug; they only exist because I wrote them alongside the buggy code, not because they exercised the actual contract. They are rewritten to assert the behavior that matters — containment outcomes against real and omitted span constraints — rather than an internal representation detail.

This is the reason DEC-13's differential-testing pattern is in the plan at all: a hand-written unit test confirms what its author already believed, and can be wrong in exactly the same way the code is. An independent oracle does not share the author's mistake.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/dimension-model.test.ts` | Unit, 27 tests | Format, duplicate-id, duplicate-key, dangling-parent, and cycle rejection (2-cycle, self-cycle, 3-cycle); zero-dimensional validity; `dimensionCount`/`dimensionValueCount` (Obs 4); ancestor containment on the D1 shape; disjoint non-hierarchical intervals; two-root forest disjointness; a hierarchical dimension with an unrelated standalone value; the DEC-23 marker behavior against both a constraining and a non-constraining span; unknown-dimension/value error paths. |
| `test/property/dimension-model-vs-ancestor-walk.test.ts` | Property, 1 test, 12,000 assertions | Promoted from `dt-2-differential.mjs`, same seed (42), same 300-model × 40-query shape. Interval containment against `DimensionModel` agrees with an independent parent-walk oracle on every one of 12,000 span/plan-line pairs across randomly generated models, including multi-root forests. |

## Full suite result

```
ℹ tests 54
ℹ suites 0
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 241.245
```

Verified from a clean checkout (`rm -rf node_modules && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **0/48**. Expected — matching end to end is T4.

## Deviations from the design

None from DT-2 itself. See the defect above: the *implementation's* first draft deviated from DEC-23's intent, not the design record, and was corrected within the task.

## Open items resolved

None of T2's design-phase open items (node capacity, split parameters — T1; performance harness wiring — T12) belong to this task. T2 had no assigned open items in the implementation plan's section 8.

## Follow-ups

**A user question surfaced during this task, worth keeping visible:** whether a dimension can validly have multiple roots. It can — `parentKey` is optional in the schema, nothing in OC 14.1 requires a single root, and the design's own `department` example (`rnd`, `eng`, neither with a parent) is already a two-root case. DT-2 section 2.3 and DEC-22 cover this, and the new tests make it executable rather than only documented. No design or code change resulted; this is a note for anyone reading the history who has the same question.

**`InvalidDimensionDefinitionError` is a plain `Error` subclass, not yet wired to the `INVALID_DIMENSION_DEFINITION` contract code.** That wiring is T7/T8's job (`OperationDispatcher` and the validation pipeline); T2 only needed the error to be distinguishable by type, which it is.
