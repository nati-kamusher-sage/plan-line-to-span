# DT-5: State Machine and Operation Lifecycle

| Document attribute | Value |
|---|---|
| Status | ECP-1 revised design |
| Governing input | [Operational Concept](../operational-concept.md) 8, 14; [Interface Contract](../interface-contract.md) 6.1 |
| Depends on | [DT-4](dt-4-component-structure.md) |
| Historical prototype | [lifecycle](prototypes/dt-5-lifecycle.mjs) |

## 1. Decision

Retain the four lifecycle states and data-driven intake gate. `INVALID_STATE` remains
declared state behavior. ECP-1 removes controlled semantic-initialization failures from
the public contract; Failed-state retry/gating is verified through a test-only lifecycle
hook rather than malformed input.

## 2. Intake gate

```text
accepts(state, operation):
  if state == initializing: return false
  if operation == initialize: return true
  return state == ready
```

Thus `initialize` is accepted from Uninitialized, Ready, and Failed. Every other operation
requires Ready. Rejection leaves lifecycle and span storage unchanged.

## 3. Intake and completion

The gate applies to new requests, not completion of work already accepted. Successful
initialization moves `initializing` to `ready`. The historical failure transition remains
available for unexpected initialization failure, but ECP-1 does not translate such a
failure into a stable response or guarantee cleanup for invalid input.

```text
uninitialized --initialize--> initializing --success--> ready
failed        --initialize--> initializing --success--> ready
ready         --initialize--> initializing --success--> ready
ready         --other accepted operation/outcome--------------> ready
any           --rejected intake-------------------------------> unchanged
```

Failed is retained as an observable lifecycle value and retry state. The acceptance suite
uses controlled state setup for it because invalid domain data is outside the contract.

## 4. Successful reinitialization

For valid input:

1. accept `initialize` and enter `initializing`;
2. build a candidate immutable dimension model;
3. create a fresh empty index;
4. replace live model and store references together;
5. enter `ready` and report `spanCount: 0`.

No separate clearing loop exists. The new store is empty by construction. ECP-1 does not
promise preservation of the prior model when invalid input or an unexpected exception
interrupts this sequence.

## 5. Serial processing

The dispatcher remains the single entry point and handlers remain synchronous. No queue
or lock is added. The `handlers-never-await` static test protects the assumption that one
accepted operation completes before the next begins.

## 6. Mutation outcomes

`SpanStore` is the only owner of stored-span mutation and declared stored-state outcomes.

- Create checks duplicate identity before insert.
- Delete checks exact presence before removal.
- Update checks source presence and replacement collision before removal, then removes
  the source and inserts the replacement.

Declared `DUPLICATE_SPAN` and `NOT_FOUND` outcomes make no change. An unexpected failure
after mutation begins is not caught or rolled back under ECP-1.

## 7. Decisions recorded

| ID | ECP-1 status |
|---|---|
| DEC-34 | Retained: one intake expression covers every state/operation cell. |
| DEC-35 | Retained: intake and completion are distinct events. |
| DEC-36 | Revised: prior-state failure restoration is not contract behavior for invalid input. |
| DEC-37 | Retained for successful valid reinitialization: swap model/store references. |
| DEC-38 | Retained: no queue or lock. |
| DEC-39 | Retained: handlers are synchronous end to end. |

## 8. Verification

Active lifecycle cases are AC-INIT-01, -03, -04, -06, -07, and -08. AC-INIT-02,
AC-INIT-05, and AC-INIT-09 are retired because they require controlled semantic or index
exception translation removed by ECP-1.

The historical prototype remains evidence for the gate table, but its failure-response
paths are superseded.
