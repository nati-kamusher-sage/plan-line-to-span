/**
 * OperationDispatcher: the single entry point for every operation (DEC-30).
 *
 * Combined with a single-threaded runtime and DEC-39's synchronous-handler
 * obligation, routing every operation through one dispatcher is what makes
 * serial processing (OC 16.1.14) hold by construction rather than by a queue
 * or lock (DEC-38) -- see AC-SERIAL-01.
 *
 * `dispatch` is deliberately synchronous end to end. Do not add `async` to
 * this method or to anything it calls on the accepted-request path: an await
 * yields to the event loop, which is exactly the interleaving DEC-38 assumes
 * is impossible. DT-9 owns a static check for this (DEC-64); until that
 * lands, this comment is the enforcement.
 *
 * T7's scope is the gate and the initialize lifecycle. Benefit-operation
 * validation precedence (IC 7) is T8's ordered pipeline, and full CRUD error
 * mapping is T9's; this dispatcher wires enough of both to demonstrate
 * correct state gating and serial ordering (AC-INIT-*, AC-SERIAL-01) without
 * pre-empting either later task's scope.
 */

import { parseRequest, MalformedRequestError, type ParsedRequest } from '../transport/request-parser.ts';
import { LifecycleState, type State } from './lifecycle-state.ts';
import {
  buildDimensionModel, InvalidDimensionDefinitionError, type DimensionModel,
} from '../model/dimension-model.ts';
import { resolveSpan, UnknownDimensionError, UnknownDimensionValueError } from '../model/span.ts';
import { RTree } from '../index/rtree.ts';
import { IndexAdapter, IndexFailureError, type IndexedBenefit } from '../store/index-adapter.ts';
import { BenefitStore, DuplicateSpanError, BenefitNotFoundError } from '../store/benefit-store.ts';
import { success, failure, type Response } from './response.ts';

export class OperationDispatcher {
  private readonly lifecycle = new LifecycleState();
  private model: DimensionModel | undefined;
  private store: BenefitStore | undefined;

  get state(): State {
    return this.lifecycle.state;
  }

  /**
   * Exposes the dispatcher's own `LifecycleState` for tests only.
   *
   * This is the seam DT-9's `pause-during-initialize` capability anticipated
   * needing none of: `LifecycleState` is already a distinct, inspectable
   * component (DT-4), so a test can force `initializing` directly and assert
   * that `dispatch` rejects a subsequent request, without OperationDispatcher
   * providing any production-facing way to do so and without fabricating
   * real concurrency around synchronous, non-`await`ing handlers (DEC-39).
   */
  get testOnlyLifecycle(): LifecycleState {
    return this.lifecycle;
  }

  /** The number of benefits in the live store, or 0 before any model exists. */
  get benefitCount(): number {
    return this.store?.count ?? 0;
  }

  /**
   * The loaded model's dimension and dimension-value counts, or 0 before any
   * model exists. Exposed alongside `benefitCount` and `state` so
   * `ObservabilityEmitter` can read every Obs 3/4 field it needs after an
   * operation completes without reaching into a `Response`'s untyped `data`.
   */
  get dimensionCount(): number {
    return this.model?.dimensionCount ?? 0;
  }

  get dimensionValueCount(): number {
    return this.model?.dimensionValueCount ?? 0;
  }

  dispatch(raw: string): Response {
    let request: ParsedRequest;
    try {
      request = parseRequest(raw);
    } catch (e) {
      const message = e instanceof MalformedRequestError ? e.message : 'malformed request';
      return failure('MALFORMED_REQUEST', message);
    }

    if (!this.lifecycle.canAccept(request.operation)) {
      return failure('INVALID_STATE',
        `operation ${request.operation} is not accepted in state ${this.lifecycle.state}`,
        { operation: request.operation, requestId: request.requestId, state: this.lifecycle.state });
    }

    if (request.operation === 'initialize') {
      return this.handleInitialize(request);
    }

    // Every non-initialize operation is only reached here when `ready`
    // (the gate above guarantees it), so `this.model` and `this.store` exist.
    const model = this.model!;
    const store = this.store!;

    switch (request.operation) {
      case 'createBenefit': return this.handleCreate(request, model, store);
      case 'updateBenefit': return this.handleUpdate(request, model, store);
      case 'deleteBenefit': return this.handleDelete(request, model, store);
      case 'queryBenefit': return this.handleQueryBenefit(request, model, store);
      case 'queryEmployee': return this.handleQueryEmployee(request, model, store);
    }
  }

