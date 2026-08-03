# T4: Employee matching

| Attribute | Value |
|---|---|
| Task | T4 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t4-matching` |
| Design records | [DT-2](../design/dt-2-dimension-to-axis-mapping.md), [DT-2a](../design/dt-2a-index-library-evaluation.md) (DEC-13) |
| Decisions implemented | DEC-13 |
| Acceptance cases now passing | `AC-MATCH-01` through `AC-MATCH-11`. Cumulative 11/48. |

## What this changes

Wires `resolveSpan`, `DimensionModel`, `IndexAdapter`, and `BenefitStore` together against the `D1` fixture to make all eleven `AC-MATCH-*` cases executable, and adds the DEC-13 differential test comparing the real store against a naive scan-and-check oracle.

`test/support/d1.ts` is new: the `D1` fixture as the acceptance catalogue defines it, plus a `buildBenefitStore` helper, shared so later tasks' tests reference the same fixture rather than each restating it. T9 owns the permanent test architecture; this is the minimal shared piece T4 needs now.

## Acceptance cases

All eleven pass in `test/contract/matching.test.ts`, driving the real domain stack rather than the design prototype's linear-filter stand-in:

- `AC-MATCH-01` through `AC-MATCH-09` — direct equality, one- and multi-level ancestor matching, child-does-not-match-parent, employee-only dimensions, missing required dimensions, AND semantics, empty-result, and result-set stability across repeated queries.
- `AC-MATCH-10` and `AC-MATCH-11` — the section 12 scenario (OC 12, 12.2): four benefits (`B1`-`B4`), matched against a New York City R&D employee and three more plan lines, confirming the New York City span never matches a Los Angeles employee.

## A test defect, found and corrected through careful verification rather than accepted at face value

The DEC-13 differential test failed on its first run:

```
AssertionError: trial 0 planLine={"d1":"v2","d2":"v0"} storedSpans=[...17 entries...]
actual: [ 1, 4, 5 ], expected: [ 1, 3, 4 ]
```

Tracking this down took real effort, and it is worth recording in full because the eventual conclusion reverses the initial diagnosis.

**First hypothesis: a defect in `RTree`.** Hand-tracing the query against the dumped tree structure suggested `RTree.search` was returning an entry whose stored box did not match its own span. A minimal two-entry reproduction did not reproduce it, so the working theory moved to something split-related, since the failing case had 17 entries against a default capacity of 9.

**A controlled 20-entry, single-axis stress test of `RTree` alone — inserting and verifying every leaf's box against its own recorded box after repeated splits — found zero mismatches.** This ruled out `RTree` and forced a return to the harness itself.

**The actual defect: the test's own oracle.** The test built `storedSpans: Record<string,string>[]` by pushing to it only when `store.create` succeeded, skipping duplicates. But the outer loop's counter `i` — used as the stored formula value — kept advancing regardless of whether a duplicate was skipped. Once the first duplicate was skipped, `storedSpans[5]` (array position) no longer corresponded to formula `5`; it was off by however many duplicates had been skipped before it. The "mismatch" was the test comparing the wrong span to the wrong formula, not a defect in `BenefitStore` or `RTree` at all.

Confirmed by dumping the tree with each entry's real `span.dimensions` restored from the stored `CanonicalSpan` rather than from array position, and by writing a corrected oracle directly against that: `store.match` and the honest oracle agreed exactly, `[1, 4, 5]`, on the disputed query.

Fixed by keying stored spans with a `Map<number, Record<string,string>>` from formula to span, so the oracle can never drift from what was actually inserted regardless of how many duplicates are skipped.

**Why this is worth the length it takes to explain:** a differential test is only as trustworthy as its own bookkeeping. This one initially implicated the wrong component, and the investigation to establish that took a controlled isolation test, a full tree dump, and a hand-verified oracle before the actual fault was located. Both the index and the store were correct throughout; only the test's accounting was wrong.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/support/d1.ts` | Fixture | The `D1` fixture and a `buildBenefitStore` helper, shared across test files. |
| `test/contract/matching.test.ts` | Contract, 11 tests | All eleven `AC-MATCH-*` cases against the real domain stack. |
| `test/property/matching-vs-naive-scan.test.ts` | Property, 1 test, 900 queries | `BenefitStore.match` against a naive scan-and-check oracle across 60 randomly generated models (up to 3 dimensions, up to 25 stored benefits each), keyed correctly by formula rather than array position. |

## Full suite result

```
ℹ tests 90
ℹ suites 0
ℹ pass 90
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 321.517625
```

Verified from a clean checkout (`rm -rf node_modules && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **11/48**.

## Deviations from the design

None. This task assembles existing components per DT-2/DT-4 rather than introducing new design decisions.

## Open items resolved

None of T4's design-phase open items were assigned to this task in the implementation plan's section 8.

## Follow-ups

None beyond the standing constraints already recorded (no TypeScript parameter-property shorthand, from T3). No new toolchain issues surfaced in this task.
