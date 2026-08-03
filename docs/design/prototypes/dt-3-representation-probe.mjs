// DT-3 probe: compare two representations of the global (empty) span.
// A: store the global benefit INSIDE the index as a full-cover box.
// B: store it OUTSIDE the index in a dedicated slot.
// Goal: determine whether either is externally distinguishable, per OC 15.1.

const FULL_MIN = -Infinity, FULL_MAX = Infinity;

// --- Minimal n-dimensional containment index (stand-in for the real R*-tree).
// Semantics only; DT-2 supplies the real structure. Containment is what matters here.
class NIndex {
  constructor(nDims) { this.n = nDims; this.entries = []; }
  insert(box, payload) { this.entries.push({ box, payload }); }
  remove(pred) {
    const i = this.entries.findIndex(e => pred(e));
    if (i < 0) return false;
    this.entries.splice(i, 1); return true;
  }
  find(pred) { return this.entries.find(e => pred(e)); }
  get size() { return this.entries.length; }
  // A stored span applies to a plan-line point when the point lies in its box.
  search(point) {
    return this.entries.filter(e =>
      e.box.every(([lo, hi], d) => point[d] >= lo && point[d] <= hi));
  }
}

// A span becomes a box: constrained dims get the value's interval,
// omitted dims span the whole axis. An empty span omits everything.
function spanToBox(span, dims) {
  return dims.map(d => (d in span) ? [span[d], span[d]] : [FULL_MIN, FULL_MAX]);
}

// ---------- Representation A: global benefit lives in the index ----------
class RepA {
  constructor(dims) { this.dims = dims; this.ix = new NIndex(dims.length); }
  key(span) { return JSON.stringify(Object.keys(span).sort().map(k => [k, span[k]])); }
  create(span, formula) {
    if (this.ix.find(e => e.payload.key === this.key(span))) return { err: 'DUPLICATE_SPAN' };
    this.ix.insert(spanToBox(span, this.dims), { key: this.key(span), span, formula });
    return { ok: true };
  }
  exact(span) {
    const e = this.ix.find(e => e.payload.key === this.key(span));
    return e ? { ok: true, formula: e.payload.formula } : { err: 'NOT_FOUND' };
  }
  update(span, formula) {
    const e = this.ix.find(e => e.payload.key === this.key(span));
    if (!e) return { err: 'NOT_FOUND' };
    e.payload.formula = formula; return { ok: true };
  }
  del(span) {
    return this.ix.remove(e => e.payload.key === this.key(span))
      ? { ok: true } : { err: 'NOT_FOUND' };
  }
  queryEmployee(planLine) {
    const point = this.dims.map(d => planLine[d]);
    // A plan line missing a dimension cannot satisfy a span that constrains it.
    return this.ix.search(point.map(v => v === undefined ? NaN : v))
      .map(e => e.payload.formula);
  }
  get benefitCount() { return this.ix.size; }
}

// ---------- Representation B: global benefit held outside the index ----------
class RepB {
  constructor(dims) { this.dims = dims; this.ix = new NIndex(dims.length); this.global = null; }
  key(span) { return JSON.stringify(Object.keys(span).sort().map(k => [k, span[k]])); }
  isEmpty(span) { return Object.keys(span).length === 0; }
  create(span, formula) {
    if (this.isEmpty(span)) {
      if (this.global) return { err: 'DUPLICATE_SPAN' };
      this.global = { formula }; return { ok: true };
    }
    if (this.ix.find(e => e.payload.key === this.key(span))) return { err: 'DUPLICATE_SPAN' };
    this.ix.insert(spanToBox(span, this.dims), { key: this.key(span), span, formula });
    return { ok: true };
  }
  exact(span) {
    if (this.isEmpty(span)) return this.global ? { ok: true, formula: this.global.formula } : { err: 'NOT_FOUND' };
    const e = this.ix.find(e => e.payload.key === this.key(span));
    return e ? { ok: true, formula: e.payload.formula } : { err: 'NOT_FOUND' };
  }
  update(span, formula) {
    if (this.isEmpty(span)) {
      if (!this.global) return { err: 'NOT_FOUND' };
      this.global.formula = formula; return { ok: true };
    }
    const e = this.ix.find(e => e.payload.key === this.key(span));
    if (!e) return { err: 'NOT_FOUND' };
    e.payload.formula = formula; return { ok: true };
  }
  del(span) {
    if (this.isEmpty(span)) {
      if (!this.global) return { err: 'NOT_FOUND' };
      this.global = null; return { ok: true };
    }
    return this.ix.remove(e => e.payload.key === this.key(span)) ? { ok: true } : { err: 'NOT_FOUND' };
  }
  queryEmployee(planLine) {
    const point = this.dims.map(d => planLine[d] === undefined ? NaN : planLine[d]);
    const out = this.ix.search(point).map(e => e.payload.formula);
    if (this.global) out.push(this.global.formula);   // global always applies
    return out;
  }
  get benefitCount() { return this.ix.size + (this.global ? 1 : 0); }
}

