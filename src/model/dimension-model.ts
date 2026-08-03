/**
 * Dimension model: validates a dimension definition and builds the interval
 * labelling that DT-2 uses to turn hierarchy into geometry.
 *
 * A depth-first traversal assigns each value an `[enter, leave]` pair so that
 * a value's interval strictly contains every descendant's (DEC-20). Because a
 * value with no `parentKey` is a root, and nothing in the baseline limits how
 * many roots a dimension may have, a dimension may be a forest rather than a
 * single tree (DEC-22). Non-hierarchical dimensions are the degenerate case:
 * every value is its own root, so containment reduces to equality (DEC-21).
 *
 * The model is immutable once built (DT-1's immutability principle), which is
 * what makes DT-5's candidate-then-swap reinitialization a single reference
 * assignment.
 */

import type { Box, MutableBox, Interval } from '../index/box.ts';
import { fullBox } from '../index/box.ts';

/** One dimension value as it appears in the initialize payload. */
export interface DimensionValueDefinition {
  readonly key: string;
  readonly name: string;
  readonly parentKey?: string;
}

/** One dimension as it appears in the initialize payload. */
export interface DimensionDefinition {
  readonly id: string;
  readonly name: string;
  readonly values: readonly DimensionValueDefinition[];
}

/** The full initialize payload's dimension section. */
export interface DimensionFile {
  readonly format: string;
  readonly dimensions: readonly DimensionDefinition[];
}

export const DIMENSION_FILE_FORMAT = 'plan-line-to-span-dimensions/v1';

/** The nine-code contract vocabulary is not reused here; this is the one
 * validation failure a dimension file can produce (IC 6). */
export class InvalidDimensionDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDimensionDefinitionError';
  }
}

/** One labelled dimension: its declared values and their intervals. */
interface LabelledDimension {
  readonly id: string;
  /** Value key -> interval. */
  readonly intervals: ReadonlyMap<string, Interval>;
  readonly valueCount: number;
}

/**
 * A validated, immutable dimension model.
 *
 * Axis order is the dimension order in the definition (DEC-19). Axis count may
 * be zero, which DT-3 requires and which `RTree` already supports.
 */
export class DimensionModel {
  private readonly dims: readonly LabelledDimension[];
  private readonly axisOf: ReadonlyMap<string, number>;

  private constructor(dims: readonly LabelledDimension[]) {
    this.dims = dims;
    this.axisOf = new Map(dims.map((d, i) => [d.id, i]));
  }

  get axisCount(): number {
    return this.dims.length;
  }

  get dimensionCount(): number {
    return this.dims.length;
  }

  /** Total dimension values across all dimensions (Obs 4: `dimensionValueCount`). */
  get dimensionValueCount(): number {
    return this.dims.reduce((sum, d) => sum + d.valueCount, 0);
  }

  hasDimension(id: string): boolean {
    return this.axisOf.has(id);
  }

  hasValue(dimensionId: string, key: string): boolean {
    const dim = this.dims[this.axisOf.get(dimensionId)!];
    return dim !== undefined && dim.intervals.has(key);
  }

  /**
   * A span's box: the value's own interval on each constrained axis, the
   * whole axis where the span omits a dimension (DEC-23's counterpart for
   * spans, and DT-3's global-span wildcard).
   *
   * Callers must validate dimension identifiers and values before calling
   * this; it throws on either, since `SpanResolver` owns those checks and
   * should never let an invalid span reach the model.
   */
  spanToBox(span: Readonly<Record<string, string>>): Box {
    const box: MutableBox = fullBox(this.axisCount);
    for (const [dimId, key] of Object.entries(span)) {
      const axis = this.axisOf.get(dimId);
      if (axis === undefined) throw new Error(`unknown dimension: ${dimId}`);
      const dim = this.dims[axis]!;
      const interval = dim.intervals.get(key);
      if (!interval) throw new Error(`unknown value for ${dimId}: ${key}`);
      box[axis] = [interval[0], interval[1]];
    }
    return box;
  }

