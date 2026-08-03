# T5: Global span and zero-dimensional model

| Attribute | Value |
|---|---|
| Task | T5 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t5-global-zero-dim` |
| Design records | [DT-3](../design/dt-3-empty-span-representation.md) |
| Decisions implemented | DEC-14, DEC-15, DEC-16 |
| Acceptance cases now passing | `AC-GLOBAL-01` through `AC-GLOBAL-04`, `AC-ZERO-01`. Cumulative 16/48. |

## What this changes

Adds `test/contract/global-and-zero-dimensional.test.ts`, promoting `docs/design/prototypes/dt-3-representation-probe.mjs`'s scenarios against the real stack.

**No production code changes.** This is the notable fact about the task, not an omission: DEC-14 (global benefit stored in-index as an all-axis-covering box) and DEC-15 (the empty span is the omitted-dimension wildcard applied to every axis, not a special case) were already realized by construction the moment `DimensionModel.spanToBox` existed in T2 — an empty span's `Object.entries({})` loop simply never runs, leaving every axis at its `fullBox` default. DEC-16 (a zero-axis model has vacuous containment) was already covered at the `RTree` level by T1's zero-axis tests. Verified directly before writing anything: all five named cases passed against the T1-T4 stack with zero changes, checked one at a time with ad hoc scripts before committing to that conclusion.

## Design decisions implemented

**DEC-14, DEC-15 — the global benefit needs no special case.** `AC-GLOBAL-01` through `AC-GLOBAL-04` exercise create, both employee-match forms (non-empty and empty plan line), duplicate rejection, and the full update/delete/not-found lifecycle on `{}`, all through the same `BenefitStore` methods every other span uses.

**DEC-16 — zero axes, vacuous containment.** `AC-ZERO-01` builds a model with `dimensions: []`, confirms `dimensionCount` is `0`, and confirms the global benefit still matches the empty plan line through the same `IndexAdapter.searchMatching` path.

## Two scenarios promoted beyond the five named cases

The prototype covered two additional scenarios that are not their own catalogue IDs but are real correctness properties worth keeping as permanent tests:

**Coexistence.** A global benefit and an ordinary benefit stored together are independently addressable: `match` returns both for a plan line the ordinary benefit also applies to, and `exact` resolves each correctly by its own span.

**The negative case.** `AC-GLOBAL-*` tests the empty span's own lifecycle; it does not by itself prove the empty span cannot leak into an unrelated exact lookup. A dedicated test confirms `exact({location: '4'})` still throws `BenefitNotFoundError` when only the global benefit is stored — OC 9.1's no-broadening guarantee applies to the global span exactly as it does to every other span, which is a direct consequence of DEC-24's identity-by-canonical-key rule from T3, exercised here at the boundary DT-3 cared about.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/contract/global-and-zero-dimensional.test.ts` | Contract, 7 tests | `AC-GLOBAL-01` through `AC-GLOBAL-04`; `AC-ZERO-01`; global/ordinary-benefit coexistence; the global span does not leak into an unrelated exact lookup. |

## Full suite result

```
ℹ tests 97
ℹ suites 0
ℹ pass 97
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 393.856
```

Verified from a clean checkout (`rm -rf node_modules && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **16/48**.

## Deviations from the design

None.

## Open items resolved

None of T5's design-phase open items were assigned to this task in the implementation plan's section 8.

## Follow-ups

None. No new toolchain issues surfaced.