// ---------------- Acceptance-derived scenarios ----------------
const results = [];
function check(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  results.push({ name, pass, got, want });
}

for (const [label, Rep] of [['A: in-index', RepA], ['B: outside', RepB]]) {
  // AC-GLOBAL-01: create {} then query employee {location:20}
  {
    const r = new Rep(['location']);
    r.create({}, 'F1');
    check(`${label} AC-GLOBAL-01 matches`, r.queryEmployee({ location: 20 }).sort(), ['F1']);
    check(`${label} AC-GLOBAL-01 count`, r.benefitCount, 1);
  }
  // AC-GLOBAL-02: query employee {} against zero-dim model
  {
    const r = new Rep([]);
    r.create({}, 'F1');
    check(`${label} AC-GLOBAL-02 matches`, r.queryEmployee({}), ['F1']);
  }
  // AC-GLOBAL-03: duplicate global create
  {
    const r = new Rep(['location']);
    r.create({}, 'F1');
    check(`${label} AC-GLOBAL-03 dup`, r.create({}, 'F2'), { err: 'DUPLICATE_SPAN' });
    check(`${label} AC-GLOBAL-03 orig kept`, r.exact({}), { ok: true, formula: 'F1' });
  }
  // AC-GLOBAL-04: full lifecycle on {}
  {
    const r = new Rep(['location']);
    r.create({}, 'F1');
    check(`${label} AC-GLOBAL-04 q1`, r.exact({}), { ok: true, formula: 'F1' });
    r.update({}, 'F2');
    check(`${label} AC-GLOBAL-04 q2`, r.exact({}), { ok: true, formula: 'F2' });
    check(`${label} AC-GLOBAL-04 del`, r.del({}), { ok: true });
    check(`${label} AC-GLOBAL-04 q3`, r.exact({}), { err: 'NOT_FOUND' });
    check(`${label} AC-GLOBAL-04 count`, r.benefitCount, 0);
  }
  // AC-ZERO-01: zero-dimensional model end to end
  {
    const r = new Rep([]);
    r.create({}, 'F1');
    check(`${label} AC-ZERO-01 match`, r.queryEmployee({}), ['F1']);
    check(`${label} AC-ZERO-01 count`, r.benefitCount, 1);
  }
  // Coexistence: global alongside an ordinary benefit
  {
    const r = new Rep(['location']);
    r.create({}, 'G');
    r.create({ location: 4 }, 'B1');
    check(`${label} coexist match`, r.queryEmployee({ location: 4 }).sort(), ['B1', 'G']);
    check(`${label} coexist count`, r.benefitCount, 2);
    check(`${label} coexist exact-global`, r.exact({}), { ok: true, formula: 'G' });
    check(`${label} coexist exact-other`, r.exact({ location: 4 }), { ok: true, formula: 'B1' });
  }
  // Global must NOT be returned by an exact query for a different span
  {
    const r = new Rep(['location']);
    r.create({}, 'G');
    check(`${label} exact {loc:4} not global`, r.exact({ location: 4 }), { err: 'NOT_FOUND' });
  }
}

let fail = 0;
for (const r of results) {
  if (!r.pass) { fail++; console.log(`FAIL ${r.name}\n  got ${JSON.stringify(r.got)}\n  want ${JSON.stringify(r.want)}`); }
}
console.log(`\n${results.length - fail}/${results.length} checks passed`);

// Externally-distinguishable comparison: run identical sequences on both, diff outputs.
console.log('\n--- observable-equivalence diff (A vs B) ---');
const seqs = [
  ['zero-dim', [], [['create', {}, 'F1'], ['qe', {}], ['exact', {}], ['count']]],
  ['one-dim',  ['location'], [['create', {}, 'G'], ['create', { location: 4 }, 'B1'],
                              ['qe', { location: 4 }], ['exact', {}], ['count'],
                              ['del', {}], ['qe', { location: 4 }], ['count']]],
];
let diffs = 0;
for (const [nm, dims, ops] of seqs) {
  const a = new RepA(dims), b = new RepB(dims);
  for (const [op, ...args] of ops) {
    const run = (r) => op === 'create' ? r.create(args[0], args[1])
      : op === 'qe' ? r.queryEmployee(args[0]).slice().sort()
      : op === 'exact' ? r.exact(args[0])
      : op === 'del' ? r.del(args[0]) : r.benefitCount;
    const ra = JSON.stringify(run(a)), rb = JSON.stringify(run(b));
    if (ra !== rb) { diffs++; console.log(`  DIFF ${nm} ${op}: A=${ra} B=${rb}`); }
  }
}
console.log(diffs === 0 ? '  no observable difference between A and B' : `  ${diffs} observable differences`);
