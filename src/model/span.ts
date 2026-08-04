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

/**
 * A canonical span, identified by a key that does not depend on member order
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
 * Canonicalizes a span without checking its domain meaning. ECP-1 makes the
 * caller responsible for supplying identifiers and values from the model.
 */
export function resolveSpan(
  dimensions: Readonly<Record<string, string>>,
): CanonicalSpan {
  return CanonicalSpan.of(dimensions);
}
