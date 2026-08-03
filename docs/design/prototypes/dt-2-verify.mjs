import { buildModel, spanToBox, planLineToPoint, applies, canonicalKey, FULL } from './dt-2-mapping.mjs';

// ---- D1 fixture, exactly as the acceptance catalogue defines it ----
const D1 = { dimensions: [
  { id: 'location', values: [
    { key: '4',  name: 'USA' },
    { key: '20', name: 'New York City', parentKey: '4' },
    { key: '21', name: 'Los Angeles',   parentKey: '4' },
    { key: '22', name: 'Manhattan',     parentKey: '20' },
    { key: '30', name: 'Brooklyn',      parentKey: '20' },
  ]},
  { id: 'department', values: [ { key: 'rnd', name: 'R&D' }, { key: 'eng', name: 'Engineering' } ]},
]};

const model = buildModel(D1);

// Show the labelling so the design document can quote real numbers.
console.log('--- interval labelling (D1) ---');
for (const d of model.dims) {
  const rows = [...d.label.entries()].sort((a,b)=>a[1][0]-b[1][0])
    .map(([k,[a,b]]) => `${k}:[${a},${b}]`).join('  ');
  console.log(`  ${d.id.padEnd(10)} ${rows}`);
}

// ---- A tiny store using the mapping, standing in for the R*-tree ----
class Store {
  constructor(model) { this.model = model; this.rows = []; }
  create(span, f) {
    const key = canonicalKey(span);
    if (this.rows.some(r => r.key === key)) return { err: 'DUPLICATE_SPAN' };
    this.rows.push({ key, span, f, box: spanToBox(span, this.model) });
    return { ok: true };
  }
  exact(span) {
    const r = this.rows.find(r => r.key === canonicalKey(span));
    return r ? { ok: true, f: r.f } : { err: 'NOT_FOUND' };
  }
  queryEmployee(planLine) {
    const pt = planLineToPoint(planLine, this.model);
    return this.rows.filter(r => applies(r.box, pt)).map(r => r.f).sort();
  }
}

