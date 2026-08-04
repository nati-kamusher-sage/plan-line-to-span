# DT-7: Performance Evaluation Approach

| Document attribute | Value |
|---|---|
| Status | Implemented and re-measured after ECP-1 |
| Design task | DT-7 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Operational Concept](../operational-concept.md) 15.2, 16.2 |
| Depends on | [DT-2](dt-2-dimension-to-axis-mapping.md), [DT-3](dt-3-empty-span-representation.md) |
| Retires | RISK-3 |
| Prototype | [measurement method](prototypes/dt-7-measurement-method.mjs) |

## 1. Decision

Measure **comparison counts**, not wall-clock time, and judge the OC 15.2 claim by **growth rate** rather than absolute numbers. Define four evaluation volumes and one pass condition.

No numeric latency or memory target is set. OC 16.2 assigned this item to design, and OC 15.2 deliberately states no target; this document does not introduce one.

## 2. What OC 15.2 actually claims

> Create, update, delete, `querySpan`, and `queryPlanLine` must use the index rather than scanning every stored span under normal operation.

This is a claim about *how cost grows*, not about any particular duration. A design that answers in 3 milliseconds is not thereby conformant, and one that takes 30 is not thereby in breach. The verifiable content is that cost must not grow in proportion to the number of stored spans.

That framing determines the metric.

## 3. Why comparison counts rather than wall clock

| Concern | Wall clock | Comparison count |
|---|---|---|
| Reproducibility | Varies by machine, load, and JIT warm-up | Deterministic |
| CI viability | Needs thresholds that flake | Exact assertion |
| Demo scale | Dominated by noise at hundreds of spans | Unaffected |
| Measures the claim | Indirect | Direct |

At demo volumes the whole operation completes in well under a millisecond, so timing measures scheduler noise more than algorithmic behavior. Counting the box comparisons the index performs measures precisely the thing OC 15.2 constrains, and does so identically on every machine.

Wall-clock duration is still *recorded* — the observability contract requires `durationMs` on every record — but it is reported, not asserted against.

## 4. The measurement method, and its validation

The method: hold the query fixed, grow the span count geometrically, and compare the growth in comparisons against the growth in data.

A metric that cannot fail is not a measurement. So the method was run against two implementations with known behavior — a deliberate linear scan and a bulk-loaded tree that prunes by bounding box:

```
spans      linear-scan   indexed
     125           125        20
     250           250        22
     500           500        26
    1000          1000        28

linear scan : size x8  cost x8.0  -> LINEAR
indexed     : size x8  cost x1.4  -> SUBLINEAR

method VALID: correctly flags the scan and clears the index
```

An eightfold increase in stored spans costs the scan exactly eight times more work and the index 1.4 times more. The method reaches the correct verdict for both, which is the evidence that it is measuring something.

Two details make the test honest rather than flattering:

**The query point lies inside the data range.** An out-of-range point is rejected by the root bounding box in a single comparison, which any tree passes trivially. Querying the middle of the data forces a real descent.

**The result set is held at exactly one match.** Otherwise a growing result would inflate the comparison count for reasons unrelated to pruning, and the metric would conflate work done finding matches with work done skipping non-matches.

## 5. Evaluation volumes

These are demo evaluation volumes. They exist to exercise the index, not to model a production workload.

| Volume | Dimensions | Values per dimension | Hierarchy depth | Spans |
|---|---:|---:|---:|---:|
| V1 minimal | 1 | 5 | 2 | 10 |
| V2 nominal | 3 | 50 | 3 | 500 |
| V3 wide | 8 | 20 | 2 | 1,000 |
| V4 deep | 2 | 200 | 6 | 2,000 |

V1 corresponds roughly to the `D1` fixture and confirms the harness agrees with the acceptance suite. V2 is the headline figure. V3 stresses dimensionality, which is where an n-dimensional R*-tree is most likely to degrade, since bounding-box overlap grows with axis count. V4 stresses hierarchy depth, which is what DT-2's interval labelling encodes.

The zero-dimensional model is excluded: it holds at most one span by DT-3's invariant, so growth is undefined and the question is meaningless.

## 6. Pass condition

For each volume, and for `queryPlanLine` and `querySpan`:

> Comparisons at 8N spans shall be fewer than 4 times comparisons at N.

Linear behavior produces a factor of 8. The threshold at 4 leaves room for the genuine growth an R*-tree exhibits — tree depth increases with size, and overlapping boxes force multi-branch descent — while still failing anything proportional to N.

The current harness measures the two query paths. Create, update, and delete have
different cost drivers inside the tree and remain a documented measurement gap; adding
meaningful counters for them requires algorithm-level instrumentation rather than
pretending a query count measures mutation work.

