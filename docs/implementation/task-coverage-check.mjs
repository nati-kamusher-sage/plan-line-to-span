import { readFileSync } from 'node:fs';
const ac = [...readFileSync('docs/acceptance-cases.md','utf8').matchAll(/\| (AC-[A-Z]+-\d+)/g)].map(m=>m[1]);
// Each task names the cases it makes passable. A case appears exactly once.
const TASKS = {
 'T1  index core':            [],
 'T2  dimension model':       [],
 'T3  span + store':          [],
 'T4  matching':              ['AC-MATCH-01','AC-MATCH-02','AC-MATCH-03','AC-MATCH-04','AC-MATCH-05','AC-MATCH-06','AC-MATCH-07','AC-MATCH-08','AC-MATCH-09','AC-MATCH-10','AC-MATCH-11'],
 'T5  global + zero-dim':     ['AC-GLOBAL-01','AC-GLOBAL-02','AC-GLOBAL-03','AC-GLOBAL-04','AC-ZERO-01'],
 'T6  parser + envelope':     ['AC-VAL-03','AC-VAL-06'],
 'T7  dispatcher/lifecycle':  ['AC-INIT-01','AC-INIT-02','AC-INIT-03','AC-INIT-04','AC-INIT-05','AC-INIT-06','AC-INIT-07','AC-INIT-08','AC-SERIAL-01'],
 'T8  validation pipeline':   ['AC-VAL-01','AC-VAL-02','AC-VAL-04','AC-VAL-05','AC-VAL-07'],
 'T9  benefit operations':    ['AC-BEN-01','AC-BEN-02','AC-BEN-03','AC-BEN-04','AC-BEN-05','AC-BEN-06','AC-BEN-07','AC-BEN-08','AC-BEN-09','AC-BEN-10','AC-BEN-11'],
 'T10 observability':         ['AC-OBS-01','AC-OBS-02','AC-OBS-03','AC-OBS-04'],
 'T11 index fault injection': ['AC-INIT-09'],
 'T12 performance harness':   [],
 'T13 frontend':              [],
};
const all = Object.values(TASKS).flat();
const dupes = all.filter((v,i)=>all.indexOf(v)!==i);
const missing = ac.filter(c=>!all.includes(c));
const invented = all.filter(c=>!ac.includes(c));
let cum=0;
for (const [t,cs] of Object.entries(TASKS)) { cum+=cs.length;
  console.log(`${t.padEnd(28)} +${String(cs.length).padStart(2)}  cumulative ${String(cum).padStart(2)}/48`); }
console.log('\ndupes   :', dupes.length?dupes:'none');
console.log('missing :', missing.length?missing:'none');
console.log('invented:', invented.length?invented:'none');
console.log(missing.length||dupes.length||invented.length ? 'ALLOCATION BROKEN' : 'allocation covers all 48 exactly once');
