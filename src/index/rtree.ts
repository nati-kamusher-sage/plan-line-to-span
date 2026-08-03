/**
 * N-dimensional R*-tree.
 *
 * Derived from RBush (https://github.com/mourner/rbush) by Vladimir Agafonkin,
 * MIT licensed, and generalized from two fixed axes to an arbitrary axis count
 * decided at construction. See docs/design/dt-2a-index-library-evaluation.md
 * for why no existing library could be adapted, and NOTICE for attribution.
 *
 * The R*-tree algorithms — choose-subtree by least enlargement, split-axis by
 * minimum total margin, split-index by minimum overlap, and bounding-box
 * condensing on removal — follow the reference. What changed is that every
 * geometric quantity is computed across `axisCount` axes rather than two, and
 * the split heuristic chooses among n axes rather than between x and y.
 *
 * Axis count may be zero (DT-3). In that case the tree holds at most one entry,
 * because the only expressible span is the empty one, so splitting is
 * unreachable — asserted rather than assumed (DEC-17).
 *
 * The tree is generic in its payload type. It never inspects a payload: refs
 * are opaque, which is what keeps geometry out of benefit identity (DEC-31).
 */

import {
  area, margin, enlargedArea, intersectionArea, contains, intersects,
  extend, emptyBox, cloneBox,
  type Box, type MutableBox, type Point,
} from './box.ts';

const DEFAULT_MAX_ENTRIES = 9;

/** A leaf entry: a box and the opaque payload it indexes. */
interface Leaf<T> {
  readonly box: MutableBox;
  readonly ref: T;
}

/** An internal node, or a leaf node holding entries. */
interface Node<T> {
  box: MutableBox;
  height: number;
  leaf: boolean;
  /** Leaf nodes hold entries; internal nodes hold child nodes. */
  children: (Node<T> | Leaf<T>)[];
}

/** Both node kinds expose a box, which is all the geometry code needs. */
type Boxed = { readonly box: MutableBox };

function createNode<T>(children: (Node<T> | Leaf<T>)[], axisCount: number): Node<T> {
  return { children, height: 1, leaf: true, box: emptyBox(axisCount) };
}

/** Bounding box of a node's children in `[start, end)`. */
function distBox<T>(node: Node<T>, start: number, end: number, axisCount: number): MutableBox {
  const box = emptyBox(axisCount);
  for (let i = start; i < end; i++) extend(box, (node.children[i] as Boxed).box);
  return box;
}

function calcBox<T>(node: Node<T>, axisCount: number): void {
  node.box = distBox(node, 0, node.children.length, axisCount);
}

export interface RTreeOptions {
  /** Node capacity. Defaults to 9, the reference's value. Minimum 4. */
  maxEntries?: number;
}

export class RTree<T> {
  readonly axisCount: number;
  private readonly _maxEntries: number;
  private readonly _minEntries: number;
  private data!: Node<T>;
  private _size = 0;

