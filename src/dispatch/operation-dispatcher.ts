/** Synchronous single entry point for all contract operations (DEC-30). */

import { parseRequest, MalformedRequestError, type ParsedRequest } from '../transport/request-parser.ts';
import { LifecycleState, type State } from './lifecycle-state.ts';
import {
  buildDimensionModel, InvalidDimensionDefinitionError, type DimensionModel,
} from '../model/dimension-model.ts';
import {
  resolveSpan, UnknownDimensionError, UnknownDimensionValueError, type CanonicalSpan,
} from '../model/span.ts';
import { RTree } from '../index/rtree.ts';
import { IndexAdapter, IndexFailureError, type IndexPort } from '../store/index-adapter.ts';
import { SpanStore, DuplicateSpanError, SpanNotFoundError } from '../store/span-store.ts';
import { success, failure, type Response } from './response.ts';

export type IndexPortFactory = (model: DimensionModel) => IndexPort;

const defaultIndexPortFactory: IndexPortFactory = model =>
  new IndexAdapter(new RTree<CanonicalSpan>(model.axisCount), model);

export class OperationDispatcher {
  private readonly lifecycle = new LifecycleState();
  private readonly buildIndexPort: IndexPortFactory;
  private model: DimensionModel | undefined;
  private store: SpanStore | undefined;

  constructor(buildIndexPort: IndexPortFactory = defaultIndexPortFactory) {
    this.buildIndexPort = buildIndexPort;
  }

  get state(): State {
    return this.lifecycle.state;
  }

  get testOnlyLifecycle(): LifecycleState {
    return this.lifecycle;
  }

  get spanCount(): number {
    return this.store?.count ?? 0;
  }

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
    } catch (error) {
      const message = error instanceof MalformedRequestError ? error.message : 'malformed request';
      return failure('MALFORMED_REQUEST', message);
    }

    if (!this.lifecycle.canAccept(request.operation)) {
      return failure('INVALID_STATE',
        `operation ${request.operation} is not accepted in state ${this.lifecycle.state}`,
        { operation: request.operation, requestId: request.requestId, state: this.lifecycle.state });
    }

    if (request.operation === 'initialize') return this.handleInitialize(request);

    const model = this.model!;
    const store = this.store!;

    switch (request.operation) {
      case 'createSpan': return this.handleCreateSpan(request, model, store);
      case 'updateSpan': return this.handleUpdateSpan(request, model, store);
      case 'deleteSpan': return this.handleDeleteSpan(request, model, store);
      case 'querySpan': return this.handleQuerySpan(request, model, store);
      case 'queryPlanLine': return this.handleQueryPlanLine(request, model, store);
    }
  }

  private handleInitialize(
    request: Extract<ParsedRequest, { operation: 'initialize' }>,
  ): Response {
    const priorState = this.lifecycle.beginInitializing();

    let candidateModel: DimensionModel;
    try {
      candidateModel = buildDimensionModel(request.payload);
    } catch (error) {
      this.lifecycle.completeInitialization(priorState, 'failure');
      const message = error instanceof InvalidDimensionDefinitionError
        ? error.message : 'invalid dimension definition';
      return failure('INVALID_DIMENSION_DEFINITION', message,
        { operation: 'initialize', requestId: request.requestId });
    }

    const candidateStore = new SpanStore(this.buildIndexPort(candidateModel));
    this.model = candidateModel;
    this.store = candidateStore;
    this.lifecycle.completeInitialization(priorState, 'success');

    return success('initialize', {
      state: 'ready',
      dimensionCount: candidateModel.dimensionCount,
      spanCount: candidateStore.count,
    }, request.requestId);
  }

  private handleCreateSpan(
    request: Extract<ParsedRequest, { operation: 'createSpan' }>,
    model: DimensionModel, store: SpanStore,
  ): Response {
    try {
      const stored = store.create(resolveSpan(request.payload.span, model));
      return success('createSpan', { span: stored.dimensions }, request.requestId);
    } catch (error) {
      return this.mapSpanError(error, 'createSpan', request.requestId);
    }
  }

  private handleUpdateSpan(
    request: Extract<ParsedRequest, { operation: 'updateSpan' }>,
    model: DimensionModel, store: SpanStore,
  ): Response {
    try {
      const source = resolveSpan(request.payload.span, model);
      const replacement = resolveSpan(request.payload.replacementSpan, model);
      const stored = store.update(source, replacement);
      return success('updateSpan', { span: stored.dimensions }, request.requestId);
    } catch (error) {
      return this.mapSpanError(error, 'updateSpan', request.requestId);
    }
  }

  private handleDeleteSpan(
    request: Extract<ParsedRequest, { operation: 'deleteSpan' }>,
    model: DimensionModel, store: SpanStore,
  ): Response {
    try {
      const span = resolveSpan(request.payload.span, model);
      store.delete(span);
      return success('deleteSpan', { deleted: true, span: span.dimensions }, request.requestId);
    } catch (error) {
      return this.mapSpanError(error, 'deleteSpan', request.requestId);
    }
  }

  private handleQuerySpan(
    request: Extract<ParsedRequest, { operation: 'querySpan' }>,
    model: DimensionModel, store: SpanStore,
  ): Response {
    try {
      const stored = store.exact(resolveSpan(request.payload.span, model));
      return success('querySpan', { span: stored.dimensions }, request.requestId);
    } catch (error) {
      return this.mapSpanError(error, 'querySpan', request.requestId);
    }
  }

  private handleQueryPlanLine(
    request: Extract<ParsedRequest, { operation: 'queryPlanLine' }>,
    model: DimensionModel, store: SpanStore,
  ): Response {
    try {
      // E1 retains semantic resolution. E2 removes this defensive check.
      resolveSpan(request.payload.dimensions, model);
      const matches = store.match(request.payload.dimensions);
      return success('queryPlanLine', {
        matches: matches.map(span => span.dimensions),
      }, request.requestId);
    } catch (error) {
      return this.mapSpanError(error, 'queryPlanLine', request.requestId);
    }
  }

  private mapSpanError(
    error: unknown, operation: Response['operation'], requestId: string | undefined,
  ): Response {
    if (error instanceof UnknownDimensionError) {
      return failure('UNKNOWN_DIMENSION', error.message, { operation, requestId });
    }
    if (error instanceof UnknownDimensionValueError) {
      return failure('UNKNOWN_DIMENSION_VALUE', error.message, { operation, requestId });
    }
    if (error instanceof DuplicateSpanError) {
      return failure('DUPLICATE_SPAN', error.message, { operation, requestId });
    }
    if (error instanceof SpanNotFoundError) {
      return failure('NOT_FOUND', error.message, { operation, requestId });
    }
    if (error instanceof IndexFailureError) {
      return failure('INDEX_FAILURE', error.message, { operation, requestId });
    }
    throw error;
  }
}
