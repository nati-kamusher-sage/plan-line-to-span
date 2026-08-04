# DT-2a: Index Library Evaluation

| Document attribute | Value |
|---|---|
| Status | ECP-1 amended; index decision retained |
| Design task | DT-2 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md), library-selection portion |
| Governing input | [Operational Concept](../operational-concept.md) 9.2 and 15.2, [DT-1](dt-1-architectural-context.md) |
| Retires | RISK-4 |
| Direction given | Adapt a library, but only if it is reliable and safe |
| Evaluation date | 2026-07-31 |

## 1. Outcome

**No available library can be adapted.** The instruction was to adapt one only if it is reliable and safe. The reliable libraries are safe but cannot express the demo's problem; the libraries that could express it are not reliable. The recommendation is therefore to implement the index directly, generalizing a permissively-licensed reference implementation.

This is the instruction's own conditional resolving to its negative branch, not a departure from it.

## 2. What the demo requires of an index

The dimension count is set at initialization from the dimension file and is not bounded by the baseline. OC 7 admits a zero-dimensional model, and nothing caps the maximum. An index must therefore support an **arbitrary number of axes decided at runtime**.

This is the requirement every candidate fails.

## 3. Candidates evaluated

Package health was measured on 2026-07-31 from the npm registry.

| Package | Version | License | Weekly downloads | Last published | Direct deps | `npm audit` | Dimensions |
|---|---|---|---:|---|---:|---|---|
| `rbush` | 4.0.1 | MIT | 5,289,298 | 2024-08-21 | 1 | 0 vulnerabilities | **Exactly 2** |
| `rbush-3d` | 0.1.2 | MIT | 33,391 | 2026-05-27 | 1 | 0 vulnerabilities | **Exactly 3** |
| `rtree` | 1.4.2 | MIT | 12,063 | 2022-06-26 | — | not assessed | 2 |
| `spatial-index` | 1.0.2 | MIT | 10 | 2022-05-18 | 1 | not assessed | k-d tree, not R*-tree |

### 3.1 `rbush` — reliable and safe, but structurally 2-dimensional

On every health measure `rbush` is exemplary: 5.3 million weekly downloads, MIT, a single well-maintained dependency, bundled TypeScript types, and a clean audit with only two transitive packages. If the demo needed a 2-dimensional index, this evaluation would end here.

It cannot be generalized. The two-dimensionality is not a configuration choice but is compiled into the data structure and every heuristic:

- Node records carry exactly `minX`, `minY`, `maxX`, `maxY`.
- `bboxArea` and `bboxMargin` compute a 2-dimensional area and perimeter.
- The R*-tree split heuristic sorts on `compareMinX` and `compareMinY` and chooses between exactly two axes.
- Enlargement and intersection tests are written against the same four fields.

Generalizing it would mean rewriting the node representation, the area and margin functions, the choose-subtree logic, and the split algorithm — which is to say, rewriting the library.

### 3.2 The silent-wrong-answer test

The tempting shortcut is to pass extra axis fields to `rbush` and hope they are respected. They are not, and the failure mode is the dangerous kind. A direct probe:

```js
const t = new RBush();
t.insert({minX:0,maxX:10,minY:0,maxY:10,minZ:0, maxZ:1,  id:'A'});
t.insert({minX:0,maxX:10,minY:0,maxY:10,minZ:90,maxZ:99, id:'B'});
t.search({minX:1,maxX:2,minY:1,maxY:2,minZ:0,maxZ:1});
// returns A and B
```

`B` is disjoint from the query on the third axis and must not match. `rbush` returns it. Extra fields are carried as opaque payload and never compared.

Applied to the demo, this means `queryPlanLine` would return spans that do not apply to the plan line — a direct violation of OC 9.2 — with no error raised. The utility would silently produce wrong matches. Since the acceptance catalogue rests on exact result sets, this option is disqualified outright.

Post-filtering the results would mask the wrongness but not fix it: correctness would then depend on a linear scan over false positives, which violates OC 15.2's requirement that operations use the index rather than scanning.

### 3.3 `rbush-3d` — same wall, one dimension further out

`rbush-3d` hard-codes `minX/minY/minZ/maxX/maxY/maxZ`. It moves the ceiling from two dimensions to three and is otherwise the same structural constraint. Its adoption is two orders of magnitude below `rbush`, and a demo whose dimension model is defined at runtime cannot rely on never exceeding three dimensions.