let pass = 0, fail = 0;
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function t(name, got, want) {
  if (eq(got, want)) { pass++; }
  else { fail++; console.log(`FAIL ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
}

// ================= AC-MATCH-01 .. 11 =================
{ const s = new Store(model); s.create({location:'20'},'F1');
  t('AC-MATCH-01 direct equality', s.queryEmployee({location:'20'}), ['F1']); }

{ const s = new Store(model); s.create({location:'4'},'F1');
  t('AC-MATCH-02 one-level ancestor', s.queryEmployee({location:'20'}), ['F1']); }

{ const s = new Store(model); s.create({location:'4'},'F1');
  t('AC-MATCH-03 multi-level ancestor 4->20->22', s.queryEmployee({location:'22'}), ['F1']); }

{ const s = new Store(model); s.create({location:'22'},'F1');
  t('AC-MATCH-04 child span vs parent employee', s.queryEmployee({location:'4'}), []); }

{ const s = new Store(model); s.create({location:'4'},'F1');
  t('AC-MATCH-05 extra employee dim ok', s.queryEmployee({location:'20',department:'rnd'}), ['F1']); }

{ const s = new Store(model); s.create({location:'4',department:'rnd'},'F1');
  t('AC-MATCH-06 missing required dim', s.queryEmployee({location:'20'}), []); }

{ const s = new Store(model); s.create({location:'4',department:'rnd'},'F1');
  t('AC-MATCH-07 AND semantics', s.queryEmployee({location:'20',department:'eng'}), []); }

{ const s = new Store(model); s.create({location:'21'},'F1');
  t('AC-MATCH-08 no matches -> empty', s.queryEmployee({location:'20'}), []); }

{ const s = new Store(model); s.create({location:'4'},'A'); s.create({location:'20'},'B');
  const r1 = s.queryEmployee({location:'22'}), r2 = s.queryEmployee({location:'22'});
  t('AC-MATCH-09 set-stable', r1, r2); t('AC-MATCH-09 content', r1, ['A','B']); }

// AC-MATCH-10 / 11: the section 12 scenario.
// B1{loc:4} B2{loc:4,dept:rnd} B3{loc:20} B4{loc:4,dept:eng}
function section12() {
  const s = new Store(model);
  s.create({location:'4'},'B1'); s.create({location:'4',department:'rnd'},'B2');
  s.create({location:'20'},'B3'); s.create({location:'4',department:'eng'},'B4');
  return s;
}
t('AC-MATCH-10 NYC/rnd -> B1,B2,B3', section12().queryEmployee({location:'20',department:'rnd'}), ['B1','B2','B3']);
t('AC-MATCH-11a LA/rnd -> B1,B2',    section12().queryEmployee({location:'21',department:'rnd'}), ['B1','B2']);
t('AC-MATCH-11b LA/eng -> B1,B4',    section12().queryEmployee({location:'21',department:'eng'}), ['B1','B4']);
t('AC-MATCH-11c USA    -> B1',       section12().queryEmployee({location:'4'}),                   ['B1']);

// ================= exactness (OC 9.1): hierarchy must not broaden =================
{ const s = new Store(model); s.create({location:'4'},'F1');
  t('exact {20} not broadened by parent', s.exact({location:'20'}), {err:'NOT_FOUND'});
  t('exact {4} found',                    s.exact({location:'4'}),  {ok:true,f:'F1'});
  t('exact order-independent', s.exact({location:'4'}), s.exact({location:'4'})); }
{ const s = new Store(model);
  s.create({location:'4',department:'rnd'},'F1');
  t('exact member order irrelevant',
    canonicalKey({location:'4',department:'rnd'}) === canonicalKey({department:'rnd',location:'4'}), true);
  t('exact subset != match', s.exact({location:'4'}), {err:'NOT_FOUND'}); }

// ================= global span + zero-dim (DT-3 interop) =================
{ const s = new Store(model); s.create({},'G'); s.create({location:'20'},'B');
  // employee 22 (Manhattan) is a descendant of 20, so B applies too; G always applies
  t('global + ancestor both match', s.queryEmployee({location:'22',department:'eng'}), ['B','G']);
  // employee 21 (Los Angeles) is outside the 20 subtree, so only the global applies
  t('global alone off-subtree',     s.queryEmployee({location:'21'}),                  ['G']);
  t('global coexists',              s.queryEmployee({location:'20'}),                  ['B','G']);
  t('global box is all-FULL',       spanToBox({}, model).every(x => x === FULL),       true); }
{ const zero = buildModel({dimensions: []});
  const s = new Store(zero); s.create({},'G');
  t('zero-dim: global matches empty plan line', s.queryEmployee({}), ['G']);
  t('zero-dim: box has zero axes', spanToBox({}, zero).length, 0); }

// ================= forest hierarchy =================
{ const F = buildModel({dimensions:[{id:'region', values:[
    {key:'eu'},{key:'de',parentKey:'eu'},{key:'us'},{key:'ca',parentKey:'us'}]}]});
  const s = new Store(F);
  s.create({region:'eu'},'EU'); s.create({region:'us'},'US');
  t('forest: de matches EU only', s.queryEmployee({region:'de'}), ['EU']);
  t('forest: ca matches US only', s.queryEmployee({region:'ca'}), ['US']);
  t('forest: roots disjoint',     s.queryEmployee({region:'eu'}), ['EU']); }

// ================= the invariant, stated directly =================
// ancestor-or-self(v,w)  <=>  interval(v) contains interval(w)
{ const loc = model.dims[0].label;
  const anc = (v,w) => { const A=loc.get(v), B=loc.get(w); return A[0]<=B[0] && B[1]<=A[1]; };
  const truth = { '4':  ['4','20','21','22','30'], '20': ['20','22','30'],
                  '21': ['21'], '22': ['22'], '30': ['30'] };
  let ok = true;
  for (const v of loc.keys()) for (const w of loc.keys())
    if (anc(v,w) !== truth[v].includes(w)) { ok = false; console.log(`  invariant broken: ${v} vs ${w}`); }
  t('containment <=> ancestor-or-self (all 25 pairs)', ok, true); }

console.log(`\n${pass}/${pass+fail} checks passed`);
process.exit(fail ? 1 : 0);
