# Plan Line to Span Interface Contract

| Contract attribute | Value |
|---|---|
| Contract name | `plan-line-to-span` |
| Contract version | `v1` |
| Status | Draft |
| Governing behavior | [Operational Concept](operational-concept.md) |
| Machine-readable schema | [plan-line-to-span-v1.schema.json](schemas/plan-line-to-span-v1.schema.json) |

## 1. Purpose and conformance

This contract defines the JSON messages exchanged with the Plan Line to Span utility. It is transport-neutral: HTTP paths, message topics, and status-code mappings are outside its scope. A conforming implementation accepts the request envelopes in this document and returns the corresponding success or error envelopes.

The operational concept governs business behavior if a conflict is found. This contract supplies the exact payload, response, and error shapes without changing that behavior.

## 2. Common request envelope

Every request is a JSON object with the following fields. No additional top-level fields are permitted.

| Field | Required | Meaning |
|---|---:|---|
| `contractVersion` | Yes | Must be `plan-line-to-span/v1`. |
| `operation` | Yes | One of `initialize`, `createBenefit`, `updateBenefit`, `deleteBenefit`, `queryBenefit`, or `queryEmployee`. |
| `payload` | Yes | The operation-specific object described below. |
| `requestId` | No | Caller correlation string, 1–128 characters. It is echoed when supplied and does not provide idempotency. |

All object fields not defined by the relevant schema are rejected with `MALFORMED_REQUEST`. JSON member order is not significant. Except for `formula`, all contract identifiers and dimension-value keys are strings; numbers are not coerced to strings.

## 3. Shared values

### 3.1 Dimension map and canonical span

A dimension map is a JSON object whose property names are dimension identifiers and whose values are stable, non-empty dimension-value keys. A span is a dimension map in `payload.span`; an employee plan line is a dimension map in `payload.dimensions`.

The canonical form of a span is its dimension map after the utility validates all dimension identifiers and value keys. JSON member order does not affect identity. The empty object, `{}`, is the only empty-span representation and is valid. It identifies the global benefit. `{}` is also the valid empty employee plan line for a zero-dimensional model.

Unknown dimensions and values are syntactically valid messages but fail semantic validation with `UNKNOWN_DIMENSION` or `UNKNOWN_DIMENSION_VALUE`. A plan line or span cannot repeat a dimension because JSON object member names are unique; a parser that accepts duplicate members must reject the request as `MALFORMED_REQUEST` rather than choosing one value.

### 3.2 Formula

`formula` is a required, non-null JSON object. It is opaque to the utility: any JSON value is permitted within that object, including nested objects, arrays, strings, numbers, booleans, and `null`. The serialized UTF-8 value of `formula` must not exceed 65,536 bytes. A non-object, `null`, or oversized formula fails with `INVALID_FORMULA`.

## 4. Operations and valid examples

### 4.1 Initialize

`initialize` replaces or establishes the dimension model using `payload` as the dimension-definition object.

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "initialize",
  "requestId": "init-001",
  "payload": {
    "format": "plan-line-to-span-dimensions/v1",
    "dimensions": [
      {
        "id": "location",
        "name": "Location",
        "values": [{ "key": "4", "name": "USA" }]
      }
    ]
  }
}
```

### 4.2 Create benefit

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "createBenefit",
  "payload": {
    "span": { "location": "4" },
    "formula": { "rate": 0.1, "enabled": true }
  }
}
```

### 4.3 Update benefit

The supplied span selects the benefit. The formula is a complete replacement; an update cannot contain or imply a replacement span.

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "updateBenefit",
  "payload": {
    "span": { "location": "4" },
    "formula": { "rate": 0.12 }
  }
}
```

### 4.4 Delete benefit

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "deleteBenefit",
  "payload": { "span": { "location": "4" } }
}
```

### 4.5 Query benefit

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "queryBenefit",
  "payload": { "span": { "location": "4" } }
}
```

### 4.6 Query employee

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "queryEmployee",
  "payload": {
    "dimensions": { "location": "20", "department": "rnd" }
  }
}
```

## 5. Success responses

Every success response has `ok: true`, the request's `contractVersion`, its `operation`, and a `data` object. `requestId` is included only when supplied by the caller. No additional fields are permitted.

| Operation | `data` shape |
|---|---|
| `initialize` | `{ "state": "ready", "dimensionCount": 2, "benefitCount": 0 }` |
| `createBenefit`, `updateBenefit`, `queryBenefit` | `{ "benefit": { "span": { ... }, "formula": { ... } } }` |
| `deleteBenefit` | `{ "deleted": true, "span": { ... } }` |
| `queryEmployee` | `{ "matches": [{ "span": { ... }, "formula": { ... } }] }` |

