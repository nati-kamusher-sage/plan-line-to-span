/**
 * The `D1` fixture, exactly as the acceptance catalogue (docs/acceptance-cases.md,
 * section 1) defines it: two dimensions, `location` and `department`.
 *
 * Location values are `4` (USA), `20` (New York City, parent `4`), `21` (Los
 * Angeles, parent `4`), `22` (Manhattan, parent `20`), and `30` (Brooklyn,
 * parent `20`). Keys `4`, `20`, and `21` denote the same values as the
 * dimension-file example in Operational Concept section 7; `22` and `30`
 * extend it with the second hierarchy level multi-level matching requires.
 *
 * Defined once here so every task's tests reference the same fixture the
 * acceptance cases name, rather than each restating it with room to drift.
 * T9 owns the permanent test architecture; this is the minimal shared piece
 * T4 needs now.
 */

import { buildDimensionModel, DIMENSION_FILE_FORMAT, type DimensionFile } from '../../src/model/dimension-model.ts';
import { RTree } from '../../src/index/rtree.ts';
import { IndexAdapter } from '../../src/store/index-adapter.ts';
import { SpanStore } from '../../src/store/span-store.ts';
import type { CanonicalSpan } from '../../src/model/span.ts';

export const D1_FILE: DimensionFile = {
  format: DIMENSION_FILE_FORMAT,
  dimensions: [
    {
      id: 'location', name: 'Location',
      values: [
        { key: '4', name: 'USA' },
        { key: '20', name: 'New York City', parentKey: '4' },
        { key: '21', name: 'Los Angeles', parentKey: '4' },
        { key: '22', name: 'Manhattan', parentKey: '20' },
        { key: '30', name: 'Brooklyn', parentKey: '20' },
      ],
    },
    {
      id: 'department', name: 'Department',
      values: [
        { key: 'rnd', name: 'R&D' },
        { key: 'eng', name: 'Engineering' },
      ],
    },
  ],
};

export function buildD1(): ReturnType<typeof buildDimensionModel> {
  return buildDimensionModel(D1_FILE);
}

/** A fresh, empty span store wired over a fresh index, for the given model. */
export function buildSpanStore(
  model: ReturnType<typeof buildDimensionModel>,
): SpanStore {
  const index = new IndexAdapter(new RTree<CanonicalSpan>(model.axisCount), model);
  return new SpanStore(index);
}
