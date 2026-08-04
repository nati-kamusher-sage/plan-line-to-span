# T12: performance harness

| Attribute | Value |
|---|---|
| Task | T12 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t12-performance-harness` |
| Design records | [DT-7](../design/dt-7-performance-evaluation.md) |
| Decisions implemented | DEC-45, DEC-46, DEC-47, DEC-48, DEC-49, DEC-50, DEC-51 |
| Acceptance cases now passing | None — T12 carries zero acceptance cases per the plan. **Resolves ISSUE-D1**, the one design-phase item that could not be closed before code. |

## What this changes

`RTree.searchCounting`, one new method alongside the existing `search`/`searchIntersecting`, invoking a callback once per box comparison during traversal — `search` and `searchIntersecting` are byte-for-byte unchanged. `test/performance/volumes.ts` builds the four DT-7 evaluation volumes deterministically from a seed. `test/performance/growth-harness.ts` measures comparison growth from N to 8N benefits for `queryBenefit` and `queryEmployee` against each volume, applies DEC-48's pass condition, and runs the DEC-13 naive-scan matcher as a control. `package.json` gains an `npm run performance` script; the harness is not a `*.test.ts` file and does not run under `npm test`, per DT-7 section 7's Placement row.

## Why `RTree` needed a new method rather than reusing `search`

`search`/`searchIntersecting` hardcode the box-comparison function (`contains`/`intersects`) with no injection point. DEC-51 requires the counter to not be compiled into the production path, so the fix could not touch either existing method — `searchCounting` shares the same private `_search` traversal but wraps the test function in a counting closure built fresh per call. Every existing caller of `search`/`searchIntersecting` is provably unaffected, since neither method's source changed at all.

## Three problems discovered while building the volume fixtures, none in production code

**V1's stated benefit count cannot be reached through its stated dimension shape.** DT-7 section 5 states V1 as 1 dimension, 5 values, depth 2, 10 benefits. But `BenefitStore` forbids duplicate canonical spans (OC 6.6), and a single dimension with 5 values total supports at most 5 distinct non-empty single-value spans — nowhere near 10. This is an inconsistency in DT-7's own volume table. It turned out not to block the harness (see below), so V1's benefit count is kept exactly as DT-7 states; the inconsistency is recorded here rather than silently worked around.

**A purely random per-dimension span assignment cannot guarantee "exactly one match" at scale.** DT-7 section 4 requires the query's result set to be held at exactly one match, since a growing result set would inflate comparison counts for reasons unrelated to pruning. A first draft assigned each span's per-dimension values independently at random; this makes collision (two spans sharing an identical full value combination) merely unlikely, not impossible, and becomes materially likely at V2's scale (500 spans against a combinatorial space of roughly 125,000). Fixed with a bijective index-to-combination mapping (Fisher–Yates shuffle over the combination-index space), which was then found insufficient for the next problem.

**The 8N requirement makes leaf-combination uniqueness infeasible for two volumes at once.** DEC-48 requires measuring comparisons at both N and 8N for the same index shape. V1 (1 dimension, 5 values) has only 5 possible combinations total, far short of 8N=80; V4's leaf level (2 dimensions, ~33 values each after a 6-level split) offers roughly 1,089 combinations, short of 8N=16,000. No per-dimension-only uniqueness scheme can reach 8N for both volumes simultaneously. Resolved by adding one synthetic, non-hierarchical `seq` dimension sized to `8×benefits`, used only to guarantee span identity — every span's `seq` value alone is unique, so the volume's *stated* dimensions are free to repeat across spans however they like, preserving each volume's real axis count and hierarchy depth exactly as DT-7 specifies rather than distorting it to reach a benefit count.

## Results: first execution against the real index

```
--- DT-7 performance harness: growth of comparisons from N to 8N ---

