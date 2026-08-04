/** Owns canonical span identity, lifecycle, and stored-state outcomes. */

import type { IndexPort } from './index-adapter.ts';
import type { CanonicalSpan } from '../model/span.ts';

export type StoredStateCode = 'DUPLICATE_SPAN' | 'NOT_FOUND';

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: StoredStateCode; readonly message: string };

const duplicate = (): StoreResult<never> => ({
  ok: false,
  code: 'DUPLICATE_SPAN',
  message: 'a span with this identity already exists',
});

const notFound = (): StoreResult<never> => ({
  ok: false,
  code: 'NOT_FOUND',
  message: 'no stored span has this identity',
});

const found = <T>(value: T): StoreResult<T> => ({ ok: true, value });

export class SpanStore {
  private readonly index: IndexPort;

  constructor(index: IndexPort) {
    this.index = index;
  }

  get count(): number {
    return this.index.size;
  }

  create(span: CanonicalSpan): StoreResult<CanonicalSpan> {
    if (this.index.findExact(span) !== undefined) return duplicate();
    this.index.insert(span);
    return found(span);
  }

  exact(span: CanonicalSpan): StoreResult<CanonicalSpan> {
    const stored = this.index.findExact(span);
    return stored === undefined ? notFound() : found(stored);
  }

  /** Replace `span` with `replacementSpan` after both state checks. */
  update(span: CanonicalSpan, replacementSpan: CanonicalSpan): StoreResult<CanonicalSpan> {
    const source = this.index.findExact(span);
    if (source === undefined) return notFound();

    const replacement = this.index.findExact(replacementSpan);
    if (replacement !== undefined && !replacement.equals(source)) return duplicate();

    this.index.remove(source);
    this.index.insert(replacementSpan);
    return found(replacementSpan);
  }

  delete(span: CanonicalSpan): StoreResult<undefined> {
    return this.index.remove(span) ? found(undefined) : notFound();
  }

  match(planLine: Readonly<Record<string, string>>): CanonicalSpan[] {
    return this.index.searchMatching(planLine);
  }
}
