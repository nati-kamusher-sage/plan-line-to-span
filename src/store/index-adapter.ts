/** Domain-facing port over the spatial index (DEC-31). */

import type { RTree } from '../index/rtree.ts';
import type { DimensionModel } from '../model/dimension-model.ts';
import type { CanonicalSpan } from '../model/span.ts';

/** Test seam retained through E1; exception translation is removed in E2. */
export class IndexFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndexFailureError';
  }
}

export interface IndexPort {
  readonly size: number;
  insert(span: CanonicalSpan): void;
  remove(span: CanonicalSpan): boolean;
  findExact(span: CanonicalSpan): CanonicalSpan | undefined;
  searchMatching(planLine: Readonly<Record<string, string>>): CanonicalSpan[];
  all(): CanonicalSpan[];
}

export class IndexAdapter implements IndexPort {
  private readonly tree: RTree<CanonicalSpan>;
  private readonly model: DimensionModel;

  constructor(tree: RTree<CanonicalSpan>, model: DimensionModel) {
    this.tree = tree;
    this.model = model;
  }

  get size(): number {
    return this.tree.size;
  }

  insert(span: CanonicalSpan): void {
    this.tree.insert(this.model.spanToBox(span.dimensions), span);
  }

  remove(span: CanonicalSpan): boolean {
    return this.tree.remove(entry => entry.equals(span));
  }

  /** Geometry narrows candidates; canonical identity decides exactness. */
  findExact(span: CanonicalSpan): CanonicalSpan | undefined {
    const box = this.model.spanToBox(span.dimensions);
    return this.tree.search(box).find(entry => entry.equals(span));
  }

  searchMatching(planLine: Readonly<Record<string, string>>): CanonicalSpan[] {
    return this.tree.search(this.model.planLineToPoint(planLine));
  }

  all(): CanonicalSpan[] {
    return this.tree.all();
  }
}
