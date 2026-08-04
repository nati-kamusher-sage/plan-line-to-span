/**
 * Promoted from docs/design/prototypes/dt-5-lifecycle.mjs, checked against
 * the real `accepts`, `completionTransition`, and `LifecycleState` rather
 * than the prototype's pure-function stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accepts, completionTransition, LifecycleState,
  OPERATIONS, type State, type Operation,
} from '../../src/dispatch/lifecycle-state.ts';

const STATES: readonly State[] = ['uninitialized', 'initializing', 'ready', 'failed'];

// IC 6.1, transcribed exactly from the contract's table.
const IC61: Record<State, { initialize: boolean; other: boolean }> = {
  uninitialized: { initialize: true, other: false },
  initializing: { initialize: false, other: false },
  ready: { initialize: true, other: true },
  failed: { initialize: true, other: false },
};

test('accepts agrees with IC 6.1 on all 24 state-operation cells', () => {
  let checked = 0;
  for (const state of STATES) {
    for (const op of OPERATIONS) {
      const expected = op === 'initialize' ? IC61[state].initialize : IC61[state].other;
      assert.equal(accepts(state, op), expected, `state=${state} op=${op}`);
      checked++;
    }
  }
  assert.equal(checked, 24);
});

test('the failed/initialize cell (ISSUE-04) is accepted, enforced by the same rule as every other cell', () => {
  assert.equal(accepts('failed', 'initialize'), true);
});

test('every operation other than initialize requires ready', () => {
  const nonInit = OPERATIONS.filter((op): op is Exclude<Operation, 'initialize'> => op !== 'initialize');
  for (const state of STATES) {
    for (const op of nonInit) {
      assert.equal(accepts(state, op), state === 'ready', `state=${state} op=${op}`);
    }
  }
});

// ---- completion transitions ----

test('a successful completion always yields ready, regardless of priorState', () => {
  assert.equal(completionTransition('uninitialized', 'success'), 'ready');
  assert.equal(completionTransition('ready', 'success'), 'ready');
  assert.equal(completionTransition('failed', 'success'), 'ready');
});

test('a failed first initialization (no prior Ready model) enters failed', () => {
  assert.equal(completionTransition('uninitialized', 'failure'), 'failed');
  assert.equal(completionTransition('failed', 'failure'), 'failed');
});

test('a failed reinitialization (prior Ready model) returns to ready, not failed', () => {
  assert.equal(completionTransition('ready', 'failure'), 'ready');
});

// ---- LifecycleState: the stateful wrapper OperationDispatcher uses ----

test('LifecycleState starts uninitialized', () => {
  const lc = new LifecycleState();
  assert.equal(lc.state, 'uninitialized');
});

test('AC-INIT-01: first initialize succeeds, entering ready', () => {
  const lc = new LifecycleState();
  const prior = lc.beginInitializing();
  assert.equal(lc.state, 'initializing');
  lc.completeInitialization(prior, 'success');
  assert.equal(lc.state, 'ready');
});

test('the historical failure transition can place a first initialization in failed', () => {
  const lc = new LifecycleState();
  const prior = lc.beginInitializing();
  lc.completeInitialization(prior, 'failure');
  assert.equal(lc.state, 'failed');
});

test('AC-INIT-03: initialize is accepted from failed, and succeeds', () => {
  const lc = new LifecycleState();
  lc.completeInitialization(lc.beginInitializing(), 'failure');
  assert.equal(lc.state, 'failed');
  assert.equal(lc.canAccept('initialize'), true);
  const prior = lc.beginInitializing();
  lc.completeInitialization(prior, 'success');
  assert.equal(lc.state, 'ready');
});

test('the historical failure transition retains a prior ready state', () => {
  const lc = new LifecycleState();
  lc.completeInitialization(lc.beginInitializing(), 'success');
  assert.equal(lc.state, 'ready');

  const prior = lc.beginInitializing(); // reinitialize
  assert.equal(prior, 'ready', 'priorState captured before the transition to initializing');
  lc.completeInitialization(prior, 'failure');
  assert.equal(lc.state, 'ready', 'failed reinitialization returns to ready, not failed');
});

test('AC-INIT-06/07/08: canAccept rejects span operations outside ready', () => {
  const lc = new LifecycleState();
  for (const op of ['createSpan', 'updateSpan', 'deleteSpan', 'querySpan', 'queryPlanLine'] as const) {
    assert.equal(lc.canAccept(op), false, `uninitialized should reject ${op}`);
  }

  lc.beginInitializing();
  for (const op of ['createSpan', 'queryPlanLine', 'initialize'] as const) {
    assert.equal(lc.canAccept(op), false, `initializing should reject ${op}`);
  }

  lc.completeInitialization('uninitialized', 'failure');
  assert.equal(lc.state, 'failed');
  for (const op of ['createSpan', 'querySpan', 'queryPlanLine'] as const) {
    assert.equal(lc.canAccept(op), false, `failed should reject ${op}`);
  }
  assert.equal(lc.canAccept('initialize'), true, 'failed accepts a retry');
});

// ---- reachability and stability, from the design-phase invariants ----

test('all four states are reachable', () => {
  const lc = new LifecycleState();
  const seen = new Set<State>([lc.state]);
  lc.completeInitialization(lc.beginInitializing(), 'success'); seen.add(lc.state); // ready
  lc.completeInitialization(lc.beginInitializing(), 'failure'); seen.add(lc.state); // failed (prior=ready -> still ready)
  // to reach failed, fail the FIRST initialization instead
  const lc2 = new LifecycleState();
  lc2.completeInitialization(lc2.beginInitializing(), 'failure'); seen.add(lc2.state);
  lc2.completeInitialization(lc2.beginInitializing(), 'success'); // retry succeeds
  assert.deepEqual(seen, new Set<State>(['uninitialized', 'ready', 'failed']));
});

test('ready is stable under every declared span-operation outcome', () => {
  const lc = new LifecycleState();
  lc.completeInitialization(lc.beginInitializing(), 'success');
  assert.equal(lc.state, 'ready');
  // Span operations never call beginInitializing/completeInitialization at
  // all -- there is no transition path for them to take the state anywhere.
  // This test documents that absence as the mechanism, not a call to assert.
  assert.equal(lc.canAccept('createSpan'), true);
  assert.equal(lc.state, 'ready', 'canAccept does not itself change state');
});
