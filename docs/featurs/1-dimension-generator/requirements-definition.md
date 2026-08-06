# Dimension Generator — Requirements Definition

| Document attribute | Value |
|---|---|
| Status | Draft — development task 1 complete; awaiting human validation |
| Feature | Dimension generator |
| Source | [Feature description](feature-description.md) |
| Baseline extended | [Preliminary Design Execution Plan](../../preliminary-design-plan.md) |
| Output contract | `plan-line-to-span-dimensions/v1` dimension definition |

## 1. Purpose and scope

The feature gives a user a quick way to create a valid dimension definition for the Plan
Line to Span demo. The user supplies the number of dimension types and the order of
magnitude of the values required in each type. The generator uses a Faker library to
produce readable names and returns a dimension definition that the existing
`initialize` operation accepts unchanged.

This feature includes a generation API and a UI that collects inputs, invokes that API,
and renders the returned object. It does not initialize the demo automatically, create
spans, save generated definitions, or make random output reproducible across requests.

## 2. Terms and fixed interpretation

| Term | Meaning |
|---|---|
| Dimension type | One item in the output `dimensions` array, such as `location`, `department`, or `vendor`. |
| Value order of magnitude | A base-10 exponent `m` that targets `10^m` values per generated dimension; the actual count varies around that target. |
| Valid dimension definition | An object that meets the existing structural contract and the semantic coherence conditions in Operational Concept section 7. |

The API accepts the following request object:

```json
{
  "dimensionCount": 3,
  "valueOrderOfMagnitude": 2
}
```

`dimensionCount` is an integer from 2 through 20. `valueOrderOfMagnitude` is an integer
from 1 through 3. These limits bound one generation while ensuring that every generated
definition can contain both required dimension kinds. The magnitude is a target order,
not an exact cardinality: magnitude `2` targets roughly 100 values per dimension, and
50 is also a valid generated value count.

## 3. Functional requirements

### API

| ID | Requirement |
|---|---|
| DG-API-01 | The system shall provide a dimension-generation API accepting `dimensionCount` and `valueOrderOfMagnitude`. |
| DG-API-02 | The API shall reject a request when either field is absent, non-integral, outside its range, or when the request contains additional fields. It shall return a machine-readable validation error and shall not return a partial definition. |
| DG-API-03 | For an accepted request, the API shall return one complete dimension definition with `format` equal to `plan-line-to-span-dimensions/v1`. |
| DG-API-04 | The returned `dimensions` array shall contain exactly `dimensionCount` dimensions, including at least one hierarchical dimension and at least one non-hierarchical dimension. |
| DG-API-05 | The generator shall choose each dimension's value count around the requested base-10 order of magnitude rather than fixing it at exactly `10^valueOrderOfMagnitude`. A Gaussian-style distribution centered on `10^valueOrderOfMagnitude`, rounded to a positive integer and bounded to safe generation limits, is acceptable. For example, magnitude `2` may generate 50 values as well as 100 values. |
| DG-API-06 | The generator shall use a Faker library to create the human-readable dimension and value names. The implementation may normalize those names when making identifiers and keys. |
| DG-API-07 | Every dimension `id`, every dimension `name`, and every value `key` within its dimension shall be non-empty and unique in the scope required by the existing dimension-definition contract. Each value shall have a non-empty `name`. |
| DG-API-08 | At least one generated dimension shall be non-hierarchical: all of its values shall omit `parentKey`. At least one generated dimension shall be hierarchical: it shall contain valid `parentKey` relationships, with at least one child value. The generator shall produce only acyclic, within-dimension parent relationships. |
| DG-API-09 | The returned object shall pass the repository's dimension-definition JSON Schema and shall satisfy the existing semantic preconditions: unique dimension identifiers, unique value keys per dimension, valid parent references, and an acyclic hierarchy. |

### User interface

| ID | Requirement |
|---|---|
| DG-UI-01 | The UI shall present labeled controls for the number of dimension types and the value order of magnitude, with the allowed ranges visible to the user. |
| DG-UI-02 | The UI shall prevent submission until both inputs are valid. |
| DG-UI-03 | On submission, the UI shall invoke the generation API with the selected values and make it clear while a request is in progress. |
| DG-UI-04 | On success, the UI shall display the complete returned dimension-definition object as formatted JSON. The displayed object shall be the API response, not a separately reconstructed client-side version. |
| DG-UI-05 | On API failure, the UI shall retain the user's inputs, show an understandable error, and shall not replace a previously displayed successful result. |
| DG-UI-06 | A later successful submission shall replace the displayed generated object. |

## 4. Non-functional requirements

| ID | Requirement |
|---|---|
| DG-NFR-01 | The generator shall use the project language and strict TypeScript conventions established by the baseline. |
| DG-NFR-02 | API generation must be side-effect free: it must not mutate the active dimension model, stored spans, or other application state. |
| DG-NFR-03 | The implementation shall test boundary values, invalid requests, schema validity, uniqueness, cardinality, and UI success/failure states. |
| DG-NFR-04 | Names and identifiers supplied by Faker are generated demonstration data only; they must not be logged or sent anywhere except the API response and the UI that requested it. |

## 5. Acceptance examples

| Case | Input | Expected outcome |
|---|---|---|
| DG-AC-01 | `{ "dimensionCount": 3, "valueOrderOfMagnitude": 2 }` | A definition with format `plan-line-to-span-dimensions/v1`, three dimensions, and both hierarchical and non-hierarchical dimensions. The generated counts vary around 100 rather than being fixed at 100. |
| DG-AC-02 | Repeated valid requests with `{ "dimensionCount": 2, "valueOrderOfMagnitude": 2 }` | Every response has one or more hierarchical dimensions and one or more non-hierarchical dimensions; the sampled cardinalities may differ between responses, and 50 values is valid. |
| DG-AC-03 | `{ "dimensionCount": 20, "valueOrderOfMagnitude": 3 }` | A valid definition with 20 dimensions, with generated cardinalities centered around 1,000 values per dimension. |
| DG-AC-04 | `{ "dimensionCount": 1, "valueOrderOfMagnitude": 2 }` | Validation error; no definition, because both dimension kinds cannot be guaranteed. |
| DG-AC-05 | `{ "dimensionCount": 2, "valueOrderOfMagnitude": 4 }` | Validation error; no definition. |
| DG-AC-06 | UI submits valid inputs | The UI shows the exact successful response as formatted JSON. |
| DG-AC-07 | UI request fails after a prior success | The UI retains inputs and the prior result, and displays an error. |

## 6. Traceability and implementation hand-off

The output shape is governed by [Operational Concept section 7](../../operational-concept.md#7-dimension-definition) and the `dimensionDefinition` schema in
[plan-line-to-span-v1.schema.json](../../schemas/plan-line-to-span-v1.schema.json).
The existing model already permits a dimension with a flat set of root values, so this
feature does not alter plan-line matching semantics.

Development task 2 shall choose the transport endpoint, UI framework/layout, Faker
package/version, collision-handling algorithm, and API error-envelope shape. Those are
implementation design choices provided they preserve the requirements above.
