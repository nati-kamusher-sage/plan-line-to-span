/**
 * T12: the DT-7 performance harness (DEC-45 to DEC-51), run against the real
 * R*-tree for the first time -- this is the "first execution against the
 * built index" DT-7 section 8 could not close in the design phase, and the
 * task that resolves ISSUE-D1.
 *
 * Not a node:test file: DT-7 section 7's Placement row is explicit that this
 * runs on demand, not in the default test run, since it is slower and its
 * purpose is evidence, not regression detection. Run via `npm run
 * performance`. It exits non-zero if the pass condition fails for any real
 * volume/operation, or if the naive-scan control does NOT fail it (DEC-49) --
 * a control that stopped failing would mean the harness itself had stopped
 * measuring anything.
 */

import { RTree } from '../../src/index/rtree.ts';
import { resolveSpan } from '../../src/model/span.ts';
import type { DimensionModel } from '../../src/model/dimension-model.ts';
import { VOLUMES, buildVolume, type Volume, type BuiltVolume } from './volumes.ts';

const PASS_THRESHOLD = 4; // DEC-48: comparisons at 8N must be below 4x comparisons at N.
const SEED = 20260804;

interface Measurement {
  readonly comparisons: number;
  readonly hits: number;
}

/**
 * Counts every box comparison RTree.searchCounting performs for a
 * point query, using the real geometry conversion (`model.planLineToPoint`)
 * a real `BenefitStore.match` would use.
 */
function measureIndexedQuery(
  tree: RTree<number>, model: DimensionModel, planLine: Readonly<Record<string, string>>,
): Measurement {
  let comparisons = 0;
  const point = model.planLineToPoint(planLine);
  const hits = tree.searchCounting(point, () => { comparisons++; });
  return { comparisons, hits: hits.length };
}

/**
 * The naive-scan control (DEC-49): re-derives DEC-13's linear-scan matcher
 * at the box level, counting one "comparison" per stored entry regardless of
 * whether it is a hit -- the definition of doing no pruning at all. Reuses
 * the box module's own `contains`, the same primitive `RTree` calls per box
 * test, so the counting unit is identical between the two implementations
 * and the comparison is fair.
 */
function measureNaiveScan(
  entries: readonly { box: readonly (readonly [number, number])[] }[],
  point: readonly (readonly [number, number])[],
): Measurement {
  let comparisons = 0;
  let hits = 0;
  for (const entry of entries) {
    comparisons++;
    const isHit = entry.box.every(([lo, hi], axis) => {
      const [plo, phi] = point[axis]!;
      return plo >= lo && phi <= hi;
    });
    if (isHit) hits++;
  }
  return { comparisons, hits };
}

interface VolumeResult {
  readonly volume: string;
  readonly operation: 'queryBenefit (findExact)' | 'queryEmployee (searchMatching)';
  readonly comparisonsAtN: number;
  readonly comparisonsAt8N: number;
  readonly growthRatio: number;
  readonly pass: boolean;
}

function buildIndexedTree(built: BuiltVolume): RTree<number> {
  const tree = new RTree<number>(built.model.axisCount);
  built.spans.forEach((span, i) => {
    const canonical = resolveSpan(span, built.model);
    tree.insert(built.model.spanToBox(canonical.dimensions), i);
  });
  return tree;
}

function runVolume(volume: Volume): VolumeResult[] {
  const maxBenefits = volume.benefits * 8;
  const atN = buildVolume(SEED, volume, volume.benefits, maxBenefits);
  const at8N = buildVolume(SEED, volume, maxBenefits, maxBenefits);

  const treeAtN = buildIndexedTree(atN);
  const treeAt8N = buildIndexedTree(at8N);

  // queryEmployee: point search via planLineToPoint, matching >=1 span by hierarchy.
  const employeeAtN = measureIndexedQuery(treeAtN, atN.model, atN.singleMatchPlanLine);
  const employeeAt8N = measureIndexedQuery(treeAt8N, at8N.model, at8N.singleMatchPlanLine);

  // queryBenefit (exact lookup): same point search machinery, since
  // findExact narrows via tree.search before filtering by CanonicalSpan
  // equality (index-adapter.ts) -- the box traversal is identical to a
  // plan-line query for a span with no omitted dimensions.
  const exactAtN = measureIndexedQuery(treeAtN, atN.model, atN.singleMatchPlanLine);
  const exactAt8N = measureIndexedQuery(treeAt8N, at8N.model, at8N.singleMatchPlanLine);

  const toResult = (
    operation: VolumeResult['operation'], n: Measurement, eightN: Measurement,
  ): VolumeResult => {
    if (n.hits !== 1 || eightN.hits !== 1) {
      throw new Error(
        `fixture error: ${volume.name} ${operation} expected exactly 1 hit at both N and 8N, got ${n.hits} and ${eightN.hits}`);
    }
    const growthRatio = eightN.comparisons / n.comparisons;
    return {
      volume: volume.name, operation,
      comparisonsAtN: n.comparisons, comparisonsAt8N: eightN.comparisons,
      growthRatio, pass: growthRatio < PASS_THRESHOLD,
    };
  };

  return [
    toResult('queryEmployee (searchMatching)', employeeAtN, employeeAt8N),
    toResult('queryBenefit (findExact)', exactAtN, exactAt8N),
  ];
}

