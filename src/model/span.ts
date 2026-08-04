/**
 * Canonical span identity.
 *
 * A span is the complete stored object and its unique identifier. OC 9.1 and
 * the AC-SPAN-04 case require that member
 * order not affect identity. DEC-24 requires that identity never depend on
 * geometry, so that a later change to the interval-labelling scheme cannot
 * silently broaden or narrow exact lookup — see DT-2 section 3.
 *
 * A `CanonicalSpan` is therefore a value object (DT-1's value-object
 * principle, DT-4's pattern catalogue): immutable, produced only by
 * `resolveSpan`, and compared by its key rather than by structural traversal
 * of the original object.
 */

/** Thrown when a span or plan line names a dimension the loaded model lacks. */
export class UnknownDimensionError extends Error {
  readonly dimensionId: string;

  constructor(dimensionId: string) {
    super(`unknown dimension: ${dimensionId}`);
    this.name = 'UnknownDimensionError';
    this.dimensionId = dimensionId;
  }
}

/** Thrown when a span or plan line uses a value key the named dimension lacks. */
export class UnknownDimensionValueError extends Error {
  readonly dimensionId: string;
  readonly key: string;

  constructor(dimensionId: string, key: string) {
    super(`unknown value for ${dimensionId}: ${key}`);
    this.name = 'UnknownDimensionValueError';
    this.dimensionId = dimensionId;
    this.key = key;
  }
}

/** A resolver capable of checking dimension identifiers and values. */
export interface DimensionChecker {
  hasDimension(id: string): boolean;
  hasValue(dimensionId: string, key: string): boolean;
}

/**
 * A validated span, identified by a key that does not depend on member order
 * or on the dimension model's geometry.
 *
 * The `dimensions` map is exposed for callers that need the original
 * dimension-value pairs (for example, to hand to `DimensionModel.spanToBox`);
 * `key` is the only thing identity comparisons should use.
 */
export class CanonicalSpan {
  readonly dimensions: Readonly<Record<string, string>>;
  readonly key: string;

  private constructor(dimensions: Readonly<Record<string, string>>, key: string) {
    this.dimensions = dimensions;
    this.key = key;
  }

  equals(other: CanonicalSpan): boolean {
    return this.key === other.key;
  }

  /** @internal exposed for `resolveSpan` only. */
  static of(dimensions: Readonly<Record<string, string>>): CanonicalSpan {
    return new CanonicalSpan(dimensions, canonicalKey(dimensions));
  }
}

/**
 * The canonical key: dimension-value pairs sorted by dimension id, so that
 * `{location: 4, department: rnd}` and `{department: rnd, location: 4}`
 * produce the same key (AC-SPAN-04).
 */
function canonicalKey(dimensions: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(dimensions).sort();
  return JSON.stringify(sorted.map(id => [id, dimensions[id]]));
}

/**
 * Validates a span or plan line's dimension-value pairs against the loaded
 * model, throwing `UnknownDimensionError` or `UnknownDimensionValueError` on
 * the first problem found. On success, returns the canonical span.
 *
 * Used for both spans and plan lines: a plan line is a dimension-value map in
 * exactly the same shape, and OC 9.2's presence rule is enforced later, by
 * `DimensionModel.planLineToPoint`, not here.
 */
export function resolveSpan(
  dimensions: Readonly<Record<string, string>>,
  model: DimensionChecker,
): CanonicalSpan {
  for (const [dimensionId, key] of Object.entries(dimensions)) {
    if (!model.hasDimension(dimensionId)) throw new UnknownDimensionError(dimensionId);
    if (!model.hasValue(dimensionId, key)) throw new UnknownDimensionValueError(dimensionId, key);
  }
  return CanonicalSpan.of(dimensions);
}
