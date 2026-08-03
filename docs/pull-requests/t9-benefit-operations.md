# T9: benefit operations

| Attribute | Value |
|---|---|
| Task | T9 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t9-benefit-operations` |
| Design records | [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | None new; this task verifies T3's `BenefitStore` and T7's `OperationDispatcher` wiring end to end rather than adding design decisions. |
| Acceptance cases now passing | `AC-BEN-01` through `AC-BEN-11`. Cumulative 38/48 (of 48; T8's 5 `AC-VAL-*` cases remain open — see below). |

## What this changes

One new file: `test/contract/benefit-operations.test.ts`, driving the real `OperationDispatcher` end to end for every `AC-BEN-*` case — raw JSON string in, `Response` out — against the D1 fixture. No production code changes were needed.

## Why no production code changed

T3's `BenefitStore` (`create`, `exact`, `update`, `delete`) and T7's `OperationDispatcher` handlers already implement every behavior `AC-BEN-01` through `AC-BEN-11` require: duplicate detection by canonical span, exact (non-hierarchical) lookup, span-preserving update via remove-then-reinsert, and `NOT_FOUND` on absent update/delete. T9's job was to verify this holds through the full contract surface, not to build it — the plan calls this out explicitly (T9's own "Tests" line: "full lifecycle sequences; opaque-formula preservation with a sentinel"), and that is exactly what this PR adds. All 11 cases passed on the first run, which is expected confirmation of T3/T7's correctness rather than evidence of a fix.

## T8 was skipped

By explicit instruction, T8 (validation pipeline / `FormulaValidator`) was skipped in favor of proceeding directly here. Consequences visible in this PR:

- `formula` is currently unvalidated end to end. `AC-BEN-11`'s round-trip test passes an object formula, which is the only case that happens to require, since nothing yet enforces the non-null/non-array/size-limit rules `AC-VAL-07` would otherwise check.
- `INVALID_FORMULA` remains a declared response code (`response.ts`) that nothing produces. A `createBenefit`/`updateBenefit` with `formula: null` or `formula: []` currently succeeds rather than being rejected — this is a real, known gap, not silently hidden.
- The cumulative acceptance-case count is annotated in `implementation-plan.md` as "(of 48; T8's 5 remain open)" for every task from here through T13, rather than letting a later task's total silently imply those 5 cases were covered.

## AC-BEN-11: what this task closes and what it does not

The case has two parts. **Structural preservation** — a formula with nested arrays, booleans, `null`, and a sentinel string round-trips identical through `create` then `queryBenefit` — is verified here, driven through the real dispatcher and store. **Log privacy** — "log: success records do not contain the sentinel" — cannot be checked yet, because `ObservabilityEmitter` (DT-8 DEC-52 to DEC-59) does not exist until T10. The test's final comment states this explicitly rather than silently treating the case as fully closed.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/contract/benefit-operations.test.ts` | Contract, 11 tests | `AC-BEN-01` through `AC-BEN-11` against the real `OperationDispatcher`/`BenefitStore`/`IndexAdapter` stack. Covers create, duplicate rejection, exact query, member-order independence, hierarchy non-broadening, update, malformed update rejection, delete, empty-index `NOT_FOUND`, a combined multi-failure sequence, and opaque-formula structural preservation. |

## Full suite result

```
ℹ tests 161
ℹ suites 0
ℹ pass 161
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 512.546958
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **38/48** (of 48; `AC-VAL-01`, `-02`, `-04`, `-05`, `-07` remain open pending T8).

## Deviations from the design

None. No new design decisions were needed; this task exercises existing components through the contract surface.

## Follow-ups

**T8's five `AC-VAL-*` cases remain open**, by explicit instruction to proceed to T9 first. `FormulaValidator` does not exist; `formula` is accepted unvalidated.

**`AC-BEN-11`'s log-privacy half is T10's to close**, once `ObservabilityEmitter` exists.
