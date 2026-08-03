import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDimensionModel, DIMENSION_FILE_FORMAT, type DimensionDefinition, type DimensionFile } from '../../src/model/dimension-model.ts';
import { contains } from '../../src/index/box.ts';

/**
 * Promoted from docs/design/prototypes/dt-2-differential.mjs.
 *
 * The design-phase version showed 12,000/12,000 agreement between the
 * interval-containment mapping and a naive parent-walk oracle across 300
 * random models, including multi-root forests. This is that same test
 * against the real DimensionModel rather than the prototype's stand-in,
 * using the same seed so the sample is reproducible (DEC-65).
 *
 * This is the highest-value test in the suite: hand-written cases confirm
 * the shapes the author imagined, and this explores shapes nobody chose.
 */

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

/** Independent oracle: walk parent links directly, per OC 6.2's ancestor-or-self rule. */
function ancestorOrSelf(values: readonly GeneratedValue[], a: string, b: string): boolean {
  const parentOf = new Map(values.map(v => [v.key, v.parentKey]));
  let current: string | undefined = b;
  while (current !== undefined) {
    if (current === a) return true;
    current = parentOf.get(current);
  }
  return false;
}

test('interval containment agrees with a parent-walk oracle across random models', () => {
  const rnd = makeRandom(42); // same seed as the design-phase prototype
  const randInt = (n: number): number => Math.floor(rnd() * n);

  let checked = 0;

  for (let trial = 0; trial < 300; trial++) {
    const dimCount = 1 + randInt(3);
    const generated: { definition: DimensionDefinition; values: GeneratedValue[] }[] = [];
    for (let d = 0; d < dimCount; d++) {
      generated.push(randomDimension(rnd, `d${d}`, 2 + randInt(7)));
    }

    const file: DimensionFile = {
      format: DIMENSION_FILE_FORMAT,
      dimensions: generated.map(g => g.definition),
    };
    const model = buildDimensionModel(file);

    for (let k = 0; k < 40; k++) {
      const span: Record<string, string> = {};
      const line: Record<string, string> = {};
      for (const g of generated) {
        const values = g.values;
        if (rnd() < 0.6) span[g.definition.id] = values[randInt(values.length)]!.key;
        if (rnd() < 0.8) line[g.definition.id] = values[randInt(values.length)]!.key;
      }

      const got = contains(model.spanToBox(span), model.planLineToPoint(line));

      // Oracle, per OC 9.2: every dimension in the span must be present in the
      // line and satisfy ancestor-or-self; dimensions only in the line do not matter.
      let want = true;
      for (const g of generated) {
        const dimId = g.definition.id;
        if (!(dimId in span)) continue;
        if (!(dimId in line)) { want = false; break; }
        if (!ancestorOrSelf(g.values, span[dimId]!, line[dimId]!)) { want = false; break; }
      }

      checked++;
      assert.equal(got, want,
        `trial ${trial} span=${JSON.stringify(span)} line=${JSON.stringify(line)}`);
    }
  }

  assert.equal(checked, 12000, 'same sample size as the design-phase prototype');
});