  /**
   * A plan line's query point. A dimension the plan line omits gets the
   * marker interval `[Infinity, Infinity]` (DEC-23).
   *
   * The marker must fail `contains` against any real, finite span interval
   * — `lo > Infinity` is always false, but `Infinity > hi` is always true for
   * finite `hi`, so `contains` correctly rejects it. It must simultaneously
   * *pass* against the full box `[-Infinity, Infinity]` that an omitted span
   * dimension produces, since a span that does not constrain a dimension
   * imposes no requirement even when the plan line lacks that dimension too;
   * `Infinity > Infinity` is false, so the full box does contain the marker.
   *
   * `emptyBox`'s identity, `[Infinity, -Infinity]`, does NOT work here: its
   * low bound already exceeds its high bound, which makes the `contains`
   * comparison degenerate and incorrectly return true against a narrow span
   * interval too. That was this module's first version, and the property
   * test (`dimension-model-vs-ancestor-walk.test.ts`) caught it immediately.
   */
  planLineToPoint(planLine: Readonly<Record<string, string>>): Box {
    const point: MutableBox = this.dims.map(() => [Infinity, Infinity]);
    for (const [dimId, key] of Object.entries(planLine)) {
      const axis = this.axisOf.get(dimId);
      if (axis === undefined) throw new Error(`unknown dimension: ${dimId}`);
      const dim = this.dims[axis]!;
      const interval = dim.intervals.get(key);
      if (!interval) throw new Error(`unknown value for ${dimId}: ${key}`);
      point[axis] = [interval[0], interval[1]];
    }
    return point;
  }

  /** @internal exposed for `DimensionModelBuilder` only. */
  static fromLabelled(dims: readonly LabelledDimension[]): DimensionModel {
    return new DimensionModel(dims);
  }
}

/**
 * Validates a dimension definition and builds the candidate model.
 *
 * Rejects (IC 6, `INVALID_DIMENSION_DEFINITION`):
 *   - an unsupported or missing format identifier
 *   - duplicate dimension identifiers
 *   - duplicate value keys within a dimension
 *   - a parentKey that does not identify a value in the same dimension
 *   - cycles in a value hierarchy
 *
 * Builds nothing on the live model; the caller (T5's dispatcher) is
 * responsible for the atomic swap DT-5 describes.
 */
export function buildDimensionModel(file: DimensionFile): DimensionModel {
  if (file.format !== DIMENSION_FILE_FORMAT) {
    throw new InvalidDimensionDefinitionError(
      `unsupported format: ${JSON.stringify(file.format)}`);
  }

  const seenDimensionIds = new Set<string>();
  const labelled: LabelledDimension[] = [];

  for (const dim of file.dimensions) {
    if (seenDimensionIds.has(dim.id)) {
      throw new InvalidDimensionDefinitionError(`duplicate dimension id: ${dim.id}`);
    }
    seenDimensionIds.add(dim.id);
    labelled.push(labelDimension(dim));
  }

  return DimensionModel.fromLabelled(labelled);
}

function labelDimension(dim: DimensionDefinition): LabelledDimension {
  const parentOf = new Map<string, string | undefined>();
  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];

  for (const v of dim.values) {
    if (parentOf.has(v.key)) {
      throw new InvalidDimensionDefinitionError(
        `duplicate value key in dimension ${dim.id}: ${v.key}`);
    }
    parentOf.set(v.key, v.parentKey);
  }

  for (const v of dim.values) {
    if (v.parentKey === undefined) {
      roots.push(v.key);
      continue;
    }
    if (!parentOf.has(v.parentKey)) {
      throw new InvalidDimensionDefinitionError(
        `dimension ${dim.id}: value ${v.key} has parentKey ${v.parentKey}, ` +
        `which does not identify a value in the same dimension`);
    }
    if (!childrenOf.has(v.parentKey)) childrenOf.set(v.parentKey, []);
    childrenOf.get(v.parentKey)!.push(v.key);
  }

  detectCycles(dim.id, parentOf);

  // Depth-first traversal over a shared counter (DEC-20). Sweeping each root
  // in turn (DEC-22) keeps root subtrees disjoint without a synthetic root:
  // a root's whole subtree is numbered before the next root begins, so no
  // interval from one root's subtree can contain one from another's.
  const intervals = new Map<string, Interval>();
  let counter = 0;
  const visit = (key: string): void => {
    const enter = counter++;
    for (const child of childrenOf.get(key) ?? []) visit(child);
    const leave = counter++;
    intervals.set(key, [enter, leave]);
  };
  for (const root of roots) visit(root);

  return { id: dim.id, intervals, valueCount: dim.values.length };
}

/**
 * Detects a cycle by walking each value's parent chain. A well-formed forest
 * has every chain terminate at a root within `parentOf.size` steps; a cycle
 * means some chain never terminates, so a step budget catches it without
 * needing cycle-specific bookkeeping.
 */
function detectCycles(dimensionId: string, parentOf: ReadonlyMap<string, string | undefined>): void {
  for (const start of parentOf.keys()) {
    let current: string | undefined = start;
    let steps = 0;
    const limit = parentOf.size + 1;
    while (current !== undefined) {
      current = parentOf.get(current);
      if (++steps > limit) {
        throw new InvalidDimensionDefinitionError(
          `dimension ${dimensionId}: hierarchy cycle involving ${start}`);
      }
    }
  }
}
