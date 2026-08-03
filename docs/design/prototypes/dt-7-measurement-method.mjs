// DT-7: validate the MEASUREMENT METHOD, not the (not-yet-built) index.
//
// The OC 15.2 claim is that operations use the index rather than scanning.
// The method must be able to tell those apart. So: run it against a known-linear
// implementation and a known-sublinear one, and confirm it reaches the right verdict
// for each. A method that passes both is not measuring anything.

// ---------- counting probes (comparisons, not wall clock) ----------
// Wall clock at demo scale is dominated by noise. Comparison counts are
// deterministic, machine-independent, and reproducible in CI.

// Known-LINEAR: tests every stored box.
function linearSearch(boxes, point) {
  let comparisons = 0, hits = [];
  for (const b of boxes) { comparisons++; if (contains(b.box, point)) hits.push(b.id); }
  return { comparisons, hits };
}

// Known-SUBLINEAR: a crude bulk-loaded tree over one axis, skipping whole groups by MBR.
function treeSearch(node, point) {
  let comparisons = 0; const hits = [];
  const walk = (n) => {
    comparisons++;                                  // one MBR test per node visited
    if (!contains(n.mbr, point)) return;            // prune the whole subtree
    if (n.leaf) { for (const e of n.entries) { comparisons++; if (contains(e.box, point)) hits.push(e.id); } }
    else for (const c of n.children) walk(c);
  };
  walk(node);
  return { comparisons, hits };
}

const contains = (box, pt) => box.every(([lo, hi], d) => pt[d][0] >= lo && pt[d][1] <= hi);

function buildTree(entries, fanout = 8) {
  let level = entries.map(e => ({ leaf: true, entries: [e], mbr: e.box }));
  const mbrOf = ns => ns[0].mbr.map((_, d) => [
    Math.min(...ns.map(n => n.mbr[d][0])), Math.max(...ns.map(n => n.mbr[d][1]))]);
  // group adjacent entries (sorted) so MBRs stay tight -- what an R*-tree achieves via splits
  level.sort((a, b) => a.mbr[0][0] - b.mbr[0][0]);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += fanout) {
      const group = level.slice(i, i + fanout);
      next.push({ leaf: false, children: group, mbr: mbrOf(group) });
    }
    level = next;
  }
  return level[0];
}

// ---------- fixture: N disjoint leaf spans on one axis ----------
function makeEntries(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i, box: [[i * 2, i * 2 + 1]] }));
}

// ---------- the growth test ----------
// Query for a point that matches nothing, so result-set size cannot confound the count.
function measure(search, prepare, sizes) {
  return sizes.map(n => {
    const entries = makeEntries(n);
    const subject = prepare(entries);
    // Query INSIDE the data range: the root MBR cannot reject it, so the index
    // must actually descend. Rejecting at the root would be a trivial pass.
    const mid = Math.floor(n / 2);
    const point = [[mid * 2, mid * 2 + 1]];
    const { comparisons, hits } = search(subject, point);
    if (hits.length !== 1) throw new Error(`fixture error: expected 1 hit, got ${hits.length}`);
    return { n, comparisons };
  });
}

// Growth ratio: comparisons(8N) / comparisons(N).
// Linear => ~8.  Sub-linear (log-ish) => well under 8.
function verdict(rows) {
  const first = rows[0], last = rows[rows.length - 1];
  const sizeRatio = last.n / first.n;
  const costRatio = last.comparisons / first.comparisons;
  return { sizeRatio, costRatio, sublinear: costRatio < sizeRatio / 2 };
}

const SIZES = [125, 250, 500, 1000];

console.log('--- method validation: does the metric distinguish the two? ---\n');

const lin = measure(linearSearch, e => e, SIZES);
const tre = measure(treeSearch, e => buildTree(e), SIZES);

console.log('benefits   linear-scan   indexed');
for (let i = 0; i < SIZES.length; i++)
  console.log(`${String(SIZES[i]).padStart(8)}   ${String(lin[i].comparisons).padStart(11)}   ${String(tre[i].comparisons).padStart(7)}`);

const vL = verdict(lin), vT = verdict(tre);
console.log(`\nlinear scan : size x${vL.sizeRatio}  cost x${vL.costRatio.toFixed(1)}  -> ${vL.sublinear ? 'SUBLINEAR' : 'LINEAR'}`);
console.log(`indexed     : size x${vT.sizeRatio}  cost x${vT.costRatio.toFixed(1)}  -> ${vT.sublinear ? 'SUBLINEAR' : 'LINEAR'}`);

const methodWorks = !vL.sublinear && vT.sublinear;
console.log(`\nmethod ${methodWorks ? 'VALID' : 'INVALID'}: ${methodWorks
  ? 'correctly flags the scan and clears the index'
  : 'cannot distinguish the two implementations'}`);
process.exit(methodWorks ? 0 : 1);
