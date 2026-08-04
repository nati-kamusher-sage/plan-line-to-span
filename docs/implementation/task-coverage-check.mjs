import { readFileSync } from 'node:fs';

const catalogue = readFileSync('docs/acceptance-cases.md', 'utf8');
const retiredHeading = '## 8. Retired Phase 1 cases';
const coverageHeading = '## 9. Coverage statement';
const retiredStart = catalogue.indexOf(retiredHeading);
const coverageStart = catalogue.indexOf(coverageHeading);

if (retiredStart < 0 || coverageStart < retiredStart) {
  throw new Error('acceptance catalogue is missing its retired or coverage section');
}

const idsIn = text => [...text.matchAll(/^\| (AC-[A-Z]+-\d+)\s*\|/gm)].map(match => match[1]);
const catalogueActive = idsIn(catalogue.slice(0, retiredStart));
const catalogueRetired = idsIn(catalogue.slice(retiredStart, coverageStart));

// Current capability ownership. Every active ECP-1 case appears exactly once.
const ACTIVE = {
  'lifecycle':           ['AC-INIT-01','AC-INIT-03','AC-INIT-04','AC-INIT-06','AC-INIT-07','AC-INIT-08'],
  'span operations':     ['AC-SPAN-01','AC-SPAN-02','AC-SPAN-03','AC-SPAN-04','AC-SPAN-05','AC-SPAN-06','AC-SPAN-07','AC-SPAN-08','AC-SPAN-09','AC-SPAN-10'],
  'matching':            ['AC-MATCH-01','AC-MATCH-02','AC-MATCH-03','AC-MATCH-04','AC-MATCH-05','AC-MATCH-06','AC-MATCH-07','AC-MATCH-08','AC-MATCH-09','AC-MATCH-10','AC-MATCH-11'],
  'global + zero-dim':   ['AC-GLOBAL-01','AC-GLOBAL-02','AC-GLOBAL-03','AC-GLOBAL-04','AC-ZERO-01'],
  'structural + serial': ['AC-VAL-03','AC-VAL-06','AC-SERIAL-01'],
  'observability':       ['AC-OBS-01','AC-OBS-02','AC-OBS-03','AC-OBS-04'],
};

// Retirement ownership records which ECP stage deliberately removed each behavior.
const RETIRED = {
  'E1 concept removal':     ['AC-BEN-11','AC-VAL-07'],
  'E2 optimistic execution': ['AC-INIT-02','AC-INIT-05','AC-INIT-09','AC-VAL-01','AC-VAL-02','AC-VAL-04','AC-VAL-05'],
};

const allocatedActive = Object.values(ACTIVE).flat();
const allocatedRetired = Object.values(RETIRED).flat();
const allocated = [...allocatedActive, ...allocatedRetired];
const catalogueAll = [...catalogueActive, ...catalogueRetired];
const duplicates = allocated.filter((id, index) => allocated.indexOf(id) !== index);
const missing = catalogueAll.filter(id => !allocated.includes(id));
const invented = allocated.filter(id => !catalogueAll.includes(id));

let cumulative = 0;
console.log('active ECP-1 cases');
for (const [capability, cases] of Object.entries(ACTIVE)) {
  cumulative += cases.length;
  console.log(`${capability.padEnd(24)} +${String(cases.length).padStart(2)}  cumulative ${String(cumulative).padStart(2)}/39`);
}

console.log('\nretired Phase 1 lineages');
cumulative = 0;
for (const [stage, cases] of Object.entries(RETIRED)) {
  cumulative += cases.length;
  console.log(`${stage.padEnd(24)} +${String(cases.length).padStart(2)}  cumulative ${String(cumulative).padStart(2)}/9`);
}

const countMismatch = catalogueActive.length !== 39 || catalogueRetired.length !== 9;
console.log(`\ncatalogue: ${catalogueActive.length} active + ${catalogueRetired.length} retired = ${catalogueAll.length} historical lineages`);
console.log('duplicates:', duplicates.length ? duplicates : 'none');
console.log('missing   :', missing.length ? missing : 'none');
console.log('invented  :', invented.length ? invented : 'none');

if (countMismatch || duplicates.length || missing.length || invented.length) {
  console.log('ECP-1 COVERAGE ALLOCATION BROKEN');
  process.exitCode = 1;
} else {
  console.log('ECP-1 coverage allocation reconciled: 39 active and 9 retired, all 48 exactly once');
}
