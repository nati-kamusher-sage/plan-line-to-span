# T11: index fault injection

| Attribute | Value |
|---|---|
| Task | T11 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t11-index-fault-injection` |
| Design records | [DT-9](../design/dt-9-test-approach.md), [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | DEC-62, DEC-63 |
| Acceptance cases now passing | `AC-INIT-09`. Cumulative 43/48 (of 48; T8's 5 `AC-VAL-*` cases remain open). |

## What this changes

`IndexPort` is extracted as an interface in `src/store/index-adapter.ts`, covering exactly the surface `BenefitStore` calls (`size`, `insert`, `remove`, `findExact`, `searchMatching`, `all`). `IndexAdapter implements IndexPort`; `BenefitStore` now depends on `IndexPort`, not the concrete class. `OperationDispatcher` gains a constructor parameter, `buildIndexPort: IndexPortFactory`, defaulting to the real `RTree`/`IndexAdapter` construction it always used — every existing caller is unaffected.

Two new test-only files: `test/support/fault-injecting-index-port.ts` (`FaultInjectingIndexPort`, wraps a real `IndexPort` and throws `IndexFailureError` on a nominated operation after a configurable number of prior successful calls) and `test/contract/index-fault-injection.test.ts` (`AC-INIT-09` against the real dispatcher).

## Why `IndexAdapter` needed to become an interface, not just get a test double

The obvious first approach — write a `FaultInjectingIndexPort` class with the same public methods as `IndexAdapter` and pass it where `IndexAdapter` is expected — does not type-check. `IndexAdapter` has `private readonly` fields, and TypeScript's structural typing has an exception for classes with private members: a class is only assignable to a type with private fields if it is that class or a subclass, regardless of whether its public surface matches exactly. This was confirmed with an isolated reproduction (a `Real`/`Fake` pair with a private field) before treating it as a real constraint rather than a syntax mistake.

Extracting `IndexPort` — the surface `BenefitStore` actually calls — resolves this the way DT-9 already intended: DEC-62's own wording is "a seam at a port rather than inside an algorithm," and an interface *is* that port, made explicit instead of implicit in a concrete class's public methods.

## Why `OperationDispatcher` needed a constructor seam

`handleInitialize` built `IndexAdapter`/`RTree` directly with no way to substitute anything. `AC-INIT-09` needs `INDEX_FAILURE` to reach a real `Response` through the full dispatch path — not just `BenefitStore` in isolation — so the seam had to reach as far as wherever the index gets constructed.

The constructor now takes an optional `buildIndexPort: (model: DimensionModel) => IndexPort`, defaulting to the production wiring. This is an ordinary dependency-injection point: `OperationDispatcher` has no branch, flag, or import that is aware a test exists. `new OperationDispatcher()` behaves exactly as before; only a test that explicitly passes a factory sees different behavior.

## Why `FaultInjectingIndexPort` needed a `failAfter` count, not just an operation name

The acceptance case requires a benefit to already exist and remain queryable after a *later*, distinct create fails — but if the wrapped port fails on every call to the nominated operation (e.g. `insert`), nothing could ever have been created to exist as "prior" in the first place. The first test draft ran into exactly this contradiction and was discarded rather than patched around: `FaultInjectingIndexPort(real, 'insert')` alone cannot express "succeed once, then fail," so a `failAfter` count (default `0`, meaning fail immediately) was added. `AC-INIT-09`'s own test constructs the port with `failAfter: 1`, letting the first `createBenefit`'s `insert` succeed against the real index underneath before the second one fails.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/contract/index-fault-injection.test.ts` | Contract, 2 tests | `AC-INIT-09` end to end: a first create succeeds, a second injected `insert` failure returns `INDEX_FAILURE`, the utility stays `ready` (no lifecycle transition — OC 8.4), `benefitCount` is unaffected, the prior benefit is still queryable, and the failed span was never committed. A second test confirms the same mechanics for `findExact` (the `queryBenefit` path). |

## Confirmed as a side effect: `INDEX_FAILURE` now produces a real `error`-level log record

T10's PR noted `deriveLevel`'s `error` branch had only been checked directly in `log-record.test.ts`, with no path yet able to reach it through the real dispatch flow. Wiring `ObservabilityEmitter` around a dispatcher constructed with a fault-injecting port confirms the full path: an injected `INDEX_FAILURE` on `queryBenefit` produces `{"level":"error",...,"errorCode":"INDEX_FAILURE"}` through the real emitter, not a synthetic one. This was checked as a manual verification during this task rather than added as a permanent test, since `AC-OBS-*` and `AC-INIT-09` are already each covered on their own; a combined test would duplicate both without adding a new obligation.

## Full suite result

```
ℹ tests 189
ℹ suites 0
ℹ pass 189
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 673.59275
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **43/48** (of 48; `AC-VAL-01`, `-02`, `-04`, `-05`, `-07` remain open pending T8, which was skipped by explicit instruction).

## Deviations from the design

None from DT-9. `IndexPort`'s extraction and `OperationDispatcher`'s constructor factory are both the seam DEC-62 already called for, made concrete rather than left as an unaddressed gap between "the design says inject at the port" and there being an actual port type to inject at.

## Follow-ups

**T8's five `AC-VAL-*` cases remain open**, unchanged from T9/T10.

**T12 (performance harness)** is the only remaining task with cases still to close (none — T12 and T13 have zero acceptance cases per the plan) before the backend reaches 48/48-minus-T8's-5. T8 itself is the only case-bearing task left unaddressed.
