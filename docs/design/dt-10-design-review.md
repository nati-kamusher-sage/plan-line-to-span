# DT-10: ECP-1 Design Review

| Document attribute | Value |
|---|---|
| Status | E0 review complete; implementation evidence pending E1–E3 |
| Governing input | [ECP-1](../ECP/ECP-1/ECP-1.md), [ECP-1 Implementation Plan](../ECP/ECP-1/ECP-1-implementation-plan.md) |
| Reviews | DT-1 through DT-9 after ECP-1 amendments |

## 1. Review conclusion

The design is coherent for the spans-only target. The R*-tree mapping and representation
decisions remain valid; component, lifecycle, optimistic-execution, observability, and
test records have been revised around direct span storage and plan-line matching.

E0 establishes specification consistency, not implementation conformance. E1–E3 supply
code, deletion, regression, performance, and mechanical traceability evidence.

## 2. Decision summary

| Record | ECP-1 disposition |
|---|---|
| DT-1 | Node/TypeScript and backend topology retained; semantic validation chain removed. |
| DT-2a | Direct n-dimensional R*-tree retained. |
| DT-2 | Nested intervals and exact canonical-key lookup retained; query names revised. |
| DT-3 | Global span stays inside the index; zero-axis defensive assertion removed. |
| DT-4 | Core reduced to spans; `SpanStore` owns duplicate and absence outcomes. |
| DT-5 | Lifecycle gate retained; invalid-input failure paths no longer contract behavior. |
| DT-6 | Rewritten around structural parsing, optimistic domain execution, and direct state outcomes. |
| DT-7 | Measurement cardinality and operation names changed to spans. |
| DT-8 | Closed logging retained; fields renamed and sink-failure isolation removed. |
| DT-9 | Catalogue target is 39 active and 9 explicitly retired cases. |

## 3. Cross-record consistency checks

| Question | Result |
|---|---|
| What is stored? | Canonical spans directly. |
| What identifies an entry? | The canonical span dimension map. |
| What does exact query return? | One identical span or `NOT_FOUND`. |
| What does plan-line query return? | An unordered array of matching span maps. |
| How does update work? | Source removal plus replacement creation after state checks. |
| Which count is observable? | `spanCount`. |
| Which declared codes remain? | `MALFORMED_REQUEST`, `DUPLICATE_SPAN`, `NOT_FOUND`, `INVALID_STATE`. |
| What invalid data is checked? | Structural envelope only; domain correctness is assumed. |
| What happens to unexpected exceptions? | They propagate; no general error envelope or rollback promise. |
| How are zero axes handled? | Standard empty product/sum and vacuous containment; split unreachable for valid state. |

## 4. Acceptance mapping

| Group | Active | Retired | Primary owner |
|---|---:|---:|---|
| `AC-INIT-*` | 6 | 3 | Dispatcher, lifecycle, model builder |
| `AC-SPAN-*` plus historical case 11 | 10 | 1 | `SpanStore`, resolver, index adapter |
| `AC-MATCH-*` | 11 | 0 | Dimension model and R*-tree |
| `AC-GLOBAL-*`, `AC-ZERO-*` | 5 | 0 | Dimension model, store, R*-tree |
| `AC-VAL-*`, `AC-SERIAL-*` | 3 | 5 | Parser and dispatcher |
| `AC-OBS-*` | 4 | 0 | Observability emitter |
| **Total** | **39** | **9** | |

Retired identifiers remain listed in the catalogue and must be named in E1/E2 PRs when
their tests are removed or replaced.

## 5. Compatibility review

The operation vocabulary, update request, success response shapes, match elements, count
field, and declared-code set are breaking changes. The contract remains `v1` because
Phase 1 was an unreleased draft. E0 prose is temporarily ahead of the executable schema;
E1 updates schema and implementation atomically to keep each branch regression-green.

## 6. Risks carried into implementation

| Risk | Stage and gate |
|---|---|
| Broad rename changes matching behavior | E1; compare canonical span sets and run full suite. |
| Update replacement partially mutates on an unexpected index exception | Accepted ECP-1 trade; declared state failures still occur before mutation. |
| Invalid hierarchy cycle can hang | Caller-owned under optimistic execution; E2 explicitly removes cycle guard. |
| Regression catalogue shrinks invisibly | Retired IDs remain in docs and PR descriptions; E3 reconciles checker. |
| Performance improvement is assumed rather than measured | E3 reruns DT-7 volumes and records comparison ratios. |

## 7. Review disposition

The design is ready for sequential implementation under the E0–E3 pull-request gate.
No later stage starts before its predecessor is reviewed, green, and merged.
