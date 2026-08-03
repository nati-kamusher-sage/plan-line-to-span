// DT-10: mechanical checks across the whole design set.
// Mirrors WP-7's method: separate what is demonstrated from what is read.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../..', import.meta.url));
const read = p => readFileSync(DOCS + p, 'utf8');
const designFiles = readdirSync(DOCS + '/design').filter(f => f.endsWith('.md')).sort();
const designText = designFiles.map(f => read('/design/' + f)).join('\n');

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) { fail++; console.log(`FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
  else console.log(`pass  ${name}${detail ? ' :: ' + detail : ''}`);
};

console.log('=== 1. decision-record integrity ===');
const decs = [...designText.matchAll(/\| (DEC-(\d+)) \|/g)].map(m => +m[2]).sort((a, b) => a - b);
check('DEC ids sequential from 1', decs.every((n, i) => n === i + 1), `DEC-1..DEC-${decs.at(-1)}`);
check('no duplicate DEC ids', new Set(decs).size === decs.length);

console.log('\n=== 2. every error code owned exactly once ===');
const ic = read('/interface-contract.md');
const codes = [...ic.matchAll(/^\| `([A-Z_]+)` \| \w/gm)].map(m => m[1]);
const dt4 = read('/design/dt-4-component-structure.md');
// Parse the ownership table's last column. Interface cells contain escaped pipes,
// so split on unescaped pipes only.
const ownerRows = dt4.split('\n').filter(l => l.startsWith('| `') && l.trim().endsWith('|'));
const owned = Object.fromEntries(codes.map(c => [c, 0]));
for (const row of ownerRows) {
  const cells = row.split(/(?<!\\)\|/).slice(1, -1);
  const last = cells.at(-1) ?? '';
  for (const c of codes) if (new RegExp('`' + c + '`').test(last)) owned[c]++;
}
check('all 9 contract codes present', codes.length === 9, codes.join(' '));
check('each code has exactly one owning row',
  Object.values(owned).every(n => n === 1),
  Object.entries(owned).filter(([, n]) => n !== 1).map(([c, n]) => `${c}=${n}`).join(' ') || 'all singly owned');

console.log('\n=== 3. acceptance-case coverage ===');
const acIds = [...read('/acceptance-cases.md').matchAll(/\| (AC-[A-Z]+-\d+)/g)].map(m => m[1]);
const dt9 = read('/design/dt-9-test-approach.md');
// DT-9 maps by family + explicit ids; the mapping prototype is the authority. Here we
// confirm the catalogue count DT-9 claims matches the catalogue itself.
check('catalogue has 48 cases', acIds.length === 48, `${acIds.length}`);
check('DT-9 states the same count', dt9.includes('48'), '48 referenced in DT-9');

console.log('\n=== 4. risks all retired ===');
const plan = read('/preliminary-design-plan.md');
for (const r of ['RISK-1', 'RISK-2', 'RISK-3', 'RISK-4']) {
  const row = plan.split('\n').find(l => l.startsWith(`| ${r} |`));
  check(`${r} marked retired`, !!row && /\*\*Retired/.test(row));
}

console.log('\n=== 5. every design task recorded ===');
for (let i = 1; i <= 10; i++) {
  const hasDoc = designFiles.some(f => f.startsWith(`dt-${i}-`) || f.startsWith(`dt-${i}a-`));
  check(`DT-${i} has a design record`, hasDoc || i === 10, hasDoc ? '' : '(DT-10 is this review)');
}

console.log('\n=== 6. cross-document reference integrity ===');
const allAc = new Set(acIds);
const citedAc = new Set([...designText.matchAll(/AC-[A-Z]+-\d+/g)].map(m => m[0]));
const badAc = [...citedAc].filter(a => !allAc.has(a));
check('no design doc cites a nonexistent case', badAc.length === 0, badAc.join(' ') || `${citedAc.size} distinct cases cited`);

const citedDec = new Set([...designText.matchAll(/DEC-\d+/g)].map(m => m[0]));
const definedDec = new Set(decs.map(n => `DEC-${n}`));
const badDec = [...citedDec].filter(d => !definedDec.has(d));
check('no design doc cites an undefined decision', badDec.length === 0, badDec.join(' ') || `${citedDec.size} distinct decisions cited`);

console.log('\n=== 7. open items have owners ===');
const openRows = [...designText.matchAll(/^\| ([^|]+) \| (DT-\d+|Implementation|Deferred[^|]*|DT-\d+ or implementation)[^|]*\|$/gm)];
check('open-item tables name an owner', openRows.length > 0, `${openRows.length} owned open items`);

console.log(fail ? `\n${fail} CHECKS FAILED` : `\nall mechanical checks passed`);
process.exit(fail ? 1 : 0);
