/**
 * DEC-13: the R*-tree-backed SpanStore against a naive linear-scan
 * matcher, over randomly generated models, spans, and plan lines.
 *
 * T2's differential test (dimension-model-vs-ancestor-walk.test.ts) checks
 * that DimensionModel's containment geometry agrees with a parent-walk
 * oracle for a single span/plan-line pair. This test is one layer up: it
 * builds a real SpanStore with many stored spans and confirms that
 * SpanStore.match agrees with an oracle that re-derives OC 9.2's matching
 * rule directly from the dimension hierarchy, with no geometry involved at
 * all. Agreement here is what the design plan's DT-7 harness will later use
 * as its control — a scan is expected to agree always and prune never.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDimensionModel, DIMENSION_FILE_FORMAT,
  type DimensionDefinition, type DimensionFile,
} from '../../src/model/dimension-model.ts';
import { resolveSpan, type CanonicalSpan } from '../../src/model/span.ts';
import { RTree } from '../../src/index/rtree.ts';
import { IndexAdapter } from '../../src/store/index-adapter.ts';
import { SpanStore } from '../../src/store/span-store.ts';

function makeRandom(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

interface GeneratedValue { key: string; parentKey: string | undefined }

function randomDimension(rnd: () => number, id: string, valueCount: number): {
  definition: DimensionDefinition;
  values: GeneratedValue[];
} {
  const values: GeneratedValue[] = [{ key: 'v0', parentKey: undefined }];
  for (let i = 1; i < valueCount; i++) {
    const parentIndex = Math.floor(rnd() * i);
    values.push({ key: `v${i}`, parentKey: rnd() < 0.25 ? undefined : `v${parentIndex}` });
  }
  const definition: DimensionDefinition = {
    id, name: id,
    values: values.map(v => v.parentKey === undefined
      ? { key: v.key, name: v.key }
      : { key: v.key, name: v.key, parentKey: v.parentKey }),
  };
  return { definition, values };
}

function ancestorOrSelf(values: readonly GeneratedValue[], a: string, b: string): boolean {
  const parentOf = new Map(values.map(v => [v.key, v.parentKey]));
  let current: string | undefined = b;
  while (current !== undefined) {
    if (current === a) return true;
    current = parentOf.get(current);
  }
  return false;
}

/** OC 9.2, applied with no geometry: every dimension in the span must be
 * present in the plan line and satisfy ancestor-or-self. */
function naiveApplies(
  generated: readonly { definition: DimensionDefinition; values: GeneratedValue[] }[],
  span: Readonly<Record<string, string>>,
  planLine: Readonly<Record<string, string>>,
): boolean {
  for (const g of generated) {
    const dimId = g.definition.id;
    if (!(dimId in span)) continue;
    if (!(dimId in planLine)) return false;
    if (!ancestorOrSelf(g.values, span[dimId]!, planLine[dimId]!)) return false;
  }
  return true;
}

test('SpanStore.match agrees with a naive scan-and-check oracle', () => {
  const rnd = makeRandom(20260803);
  const randInt = (n: number): number => Math.floor(rnd() * n);
  let queriesChecked = 0;

  for (let trial = 0; trial < 60; trial++) {
    const dimCount = 1 + randInt(3);
    const generated: { definition: DimensionDefinition; values: GeneratedValue[] }[] = [];
    for (let d = 0; d < dimCount; d++) {
      generated.push(randomDimension(rnd, `d${d}`, 2 + randInt(6)));
    }

    const file: DimensionFile = {
      format: DIMENSION_FILE_FORMAT,
      dimensions: generated.map(g => g.definition),
    };
    const model = buildDimensionModel(file);
    const index = new IndexAdapter(new RTree<CanonicalSpan>(model.axisCount), model);
    const store = new SpanStore(index);

    const storedSpans = new Map<string, Record<string, string>>();
    const spanCount = 5 + randInt(20);
    for (let i = 0; i < spanCount; i++) {
      const span: Record<string, string> = {};
      for (const g of generated) {
        if (rnd() < 0.5) span[g.definition.id] = g.values[randInt(g.values.length)]!.key;
      }
      try {
        const canonical = resolveSpan(span, model);
        store.create(canonical);
        storedSpans.set(canonical.key, span);
      } catch {
        // duplicate canonical span; skip
      }
    }

    for (let q = 0; q < 15; q++) {
      const planLine: Record<string, string> = {};
      for (const g of generated) {
        if (rnd() < 0.8) planLine[g.definition.id] = g.values[randInt(g.values.length)]!.key;
      }

      const fromStore = store.match(planLine).map(span => span.key).sort();
      const fromOracle = [...storedSpans.entries()]
        .filter(([, span]) => naiveApplies(generated, span, planLine))
        .map(([key]) => key)
        .sort();

      queriesChecked++;
      assert.deepEqual(fromStore, fromOracle,
        `trial ${trial} planLine=${JSON.stringify(planLine)} storedSpans=${JSON.stringify([...storedSpans])}`);
    }
  }

  assert.ok(queriesChecked >= 800, `expected a meaningful sample, ran ${queriesChecked}`);
});