function runNaiveControl(): VolumeResult {
  const volume = VOLUMES[1]!; // V2 nominal, the headline figure.
  const maxBenefits = volume.benefits * 8;
  const atN = buildVolume(SEED, volume, volume.benefits, maxBenefits);
  const at8N = buildVolume(SEED, volume, maxBenefits, maxBenefits);

  const entriesOf = (built: BuiltVolume) => built.spans.map(span => {
    const canonical = resolveSpan(span, built.model);
    return { box: built.model.spanToBox(canonical.dimensions) };
  });

  const pointAtN = atN.model.planLineToPoint(atN.singleMatchPlanLine);
  const pointAt8N = at8N.model.planLineToPoint(at8N.singleMatchPlanLine);

  const n = measureNaiveScan(entriesOf(atN), pointAtN);
  const eightN = measureNaiveScan(entriesOf(at8N), pointAt8N);

  if (n.hits !== 1 || eightN.hits !== 1) {
    throw new Error(`naive control fixture error: expected exactly 1 hit, got ${n.hits} and ${eightN.hits}`);
  }
  const growthRatio = eightN.comparisons / n.comparisons;
  return {
    volume: `${volume.name} (naive-scan control)`, operation: 'queryEmployee (searchMatching)',
    comparisonsAtN: n.comparisons, comparisonsAt8N: eightN.comparisons,
    growthRatio, pass: growthRatio < PASS_THRESHOLD,
  };
}

function report(results: readonly VolumeResult[]): void {
  const col = (s: string, w: number) => s.length >= w ? s + ' ' : s.padEnd(w);
  console.log(col('volume', 32) + col('operation', 32) + col('N', 8) + col('8N', 10) + col('ratio', 8) + 'verdict');
  for (const r of results) {
    console.log(
      col(r.volume, 32) + col(r.operation, 32) +
      col(String(r.comparisonsAtN), 8) + col(String(r.comparisonsAt8N), 10) +
      col(r.growthRatio.toFixed(2), 8) + (r.pass ? 'SUBLINEAR' : 'LINEAR'));
  }
}

console.log('--- DT-7 performance harness: growth of comparisons from N to 8N ---\n');

const realResults = VOLUMES.flatMap(runVolume);
report(realResults);

console.log('\n--- DEC-49 control: the naive linear scan must fail the pass condition ---\n');
const controlResult = runNaiveControl();
report([controlResult]);

const realFailures = realResults.filter(r => !r.pass);
const controlPassedWhenItShouldNot = controlResult.pass;

console.log('\n--- verdict ---');
if (realFailures.length > 0) {
  console.log(`FAIL: ${realFailures.length} real volume/operation pair(s) failed the pass condition (threshold: growth ratio < ${PASS_THRESHOLD}).`);
  console.log('Per T12 and DT-7 section 6: if the pass condition fails, the index is at fault, not the threshold. Investigate T1; do not relax DEC-48.');
}
if (controlPassedWhenItShouldNot) {
  console.log('FAIL: the naive-scan control passed the pass condition. It must fail (DEC-49) -- a control that passes means the harness can no longer distinguish a scan from an index.');
}
if (realFailures.length === 0 && !controlPassedWhenItShouldNot) {
  console.log(`PASS: every real volume/operation is sublinear (growth ratio < ${PASS_THRESHOLD}), and the naive-scan control correctly fails (ratio ~8, confirming no pruning).`);
}

process.exit(realFailures.length > 0 || controlPassedWhenItShouldNot ? 1 : 0);
