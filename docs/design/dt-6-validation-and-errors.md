# DT-6: Validation and Error Handling

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-6 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Interface Contract](../interface-contract.md) 6, 6.1, 7; [Operational Concept](../operational-concept.md) 14 |
| Depends on | [DT-4](dt-4-component-structure.md), [DT-5](dt-5-lifecycle.md) |
| Prototype | [validation pipeline](prototypes/dt-6-validation-pipeline.mjs) |

## 1. Decision

Four ordered validation stages, each owning its codes from DT-4, with structural validation driven by the project's own JSON Schema rather than hand-written checks.

The stage order is what produces the contract's precedence. No stage inspects a condition that a later stage owns.

## 2. The pipeline

| Stage | Component | Checks | Codes |
|---|---|---|---|
| 1. Structural | `RequestParser` | Envelope shape against the JSON Schema: required fields, undeclared fields, `contractVersion`, `operation`, `requestId` length, JSON types, parse failure. | `MALFORMED_REQUEST` |
| 2. State | `OperationDispatcher` | The DT-5 intake gate from IC 6.1. | `INVALID_STATE` |
| 3a. Model | `DimensionModelBuilder` | `initialize` only: format value, duplicate ids and keys, dangling parents, cycles. | `INVALID_DIMENSION_DEFINITION` |
| 3b. Semantic | `SpanResolver` | Benefit operations: dimension identifiers and value keys against the loaded model. | `UNKNOWN_DIMENSION`, `UNKNOWN_DIMENSION_VALUE` |
| 4. Formula | `FormulaValidator` | Non-null, object, within 65,536 serialized UTF-8 bytes. | `INVALID_FORMULA` |
| 5. Identity | `BenefitStore` | Duplicate canonical span; absent span for update, delete, exact query. | `DUPLICATE_SPAN`, `NOT_FOUND` |
| 6. Index | `IndexAdapter` | Internal index failure. | `INDEX_FAILURE` |

## 3. Structural validation is schema-driven

DT-1's R1 recorded that TypeScript types are erased at runtime and cannot reject undeclared fields, and DEC-6 resolved to drive runtime validation from the existing JSON Schema. The prototype does exactly that: it loads `docs/schemas/plan-line-to-span-v1.schema.json` and compiles it.

This matters beyond convenience. The schema is already the structural contract, already validated in the readiness review, and already the thing the interface contract points to. Hand-writing equivalent checks would create a second structural authority that could drift from the first — the divergence problem WP-2 solved for the prose documents, reappearing in code.

The schema is Draft 2020-12, so the validator must be configured for that dialect. Using a Draft-07 default fails outright, which is a useful failure: it cannot silently validate against the wrong dialect.

## 4. How IC 7 precedence is preserved

IC 7 requires that a condition with a dedicated semantic code not be pre-empted by structural rejection. Two fields are affected, and the mechanism is the same for both: **the schema deliberately does not constrain them.**

| Field | Schema treatment | Owning stage | Code |
|---|---|---|---|
| `formula` | Unconstrained; any JSON value validates | 4 | `INVALID_FORMULA` |
| `payload.format` | Typed as a string, not a constant | 3a | `INVALID_DIMENSION_DEFINITION` |

Because stage 1 validates against that schema, it structurally *cannot* reject either field. The precedence is not enforced by an ordering convention someone must remember; it is enforced by the absence of a constraint. This is the same defect the WP-7 review caught as ISSUE-03, now impossible rather than merely avoided.

The two `$comment` annotations added to the schema in DT-2a explain the omission at the point where a future maintainer would otherwise be tempted to "fix" it by adding the constraint back.

## 5. Verification

The exit criterion is that the twelve invalid messages from the readiness review resolve to their documented codes under the designed pipeline. Run against the real schema:

```
--- the twelve invalid messages ---
pass  MALFORMED_REQUEST            RequestParser          missing envelope fields
pass  INVALID_FORMULA              FormulaValidator       formula null
pass  UNKNOWN_DIMENSION            SpanResolver           unknown dimension
pass  UNKNOWN_DIMENSION_VALUE      SpanResolver           unknown value
pass  MALFORMED_REQUEST            RequestParser          extra top-level field
pass  MALFORMED_REQUEST            RequestParser          update with replacementSpan
pass  MALFORMED_REQUEST            RequestParser          bad contract version
pass  MALFORMED_REQUEST            RequestParser          numeric dimension value
pass  INVALID_DIMENSION_DEFINITION DimensionModelBuilder  init bad format
pass  INVALID_DIMENSION_DEFINITION DimensionModelBuilder  init dangling parentKey
pass  MALFORMED_REQUEST            RequestParser          queryEmployee wrong payload
pass  MALFORMED_REQUEST            RequestParser          requestId too long

--- IC 7 precedence ---
pass  INVALID_STATE                OperationDispatcher    state beats payload error
pass  UNKNOWN_DIMENSION            SpanResolver           unknown dim beats formula
pass  INVALID_FORMULA              FormulaValidator       oversized formula
pass  INVALID_FORMULA              FormulaValidator       formula array rejected
pass  OK                           -                      valid create succeeds
pass  OK                           -                      retry init from failed

18/18 resolve to the documented code
```

The third column is the owning component, so the run confirms both the code and that DT-4's ownership assignment holds in practice.

Six checks beyond the required twelve cover conditions the review did not exercise: state precedence over payload errors, semantic precedence within stage ordering, the byte-size limit, arrays rejected as formulas (an array is an object in JavaScript, so this is a real trap), and two positive paths including the retry from `failed` that ISSUE-04 concerned.

## 6. Error response construction

Every rejection returns the same envelope shape, per IC 6: `ok: false`, the parsed `operation` when available, the echoed `requestId` when validly supplied, and an `error` object carrying the stable `code`.

Two rules constrain what may appear:

**`message` is human-readable and unstable.** Callers must use `error.code`. The message must never embed a span, dimension value, or formula fragment, which would leak the payload data the observability contract's privacy rules exclude. The same discipline applies here even though IC 6 does not say so directly, because an error message is as observable as a log record.

**`error.details.state` is the only structured detail.** IC 6 defines it for `INVALID_STATE`. No other detail field is introduced; adding one would extend the contract.

## 7. Relationship to observability

Each pipeline outcome produces exactly one log record through `ObservabilityEmitter` (DT-4's DEC-32). The `errorCode` field carries the same code the response carries, so the log and the response can never disagree about what happened.

Stage 1 failures are the one case needing care: if the envelope cannot be parsed, `operation` may be unknown. The observability contract requires `operation` on every record. DT-8 must decide how an unparseable request is recorded, and the acceptance catalogue's `AC-VAL-06` already qualifies its expectation with "when an operation is parseable." Flagged as an open item.

## 8. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-40 | Structural validation compiles the project's JSON Schema at runtime | DT-1 DEC-6; avoids a second structural authority that could drift. |
| DEC-41 | The validator must be configured for Draft 2020-12 | The schema declares that dialect; a Draft-07 default fails loudly rather than validating wrongly. |
| DEC-42 | IC 7 precedence is preserved by the schema not constraining `formula` and `format` | Structural rejection becomes impossible rather than merely avoided. |
| DEC-43 | Error messages never embed payload data | An error message is as observable as a log record; the privacy rationale applies equally. |
| DEC-44 | `error.details.state` is the only structured detail field | Anything further would extend the contract. |

## 9. Open items

| Item | Owner task |
|---|---|
| How an unparseable request is logged when `operation` is unknown | DT-8 |
| Promoting the eighteen checks to a permanent test suite | DT-9 |
| Whether `ajv` or another validator is the final choice | Implementation; DEC-40 and DEC-41 constrain the choice to a Draft 2020-12 capable validator |

## 10. Limitations

The prototype implements the pipeline stages as functions and drives real messages through them against the real schema. Stages 3a, 3b, 4, and 5 are simplified stand-ins: the model builder checks the documented conditions but is not DT-2's full builder, and the store is a set of canonical keys rather than `BenefitStore`.

What the run establishes is that the *ordering* produces the contract's codes and that schema-driven structural validation behaves as DEC-40 assumes. Whether the real components behave identically is DT-9's concern.