### 3.4 The remaining candidates

`rtree` has not been published since 2022 and is 2-dimensional. `spatial-index` receives roughly ten downloads a week and is a k-d tree rather than an R*-tree, so it fails both the reliability bar and the fixed R*-tree demonstration objective confirmed in the design plan's section 2.1.

## 4. Assessment against the instruction

The direction was to adapt a library only if it is reliable and safe. Both words were tested, and the two properties turn out to be unsatisfiable together here.

| Requirement | Result |
|---|---|
| Reliable — actively maintained, widely adopted, clean audit | `rbush` passes comfortably; nothing else does. |
| Safe — cannot silently produce wrong results | `rbush` fails for this problem. Beyond two dimensions it returns false positives with no error. |
| Fit — arbitrary runtime dimension count | No candidate passes. |
| Fit — R*-tree, per the fixed demonstration objective | `spatial-index` fails; the rest are R-tree family. |

A library that is safe in general becomes unsafe when used outside the shape it was built for. `rbush` used at three or more dimensions is exactly that case.

## 5. Recommendation

Implement the n-dimensional R*-tree directly, generalizing `rbush` as the reference.

The scope is bounded and the provenance is clean:

- `rbush` is 594 lines of MIT-licensed code implementing precisely the R*-tree algorithms required, in the target language.
- Its sole dependency, `quickselect` (74 lines, ISC), is dimension-independent and can be consumed unmodified as a normal dependency.
- The generalization is mechanical in shape: replace the four fixed bounds with coordinate arrays, replace area and margin with their n-dimensional products and sums, and generalize the split heuristic to choose among n axes rather than two.
- The R*-tree insertion, choose-subtree, split, and condense algorithms are published and stable. This is not novel work.

MIT permits this with attribution. The derivation must be recorded in the source and in the project's licence notices.

### 5.1 Why this is a good outcome rather than a fallback

DT-1 anticipated this under RISK-4 and noted that implementing the index makes the demonstration objective more visible rather than less. That holds. The demo exists to show dimension-aware matching working through a spatial index; an R*-tree the team has built and can explain demonstrates that better than an opaque dependency, and it removes the risk of the whole demonstration resting on a library that turns out not to fit.

It also keeps the dependency surface small, which DT-1 recorded as a principle for both maintenance and the observability privacy prohibitions.

### 5.2 Residual risk

A hand-written index is code the team owns and must test. Three mitigations are already in place.

The correctness bar is external and pre-existing: `AC-MATCH-01` through `AC-MATCH-11`, the `AC-GLOBAL-*` cases, and the `AC-ZERO-*` cases define expected result sets that the index must reproduce exactly. The DT-2 exit criterion already requires the prototype to satisfy them.

DT-7 measures whether query cost grows linearly with span count, which is the check that catches an index that is structurally correct but has lost its pruning behavior — the most plausible way a hand-written R*-tree goes wrong quietly.

The DT-1 adapter boundary means the engine depends on a domain-level index interface, so a later replacement would not disturb the component structure.

An additional safeguard is worth adopting in DT-9: differential testing against a deliberately naive linear-scan matcher. The naive matcher is trivial to write and obviously correct, so any disagreement between it and the R*-tree on randomly generated models and spans localizes an index defect immediately. This also gives DT-7 the comparison baseline it needs to demonstrate that the index is doing real pruning.

## 6. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-9 | No third-party spatial index is adopted | No candidate supports an arbitrary runtime dimension count. |
| DEC-10 | `rbush` is rejected despite excellent health | Structurally 2-dimensional; silently returns false positives beyond two axes, violating OC 9.2. |
| DEC-11 | Implement an n-dimensional R*-tree, generalizing `rbush` under MIT with attribution | Bounded scope, published algorithms, clean licence, small dependency surface. |
| DEC-12 | Consume `quickselect` unmodified as a dependency | Dimension-independent, ISC, no reason to reimplement. |
| DEC-13 | Differential-test the index against a naive linear-scan matcher | Independent correctness oracle, and the DT-7 pruning baseline. |

## 7. Open items

| Item | Owner task |
|---|---|
| The axis-coordinate mapping the index will hold, including hierarchy interval labelling | DT-2, main body |
| Node capacity, split strategy parameters, and the reinsertion policy | DT-2 |
| Where the global empty span is held relative to the index | DT-3 |
| Differential-testing harness and generators | DT-9 |
| Attribution notice placement | DT-4 or implementation |
