# Plan Line to Span Acceptance Cases

| Catalog attribute | Value |
|---|---|
| Version | `v1` |
| Status | Draft |
| Governing behavior | [Operational Concept](operational-concept.md) |
| Interface messages | [Interface Contract](interface-contract.md) |
| Observable output | [Observability Contract](observability-contract.md) |

## 1. Test conventions

Unless a case states otherwise, initialize a new utility with fixture `D1` and use valid `plan-line-to-span/v1` envelopes. `F1`, `F2`, and so on are distinct non-null JSON formula objects. `B(span, formula)` denotes a stored benefit.

`D1` has dimensions `location` and `department`. Location values are `4` (USA), `20` (New York City, parent `4`), `21` (Los Angeles, parent `4`), `22` (Manhattan, parent `20`), and `30` (Brooklyn, parent `20`). Department values are `rnd` and `eng`. Keys `4`, `20`, and `21` denote the same values as the dimension-file example in Operational Concept section 7; `22` and `30` extend it with the second hierarchy level that multi-level matching requires.

Each operation produces one console JSON Lines record as specified by the observability contract. In the tables, `log: success` means `outcome: success` with the operation, resulting `state`, `benefitCount`, and any required operation-specific fields; `log: failure CODE` means `outcome: failure`, `errorCode: CODE`, unchanged `benefitCount`, and level `warn` unless the code is `INDEX_FAILURE`.

## 2. Initialization and lifecycle

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-INIT-01 | OC 8, 14.1, 17.1 | Start Uninitialized; initialize with `D1`. | Success `{state: ready, dimensionCount: 2, benefitCount: 0}`; Ready; empty index; `log: success` with `dimensionCount: 2`. |
| AC-INIT-02 | OC 8.4, 14.1, 17.2, 17.12 | Start Uninitialized; initialize a definition whose `parentKey` is absent. | `INVALID_DIMENSION_DEFINITION`; Failed; no usable model or benefits; `log: failure INVALID_DIMENSION_DEFINITION` with `state: failed`. |
| AC-INIT-03 | OC 8.4, 17.12 | From AC-INIT-02 Failed state; initialize with `D1`. | Success; Ready; empty index; `log: success`. |
| AC-INIT-04 | OC 8.2–8.3, 17.13 | Ready with `B({location: 4}, F1)`; initialize valid replacement model `D1`. | Success with `benefitCount: 0`; Ready; all prior benefits are atomically cleared; `log: success` with `benefitCount: 0`. |
| AC-INIT-05 | OC 8.2–8.3, 17.14 | Ready with `B({location: 4}, F1)`; reinitialize with a hierarchy cycle. | `INVALID_DIMENSION_DEFINITION`; returns to Ready; `B({location: 4}, F1)` remains queryable; `log: failure INVALID_DIMENSION_DEFINITION` with `state: ready`, `benefitCount: 1`. |
| AC-INIT-06 | OC 8.2, 14.2, 17.11 | Hold initialization in progress; submit `queryEmployee`. | `INVALID_STATE`; no state or storage change; `log: failure INVALID_STATE`. |
| AC-INIT-07 | OC 8.1, 14.2 | Start Uninitialized; submit `createBenefit`. | `INVALID_STATE`; Uninitialized; empty storage; `log: failure INVALID_STATE`. |
| AC-INIT-08 | OC 8.4, IC 6.1 | From AC-INIT-02 Failed state; submit `createBenefit`, `queryBenefit`, and `queryEmployee`. | Each returns `INVALID_STATE` with `details.state: failed`; the state remains Failed; each emits `log: failure INVALID_STATE`. Only `initialize` is accepted from Failed, as AC-INIT-03 confirms. |
| AC-INIT-09 | OC 8.4, 15.3, IC 6.1 | Ready with `B({location: 4}, F1)`; induce an index error on a `createBenefit` for a distinct span. | `INDEX_FAILURE` at log level `error`; the utility remains Ready rather than entering Failed; `B({location: 4}, F1)` is still queryable; `benefitCount` remains `1`; no partial mutation is committed. |