  /**
   * Candidate-then-swap reinitialization (DEC-37). The candidate model is
   * built before any live state changes; on failure nothing about the live
   * model or store is touched, and completeInitialization's priorState
   * restores Ready with the previous benefits intact (OC 8.3, AC-INIT-05).
   * On success, a fresh empty index and the new model are swapped in
   * together, which is why benefitCount is 0 with no separate clearing step
   * (AC-INIT-04).
   */
  private handleInitialize(
    request: Extract<ParsedRequest, { operation: 'initialize' }>,
  ): Response {
    const priorState = this.lifecycle.beginInitializing();

    let candidateModel: DimensionModel;
    try {
      candidateModel = buildDimensionModel(request.payload);
    } catch (e) {
      this.lifecycle.completeInitialization(priorState, 'failure');
      const message = e instanceof InvalidDimensionDefinitionError ? e.message : 'invalid dimension definition';
      return failure('INVALID_DIMENSION_DEFINITION', message,
        { operation: 'initialize', requestId: request.requestId });
    }

    const candidateStore = new BenefitStore(
      new IndexAdapter(new RTree<IndexedBenefit>(candidateModel.axisCount), candidateModel));
    this.model = candidateModel;
    this.store = candidateStore;
    this.lifecycle.completeInitialization(priorState, 'success');

    return success('initialize', {
      state: 'ready',
      dimensionCount: candidateModel.dimensionCount,
      benefitCount: candidateStore.count,
    }, request.requestId);
  }

  private handleCreate(
    request: Extract<ParsedRequest, { operation: 'createBenefit' }>,
    model: DimensionModel, store: BenefitStore,
  ): Response {
    try {
      const span = resolveSpan(request.payload.span, model);
      const benefit = store.create(span, request.payload.formula);
      return success('createBenefit',
        { benefit: { span: benefit.span.dimensions, formula: benefit.formula } }, request.requestId);
    } catch (e) {
      return this.mapBenefitError(e, 'createBenefit', request.requestId);
    }
  }

  private handleUpdate(
    request: Extract<ParsedRequest, { operation: 'updateBenefit' }>,
    model: DimensionModel, store: BenefitStore,
  ): Response {
    try {
      const span = resolveSpan(request.payload.span, model);
      const benefit = store.update(span, request.payload.formula);
      return success('updateBenefit',
        { benefit: { span: benefit.span.dimensions, formula: benefit.formula } }, request.requestId);
    } catch (e) {
      return this.mapBenefitError(e, 'updateBenefit', request.requestId);
    }
  }

  private handleDelete(
    request: Extract<ParsedRequest, { operation: 'deleteBenefit' }>,
    model: DimensionModel, store: BenefitStore,
  ): Response {
    try {
      const span = resolveSpan(request.payload.span, model);
      store.delete(span);
      return success('deleteBenefit', { deleted: true, span: span.dimensions }, request.requestId);
    } catch (e) {
      return this.mapBenefitError(e, 'deleteBenefit', request.requestId);
    }
  }

  private handleQueryBenefit(
    request: Extract<ParsedRequest, { operation: 'queryBenefit' }>,
    model: DimensionModel, store: BenefitStore,
  ): Response {
    try {
      const span = resolveSpan(request.payload.span, model);
      const benefit = store.exact(span);
      return success('queryBenefit',
        { benefit: { span: benefit.span.dimensions, formula: benefit.formula } }, request.requestId);
    } catch (e) {
      return this.mapBenefitError(e, 'queryBenefit', request.requestId);
    }
  }

  private handleQueryEmployee(
    request: Extract<ParsedRequest, { operation: 'queryEmployee' }>,
    model: DimensionModel, store: BenefitStore,
  ): Response {
    try {
      // Employee-side resolution deliberately reuses resolveSpan: a plan
      // line and a span are both dimension-value maps validated the same
      // way (src/model/span.ts), and OC 9.2's presence rule is enforced
      // later by DimensionModel.planLineToPoint, not here.
      resolveSpan(request.payload.dimensions, model);
      const matches = store.match(request.payload.dimensions);
      return success('queryEmployee', {
        matches: matches.map(b => ({ span: b.span.dimensions, formula: b.formula })),
      }, request.requestId);
    } catch (e) {
      return this.mapBenefitError(e, 'queryEmployee', request.requestId);
    }
  }

  private mapBenefitError(e: unknown, operation: Response['operation'], requestId: string | undefined): Response {
    if (e instanceof UnknownDimensionError) {
      return failure('UNKNOWN_DIMENSION', e.message, { operation, requestId });
    }
    if (e instanceof UnknownDimensionValueError) {
      return failure('UNKNOWN_DIMENSION_VALUE', e.message, { operation, requestId });
    }
    if (e instanceof DuplicateSpanError) {
      return failure('DUPLICATE_SPAN', e.message, { operation, requestId });
    }
    if (e instanceof BenefitNotFoundError) {
      return failure('NOT_FOUND', e.message, { operation, requestId });
    }
    if (e instanceof IndexFailureError) {
      // AC-INIT-09: the utility remains Ready. No lifecycle transition
      // happens here, since INDEX_FAILURE never enters Failed (DT-3 DEC-17,
      // the operational concept's Ready --> Ready edge).
      return failure('INDEX_FAILURE', e.message, { operation, requestId });
    }
    throw e;
  }
}
