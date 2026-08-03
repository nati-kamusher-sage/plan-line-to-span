# T6: Request parser and envelope

| Attribute | Value |
|---|---|
| Task | T6 of the [Implementation Execution Plan](../implementation-plan.md) |
| Branch | `t6-parser-envelope` |
| Design records | [DT-6](../design/dt-6-validation-and-errors.md), [DT-4](../design/dt-4-component-structure.md) |
| Decisions implemented | DEC-28, DEC-40, DEC-41, DEC-42 |
| Acceptance cases now passing | `AC-VAL-03`, `AC-VAL-06`. Cumulative 18/48. |

## What this changes

`src/transport/request-parser.ts` adds `parseRequest`, which validates a raw request body against the project's own JSON Schema and returns a discriminated `ParsedRequest` union narrowed by `operation`. `ajv` moves from a devDependency (design-phase prototypes only) to a runtime dependency, since `RequestParser` is now shipped code that uses it.

## Design decisions implemented

**DEC-40 — structural validation compiles the project's own JSON Schema at runtime.** `parseRequest` loads `docs/schemas/plan-line-to-span-v1.schema.json` directly rather than duplicating its rules by hand, so the schema stays the single structural authority the readiness review already validated.

**DEC-41 — the validator is configured for Draft 2020-12.** Imports `ajv/dist/2020.js` specifically. Using the default (Draft-07) build would not fail to load; it would silently validate against the wrong dialect, which is the worse failure mode DEC-41 exists to avoid.

**DEC-28, DEC-42 — envelope structure only; `formula` and `format` are never judged here.** Verified directly with two tests: a `createBenefit` with `formula: null` parses successfully, and an `initialize` with `format: "wrong/v1"` parses successfully. Both are exactly the conditions `FormulaValidator` and `DimensionModelBuilder` (T7/T8) must reject — `RequestParser` structurally cannot pre-empt them, because the schema leaves both fields unconstrained by design.

## A toolchain issue, worked through rather than routed around

Constructing `ajv`'s Draft 2020-12 validator with a plain `import Ajv2020 from 'ajv/dist/2020.js'` type-checks-fails under this project's `nodenext` module resolution:

```
error TS2351: This expression is not constructable.
```

despite being genuinely constructable at runtime (`node -e "console.log(typeof require('ajv/dist/2020.js'))"` prints `function`). The cause: `ajv`'s shipped `.d.ts` declares `export default Ajv2020` (ES module shape), but the shipped JS actually does `module.exports = Ajv2020` (a legacy CJS reassignment) — the declared types and the runtime shape disagree, and `nodenext`'s stricter interop rules surface the disagreement as a type error that looser resolution modes would not have caught.

Ruled out, in order: `esModuleInterop` alone (no effect, since the issue is the `.d.ts` shape itself, not interop policy); `import ... = require(...)` (same error, since it resolves to the same declaration file regardless of import syntax). What worked: importing the **named** export, `import { Ajv2020 } from 'ajv/dist/2020.js'`, which the `.d.ts` declares as a real class with a construct signature, and which is confirmed at runtime to be the identical value (`require(...).Ajv2020 === require(...)`). `esModuleInterop: true` was added to `tsconfig.json` regardless, since it is the correct baseline for a project now consuming a CJS dependency and several other imports benefit from it being explicit rather than incidentally unneeded.

## A parser correctness question, checked rather than assumed

`parseWithoutDuplicateMembers`'s state machine sets `expectingKey = true` on every comma, including one inside an array — which looks unsafe on a first read: could an array's string elements then be wrongly recorded as object keys, causing a later genuine key of the same name to false-positive as a duplicate?

Checked directly with two adversarial constructions before trusting the logic: an array `["x","y"]` sharing a name with a real sibling key `"x"`, and the reverse ordering, a real key `"a"` followed by an array containing `"a"`. Both parse without incident. The reason: JSON grammar guarantees every object value — including an array's contents — is introduced by a `:`, and this scanner resets `expectingKey` to `false` on every `:` before any value is examined. A comma can only leave `expectingKey` meaningfully `true` when the following string literal is genuinely in key position, which is exactly the case the scanner needs to catch. Both adversarial cases are now permanent tests, and the reasoning is recorded as a comment at the point in the code a future reader would otherwise flag it as suspicious.

## Tests added

| Test | Kind | What it establishes |
|---|---|---|
| `test/unit/request-parser.test.ts` | Unit, 25 tests | The eight interface-contract JSON examples, extracted and checked: the six requests parse successfully, the two response envelopes are correctly rejected as non-requests. `AC-VAL-03` and its adversarial variants (top-level duplicate, sibling same-name keys at the same depth, different depth, structural characters inside string values, array-of-objects, and the two array/key-name-collision cases above). `AC-VAL-06` (missing `payload`, undeclared field). DEC-28/DEC-42 (`null` formula and unsupported `format` both parse successfully). Contract-version, numeric-value, unrecognized-operation, `requestId` length, `queryEmployee` payload shape, and `replacementSpan` rejections. The discriminated `ParsedRequest` union narrows correctly by `operation`. `requestId` echoing and optionality. |

## Full suite result

```
ℹ tests 122
ℹ suites 0
ℹ pass 122
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 531.147666
```

Verified from a clean checkout (`rm -rf node_modules package-lock.json && npm install && npm test`), and the fourteen design prototypes still pass via `npm run prototypes`.

Cumulative acceptance cases: **18/48**.

## Deviations from the design

None from DT-4/DT-6. `esModuleInterop` is an addition to the DT-1 technology baseline's `tsconfig.json`, not a deviation from any decision — DT-1 did not anticipate a CJS-only runtime dependency, and this is the standard, minimal accommodation for one.

## Open items resolved

| Item | Resolution |
|---|---|
| Runtime schema-validation library selection | `ajv`, Draft 2020-12 build, now a runtime dependency (was devDependency-only during design). |

## Follow-ups

**The `ajv` `.d.ts`/runtime-shape mismatch is specific to the `2020.js` entry point of this `ajv` version.** If `ajv` is ever upgraded, re-check whether the named-export workaround is still needed or whether a newer release's types have been corrected; a plain default import is the more conventional form and should be preferred if it type-checks cleanly in the future.
