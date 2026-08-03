# T1: N-dimensional R*-tree core

| Attribute | Value |
|---|---|
| Task | T1 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t1-index-core` |
| Design records | [DT-2a](../design/dt-2a-index-library-evaluation.md), [DT-2](../design/dt-2-dimension-to-axis-mapping.md), [DT-3](../design/dt-3-empty-span-representation.md) |
| Decisions implemented | DEC-1, DEC-11, DEC-16, DEC-17, DEC-18, DEC-65. **DEC-12 deviated from — see below.** |
| Acceptance cases now passing | None; foundation task. Cumulative 0/48. |

## What this changes

The demo now has a working n-dimensional R*-tree. `src/index/box.ts` holds the geometry primitives and `src/index/rtree.ts` the tree, generalized from RBush's two fixed axes to an axis count decided at construction and permitted to be zero.

The project is TypeScript under `strict`, with `tsc --noEmit` gating the test suite. Node 24 strips types natively, so tests run directly against `.ts` sources with no build step and no test framework.

This is the first task, and it carries IR-2: every design-phase risk retirement rested on a linear-filter stand-in rather than real index code. Those retirements now have an implementation behind them.

## Design decisions implemented

**DEC-1 — Node with TypeScript.** Sources and tests are `.ts`, type-checked with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, and `noUnusedParameters`. `npm test` runs `tsc --noEmit` first, so a type error fails the suite rather than being discovered later.

`RTree<T>` is generic in its payload. The tree never inspects a ref, which is how the type system expresses DEC-31's requirement that geometry stay out of benefit identity — `BenefitStore` will instantiate it with its own entry type and the index cannot reach into it.

**DEC-11 — implement the index, generalizing `rbush` under MIT with attribution.** The R*-tree algorithms follow the reference: choose-subtree by least area enlargement, split-axis by minimum total margin, split-index by minimum overlap, and bounding-box condensing on removal. What changed is that every geometric quantity is computed across `axisCount` axes rather than two, and `_chooseSplitAxis` evaluates all axes rather than comparing x against y. Attribution is in `NOTICE`.

**DEC-16 — containment over zero axes returns true.** `contains([], [])` is vacuously true, which is what makes the global empty span match an empty plan line without a special case.

**DEC-17 — node splitting asserts a non-zero axis count.** `_split` throws with an explanatory message rather than letting the heuristic read an axis that does not exist. Unreachable in the real system, since only one span is expressible when no dimensions are defined, so the assertion exists to make a future violation loud.

**DEC-18 — empty product and empty sum.** `area([])` is 1 and `margin([])` is 0, implemented as loop identities rather than special cases.

**DEC-65 — deterministic seeded generation.** The property tests use a fixed seed, so a failure is reproducible from the test file alone.

## Deviation from the reference: removal

RBush narrows its removal descent using the entry's bounding box. This implementation removes by predicate on the payload instead, so the descent is an ordinary depth-first walk.

This is deliberate and follows DEC-24 and DEC-31: `BenefitStore` identifies benefits by canonical span key, never by geometry, so a box-guided removal would couple identity to the hierarchy encoding — exactly what DT-2 section 3 argues against. The cost is that removal visits more nodes than it strictly must. At demo volumes that is immaterial, and correctness of identity matters more than removal speed.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/box.test.ts` | Unit, 12 tests | Zero-axis conventions for area, margin, and containment; containment strict on every axis and inclusive at boundaries; `extend`, `enlargedArea`, `intersectionArea`. |
| `test/unit/rtree.test.ts` | Unit, 15 tests | Insert, search, remove, clear; multi-axis exclusion; full-box global geometry; entry preservation across repeated splits; removal after splitting; the three zero-axis behaviors including the DEC-17 assertion. |
| `test/property/rtree-vs-bruteforce.test.ts` | Property, 3 tests | Search agrees with a brute-force filter over 200 random models and 2,000 queries; agreement survives interleaved removals across 60 more models; identical boxes do not collapse. |

The property test is the DEC-13 pattern applied early: an obviously-correct oracle compared against the implementation over inputs nobody chose. It found nothing here, but it is the test most likely to catch a split-heuristic defect later.

