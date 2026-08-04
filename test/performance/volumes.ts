/**
 * The four DT-7 evaluation volumes (section 5), and the deterministic
 * generator that builds each one's dimension file and benefit set.
 *
 * These are demo evaluation volumes: they exist to exercise the index along
 * two axes that stress an n-dimensional R*-tree differently -- dimension
 * count (V3, bounding-box overlap grows with axis count) and hierarchy depth
 * (V4, what DT-2's interval labelling encodes) -- not to model a production
 * workload. V1 corresponds roughly to the D1 acceptance fixture.
 *
 * A shared seeded PRNG (the same linear-congruential generator
 * test/property/matching-vs-naive-scan.test.ts uses for DEC-13's
 * differential test) makes every volume's benefit set reproducible from its
 * seed (DEC-65), independent of this generator's own random dimension
 * shapes -- unlike the differential test, a volume's dimension count, depth,
 * and values-per-dimension are fixed parameters, not randomized per trial,
 * since DT-7 needs a controlled shape to isolate what each volume stresses.
 */

import {
  buildDimensionModel, DIMENSION_FILE_FORMAT,
  type DimensionDefinition, type DimensionFile, type DimensionModel,
} from '../../src/model/dimension-model.ts';

export function makeRandom(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

export interface Volume {
  readonly name: string;
  readonly dimensions: number;
  readonly valuesPerDimension: number;
  readonly hierarchyDepth: number;
  /** DT-7's "N": the baseline benefit count the pass condition compares against 8N of. */
  readonly benefits: number;
}

/**
 * DT-7 section 5's table states V1 as 10 benefits, but 1 dimension with 5
 * values total (split across 2 hierarchy levels) supports at most 5 distinct
 * non-empty single-value spans -- `BenefitStore` forbids duplicate canonical
 * spans (OC 6.6). This is an inconsistency in DT-7's own volume table; it
 * does not block the harness (see the synthetic uniqueness dimension below,
 * which does not depend on the stated dimension's own value count), so V1's
 * benefit count is kept exactly as stated rather than silently altered.
 */
export const VOLUMES: readonly Volume[] = [
  { name: 'V1 minimal', dimensions: 1, valuesPerDimension: 5, hierarchyDepth: 2, benefits: 10 },
  { name: 'V2 nominal', dimensions: 3, valuesPerDimension: 50, hierarchyDepth: 3, benefits: 500 },
  { name: 'V3 wide', dimensions: 8, valuesPerDimension: 20, hierarchyDepth: 2, benefits: 1000 },
  { name: 'V4 deep', dimensions: 2, valuesPerDimension: 200, hierarchyDepth: 6, benefits: 2000 },
];

/**
 * Builds one dimension with `valuesPerDimension` values TOTAL, distributed
 * as evenly as possible across `hierarchyDepth` levels (matching how the D1
 * acceptance fixture's 5-value `location` dimension is 2 levels deep, not 5
 * values at each of 2 levels). Each level's values pick a parent from the
 * level above, forming a forest rooted at level 0.
 */
function buildDimensionDefinition(
  rnd: () => number, id: string, valuesPerDimension: number, hierarchyDepth: number,
): DimensionDefinition {
  const values: DimensionDefinition['values'][number][] = [];
  const perLevel = Array.from({ length: hierarchyDepth }, (_, level) =>
    Math.floor(valuesPerDimension / hierarchyDepth) + (level < valuesPerDimension % hierarchyDepth ? 1 : 0));

  let previousLevelKeys: string[] = [];
  for (let level = 0; level < hierarchyDepth; level++) {
    const countAtLevel = Math.max(1, perLevel[level]!);
    const currentLevelKeys: string[] = [];
    for (let i = 0; i < countAtLevel; i++) {
      const key = `${id}-l${level}-v${i}`;
      currentLevelKeys.push(key);
      if (level === 0 || previousLevelKeys.length === 0) {
        values.push({ key, name: key });
      } else {
        const parentKey = previousLevelKeys[Math.floor(rnd() * previousLevelKeys.length)]!;
        values.push({ key, name: key, parentKey });
      }
    }
    previousLevelKeys = currentLevelKeys;
  }

  return { id, name: id, values };
}

/** Every non-`seq` dimension's leaf-level (deepest) values, for building spans that vary realistically. */
function leafValuesOf(definition: DimensionDefinition, hierarchyDepth: number): string[] {
  const leafLevelPrefix = `${definition.id}-l${hierarchyDepth - 1}-`;
  return definition.values.map(v => v.key).filter(key => key.startsWith(leafLevelPrefix));
}

const SEQ_DIMENSION_ID = 'seq';

/**
 * A single flat (non-hierarchical), high-cardinality dimension used only to
 * guarantee span uniqueness, not to stress dimensionality or depth.
 *
 * DEC-48's pass condition needs comparisons measured at both N and 8N
 * benefits for the same volume shape. Two volumes make guaranteeing
 * uniqueness through only the *stated* dimensions impossible at 8N: V1 (1
 * dimension, 5 values) has only 5 possible non-empty single-value spans
 * total, far short of 8N=80; V4's leaf level (2 dimensions, ~33 values each
 * after a 6-level split) offers ~1,089 combinations, short of 8N=16,000.
 * Adding one synthetic dimension sized to `maxBenefits` sidesteps this
 * entirely: every span's `seq` value alone is already unique, so the stated
 * dimensions are free to repeat across spans however they like, which
 * keeps this volume's actual index shape (its real axis count and depth)
 * exactly as DT-7 specifies rather than distorted to reach a benefit count.
 */
function buildSeqDimension(maxBenefits: number): DimensionDefinition {
  return {
    id: SEQ_DIMENSION_ID,
    name: SEQ_DIMENSION_ID,
    values: Array.from({ length: maxBenefits }, (_, i) => ({ key: `seq-${i}`, name: `seq-${i}` })),
  };
}

export interface BuiltVolume {
  readonly model: DimensionModel;
  readonly file: DimensionFile;
  readonly spans: readonly Readonly<Record<string, string>>[];
  /** A query plan line matching exactly one stored span (DT-7 section 4: held at exactly one match). */
  readonly singleMatchPlanLine: Readonly<Record<string, string>>;
}

/**
 * Builds one volume's model (the volume's stated dimensions plus the
 * synthetic `seq` uniqueness dimension) and `benefitCount` distinct spans.
 *
 * `maxBenefits` sizes the `seq` dimension once, so the *model* built for
 * measuring at N and the model built for measuring at 8N are identical in
 * shape (same dimension count, same value counts) -- only the number of
 * spans inserted differs. This matters because DEC-48 compares comparison
 * counts *at* N and 8N for what must otherwise be the same index shape;
 * changing the model between the two measurements would confound the
 * growth-rate comparison with a shape change.
 *
 * Every span picks one leaf-level value per stated dimension (so a
 * realistic fraction of dimension structure is exercised) plus one
 * dedicated, never-repeated `seq` value (so identity never depends on the
 * stated dimensions colliding). The query plan line copies one span's
 * values exactly, and since no other span shares that span's `seq` value,
 * exactly one span can match it (OC 9.1: presence and ancestor-or-self on
 * every dimension the span names, including `seq`, whose values have no
 * hierarchy at all, so ancestor-or-self degenerates to equality).
 */
export function buildVolume(seed: number, volume: Volume, benefitCount: number, maxBenefits: number): BuiltVolume {
  if (benefitCount > maxBenefits) {
    throw new Error(`benefitCount (${benefitCount}) exceeds maxBenefits (${maxBenefits})`);
  }

  const rnd = makeRandom(seed);
  const dimensionIds = Array.from({ length: volume.dimensions }, (_, d) => `d${d}`);
  const statedDefinitions = dimensionIds.map(id =>
    buildDimensionDefinition(rnd, id, volume.valuesPerDimension, volume.hierarchyDepth));
  const leafValuesByDimension = statedDefinitions.map(def => leafValuesOf(def, volume.hierarchyDepth));

  const file: DimensionFile = {
    format: DIMENSION_FILE_FORMAT,
    dimensions: [...statedDefinitions, buildSeqDimension(maxBenefits)],
  };
  const model = buildDimensionModel(file);

  const spans: Record<string, string>[] = Array.from({ length: benefitCount }, (_, i) => {
    const span: Record<string, string> = { [SEQ_DIMENSION_ID]: `seq-${i}` };
    for (let d = 0; d < dimensionIds.length; d++) {
      const leafValues = leafValuesByDimension[d]!;
      span[dimensionIds[d]!] = leafValues[Math.floor(rnd() * leafValues.length)]!;
    }
    return span;
  });

  const midIndex = Math.floor(spans.length / 2);
  const singleMatchPlanLine = { ...spans[midIndex]! };

  return { model, file, spans, singleMatchPlanLine };
}
