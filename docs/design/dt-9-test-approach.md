# DT-9: Test Approach

| Document attribute | Value |
|---|---|
| Status | ECP-1 revised test design |
| Governing input | [Acceptance Cases](../acceptance-cases.md), [Observability Contract](../observability-contract.md) 8 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-8](dt-8-observability.md) |
| Mapping check | [task-coverage-check.mjs](../implementation/task-coverage-check.mjs), reconciled in E3 |

## 1. Decision

Retain contract, harness, property, and static testing, but derive the executable target
from the ECP-1 catalogue: 39 active cases and 9 explicitly retired Phase 1 cases.

Retired cases are not deleted from history and are not counted as passing. E1/E2 remove
or reshape their implementation tests; E3 reconciles the mechanical mapping after all
code changes land.

## 2. Test layers

| Layer | Definition | ECP-1 active cases |
|---|---|---:|
| Contract | Drives raw request through response and emitted record without privileged state control. | 31 |
| Harness | Uses a test-only capability for transient/output/internal state. | 8 |
| Property | Generated valid models and spans compared with an independent oracle. | Supplementary |
| Static | Exhaustively checks source-shape obligations. | Supplementary |

The contract layer remains preferred because it verifies the assembled surface. The
harness exists only where a public request cannot create the required observation.

## 3. Test-only capabilities

| Capability | Active cases | Reason |
|---|---|---|
| `capture-stdout` | AC-OBS-01 to AC-OBS-04 | Records are process output. |
| `pause-during-initialize` | AC-INIT-06 | `initializing` is transient. |
| `raw-json-with-duplicate-members` | AC-VAL-03 | Duplicate members require raw text. |
| `set-lifecycle-failed` | AC-INIT-03, AC-INIT-08 | Optimistic execution no longer uses invalid data to create a controlled Failed response. |

The Phase 1 `inject-index-failure` capability and AC-INIT-09 are retired because ECP-1
removes exception translation and rollback guarantees for unexpected index failures.

Capabilities remain at ports: injectable stdout sink, substitutable builder/lifecycle,
and raw-string parser entry. No R-tree algorithm branch is test-only.

## 4. Supplementary tests

| Test | ECP-1 obligation |
|---|---|
| `differential-matching` | R-tree results equal a naive matcher over valid generated inputs. |
| `differential-mapping` | Interval containment equals a parent-walk ancestor oracle. |
| `handlers-never-await` | Serial handlers never yield mid-operation. |
| `emitter-sole-stdout-writer` | Only the emitter writes structured records to stdout. |
| `schema-examples-validate` | E1's executable schema accepts every revised interface example. |
| `performance-growth` | E3 re-runs DT-7 volumes with a linear control. |
| `removed-concepts-absent` | E1 statically proves removed concepts absent from `src`, `test`, `frontend`, and schema. |
| `optimistic-path-audit` | E2 statically checks that retired guards, codes, and catch/translate paths are absent. |

Generated tests use seeded deterministic fixtures. They generate only data inside the
optimistic contract; fuzzing invalid data would assert behavior the target disclaims.

## 5. Fixtures

`D1` remains the shared deterministic fixture from the catalogue. Stored fixtures are
spans only. Match expectations compare canonical span sets. Performance volumes preserve
the Phase 1 span cardinalities so E3 can compare measurements meaningfully.

## 6. Catalogue mapping

```text
Phase 1 lineages    : 48
ECP-1 active         : 39
ECP-1 retired        :  9

active contract      : 31
active harness       :  8
```

The nine retired identifiers are AC-INIT-02, AC-INIT-05, AC-INIT-09, AC-BEN-11,
AC-VAL-01, AC-VAL-02, AC-VAL-04, AC-VAL-05, and AC-VAL-07.

The coverage checker must eventually fail on an unmapped active case, an invented case,
or a retired case still claimed as passing. It remains Phase 1-shaped during E0–E2 and is
reconciled in E3 after the implementation and catalogue names settle.

## 7. Decisions recorded

| ID | ECP-1 status |
|---|---|
| DEC-60 | Retained: layered testing with the contract layer preferred. |
| DEC-61 | Retained: derive mapping from the catalogue. |
| DEC-62 | Revised: four active test capabilities; index-failure injection retired and failed-state setup added. |
| DEC-63 | Superseded: AC-INIT-09 and its injection seam are retired. |
| DEC-64 | Retained: source-wide obligations use static checks. |
| DEC-65 | Retained: one seeded generator for differential and performance evidence. |
| DEC-69 | Added: retired case IDs remain mechanically visible and cannot count as passing. |

## 8. Stage ownership

| Work | Stage |
|---|---|
| Rename and reshape active contract tests; remove concept-specific case | E1 |
| Remove semantic-validation and exception-path tests, with explicit retired-ID list | E2 |
| Re-run performance and reconcile the coverage checker/catalogue totals | E3 |

## 9. Limitations

E0 changes the target catalogue, not the current regression implementation. Until E1 and
E2 land, `npm test` still executes the Phase 1 suite. The temporary mismatch is deliberate
and bounded by the sequential PR plan.
