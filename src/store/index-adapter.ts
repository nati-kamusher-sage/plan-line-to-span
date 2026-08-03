/**
 * IndexAdapter: the domain-facing port over the spatial index (DEC-31).
 *
 * Expressed in spans and plan lines, never in boxes or points. This keeps
 * geometry out of the domain core: `BenefitStore` calls `insert`, `remove`,
 * and `search` without knowing an R*-tree is underneath, which is what lets
 * DT-2a's index choice change without disturbing the component structure,
 * and is the seam T11's `inject-index-failure` capability uses without
 * `RTree` itself being aware of testing.
 */

import type { RTree } from '../index/rtree.ts';
import type { DimensionModel } from '../model/dimension-model.ts';
import type { CanonicalSpan } from '../model/span.ts';

/** One indexed entry: identity plus the opaque formula it carries. */
export interface IndexedBenefit {
  readonly span: CanonicalSpan;
  readonly formula: unknown;
}

/**
 * Thrown when the index cannot safely complete an operation (IC 6,
 * `INDEX_FAILURE`). No production path throws this; it exists so a test-only
 * index substitute can simulate the failure at this port, per DT-9's
 * `inject-index-failure` capability.
 */
export class IndexFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexFailureError';
  }
}

/**
 * The port `BenefitStore` actually depends on (DEC-31, DEC-62).
 *
 * `IndexAdapter`'s private fields make the class itself nominal: TypeScript
 * requires an exact subclass, not merely a structurally identical class, to
 * satisfy a type with private members. Extracting this interface is what
 * lets T11's `FaultInjectingIndexPort` (a plain class with no relation to
 * `IndexAdapter`) substitute at this port without `BenefitStore` or
 * `IndexAdapter` needing to know testing exists (DT-9 section 3.1: "the
 * fault is injected at the port rather than inside the algorithm").
 */
export interface IndexPort {
  readonly size: number;
  insert(span: CanonicalSpan, formula: unknown): void;
  remove(span: CanonicalSpan): boolean;
  findExact(span: CanonicalSpan): IndexedBenefit | undefined;
  searchMatching(planLine: Readonly<Record<string, string>>): IndexedBenefit[];
  all(): IndexedBenefit[];
}

export class IndexAdapter implements IndexPort {
  private readonly tree: RTree<IndexedBenefit>;
  private readonly model: DimensionModel;

  constructor(tree: RTree<IndexedBenefit>, model: DimensionModel) {
    this.tree = tree;
    this.model = model;
  }

  get size(): number {
    return this.tree.size;
  }

  insert(span: CanonicalSpan, formula: unknown): void {
    this.tree.insert(this.model.spanToBox(span.dimensions), { span, formula });
  }

  /** Remove the entry whose span equals `span`. Returns whether one was removed. */
  remove(span: CanonicalSpan): boolean {
    return this.tree.remove(entry => entry.span.equals(span));
  }

  /**
   * The entry whose span equals `span`, or `undefined` if none exists.
   *
   * `tree.search` returns every stored box that *contains* the query box, not
   * only boxes equal to it — an ancestor's wider interval always contains a
   * descendant's narrower one, so searching for a child's own box can return
   * the parent's entry too. That is precisely why DEC-24 requires identity to
   * rest on the canonical key rather than on geometry: this method uses the
   * geometry only to narrow the candidates, then decides identity by
   * `CanonicalSpan.equals`, which hierarchy cannot broaden (OC 9.1).
   */
  findExact(span: CanonicalSpan): IndexedBenefit | undefined {
    const box = this.model.spanToBox(span.dimensions);
    return this.tree.search(box).find(entry => entry.span.equals(span));
  }

  /** Every entry whose span applies to `planLine`, per OC 9.2. */
  searchMatching(planLine: Readonly<Record<string, string>>): IndexedBenefit[] {
    const point = this.model.planLineToPoint(planLine);
    return this.tree.search(point);
  }

  all(): IndexedBenefit[] {
    return this.tree.all();
  }
}
