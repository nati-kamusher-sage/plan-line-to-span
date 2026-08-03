# DT-5: State Machine and Operation Lifecycle

| Document attribute | Value |
|---|---|
| Status | Draft; awaiting technical-lead approval |
| Design task | DT-5 of the [Preliminary Design Execution Plan](../preliminary-design-plan.md) |
| Governing input | [Operational Concept](../operational-concept.md) 8, 14.2, 14.3; [Interface Contract](../interface-contract.md) 6.1 |
| Depends on | [DT-4](dt-4-component-structure.md) |
| Prototype | [lifecycle](prototypes/dt-5-lifecycle.mjs) |

## 1. Decision

`LifecycleState` holds the four states and two pure functions: an **intake gate** deciding whether a request is accepted, and a **transition function** deciding the resulting state. Both are data-driven and are checked against IC 6.1 cell by cell.

The separation between intake and completion is the design's central distinction, and getting it wrong is the failure the prototype caught. Section 3 records it.

## 2. The intake gate

IC 6.1 reduces to one rule:

> `initialize` is accepted unless the utility is already initializing. Every other operation requires `ready`.

```
accepts(state, op):
    if state == initializing:  return false
    return op == initialize ? true : state == ready
```

Checked against all 24 state-operation cells transcribed from the contract:

```
all lifecycle checks passed (24 gate cells + paths + invariants)
```

The exit criterion — that the table maps onto the gating logic with `initialize` accepted from `Failed` — is met. The `failed`/`initialize` cell is the one the WP-7 review flagged as ISSUE-04, and it is now enforced by the same expression that enforces every other cell rather than by a special case that could be dropped.

## 3. Intake and completion are different events

The first version of the transition function applied the intake gate to every event. It failed two checks:

```
FAIL AC-INIT-01 uninit -> initializing -> ready: got initializing want ready
FAIL AC-INIT-02 first init failure -> failed:    got initializing want failed
```

The reason is worth recording, because the same mistake is easy to make in the implementation. From `initializing` the gate accepts nothing — that is its whole purpose. But an initialization that is already running must still be able to *finish*. Applying the gate to its completion strands the utility in `initializing` forever.

The gate governs **incoming requests**. Completions are consequences of a request already accepted, and are not gated:

```
next(state, op, outcome, priorState):
    if outcome == start:
        if not accepts(state, op): return state        # rejected intake, unchanged
        return op == initialize ? initializing : state
    # completion of work already in flight
    if state != initializing: return state             # benefit ops never move state
    if outcome == success: return ready
    return priorState == ready ? ready : failed
```

`priorState` is what the utility was before initialization began. It is the mechanism for OC 8.4's distinction: a failed *first* initialization enters `Failed`, while a failed *reinitialization* returns to `Ready` with the previous model intact.

## 4. Transitions

| From | Event | To | Source |
|---|---|---|---|
| `uninitialized` | `initialize` accepted | `initializing` | OC 8.2 |
| `failed` | `initialize` accepted (retry) | `initializing` | OC 8.4 |
| `ready` | `initialize` accepted (reinitialization) | `initializing` | OC 8.3 |
| `initializing` | success | `ready` | OC 8.3 |
| `initializing` | failure, no prior Ready model | `failed` | OC 8.4 |
| `initializing` | failure, prior Ready model | `ready` | OC 8.3 |
| `ready` | any benefit operation, any outcome | `ready` | OC 8.3, DT-3 |
| any | rejected request | unchanged | OC 14.2 |

The prototype confirms all four states are reachable and none is stranded, and that `Ready` is stable under every benefit operation and outcome — including `INDEX_FAILURE`, per DT-3's DEC-17 and the operational concept's `Ready --> Ready` edge.

## 5. Atomic reinitialization

DT-4's DEC-33 placed candidate construction before any live state change. The sequence:

1. The dispatcher accepts `initialize` and sets `initializing`, recording `priorState`.
2. `DimensionModelBuilder` builds a **candidate** `DimensionModel`. The live model is untouched.
3. On failure: discard the candidate, restore `priorState` semantics per section 3, emit the error. The previous model and all benefits remain exactly as they were.
4. On success: create a fresh empty index, then swap both references in one step. Transition to `ready`.

Because `DimensionModel` is immutable (DT-1's immutability principle) and `BenefitStore` holds the index by reference, step 4 is two assignments with no intervening observable state. There is no partially-built model a caller could see, satisfying OC 8.2's prohibition.

Benefit clearing is not a separate operation. The new index *is* empty, so `benefitCount` reports zero the moment the swap completes — which is why `AC-INIT-04` and the observability contract's "successful reinitialization always returns `benefitCount: 0`" hold without explicit clearing logic that could be forgotten.

## 6. Serial processing

`OperationDispatcher` is the single entry point (DT-4's DEC-30). Combined with DT-1's single-threaded runtime and synchronous handlers, no two operations interleave.

The design does not add a queue or lock. DT-1's DEC-1 rationale was that serial processing holds by construction on this runtime; introducing a mechanism would imply the property needs enforcing and invite the belief that it is safe to make handlers concurrent later.

One obligation follows: **operation handlers must not await.** A handler that yields to the event loop mid-operation reopens interleaving. This is a constraint on the implementation, and DT-9 should include a test that the handler path is synchronous end to end.

## 7. Mutation isolation

OC 14.3 requires that a failed mutation leave no partial change. Three properties combine to give this without a transaction mechanism:

**Validation completes before mutation.** DT-4's pipeline runs `RequestParser`, the state gate, `SpanResolver`, and `FormulaValidator` before `BenefitStore` is reached. By the time anything mutates, every rejection that can be predicted has been.

**Only `BenefitStore` mutates.** Every other component returns a result. There is one place where state changes, so there is one place to reason about.

**A single index operation is the commit point.** Create, update, and delete each reduce to one index call. There is no multi-step mutation that could fail halfway.

`INDEX_FAILURE` is the residual case: an index operation that fails internally. The interface contract already requires that no partial mutation be committed, which the index implementation must honor — the entry is either inserted or it is not. DT-3's `AC-INIT-09` verifies the utility stays `Ready` with its benefits intact, and the readiness review's note that this case needs a fault-injection hook still applies.

## 8. Decisions recorded

| ID | Decision | Rationale |
|---|---|---|
| DEC-34 | The intake gate is one expression derived from IC 6.1, not per-state special cases | Every cell including `failed`/`initialize` is enforced by the same rule; ISSUE-04 cannot regress. |
| DEC-35 | Intake and completion are distinct events; the gate applies only to intake | Gating completions strands the utility in `initializing`. Caught by the prototype. |
| DEC-36 | The transition function takes `priorState` | Distinguishes first-initialization failure (`Failed`) from reinitialization failure (`Ready`). |
| DEC-37 | Reinitialization swaps immutable model and index references in one step | No observable partial state; benefit clearing is implicit in the fresh index. |
| DEC-38 | No queue or lock for serial processing | Holds by construction on the DT-1 runtime; a mechanism would imply it needs enforcing. |
| DEC-39 | Operation handlers must be synchronous end to end | An await reopens interleaving that DEC-38 relies on being impossible. |

## 9. Open items

| Item | Owner task |
|---|---|
| Test that the handler path never awaits | DT-9 |
| Fault-injection hook for `INDEX_FAILURE` | DT-9 |
| Where `priorState` is stored during initialization | Implementation; a dispatcher local suffices |

## 10. Limitations

The prototype models the lifecycle as pure functions and checks them against the contract table. It verifies the *rules*, not their wiring into a running dispatcher. That the implementation calls them at the right moments is DT-9's concern.

The synchronous-handler obligation in DEC-39 is stated but not enforced by anything in this design. It depends on implementation discipline until DT-9 provides the test.
