import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RTree } from '../../src/index/rtree.ts';
import { fullBox, type Box } from '../../src/index/box.ts';

const point = (...coords: number[]): Box => coords.map(c => [c, c] as const);
const NO_AXES: Box = [];

test('rejects a negative or non-integer axis count', () => {
  assert.throws(() => new RTree(-1), TypeError);
  assert.throws(() => new RTree(1.5), TypeError);
});

test('rejects a box whose axis count does not match the tree', () => {
  const t = new RTree<string>(2);
  assert.throws(() => t.insert([[0, 1]], 'a'), TypeError);
});

test('insert and search on one axis', () => {
  const t = new RTree<string>(1);
  t.insert([[0, 10]], 'wide');
  t.insert([[20, 30]], 'far');
  assert.deepEqual(t.search(point(5)), ['wide']);
  assert.deepEqual(t.search(point(25)), ['far']);
  assert.deepEqual(t.search(point(15)), []);
  assert.equal(t.size, 2);
});

test('search returns every containing box, not just the first', () => {
  const t = new RTree<string>(1);
  t.insert([[0, 100]], 'outer');
  t.insert([[10, 20]], 'inner');
  assert.deepEqual(t.search(point(15)).sort(), ['inner', 'outer']);
});

test('search on multiple axes requires containment on all of them', () => {
  const t = new RTree<string>(3);
  t.insert([[0, 10], [0, 10], [0, 10]], 'cube');
  assert.deepEqual(t.search(point(5, 5, 5)), ['cube']);
  assert.deepEqual(t.search(point(5, 5, 50)), [], 'third axis excludes it');
});

test('a full box matches every point, which is the global-span geometry', () => {
  const t = new RTree<string>(2);
  t.insert(fullBox(2), 'global');
  t.insert([[0, 1], [0, 1]], 'narrow');
  assert.deepEqual(t.search(point(1000, -1000)), ['global']);
  assert.deepEqual(t.search(point(0.5, 0.5)).sort(), ['global', 'narrow']);
});

test('remove deletes by predicate and reports whether it matched', () => {
  const t = new RTree<string>(1);
  t.insert([[0, 10]], 'a');
  t.insert([[5, 15]], 'b');
  assert.equal(t.remove(r => r === 'a'), true);
  assert.equal(t.size, 1);
  assert.deepEqual(t.search(point(7)), ['b']);
  assert.equal(t.remove(r => r === 'missing'), false);
  assert.equal(t.size, 1);
});

test('removing the last entry empties the tree', () => {
  const t = new RTree<string>(1);
  t.insert([[0, 1]], 'only');
  assert.equal(t.remove(r => r === 'only'), true);
  assert.equal(t.size, 0);
  assert.deepEqual(t.search(point(0)), []);
  assert.deepEqual(t.all(), []);
});

test('splitting preserves every entry', () => {
  // Well past the default capacity of 9, so the root must split repeatedly.
  const t = new RTree<number>(2, { maxEntries: 4 });
  for (let i = 0; i < 200; i++) t.insert([[i, i + 1], [i, i + 1]], i);
  assert.equal(t.size, 200);
  assert.equal(t.all().length, 200);
  for (let i = 0; i < 200; i += 17) {
    assert.ok(t.search(point(i + 0.5, i + 0.5)).includes(i), `entry ${i} findable after split`);
  }
});

test('removal after splitting keeps the remainder searchable', () => {
  const t = new RTree<number>(2, { maxEntries: 4 });
  for (let i = 0; i < 100; i++) t.insert([[i, i + 1], [0, 1]], i);
  for (let i = 0; i < 100; i += 2) assert.equal(t.remove(r => r === i), true);
  assert.equal(t.size, 50);
  assert.deepEqual(t.all().sort((a, b) => a - b),
    Array.from({ length: 50 }, (_, k) => k * 2 + 1));
});

test('clear resets to empty', () => {
  const t = new RTree<string>(2);
  t.insert([[0, 1], [0, 1]], 'x');
  t.clear();
  assert.equal(t.size, 0);
  assert.deepEqual(t.all(), []);
});

// ---- zero-dimensional model (DT-3) ----

test('a zero-axis tree holds one entry that matches the empty point', () => {
  const t = new RTree<string>(0);
  t.insert(NO_AXES, 'global');
  assert.equal(t.size, 1);
  assert.deepEqual(t.search(NO_AXES), ['global'], 'vacuous containment (DEC-16)');
});

test('a zero-axis tree supports removal', () => {
  const t = new RTree<string>(0);
  t.insert(NO_AXES, 'global');
  assert.equal(t.remove(r => r === 'global'), true);
  assert.equal(t.size, 0);
  assert.deepEqual(t.search(NO_AXES), []);
});

test('a zero-axis tree asserts rather than splitting', () => {
  // DEC-17: unreachable in the real system, because only one span is
  // expressible when no dimensions exist. Forced here to prove it fails loudly.
  const t = new RTree<number>(0, { maxEntries: 4 });
  assert.throws(
    () => { for (let i = 0; i < 20; i++) t.insert(NO_AXES, i); },
    /invariant violated: a zero-dimensional index cannot hold enough entries to split/,
  );
});