  /**
   * @param axisCount fixed for the tree's lifetime; zero is valid
   */
  constructor(axisCount: number, { maxEntries = DEFAULT_MAX_ENTRIES }: RTreeOptions = {}) {
    if (!Number.isInteger(axisCount) || axisCount < 0) {
      throw new TypeError('axisCount must be a non-negative integer');
    }
    this.axisCount = axisCount;
    // The reference's default of 9 is retained; minimum fill of 40% is the
    // R*-tree paper's recommendation and the reference's choice.
    this._maxEntries = Math.max(4, maxEntries);
    this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));
    this.clear();
  }

  clear(): this {
    this.data = createNode<T>([], this.axisCount);
    this._size = 0;
    return this;
  }

  get size(): number {
    return this._size;
  }

  /** Insert a leaf entry. The payload is opaque and never inspected. */
  insert(box: Box, ref: T): this {
    if (box.length !== this.axisCount) {
      throw new TypeError(`box has ${box.length} axes, tree has ${this.axisCount}`);
    }
    this._insert({ box: cloneBox(box), ref }, this.data.height - 1);
    this._size++;
    return this;
  }

  /**
   * Remove the first leaf whose `ref` satisfies `predicate`.
   *
   * The reference narrows the descent using the entry's bounding box. Here the
   * caller identifies the entry by predicate rather than by box, so the search
   * is an ordinary depth-first walk. `BenefitStore` removes by canonical span
   * key (DEC-24, DEC-31), and identity deliberately never depends on geometry.
   *
   * @returns whether an entry was removed
   */
  remove(predicate: (ref: T) => boolean): boolean {
    const path: Node<T>[] = [];

    const descend = (node: Node<T>): boolean => {
      path.push(node);
      if (node.leaf) {
        const idx = node.children.findIndex(c => predicate((c as Leaf<T>).ref));
        if (idx !== -1) {
          node.children.splice(idx, 1);
          return true;
        }
      } else {
        for (const child of node.children) {
          if (descend(child as Node<T>)) return true;
        }
      }
      path.pop();
      return false;
    };

    if (!descend(this.data)) return false;
    // Decrement before condensing: when the root empties, `_condense` calls
    // `clear()`, which resets the size to zero. Decrementing afterwards would
    // drive it to -1.
    this._size--;
    this._condense(path);
    return true;
  }

  /** Every leaf whose box contains `point`. */
  search(point: Point): T[] {
    return this._search(point, contains);
  }

  /** Every leaf whose box intersects `box`. */
  searchIntersecting(box: Box): T[] {
    return this._search(box, intersects);
  }

  private _search(query: Box, test: (candidate: Box, query: Box) => boolean): T[] {
    const result: T[] = [];
    if (this._size === 0) return result;
    if (!test(this.data.box, query)) return result;

    const stack: Node<T>[] = [this.data];
    while (stack.length) {
      const node = stack.pop()!;
      for (const child of node.children) {
        if (!test((child as Boxed).box, query)) continue;
        if (node.leaf) result.push((child as Leaf<T>).ref);
        else stack.push(child as Node<T>);
      }
    }
    return result;
  }

  /** Every stored ref, order unspecified. */
  all(): T[] {
    const result: T[] = [];
    const stack: Node<T>[] = [this.data];
    while (stack.length) {
      const node = stack.pop()!;
      for (const child of node.children) {
        if (node.leaf) result.push((child as Leaf<T>).ref);
        else stack.push(child as Node<T>);
      }
    }
    return result;
  }

  // ---- insertion ----

  private _insert(item: Leaf<T>, level: number): void {
    const insertPath: Node<T>[] = [];
    const node = this._chooseSubtree(item.box, this.data, level, insertPath);

    node.children.push(item);
    extend(node.box, item.box);

    let l = level;
    while (l >= 0) {
      if (insertPath[l]!.children.length > this._maxEntries) {
        this._split(insertPath, l);
        l--;
      } else break;
    }

    for (let i = level; i >= 0; i--) extend(insertPath[i]!.box, item.box);
  }

  private _chooseSubtree(box: Box, node: Node<T>, level: number, path: Node<T>[]): Node<T> {
    for (;;) {
      path.push(node);
      if (node.leaf || path.length - 1 === level) break;

      let minArea = Infinity;
      let minEnlargement = Infinity;
      let target: Node<T> | undefined;

      for (const child of node.children as Node<T>[]) {
        const childArea = area(child.box);
        const enlargement = enlargedArea(box, child.box) - childArea;
        if (enlargement < minEnlargement) {
          minEnlargement = enlargement;
          minArea = childArea < minArea ? childArea : minArea;
          target = child;
        } else if (enlargement === minEnlargement && childArea < minArea) {
          minArea = childArea;
          target = child;
        }
      }
      node = target ?? (node.children[0] as Node<T>);
    }
    return node;
  }

  private _split(insertPath: Node<T>[], level: number): void {
    const node = insertPath[level]!;
    const M = node.children.length;
    const m = this._minEntries;

    // DEC-17: with zero axes the only expressible span is the empty one, so at
    // most one entry can exist and this path is unreachable. Fail loudly rather
    // than letting the split heuristic read an axis that does not exist.
    if (this.axisCount === 0) {
      throw new Error(
        'invariant violated: a zero-dimensional index cannot hold enough entries to split; ' +
        'at most one benefit is expressible when no dimensions are defined');
    }

    this._chooseSplitAxis(node, m, M);
    const splitIndex = this._chooseSplitIndex(node, m, M);

    const newNode = createNode<T>(
      node.children.splice(splitIndex, node.children.length - splitIndex), this.axisCount);
    newNode.height = node.height;
    newNode.leaf = node.leaf;

    calcBox(node, this.axisCount);
    calcBox(newNode, this.axisCount);

    if (level) insertPath[level - 1]!.children.push(newNode);
    else this._splitRoot(node, newNode);
  }

  private _splitRoot(node: Node<T>, newNode: Node<T>): void {
    this.data = createNode<T>([node, newNode], this.axisCount);
    this.data.height = node.height + 1;
    this.data.leaf = false;
    calcBox(this.data, this.axisCount);
  }

  /**
   * Sort children by the axis giving the least total margin across all
   * candidate distributions. The reference compares exactly two axes; this
   * compares all of them.
   */
  private _chooseSplitAxis(node: Node<T>, m: number, M: number): void {
    let bestAxis = 0;
    let bestMargin = Infinity;
    for (let d = 0; d < this.axisCount; d++) {
      const total = this._allDistMargin(node, m, M, d);
      if (total < bestMargin) {
        bestMargin = total;
        bestAxis = d;
      }
    }
    // Re-sort on the winning axis; `_allDistMargin` left the children sorted by
    // the last axis tried, which is not necessarily the best one.
    this._sortByAxis(node, bestAxis);
  }

  private _sortByAxis(node: Node<T>, axis: number): void {
    node.children.sort((a, b) => (a as Boxed).box[axis]![0] - (b as Boxed).box[axis]![0]);
  }

  private _allDistMargin(node: Node<T>, m: number, M: number, axis: number): number {
    this._sortByAxis(node, axis);

    const leftBox = distBox(node, 0, m, this.axisCount);
    const rightBox = distBox(node, M - m, M, this.axisCount);
    let total = margin(leftBox) + margin(rightBox);

    for (let i = m; i < M - m; i++) {
      extend(leftBox, (node.children[i] as Boxed).box);
      total += margin(leftBox);
    }
    for (let i = M - m - 1; i >= m; i--) {
      extend(rightBox, (node.children[i] as Boxed).box);
      total += margin(rightBox);
    }
    return total;
  }

  private _chooseSplitIndex(node: Node<T>, m: number, M: number): number {
    let index: number | undefined;
    let minOverlap = Infinity;
    let minArea = Infinity;

    for (let i = m; i <= M - m; i++) {
      const box1 = distBox(node, 0, i, this.axisCount);
      const box2 = distBox(node, i, M, this.axisCount);
      const overlap = intersectionArea(box1, box2);
      const totalArea = area(box1) + area(box2);

      if (overlap < minOverlap) {
        minOverlap = overlap;
        index = i;
        minArea = totalArea < minArea ? totalArea : minArea;
      } else if (overlap === minOverlap && totalArea < minArea) {
        minArea = totalArea;
        index = i;
      }
    }
    return index ?? M - m;
  }

  // ---- removal ----

  private _condense(path: Node<T>[]): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i]!;
      if (node.children.length === 0) {
        if (i > 0) {
          const siblings = path[i - 1]!.children;
          siblings.splice(siblings.indexOf(node), 1);
        } else {
          this.clear();
          return;
        }
      } else {
        calcBox(node, this.axisCount);
      }
    }
  }
}
