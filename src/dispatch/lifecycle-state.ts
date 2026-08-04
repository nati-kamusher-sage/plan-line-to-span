/**
 * LifecycleState: the four operating states and the two pure functions DT-5
 * derives from IC 6.1 — an intake gate and a transition function.
 *
 * The central distinction (DEC-35) is that intake and completion are
 * different events. The gate governs incoming requests only; applying it to
 * a request's own completion strands the utility in `initializing` forever,
 * since that state accepts nothing by design. The design-phase prototype
 * caught this exact mistake (docs/design/dt-5-lifecycle.md section 3).
 */

export type State = 'uninitialized' | 'initializing' | 'ready' | 'failed';

export const OPERATIONS = [
  'initialize', 'createSpan', 'updateSpan', 'deleteSpan', 'querySpan', 'queryPlanLine',
] as const;
export type Operation = (typeof OPERATIONS)[number];

/**
 * DEC-34: one expression derived from IC 6.1, not per-state special cases.
 * `initialize` is accepted unless already initializing; every other
 * operation requires `ready`. The `failed`/`initialize` cell — the retry
 * path the WP-7 readiness review recorded as ISSUE-04 — is enforced by this
 * same expression, so it cannot regress independently of every other cell.
 */
export function accepts(state: State, operation: Operation): boolean {
  if (state === 'initializing') return false;
  return operation === 'initialize' ? true : state === 'ready';
}

export type Outcome = 'success' | 'failure';

/**
 * DEC-36: the transition function takes `priorState`, which distinguishes a
 * failed *first* initialization (enters `failed`, OC 8.4) from a failed
 * *reinitialization* (returns to `ready` with the previous model intact,
 * OC 8.3). `LifecycleState` is responsible for recording `priorState` across
 * the two calls that bracket one initialization (see `beginInitializing`).
 */
export function completionTransition(priorState: State, outcome: Outcome): State {
  return outcome === 'success' ? 'ready' : (priorState === 'ready' ? 'ready' : 'failed');
}

/**
 * Mutable state holder used by `OperationDispatcher`. The gate and
 * transition functions above are pure and independently testable; this
 * class is the thin, stateful wrapper the dispatcher actually calls.
 *
 * Deliberately not hidden inside `OperationDispatcher`: T9's
 * `pause-during-initialize` capability (docs/design/dt-9-test-approach.md)
 * needs to force the utility into `initializing` and assert that the gate
 * rejects a request while there, and doing that requires a state object a
 * test can construct and inspect directly rather than reaching into a
 * dispatcher's private field.
 */
export class LifecycleState {
  private current: State = 'uninitialized';

  get state(): State {
    return this.current;
  }

  canAccept(operation: Operation): boolean {
    return accepts(this.current, operation);
  }

  /**
   * Begin an accepted `initialize` intake. Returns the state to restore on
   * failure (`priorState`), which the caller must pass back to
   * `completeInitialization`.
   *
   * Throws if called when `canAccept('initialize')` is false — this is a
   * programming-error guard, not a path `OperationDispatcher` should ever
   * reach, since it must check the gate before calling this.
   */
  beginInitializing(): State {
    if (!this.canAccept('initialize')) {
      throw new Error(`cannot begin initialization from state ${this.current}`);
    }
    const priorState = this.current;
    this.current = 'initializing';
    return priorState;
  }

  /** Complete an initialization that `beginInitializing` started. */
  completeInitialization(priorState: State, outcome: Outcome): void {
    if (this.current !== 'initializing') {
      throw new Error(`completeInitialization called from state ${this.current}, expected initializing`);
    }
    this.current = completionTransition(priorState, outcome);
  }
}