## 3. Benefit lifecycle and exact lookup

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-BEN-01 | OC 10–11, 17.3 | Ready; create `{location: 4}` with `F1`. | Success returning that benefit; Ready; one stored benefit; `log: success`, `benefitCount: 1`. |
| AC-BEN-02 | OC 6.6, 14.2, 17.15 | Ready with `B({location: 4}, F1)`; create the same span with `F2`. | `DUPLICATE_SPAN`; original `F1` remains; `log: failure DUPLICATE_SPAN`, `benefitCount: 1`. |
| AC-BEN-03 | OC 9.1, 17.4 | Ready with `B({location: 4}, F1)`; query `{location: 4}`. | Success returning only `B({location: 4}, F1)`; `log: success`. |
| AC-BEN-04 | OC 9.1 | Ready with `B({location: 4, department: rnd}, F1)`; query `{department: rnd, location: 4}`. | Success returning the benefit; member order does not affect identity; `log: success`. |
| AC-BEN-05 | OC 9.1, 17.9 | Ready with `B({location: 4}, F1)`; query `{location: 20}`. | `NOT_FOUND`; hierarchy does not broaden exact lookup; `log: failure NOT_FOUND`. |
| AC-BEN-06 | OC 11.3, 17.6, 17.16 | Ready with `B({location: 4}, F1)`; update `{location: 4}` with `F2`; query it. | Update and subsequent query return `F2` only; span unchanged; `log: success` for both operations. |
| AC-BEN-07 | OC 11.3, 14.2, 17.17 | Ready with `B({location: 4}, F1)`; send an update payload containing additional `replacementSpan`. | `MALFORMED_REQUEST`; original benefit remains; `log: failure MALFORMED_REQUEST`. |
| AC-BEN-08 | OC 11.4, 17.7 | Ready with `B({location: 4}, F1)`; delete `{location: 4}`; query it. | Delete success then `NOT_FOUND`; storage is empty; `log: success` then `log: failure NOT_FOUND`. |
| AC-BEN-09 | OC 14.3 | Ready with an empty index; update and delete `{location: 4}`. | Each returns `NOT_FOUND`; storage remains empty; each emits `log: failure NOT_FOUND`. |
| AC-BEN-10 | OC 14.3 | Ready with `B({location: 4}, F1)`; attempt duplicate create, malformed update, and absent delete. | Each fails with its defined code; after each, exact query still returns only `F1`; failed-operation logs keep `benefitCount: 1`. |
| AC-BEN-11 | OC 6.5, 17.10 | Ready; create a formula object containing nested arrays, booleans, `null`, and a sentinel string; query its benefit. | The returned formula is structurally identical to the submitted object; no interpretation or transformation occurs; `log: success` records do not contain the sentinel. |

## 4. Employee matching

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-MATCH-01 | OC 9.2 | Ready with `B({location: 20}, F1)`; query employee `{location: 20}`. | `matches` contains `F1`; `matchCount: 1`; `log: success`. |
| AC-MATCH-02 | OC 6.2, 9.2 | Ready with `B({location: 4}, F1)`; query employee `{location: 20}`. | `matches` contains `F1`; one-level ancestor match; `matchCount: 1`. |
| AC-MATCH-03 | OC 6.2, 9.2 | Ready with `B({location: 4}, F1)`; query employee `{location: 22}`. | `matches` contains `F1`; multi-level ancestor match across two levels, `4` to `20` to `22`; `matchCount: 1`. |
| AC-MATCH-04 | OC 9.2 | Ready with `B({location: 22}, F1)`; query employee `{location: 4}`. | `{matches: []}`; child span does not match parent employee; `matchCount: 0`. |
| AC-MATCH-05 | OC 9.2 | Ready with `B({location: 4}, F1)`; query employee `{location: 20, department: rnd}`. | `matches` contains `F1`; employee-only dimension does not prevent match; `matchCount: 1`. |
| AC-MATCH-06 | OC 9.2 | Ready with `B({location: 4, department: rnd}, F1)`; query employee `{location: 20}`. | `{matches: []}`; required employee dimension is missing; `matchCount: 0`. |
| AC-MATCH-07 | OC 9.2 | Ready with `B({location: 4, department: rnd}, F1)`; query `{location: 20, department: eng}`. | `{matches: []}`; all span constraints use AND semantics; `matchCount: 0`. |
| AC-MATCH-08 | OC 14.3, 17.8 | Ready with no applicable benefits; query a valid employee. | Success `{matches: []}` rather than not found; `log: success`, `matchCount: 0`. |
| AC-MATCH-09 | OC 14.3 | Ready with benefits matching the same employee; query twice and compare as sets. | Each response contains the same complete set; no ordering assertion is made; each has the same `matchCount`. |
| AC-MATCH-10 | OC 12, 12.2, 17.5 | Ready; create the four section 12 benefits: `B1({location: 4})`, `B2({location: 4, department: rnd})`, `B3({location: 20})`, `B4({location: 4, department: eng})`; query employee `{location: 20, department: rnd}`. | `matches` is exactly `{B1, B2, B3}`, compared as a set; `B4` is excluded because its department differs; `matchCount: 3`; `log: success`. |
| AC-MATCH-11 | OC 12.2 | From the AC-MATCH-10 state; query employee `{location: 21, department: rnd}`, then `{location: 21, department: eng}`, then `{location: 4}`. | Results are exactly `{B1, B2}`, then `{B1, B4}`, then `{B1}`; the New York City span never matches a Los Angeles employee; `matchCount` is `2`, `2`, then `1`. |