## Full suite result

```
ℹ tests 30
ℹ suites 0
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 236.953958
```

`npm test` runs `tsc --noEmit` first, so this result includes a clean type check. Verified from a clean checkout: `rm -rf node_modules && npm install && npm test` gives the same result. The fourteen design prototypes also still pass via `npm run prototypes`.

Cumulative acceptance cases: **0/48**. Expected for a foundation task.

## Defects found and fixed during the task

### Written in JavaScript first

The task was initially implemented in plain JavaScript. DEC-1 specifies Node **with TypeScript**, and DT-1 section 2.5 explicitly *rejected* plain JavaScript, on the grounds that it discards compile-time modelling of the nine error codes, four states, and envelope shapes for no benefit.

This was a deviation introduced without noticing it and without recording it, which is exactly the failure the plan's section 3.2 warns about. It was caught by review, not by the process. Converted in full: sources, tests, and a `tsconfig.json` with strict settings.

Worth recording rather than quietly fixing, because the first task setting the wrong language would have propagated to every task after it.

### Size counter driven negative

The unit and property tests caught a real bug before merge. `remove` decremented `_size` after calling `_condense`, but when removal empties the root, `_condense` calls `clear()`, which resets the size to zero — so the subsequent decrement drove it to −1.

Three tests failed on it: `removing the last entry empties the tree`, `a zero-axis tree supports removal`, and the interleaved-removal property test. Fixed by decrementing before condensing, with a comment recording why the order matters.

Worth noting because the zero-axis case and the property test each caught it independently. A suite that only exercised the happy path would have shipped it.

## Deviations from the design

**DEC-12 — `quickselect` is not consumed.** The decision expected it as an unmodified dependency, on the reasoning that it is dimension-independent so there was no reason to reimplement it.

That reasoning was sound but the premise was wrong: `quickselect` supports RBush's *bulk loading*, and this implementation has no bulk-load path. Nothing calls it. It was briefly added, imported, and re-exported solely to satisfy the decision — which is declaring a dependency to look compliant rather than using one — and has been removed.

The demo inserts benefits one at a time through `createBenefit`, so bulk loading has no caller in the contract. If a later task adds one, `quickselect` should be added back then and DEC-12 reinstated.

**No other deviation.** The removal-by-predicate difference described above is a deviation from the RBush *reference*, not from any design record; DEC-24 and DEC-31 require it.

## Open items resolved

| Item | Resolution |
|---|---|
| Node capacity, split parameters, reinsertion policy | Capacity 9 and minimum fill 40%, both retained from the reference and from the R*-tree paper's recommendation. Configurable per tree. Forced reinsertion is **not** implemented — see follow-ups. |
| Attribution notice placement | `NOTICE` at the repository root, referenced from the source header. |
| Test-runner selection | Node's built-in `node --test`, per DT-1's minimal-dependency principle. No test framework added. Node 24 strips TypeScript natively, so no build step or transpiler is needed either. |

## Follow-ups

**Forced reinsertion is not implemented.** The R*-tree paper's forced-reinsert step improves tree quality on skewed data, and RBush omits it too. If T12's performance harness shows worse pruning than expected, this is the first thing to add. Recorded rather than done, because adding an optimization before measuring would contradict DT-7's whole approach.

**Bulk loading is not implemented.** Neither the contract nor the acceptance cases need it, since benefits arrive one at a time. If T12's measurements suggest tree quality suffers from incremental insertion, bulk loading plus `quickselect` is the remedy, and DEC-12 would be reinstated at that point.

**The project has no runtime dependencies at all.** The devDependencies are `typescript`, `@types/node`, and `ajv` (the last for T6). This is a stronger position than DT-1's minimal-dependency principle anticipated, and worth preserving.

**No lint rule enforces the static checks DT-9 requires yet.** DEC-64 calls for `handlers-never-await` and `emitter-sole-stdout-writer` as static checks. Neither has a subject yet — T7 and T10 introduce the code they constrain. The `tsconfig` strictness added here is the foundation they will build on.