volume                          operation                       N       8N        ratio   verdict
V1 minimal                      queryEmployee (searchMatching)  13      35        2.69    SUBLINEAR
V1 minimal                      queryBenefit (findExact)        13      35        2.69    SUBLINEAR
V2 nominal                      queryEmployee (searchMatching)  29      62        2.14    SUBLINEAR
V2 nominal                      queryBenefit (findExact)        29      62        2.14    SUBLINEAR
V3 wide                         queryEmployee (searchMatching)  44      54        1.23    SUBLINEAR
V3 wide                         queryBenefit (findExact)        44      54        1.23    SUBLINEAR
V4 deep                         queryEmployee (searchMatching)  45      51        1.13    SUBLINEAR
V4 deep                         queryBenefit (findExact)        45      51        1.13    SUBLINEAR

--- DEC-49 control: the naive linear scan must fail the pass condition ---

volume                          operation                       N       8N        ratio   verdict
V2 nominal (naive-scan control) queryEmployee (searchMatching)  500     4000      8.00    LINEAR

--- verdict ---
PASS: every real volume/operation is sublinear (growth ratio < 4), and the naive-scan control correctly fails (ratio ~8, confirming no pruning).
```

Every volume passes with considerable margin — V3 and V4 (the dimensionality- and depth-stress volumes) show the strongest sublinearity (ratios of 1.13–1.23), while V1 and V2 sit at 2.14–2.69, still comfortably under the threshold of 4. The naive-scan control shows exactly the expected ratio of 8.00 (no pruning at all), confirming the harness can still tell a scan from an index. **ISSUE-D1 is resolved**: the OC 15.2 claim is no longer merely designed-for, it is demonstrated against the built `RTree`.

`queryBenefit` and `queryEmployee` show identical comparison counts in this run. This is expected, not a bug: `IndexAdapter.findExact` narrows candidates via the same `tree.search` traversal `searchMatching` uses before filtering by `CanonicalSpan.equality`, and both measurements here use the same fully-specified query point — the box traversal is geometrically identical.

## Deliberately out of scope: mutation comparisons

DT-7 section 6 states that create, update, and delete should be measured the same way, since each locates a position before acting. This PR does not instrument them. `insert`'s cost driver is `_chooseSubtree`'s enlargement-area comparisons and `remove`'s is `_condense`'s ancestor bounding-box recalculation — both structurally different from the search path's `contains`/`intersects` tests, and instrumenting them would mean touching `_insert`/`_chooseSubtree`/`_condense`'s actual algorithm code directly, not adding one parallel method alongside untouched originals the way `searchCounting` does for search. Given DEC-51's caution about instrumentation risk and DT-1's minimal-invasiveness principle, and since the acceptance catalogue ties zero cases to T12, this is recorded as an explicit, deliberate gap rather than folded into this PR's scope.

## Full suite result

```
ℹ tests 189
ℹ suites 0
ℹ pass 189
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 739.410542
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), the fourteen design prototypes still pass via `npm run prototypes`, and `npm run performance` passes as shown above. The harness does not run under `npm test` (it is not a `*.test.ts` file), matching DT-7's placement requirement.

Cumulative acceptance cases: unchanged at **43/48** (of 48; `AC-VAL-01`, `-02`, `-04`, `-05`, `-07` remain open pending T8, which was skipped by explicit instruction). T12 carries no acceptance cases of its own.

## Deviations from the design

**V1's benefit count is inconsistent with its stated dimension shape** in DT-7's own table (see above); kept as stated since the synthetic `seq` dimension makes it achievable regardless, and the inconsistency is about the *stated* dimension's own combinatorics, not about anything this implementation needed to change.

**Mutation comparisons (create/update/delete) are not measured**, an explicit, documented gap rather than a silent omission (see above).

No other deviations from DT-7.

## Follow-ups

**Mutation comparison measurement** would need counting variants threaded through `_chooseSubtree` and `_condense`, a larger change to `RTree`'s actual algorithm code than this task's scope.

**T8's five `AC-VAL-*` cases remain open**, unchanged from T9/T10/T11.

**T13 (frontend)** is the only remaining task, per the plan's sequencing (added only after the backend passes all 48 cases — currently 43, pending T8).