## 5. Empty spans and zero-dimensional models

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-GLOBAL-01 | OC 6.4, 9.2, 17.18 | Ready; create `B({}, F1)`; query employee `{location: 20}`. | Create succeeds; employee result contains `F1`; `log: success`, `matchCount: 1`. |
| AC-GLOBAL-02 | OC 6.4, 9.2, 17.18 | Ready with `B({}, F1)`; query employee `{}`. | Success result contains `F1`; `matchCount: 1`. |
| AC-GLOBAL-03 | OC 6.6, 17.15, 17.18 | Ready with `B({}, F1)`; create `{}` with `F2`. | `DUPLICATE_SPAN`; original global benefit remains; `log: failure DUPLICATE_SPAN`. |
| AC-GLOBAL-04 | OC 6.4, 11.3–11.5, 17.18 | Ready with `B({}, F1)`; exact query `{}`, update it to `F2`, exact query again, delete `{}`, query again. | First query `F1`; update and second query `F2`; delete succeeds; final query is `NOT_FOUND`; logs reflect each outcome and resulting count. |
| AC-ZERO-01 | OC 7, 16.1.7, 17.19 | Start Uninitialized; initialize `{format: plan-line-to-span-dimensions/v1, dimensions: []}`; create `B({}, F1)`; query employee `{}`. | Initialization succeeds with `dimensionCount: 0`; create and query succeed; query has `matchCount: 1`; all logs are successful. |

## 6. Validation and serial processing

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-VAL-01 | OC 14.2 | Ready; create span `{unknown: x}`. | `UNKNOWN_DIMENSION`; storage unchanged; `log: failure UNKNOWN_DIMENSION`. |
| AC-VAL-02 | OC 14.2 | Ready; create span `{location: not-a-key}`. | `UNKNOWN_DIMENSION_VALUE`; storage unchanged; `log: failure UNKNOWN_DIMENSION_VALUE`. |
| AC-VAL-03 | IC 3.1, 6 | Ready; send raw JSON containing duplicate `location` members in `span`. | `MALFORMED_REQUEST`; storage unchanged; `log: failure MALFORMED_REQUEST`. |
| AC-VAL-04 | OC 14.1 | Start Uninitialized; initialize a value whose `parentKey` is absent. | `INVALID_DIMENSION_DEFINITION`; Failed; `log: failure INVALID_DIMENSION_DEFINITION`. |
| AC-VAL-05 | OC 14.1 | Start Uninitialized; initialize a two-value parent cycle. | `INVALID_DIMENSION_DEFINITION`; Failed; `log: failure INVALID_DIMENSION_DEFINITION`. |
| AC-VAL-06 | IC 2, 6 | Ready; submit a request missing `payload` or containing an undeclared field. | `MALFORMED_REQUEST`; state and storage unchanged; `log: failure MALFORMED_REQUEST` when an operation is parseable. |
| AC-VAL-07 | IC 3.2, 6 | Ready; create with `formula: null`, then with an object whose serialized size exceeds 65,536 bytes. | Each returns `INVALID_FORMULA`; storage is unchanged; each emits `log: failure INVALID_FORMULA`. |
| AC-SERIAL-01 | OC 8.3, 15.3, 17.20 | Ready; submit accepted create `B({location: 4}, F1)`, then query `{location: 4}` in that order. | Create response precedes query processing; query returns `F1`; the two success log records have increasing `sequence` values. |

## 7. Observability and privacy

| ID | Requirement trace | Preconditions and sequence | Expected response, state, storage, and log |
|---|---|---|---|
| AC-OBS-01 | Observability Contract 2–6 | Ready; perform successful create, query employee with one match, and delete. | Capture three valid JSON Lines records; each has common fields, correct operation/outcome, and non-negative `durationMs`; the employee record has `matchCount: 1`. |
| AC-OBS-02 | Observability Contract 4, 6 | Ready with one benefit; submit unknown-dimension create and then absent delete. | Capture two `warn` failure records with the respective error codes, no `matchCount`, and unchanged `benefitCount: 1`. |
| AC-OBS-03 | Observability Contract 6 | Ready with one benefit; delete it; successfully reinitialize with `D1`. | Success records report benefit counts `0` after delete and `0` after reinitialization; the `initialize` record carries `dimensionCount: 2` and `dimensionValueCount: 7`. |
| AC-OBS-04 | Observability Contract 7 | Use formulas and employee values containing distinctive sentinel strings; capture logs for create and query employee. | No log record contains either sentinel, any span or plan-line map, formula, request ID, or raw dimension value. |

## 8. Coverage statement

The cases above cover all twenty operational acceptance outcomes in Operational Concept section 17, all nine interface error codes, every state and operation combination in Interface Contract section 6.1, the settled empty-span and zero-dimensional decisions, and every required console-log field. Cases with a reference to `IC` use the Interface Contract; all other references use the Operational Concept unless stated otherwise.

`INDEX_FAILURE` is verifiable only by fault injection, so `AC-INIT-09` presumes a test hook that forces an index error. If the demo provides no such hook, that case is recorded as not executable rather than passing.
