/**
 * N-dimensional box geometry.
 *
 * A box is an array of `[min, max]` intervals, one per axis. Its length is the
 * axis count, which is fixed by the dimension model and MAY BE ZERO
 * (DT-3 section 5.1, requirements 1 and 2).
 *
 * The zero-axis conventions are deliberate, not accidental (DEC-18):
 *   - area over no axes is the empty product, 1
 *   - margin over no axes is the empty sum, 0
 *   - containment over no axes is vacuously true (DEC-16)
 *
 * That last one is load-bearing: it is what makes the global empty span match
 * an empty plan line without a special case.
 */

/** A closed interval on one axis. */
export type Interval = readonly [number, number];

/** An immutable box: one interval per axis. Length zero is valid. */
export type Box = readonly Interval[];

/** A box under construction, whose intervals are still being widened. */
export type MutableBox = [number, number][];

/** A query point, expressed as a degenerate box so one containment test serves both. */
export type Point = Box;

/** A box covering the whole space on every axis. The global span's geometry. */
export function fullBox(axisCount: number): MutableBox {
  return Array.from({ length: axisCount }, () => [-Infinity, Infinity]);
}

/** A box that contains nothing, used as the identity for `extend`. */
export function emptyBox(axisCount: number): MutableBox {
  return Array.from({ length: axisCount }, () => [Infinity, -Infinity]);
}

export function cloneBox(box: Box): MutableBox {
  return box.map(([lo, hi]) => [lo, hi] as [number, number]);
}

/** Grow `target` in place to cover `other`. Both must have the same axis count. */
export function extend(target: MutableBox, other: Box): MutableBox {
  for (let d = 0; d < target.length; d++) {
    const o = other[d]!;
    const t = target[d]!;
    if (o[0] < t[0]) t[0] = o[0];
    if (o[1] > t[1]) t[1] = o[1];
  }
  return target;
}

/** Empty product over zero axes is 1 (DEC-18). */
export function area(box: Box): number {
  let a = 1;
  for (const [lo, hi] of box) a *= hi - lo;
  return a;
}

/** Empty sum over zero axes is 0 (DEC-18). */
export function margin(box: Box): number {
  let m = 0;
  for (const [lo, hi] of box) m += hi - lo;
  return m;
}

/** Area of the box that would result from extending `a` to cover `b`. */
export function enlargedArea(a: Box, b: Box): number {
  let product = 1;
  for (let d = 0; d < a.length; d++) {
    const x = a[d]!;
    const y = b[d]!;
    product *= Math.max(x[1], y[1]) - Math.min(x[0], y[0]);
  }
  return product;
}

/** Area of the overlap between `a` and `b`; zero when they are disjoint. */
export function intersectionArea(a: Box, b: Box): number {
  let product = 1;
  for (let d = 0; d < a.length; d++) {
    const x = a[d]!;
    const y = b[d]!;
    const lo = Math.max(x[0], y[0]);
    const hi = Math.min(x[1], y[1]);
    if (hi < lo) return 0;
    product *= hi - lo;
  }
  return product;
}

/**
 * True when `outer` fully contains `inner`.
 * Vacuously true over zero axes (DEC-16).
 */
export function contains(outer: Box, inner: Box): boolean {
  for (let d = 0; d < outer.length; d++) {
    const o = outer[d]!;
    const i = inner[d]!;
    if (o[0] > i[0] || i[1] > o[1]) return false;
  }
  return true;
}

/** True when `a` and `b` share any point. Vacuously true over zero axes. */
export function intersects(a: Box, b: Box): boolean {
  for (let d = 0; d < a.length; d++) {
    const x = a[d]!;
    const y = b[d]!;
    if (y[0] > x[1] || y[1] < x[0]) return false;
  }
  return true;
}
