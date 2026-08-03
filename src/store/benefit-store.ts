/**
 * BenefitStore: owns benefit identity and lifecycle (DT-4).
 *
 * Detects duplicates and absences by canonical span key; delegates geometry
 * to `IndexAdapter`. This is the only component that mutates (DT-4 section
 * 7): every other component in the create/update/delete path returns a
 * result, so there is exactly one place where state changes and exactly one
 * place to reason about a failed mutation leaving no partial change (OC
 * 14.3).
 */

import type { IndexPort, IndexedBenefit } from './index-adapter.ts';
import type { CanonicalSpan } from '../model/span.ts';

export class DuplicateSpanError extends Error {
  constructor() {
    super('a benefit already exists for this span');
    this.name = 'DuplicateSpanError';
  }
}

export class BenefitNotFoundError extends Error {
  constructor() {
    super('no benefit exists for this span');
    this.name = 'BenefitNotFoundError';
  }
}

export class BenefitStore {
  private readonly index: IndexPort;

  constructor(index: IndexPort) {
    this.index = index;
  }

  get count(): number {
    return this.index.size;
  }

  /** OC 6.6: at most one benefit per canonical span. */
  create(span: CanonicalSpan, formula: unknown): IndexedBenefit {
    if (this.index.findExact(span) !== undefined) throw new DuplicateSpanError();
    this.index.insert(span, formula);
    return { span, formula };
  }

  /** Exact lookup; hierarchy does not broaden it (OC 9.1). */
  exact(span: CanonicalSpan): IndexedBenefit {
    const found = this.index.findExact(span);
    if (found === undefined) throw new BenefitNotFoundError();
    return found;
  }

  /**
   * Complete formula replacement; the span cannot change (OC 11.3). Removes
   * and reinserts under the same span rather than mutating an existing entry
   * in place, since `IndexedBenefit` is treated as immutable everywhere else
   * (DT-1's immutability principle).
   */
  update(span: CanonicalSpan, formula: unknown): IndexedBenefit {
    if (this.index.findExact(span) === undefined) throw new BenefitNotFoundError();
    this.index.remove(span);
    this.index.insert(span, formula);
    return { span, formula };
  }

  delete(span: CanonicalSpan): void {
    if (!this.index.remove(span)) throw new BenefitNotFoundError();
  }

  /** Every benefit applying to `planLine`, per OC 9.2. Order is not significant. */
  match(planLine: Readonly<Record<string, string>>): IndexedBenefit[] {
    return this.index.searchMatching(planLine);
  }
}
