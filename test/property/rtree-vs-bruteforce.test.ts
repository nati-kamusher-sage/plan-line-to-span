import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RTree } from '../../src/index/rtree.ts';
import { contains, type Box } from '../../src/index/box.ts';

/**
 * The index must agree with a brute-force filter over the same boxes, always.
 *
 * This is the DEC-13 pattern applied to T1: an independent oracle that is
 * obviously correct, compared against the implementation over inputs nobody
 * chose. Hand-written cases confirm the situations the author imagined; this
 * explores shapes they did not. Both DT-2 defects the design prototypes caught
 * were of that kind.
 *
 * Deterministic from a fixed seed (DEC-65), so a failure is reproducible.
 */
function makeRandom(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

function randomBox(rnd: () => number, axisCount: number): Box {
  return Array.from({ length: axisCount }, () => {
    const lo = Math.floor(rnd() * 100);
    return [lo, lo + Math.floor(rnd() * 20)] as const;
  });
}

function randomPoint(rnd: () => number, axisCount: number): Box {
  return Array.from({ length: axisCount }, () => {
    const v = Math.floor(rnd() * 120);
    return [v, v] as const;
  });
}

interface Entry { box: Box; ref: number }

test('search agrees with brute force across random models', () => {
  const rnd = makeRandom(20260731);
  let comparisons = 0;

  for (let trial = 0; trial < 200; trial++) {
    const axisCount = 1 + Math.floor(rnd() * 4);
    const entryCount = Math.floor(rnd() * 60);
    const maxEntries = 4 + Math.floor(rnd() * 6);

    const tree = new RTree<number>(axisCount, { maxEntries });
    const entries: Entry[] = [];
    for (let i = 0; i < entryCount; i++) {
      const box = randomBox(rnd, axisCount);
      entries.push({ box, ref: i });
      tree.insert(box, i);
    }

    assert.equal(tree.size, entryCount, 'size tracks insertions');

    for (let q = 0; q < 10; q++) {
      const pt = randomPoint(rnd, axisCount);
      const fromTree = tree.search(pt).sort((a, b) => a - b);
      const fromBrute = entries.filter(e => contains(e.box, pt)).map(e => e.ref).sort((a, b) => a - b);
      comparisons++;
      assert.deepEqual(fromTree, fromBrute,
        `axes=${axisCount} entries=${entryCount} point=${JSON.stringify(pt)}`);
    }
  }
  assert.ok(comparisons >= 2000, `expected a meaningful sample, ran ${comparisons}`);
});

test('search still agrees after interleaved removals', () => {
  const rnd = makeRandom(880821);

  for (let trial = 0; trial < 60; trial++) {
    const axisCount = 1 + Math.floor(rnd() * 3);
    const tree = new RTree<number>(axisCount, { maxEntries: 4 });
    let entries: Entry[] = [];

    for (let i = 0; i < 80; i++) {
      const box = randomBox(rnd, axisCount);
      entries.push({ box, ref: i });
      tree.insert(box, i);
      // Remove roughly a third of what was inserted, as we go.
      if (rnd() < 0.33 && entries.length) {
        const victim = entries[Math.floor(rnd() * entries.length)]!;
        assert.equal(tree.remove(r => r === victim.ref), true, 'stored entry is removable');
        entries = entries.filter(e => e.ref !== victim.ref);
      }
    }

    assert.equal(tree.size, entries.length, 'size tracks removals');
    assert.deepEqual(tree.all().sort((a, b) => a - b),
      entries.map(e => e.ref).sort((a, b) => a - b), 'all() matches surviving entries');

    for (let q = 0; q < 10; q++) {
      const pt = randomPoint(rnd, axisCount);
      assert.deepEqual(
        tree.search(pt).sort((a, b) => a - b),
        entries.filter(e => contains(e.box, pt)).map(e => e.ref).sort((a, b) => a - b),
        `after removals: axes=${axisCount} point=${JSON.stringify(pt)}`);
    }
  }
});

test('duplicate and identical boxes are all retained and returned', () => {
  const tree = new RTree<number>(2, { maxEntries: 4 });
  for (let i = 0; i < 50; i++) tree.insert([[0, 1], [0, 1]], i);
  assert.equal(tree.size, 50);
  assert.equal(tree.search([[0, 0], [0, 0]]).length, 50, 'identical boxes do not collapse');
});
