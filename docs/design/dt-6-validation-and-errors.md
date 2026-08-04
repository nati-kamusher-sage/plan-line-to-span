# DT-6: Optimistic Execution and State Outcomes

| Document attribute | Value |
|---|---|
| Status | Rewritten by ECP-1 |
| Governing input | [ECP-1](../ECP/ECP-1/ECP-1.md), [Interface Contract](../interface-contract.md) 6–7 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-5](dt-5-lifecycle.md) |

## 1. Decision

Assume domain data is correct and valid. Remove semantic validation, internal invariant
guards, and catch/translate layers. Retain only the structural request boundary and the
declared outcomes that answer questions about lifecycle or stored state.

This replaces the Phase 1 validation-pipeline design. It is a deliberate
performance-over-correctness trade, not an implementation shortcut.

## 2. Target pipeline

| Stage | Component | What remains |
|---|---|---|
| 1. Parse | `RequestParser` | Parse JSON and enforce the closed structural envelope needed to select one of six operations. |
| 2. State | `OperationDispatcher` | Return `INVALID_STATE` when the lifecycle gate rejects the operation. |
| 3. Resolve | `DimensionModelBuilder` / `SpanResolver` | Build intervals, canonical spans, boxes, and points without semantic checks. |
| 4. Stored state | `SpanStore` | Return `DUPLICATE_SPAN` or `NOT_FOUND` before mutation. |
| 5. Execute | `IndexAdapter` / `RTreeIndex` | Execute directly; unexpected errors propagate. |
| 6. Observe | `ObservabilityEmitter` | Emit a completion record; sink failure may propagate. |

There is no general error-mapping stage.

## 3. Structural boundary

The parser retains `MALFORMED_REQUEST` because the program cannot invoke a typed
operation until raw JSON selects a known operation and payload shape. It checks:

- valid JSON without duplicate object members;
- the closed top-level envelope;
- supported `contractVersion` and operation names;
- operation-specific required fields and JSON types; and
- the optional `requestId` shape.

It does not check whether domain identifiers exist, whether hierarchy links are coherent,
or whether dimension-map values have meaning in the current model.

The executable schema remains Phase 1-shaped during docs-only E0 and changes with the
parser in E1 so the intermediate branch remains regression-green.

## 4. Removed validation

E2 deletes checks for:

- dimension-definition format meaning, duplicate identifiers/keys, dangling parents,
  and cycles;
- unknown span or plan-line dimensions and values;
- R-tree axis count and box arity;
- split-path assertions and other internal invariants;
- log-record values constructed by the program itself; and
- re-validation of values already narrowed by the structural parser.

Invalid data is outside the contract. It may yield no matches, an uncaught exception,
corrupt internal state, or non-termination. In particular, removing hierarchy-cycle
detection can turn invalid initialization into an infinite traversal; the caller owns
that risk.

## 5. Retained state outcomes

| Code | Owner | Behavior |
|---|---|---|
| `INVALID_STATE` | `OperationDispatcher` | Reject an operation not accepted by the lifecycle gate. |
| `DUPLICATE_SPAN` | `SpanStore` | Reject duplicate create or an update replacement occupied by another entry. |
| `NOT_FOUND` | `SpanStore` | Report absent exact query/delete/update source. |

These are ordinary branches over state, not exceptions and not judgments about input
correctness. `MALFORMED_REQUEST` belongs to the structural boundary described in section
3.

## 6. Update integrity and precedence

`updateSpan({span, replacementSpan})` resolves declared outcomes before mutation:

```text
source absent                              -> NOT_FOUND
source present, different target occupied  -> DUPLICATE_SPAN
otherwise                                  -> remove source; insert target; success
```

Same-identity replacement succeeds. A declared failure leaves the source and count
unchanged. Once mutation begins, an unexpected index failure is not caught or translated;
ECP-1 makes no rollback guarantee for that out-of-contract path.

## 7. Exception posture

Production dispatch does not catch implementation exceptions to build an error envelope.
The former general index-failure response is removed. Observability does not isolate sink
failures. Defensive assertions do not manufacture exceptions for invalid internal data.

Language/runtime exceptions may still arise naturally. “No exception handling” means
they propagate rather than being converted into stable application behavior.

## 8. Observability relationship

Only operations reaching a declared success or state outcome are guaranteed a completion
record. Records use the four interface codes and never include domain payload. An
uncaught failure is not guaranteed to produce a record through this emitter; process
supervision is outside the demo.

## 9. Decisions recorded

| ID | Decision | Status |
|---|---|---|
| DEC-40 | Compile the JSON Schema once and use it in request parsing. | Retained for the structural boundary; schema shape changes in E1. |
| DEC-41 | Reject duplicate JSON members before ordinary parsing. | Retained as structural ambiguity prevention. |
| DEC-42 | Leave one removed payload field unconstrained for semantic precedence. | Superseded; the field and semantic path no longer exist. |
| DEC-43 | Semantic dimension-definition errors have dedicated responses. | Superseded by optimistic execution. |
| DEC-44 | Translate index exceptions into a stable response. | Superseded; exceptions propagate. |
| DEC-67 | Domain data is trusted after structural parsing. | Added by ECP-1. |
| DEC-68 | Stored-state outcomes are direct branches, not caught exceptions. | Added by ECP-1. |

## 10. Verification

E0 marks nine Phase 1 acceptance cases retired. E2 must list every removed regression
test by case ID, prove the remaining suite green, and statically inspect production code
for obsolete guards, catch/translate layers, and removed error codes.

The absence of validation cannot be established solely by sending valid requests; review
must inspect the deleted paths as well as the surviving behavior.

## 11. Limitations

This posture intentionally gives no correctness guarantee for invalid domain data.
Performance evidence is collected in E3; E0 and E2 do not claim a speedup merely from
deleting code.