**On failure the design is at fault, not the threshold.** If a real index fails this, the response is to investigate the index, not to relax the number. The threshold is documented here so that moving it requires an explicit, visible change.

## 7. Harness design

The harness sits alongside the differential test from DT-2a's DEC-13, which already needs a naive linear-scan matcher. That matcher doubles as the control: it should fail the pass condition, confirming on every run that the harness can still detect a scan.

| Element | Design |
|---|---|
| Instrumentation | A comparison counter on `IndexAdapter`, incremented per box test. Enabled only under the harness. |
| Fixtures | Generated deterministically from a fixed seed, so counts are reproducible. |
| Control | The naive matcher from DEC-13, expected to fail the pass condition. |
| Reporting | A table of volume, span count, comparisons, and growth ratio, plus the verdict. |
| Placement | Runs on demand, not in the default test run; it is slower and its purpose is evidence, not regression detection. |

The counter must not be compiled into the production path. DT-1's minimal-dependency principle and the privacy rules both argue against instrumentation that is live by default.

## 8. Implementation measurements

T12 first ran the harness against the Phase 1 implementation. ECP-1 E3 reran the same
four volumes, seed (`20260804`), operations, and threshold after formulas, benefits,
employees, and semantic guard paths were removed. The comparison counts are shown side
by side:

| Volume | Operation | Phase 1 N | Phase 1 8N | Phase 1 ratio | ECP-1 N | ECP-1 8N | ECP-1 ratio |
|---|---|---:|---:|---:|---:|---:|---:|
| V1 minimal | `queryPlanLine` | 13 | 35 | 2.69 | 13 | 35 | 2.69 |
| V1 minimal | `querySpan` | 13 | 35 | 2.69 | 13 | 35 | 2.69 |
| V2 nominal | `queryPlanLine` | 29 | 62 | 2.14 | 29 | 62 | 2.14 |
| V2 nominal | `querySpan` | 29 | 62 | 2.14 | 29 | 62 | 2.14 |
| V3 wide | `queryPlanLine` | 44 | 54 | 1.23 | 44 | 54 | 1.23 |
| V3 wide | `querySpan` | 44 | 54 | 1.23 | 44 | 54 | 1.23 |
| V4 deep | `queryPlanLine` | 45 | 51 | 1.13 | 45 | 51 | 1.13 |
| V4 deep | `querySpan` | 45 | 51 | 1.13 | 45 | 51 | 1.13 |

Every real volume/operation pair remains below the `< 4` pass threshold. The V2 naive
linear-scan control again measured 500 comparisons at N and 4,000 at 8N, a ratio of
8.00, and correctly failed the threshold.

The identical before/after counts are expected evidence, not a missing effect: the
metric counts R\*-tree box comparisons. ECP-1 reduced the stored value and removed work
outside tree traversal, but did not change span geometry, tree construction, or the
search algorithm. This measurement establishes that the reductions caused no pruning
regression; it does not claim that comparison counts measure payload size or total
operation latency.

## 9. RISK-3 retirement

RISK-3 was that no volume, latency, or memory targets exist, making OC 15.2 unmeasurable and leaving no way to detect an accidentally linear design.

The risk is retired: volumes are defined, the metric is validated against known-linear
and known-sublinear implementations, the pass condition is explicit, the control fails
by construction, and both T12 and ECP-1 E3 measured the built R\*-tree successfully.

Memory is not measured. OC 16.2 mentions it, but at these volumes any measurement would be dominated by runtime overhead rather than the index, and no target exists to compare against. Recorded as a deliberate omission rather than an oversight.

## 10. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-45 | Measure comparison counts, not wall-clock time | Deterministic, machine-independent, and measures the claim directly. |
| DEC-46 | Judge OC 15.2 by growth rate against span count | That is what the clause actually constrains. |
| DEC-47 | Four evaluation volumes V1 to V4, stressing dimensionality and depth separately | Overlap grows with axis count; interval labelling encodes depth. |
| DEC-48 | Pass condition: cost at 8N below 4 times cost at N | Fails anything proportional to N while allowing genuine tree growth. |
| DEC-49 | The DEC-13 naive matcher is the harness control and must fail the pass condition | Proves on every run that the harness can still detect a scan. |
| DEC-50 | No numeric latency or memory target | OC 15.2 states none, and OC 16.2 forbids implying production targets. |
| DEC-51 | The comparison counter is harness-only, not in the production path | Instrumentation should not be live by default. |

## 11. Open items

| Item | Owner task |
|---|---|
| Mutation-path comparison instrumentation | Future performance work |