`queryEmployee` returns `{ "matches": [] }` for a valid request with no applicable benefits. Match order is not significant. A successful reinitialization always returns `benefitCount: 0` because it clears benefits atomically.

Example successful employee query:

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "queryEmployee",
  "ok": true,
  "data": {
    "matches": [
      { "span": { "location": "4" }, "formula": { "rate": 0.1 } }
    ]
  }
}
```

## 6. Error responses

Every rejected request returns `ok: false` and an `error` object. The response includes the parsed operation when available and echoes `requestId` when it was validly supplied. `message` is human-readable and not stable; callers must use `error.code`.

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "createBenefit",
  "ok": false,
  "error": {
    "code": "DUPLICATE_SPAN",
    "message": "A benefit already exists for the supplied span."
  }
}
```

| Code | Category | When returned |
|---|---|---|
| `MALFORMED_REQUEST` | Syntax/schema | Invalid JSON, missing or extra fields, unsupported contract version or operation, wrong JSON type, duplicate object members, or an invalid `requestId`. |
| `INVALID_DIMENSION_DEFINITION` | Validation | Invalid initialization format, duplicate identifiers or value keys, missing hierarchy parent, hierarchy cycle, or ambiguous hierarchy. |
| `UNKNOWN_DIMENSION` | Validation | A span or plan line names a dimension absent from the loaded model. |
| `UNKNOWN_DIMENSION_VALUE` | Validation | A span or plan line uses a value key absent from its named dimension. |
| `INVALID_FORMULA` | Validation | `formula` is null, not an object, or exceeds 65,536 serialized UTF-8 bytes. |
| `DUPLICATE_SPAN` | Conflict | `createBenefit` supplies a canonical span that already exists. |
| `NOT_FOUND` | Absence | `queryBenefit`, `updateBenefit`, or `deleteBenefit` supplies a valid exact span that does not exist. |
| `INVALID_STATE` | State | The operation is not accepted in the utility's current state, as defined in section 6.1. `error.details.state` identifies the state when available. |
| `INDEX_FAILURE` | Internal | The utility cannot safely complete an index operation. No partial mutation is committed, and the utility remains in its current state. |

### 6.1 Operation acceptance by state

`initialize` is accepted whenever the utility is not already initializing. Every other operation requires `ready`.

| Current state | `initialize` | All other operations |
|---|---|---|
| `uninitialized` | Accepted | `INVALID_STATE` |
| `initializing` | `INVALID_STATE` | `INVALID_STATE` |
| `ready` | Accepted as reinitialization | Accepted |
| `failed` | Accepted as a retry | `INVALID_STATE` |

Accepting `initialize` from `failed` is required by the operational concept's retry path. A rejected operation never changes the utility's state.

Invalid examples and their expected outcomes:

| Invalid request condition | Expected code |
|---|---|
| `{ "operation": "createBenefit" }` (missing envelope fields) | `MALFORMED_REQUEST` |
| Create payload includes `{ "span": {}, "formula": null }` | `INVALID_FORMULA` |
| Query span is `{ "unknown": "x" }` | `UNKNOWN_DIMENSION` |
| Query span is `{ "location": "not-a-key" }` | `UNKNOWN_DIMENSION_VALUE` |
| A duplicate canonical create span | `DUPLICATE_SPAN` |
| Valid delete span absent from storage | `NOT_FOUND` |
| Any benefit operation before initialization | `INVALID_STATE` |
| Any benefit operation while the utility is `failed` | `INVALID_STATE` |
| Any operation, including `initialize`, while initialization is in progress | `INVALID_STATE` |
| Invalid hierarchy parent in initialization payload | `INVALID_DIMENSION_DEFINITION` |

## 7. Schema and validation rules

The JSON Schema is the structural contract for requests and responses. Semantic validation that depends on the loaded dimension model, duplicate-member detection, formula byte size, and current lifecycle state is performed by the utility and reported with the error codes in section 6.

Where a condition has a dedicated semantic code, that code takes precedence over structural rejection, and the schema deliberately leaves the field unconstrained so the two cannot disagree:

| Condition | Reported code | Not `MALFORMED_REQUEST` because |
|---|---|---|
| `formula` is null, a non-object, or oversized | `INVALID_FORMULA` | `formula` is structurally unconstrained in the schema. |
| `payload.format` is an unsupported value | `INVALID_DIMENSION_DEFINITION` | `format` is typed as a string rather than a fixed constant. |

`MALFORMED_REQUEST` remains correct for envelope violations, undeclared fields, wrong JSON types elsewhere, and duplicate object members.

An implementation may enforce a transport-level JSON size limit, but it must not reinterpret a valid contract message or replace a defined contract error with an ambiguous response.

## 8. Compatibility

The `contractVersion` value is required on every request and response. Any additive or breaking change requires a new version value and a corresponding schema. `v1` implementations reject unrecognized fields rather than silently accepting them.
