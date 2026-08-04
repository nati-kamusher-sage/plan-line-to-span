/**
 * The `inject-index-failure` test-only capability (DT-9 section 3.1,
 * DEC-62, DEC-63): `INDEX_FAILURE` cannot be provoked by any valid request,
 * because no production path ever throws `IndexFailureError` -- the index
 * has no failure mode a caller can reach. `AC-INIT-09` requires it to be
 * reachable anyway, so the fault must be injected at the port.
 *
 * `FaultInjectingIndexPort` wraps a real `IndexPort` and throws
 * `IndexFailureError` on the nominated operation's call, while delegating
 * every other call -- and every earlier call to the nominated operation
 * itself -- unchanged. `IndexAdapter` and `RTree` remain entirely unaware
 * this class exists (DT-9: "a test-only adapter ... without any production
 * code aware of testing").
 *
 * `failAfter` (default 0) lets a test establish prior state through the
 * *same* wrapped port before the fault fires: AC-INIT-09 requires a span
 * to already exist and remain queryable after a *later* create fails, so the
 * fault cannot simply fire on every call to the nominated operation --
 * nothing could ever have been created to fail alongside.
 */

import type { CanonicalSpan } from '../../src/model/span.ts';
import { IndexFailureError, type IndexPort } from '../../src/store/index-adapter.ts';

export type InjectableOperation = 'insert' | 'remove' | 'findExact' | 'searchMatching' | 'all';

export class FaultInjectingIndexPort implements IndexPort {
  private readonly real: IndexPort;
  private readonly failOn: InjectableOperation;
  private readonly failAfter: number;
  private callCount = 0;

  constructor(real: IndexPort, failOn: InjectableOperation, failAfter = 0) {
    this.real = real;
    this.failOn = failOn;
    this.failAfter = failAfter;
  }

  private failIfNominated(operation: InjectableOperation): void {
    if (operation !== this.failOn) return;
    if (this.callCount++ < this.failAfter) return;
    throw new IndexFailureError(`injected failure: ${operation}`);
  }

  get size(): number {
    return this.real.size;
  }

  insert(span: CanonicalSpan): void {
    this.failIfNominated('insert');
    this.real.insert(span);
  }

  remove(span: CanonicalSpan): boolean {
    this.failIfNominated('remove');
    return this.real.remove(span);
  }

  findExact(span: CanonicalSpan): CanonicalSpan | undefined {
    this.failIfNominated('findExact');
    return this.real.findExact(span);
  }

  searchMatching(planLine: Readonly<Record<string, string>>): CanonicalSpan[] {
    this.failIfNominated('searchMatching');
    return this.real.searchMatching(planLine);
  }

  all(): CanonicalSpan[] {
    this.failIfNominated('all');
    return this.real.all();
  }
}
