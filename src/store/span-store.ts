/** Owns canonical span identity, lifecycle, and stored-state outcomes. */

import type { IndexPort } from './index-adapter.ts';
import type { CanonicalSpan } from '../model/span.ts';

export class DuplicateSpanError extends Error {
  constructor() {
    super('a span with this identity already exists');
    this.name = 'DuplicateSpanError';
  }
}

export class SpanNotFoundError extends Error {
  constructor() {
    super('no stored span has this identity');
    this.name = 'SpanNotFoundError';
  }
}

export class SpanStore {
  private readonly index: IndexPort;

  constructor(index: IndexPort) {
    this.index = index;
  }

  get count(): number {
    return this.index.size;
  }

  create(span: CanonicalSpan): CanonicalSpan {
    if (this.index.findExact(span) !== undefined) throw new DuplicateSpanError();
    this.index.insert(span);
    return span;
  }

  exact(span: CanonicalSpan): CanonicalSpan {
    const found = this.index.findExact(span);
    if (found === undefined) throw new SpanNotFoundError();
    return found;
  }

  /** Replace `span` with `replacementSpan` after both state checks. */
  update(span: CanonicalSpan, replacementSpan: CanonicalSpan): CanonicalSpan {
    const source = this.index.findExact(span);
    if (source === undefined) throw new SpanNotFoundError();

    const replacement = this.index.findExact(replacementSpan);
    if (replacement !== undefined && !replacement.equals(source)) {
      throw new DuplicateSpanError();
    }

    this.index.remove(source);
    this.index.insert(replacementSpan);
    return replacementSpan;
  }

  delete(span: CanonicalSpan): void {
    if (!this.index.remove(span)) throw new SpanNotFoundError();
  }

  match(planLine: Readonly<Record<string, string>>): CanonicalSpan[] {
    return this.index.searchMatching(planLine);
  }
}
