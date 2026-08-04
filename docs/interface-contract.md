# Plan Line to Span Interface Contract

| Contract attribute | Value |
|---|---|
| Contract name | `plan-line-to-span` |
| Contract version | `v1` |
| Status | ECP-1 target contract; spans-only executable surface implemented in E1 |
| Governing behavior | [Operational Concept](operational-concept.md) |
| Executable schema | [plan-line-to-span-v1.schema.json](schemas/plan-line-to-span-v1.schema.json) |

## 1. Purpose and conformance

This contract defines the transport-neutral JSON messages exchanged with the utility.
The operational concept governs behavior; this document supplies exact request,
response, and state-outcome shapes.

ECP-1 revises the unreleased draft `v1` contract in place. E1 updates the schema and
implementation atomically to the spans-only operation and payload vocabulary. E2 applies
the optimistic-execution portion of this target contract.

## 2. Common request envelope

Every request is a JSON object with no undeclared fields.

| Field | Required | Meaning |
|---|---:|---|
| `contractVersion` | Yes | `plan-line-to-span/v1`. |
| `operation` | Yes | `initialize`, `createSpan`, `updateSpan`, `deleteSpan`, `querySpan`, or `queryPlanLine`. |
| `payload` | Yes | The operation-specific object in section 4. |
| `requestId` | No | Caller correlation string, 1–128 characters; echoed when supplied. |

Invalid JSON, missing fields, extra fields, wrong JSON types, duplicate object members,
unsupported versions or operations, and invalid `requestId` shape return
`MALFORMED_REQUEST`. JSON member order is not significant and string keys are not
coerced from other JSON types.

## 3. Shared values

### 3.1 Dimension maps

A dimension map is a JSON object whose property names are dimension identifiers and
whose values are non-empty string value keys.

- `payload.span` and `payload.replacementSpan` are spans.
- `payload.dimensions` is a plan line.
- `{}` is the valid empty span and the valid empty plan line for a zero-dimensional
  model.

The caller is responsible for supplying dimensions and values that exist in the loaded
model. The interface performs no semantic validation of them. JSON member order does not
affect canonical span identity.

## 4. Operations and examples

### 4.1 Initialize

`initialize` establishes or replaces the dimension model and clears stored spans.

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

### 4.2 Create span

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "createSpan",
  "payload": { "span": { "location": "4" } }
}
```

### 4.3 Update span

`span` identifies the stored source. `replacementSpan` supplies the requested new
identity. The operation checks state outcomes before mutation, removes the source, and
creates the replacement.

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "updateSpan",
  "payload": {
    "span": { "location": "4" },
    "replacementSpan": { "location": "20" }
  }
}
```

### 4.4 Delete span

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "deleteSpan",
  "payload": { "span": { "location": "4" } }
}
```

### 4.5 Query span

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "querySpan",
  "payload": { "span": { "location": "4" } }
}
```

### 4.6 Query plan line

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "queryPlanLine",
  "payload": {
    "dimensions": { "location": "20", "department": "rnd" }
  }
}
```

## 5. Success responses

Every success response contains `contractVersion`, `operation`, `ok: true`, and `data`.
`requestId` is included only when supplied. No additional fields are permitted.

| Operation | `data` shape |
|---|---|
| `initialize` | `{ "state": "ready", "dimensionCount": 2, "spanCount": 0 }` |
| `createSpan`, `updateSpan`, `querySpan` | `{ "span": { ... } }` |
| `deleteSpan` | `{ "deleted": true, "span": { ... } }` |
| `queryPlanLine` | `{ "matches": [{ ... }, { ... }] }` |

Each `matches` element is a span dimension map, not a wrapper. No-match is successful and
returns `{ "matches": [] }`. Match order is not significant. Successful reinitialization
always returns `spanCount: 0`.

Example successful plan-line query:

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "queryPlanLine",
  "ok": true,
  "data": {
    "matches": [
      { "location": "4" },
      { "location": "4", "department": "rnd" }
    ]
  }
}
```

## 6. State-outcome responses

Declared failures contain `ok: false` and an `error` object. The parsed operation and a
valid supplied `requestId` are included when available. `message` is human-readable and
unstable; callers use `error.code`.

```json
{
  "contractVersion": "plan-line-to-span/v1",
  "operation": "createSpan",
  "ok": false,
  "error": {
    "code": "DUPLICATE_SPAN",
    "message": "A span with the supplied identity already exists."
  }
}
```

| Code | Category | When returned |
|---|---|---|
| `MALFORMED_REQUEST` | Structural boundary | The JSON envelope cannot select and invoke a defined operation because its syntax or declared shape is invalid. |
| `DUPLICATE_SPAN` | Stored state | `createSpan` supplies an existing identity, or `updateSpan` targets an identity occupied by a different stored span. |
| `NOT_FOUND` | Stored state | `querySpan` or `deleteSpan` names an absent span, or `updateSpan` names an absent source. |
| `INVALID_STATE` | Lifecycle state | The operation is not accepted in the current state. `error.details.state` identifies that state when available. |

Unexpected implementation failures and semantically invalid domain data are outside the
response contract. They may fail uncaught; there is no general internal-error envelope.

### 6.1 Operation acceptance by state

`initialize` is accepted whenever initialization is not already in progress. Every other
operation requires `ready`.

| Current state | `initialize` | All other operations |
|---|---|---|
| `uninitialized` | Accepted | `INVALID_STATE` |
| `initializing` | `INVALID_STATE` | `INVALID_STATE` |
| `ready` | Accepted as reinitialization | Accepted |
| `failed` | Accepted as retry | `INVALID_STATE` |

A rejected state outcome does not mutate stored spans.

### 6.2 Stored-state precedence

For `updateSpan`, the source identity is resolved first:

1. absent source → `NOT_FOUND`;
2. source present and replacement occupied by a different span → `DUPLICATE_SPAN`;
3. otherwise replace and return the replacement.

Replacing a span with the same canonical identity succeeds. All stored-state checks occur
before removal, so a declared failure leaves the source intact.

## 7. Schema and optimistic-input rules

The schema is the structural request boundary. It distinguishes the six operations and
their payload shapes, including the two-span `updateSpan` payload. It does not verify that
a dimension definition is coherent or that a dimension/value exists in the loaded model.

ECP-1 removes semantic validation and exception translation. In particular, the target
contract has no dedicated codes for invalid dimension definitions, unknown dimensions,
unknown values, payload content outside the concept model, or index exceptions.

The executable schema and parser use the spans-only operation and payload shapes. E2
removes the semantic checks and exception translation that remain during E1 sequencing.

## 8. Compatibility

ECP-1 is a breaking replacement of the unreleased draft `v1` surface: operation names,
update payload, success payloads, match elements, count field, and error set change. The
contract remains `plan-line-to-span/v1` because the Phase 1 draft was never a supported
release. After ECP-1 is implemented and released, further breaking changes require a new
version value and corresponding schema.
