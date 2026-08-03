# T3: Canonical span and benefit store

| Attribute | Value |
|---|---|
| Task | T3 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t3-span-store` |
| Design records | [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | DEC-24, DEC-31 |
| Acceptance cases now passing | None; foundation task. Cumulative 0/48. |

## What this changes

Three new modules complete the store side of the domain core:

- `src/model/span.ts` — `CanonicalSpan` and `resolveSpan`, giving a span its identity independent of member order or geometry.
- `src/store/index-adapter.ts` — `IndexAdapter`, the domain-facing port over `RTree`, expressed in spans and plan lines rather than boxes and points.
- `src/store/benefit-store.ts` — `BenefitStore`, which owns create/exact/update/delete/match and is the only component in this path that mutates.

This closes the chain from a raw dimension-value map to a stored, identifiable benefit: T1 provides the geometry, T2 the model that produces it, T3 the identity and storage built on both.

## Design decisions implemented

**DEC-24 — `Query Benefit` uses the canonical span key, never the geometry.** This is the part of the task with a real trap, and it surfaced immediately on writing the first adversarial test (see below). `IndexAdapter.findExact` narrows candidates using `RTree.search`, but that method returns every stored box that *contains* the query box — not only boxes equal to it. An ancestor's wider interval always contains a descendant's narrower one, so searching for a child span's own box can return the parent's entry alongside it. `findExact` filters the candidates by `CanonicalSpan.equals` before returning, so identity is decided by the key, and the geometry is used only to narrow the search space. `BenefitStore.exact` inherits this and is what makes AC-BEN-05 (hierarchy must not broaden exact lookup) hold.

**DEC-31 — `IndexAdapter` is expressed in spans and plan lines, not boxes and points.** Its public methods (`insert`, `remove`, `findExact`, `searchMatching`) take `CanonicalSpan` and plan-line maps; box and point construction happen inside, via `DimensionModel`. `BenefitStore` never imports anything from `src/index/`.

## A toolchain defect found and fixed during the task

Writing `CanonicalSpan`'s private constructor with the terse TypeScript parameter-property form —

```ts
private constructor(
  public readonly dimensions: Readonly<Record<string, string>>,
  public readonly key: string,
) {}
```

— type-checks cleanly under `tsc --noEmit` but fails at runtime:

```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
```

Node's native type-stripping (the mechanism T1 chose specifically to avoid a build step) does not support the `public`/`private`/`readonly` parameter-property shorthand at all. `tsc --noEmit` cannot catch this, because the code is perfectly valid TypeScript; it is a runtime capability gap in the stripper, invisible to the type checker that gates the suite.

Four sites used the pattern: two error classes and `CanonicalSpan`'s constructor in `span.ts`, and the constructors of `BenefitStore` and `IndexAdapter`. All four are rewritten as explicit field declarations plus assignment in the constructor body. **This also affected T3's own new code, not inherited code** — T1 and T2 happened not to use the pattern, so this is the first task to hit it.

This is a standing constraint on every future task: **do not use TypeScript parameter-property shorthand anywhere in `src/` or `test/`.** `tsc --noEmit` will not catch a violation; only running the suite will, and only if the affected file is actually imported by a test that runs. Worth a grep across the codebase before any future PR that adds a constructor.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/span.test.ts` | Unit, 7 tests | Valid resolution; unknown-dimension and unknown-value rejection; the empty span resolves at any dimensionality; member-order independence (AC-BEN-04); distinct keys for distinct spans, including a subset-vs-superset span; a stable, distinct key for the empty span. |
| `test/unit/benefit-store.test.ts` | Unit, 18 tests | Create/exact round-trip; duplicate rejection with the original preserved (AC-BEN-02); member-order duplicate detection; not-found on absent exact/update/delete (AC-BEN-05, AC-BEN-09); **the adversarial exact-lookup case** — a child span's exact lookup is not confused by a stored wider ancestor; update preserves span and count while replacing the formula; a sequence of failed operations leaves prior state completely unaffected (OC 14.3); structural formula preservation including nested arrays, `null`, and a sentinel string (OC 6.5); the global benefit working through the full store stack at zero dimensions. |

## Full suite result

```
ℹ tests 78
ℹ suites 0
ℹ pass 78
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 252.426417
```

Verified from a clean checkout (`rm -rf node_modules && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **0/48**. Expected — matching end to end is T4, and dispatch/state wiring is T7.

## Deviations from the design

None. The parameter-property issue above is a toolchain constraint discovered while implementing, not a deviation from any DT-4 decision.

## Open items resolved

None of T3's design-phase open items were assigned to this task in the implementation plan's section 8.

## Follow-ups

**The parameter-property constraint should be added to a shared style note before T4**, so it does not have to be rediscovered per task. Recorded here rather than fixed by adding a lint rule, since no linter is configured yet (DT-1's minimal-dependency principle), and introducing one for a single rule felt premature — worth revisiting if it recurs.

**`IndexedBenefit.formula` is typed `unknown`.** This is deliberate: OC 6.5 treats the formula as opaque JSON-compatible data the utility must not interpret, and `unknown` is the strongest type that still permits `deepEqual` comparison without asserting a shape the utility has no business asserting. `FormulaValidator` (T8) is where any structural constraint — non-null, object, byte size — belongs, not here.
