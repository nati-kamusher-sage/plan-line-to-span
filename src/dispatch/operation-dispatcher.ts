/** Synchronous single entry point for all contract operations (DEC-30). */

import { parseRequest, type ParsedRequest } from '../transport/request-parser.ts';
import { LifecycleState, type State } from './lifecycle-state.ts';
import { buildDimensionModel, type DimensionModel } from '../model/dimension-model.ts';
import { resolveSpan, type CanonicalSpan } from '../model/span.ts';
import { RTree } from '../index/rtree.ts';
import { IndexAdapter, type IndexPort } from '../store/index-adapter.ts';
import { SpanStore, type StoreResult } from '../store/span-store.ts';
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
    const parsed = parseRequest(raw);
    if (!parsed.ok) return failure('MALFORMED_REQUEST', parsed.message);
    const request = parsed.request;

    if (!this.lifecycle.canAccept(request.operation)) {
      return failure('INVALID_STATE',
        `operation ${request.operation} is not accepted in state ${this.lifecycle.state}`,
        { operation: request.operation, requestId: request.requestId, state: this.lifecycle.state });
    }

    if (request.operation === 'initialize') return this.handleInitialize(request);

    const store = this.store!;
    switch (request.operation) {
      case 'createSpan': return this.handleCreateSpan(request, store);
      case 'updateSpan': return this.handleUpdateSpan(request, store);
      case 'deleteSpan': return this.handleDeleteSpan(request, store);
      case 'querySpan': return this.handleQuerySpan(request, store);
      case 'queryPlanLine': return this.handleQueryPlanLine(request, store);
    }
  }

  private handleInitialize(
    request: Extract<ParsedRequest, { operation: 'initialize' }>,
  ): Response {
    const priorState = this.lifecycle.beginInitializing();
    const candidateModel = buildDimensionModel(request.payload);
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
    store: SpanStore,
  ): Response {
    const result = store.create(resolveSpan(request.payload.span));
    if (!result.ok) return this.storedStateFailure(result, 'createSpan', request.requestId);
    return success('createSpan', { span: result.value.dimensions }, request.requestId);
  }

  private handleUpdateSpan(
    request: Extract<ParsedRequest, { operation: 'updateSpan' }>,
    store: SpanStore,
  ): Response {
    const source = resolveSpan(request.payload.span);
    const replacement = resolveSpan(request.payload.replacementSpan);
    const result = store.update(source, replacement);
    if (!result.ok) return this.storedStateFailure(result, 'updateSpan', request.requestId);
    return success('updateSpan', { span: result.value.dimensions }, request.requestId);
  }

  private handleDeleteSpan(
    request: Extract<ParsedRequest, { operation: 'deleteSpan' }>,
    store: SpanStore,
  ): Response {
    const span = resolveSpan(request.payload.span);
    const result = store.delete(span);
    if (!result.ok) return this.storedStateFailure(result, 'deleteSpan', request.requestId);
    return success('deleteSpan', { deleted: true, span: span.dimensions }, request.requestId);
  }

  private handleQuerySpan(
    request: Extract<ParsedRequest, { operation: 'querySpan' }>,
    store: SpanStore,
  ): Response {
    const result = store.exact(resolveSpan(request.payload.span));
    if (!result.ok) return this.storedStateFailure(result, 'querySpan', request.requestId);
    return success('querySpan', { span: result.value.dimensions }, request.requestId);
  }

  private handleQueryPlanLine(
    request: Extract<ParsedRequest, { operation: 'queryPlanLine' }>,
    store: SpanStore,
  ): Response {
    const matches = store.match(request.payload.dimensions);
    return success('queryPlanLine', {
      matches: matches.map(span => span.dimensions),
    }, request.requestId);
  }

  private storedStateFailure(
    result: Extract<StoreResult<unknown>, { ok: false }>,
    operation: Response['operation'],
    requestId: string | undefined,
  ): Response {
    return failure(result.code, result.message, { operation, requestId });
  }
}
