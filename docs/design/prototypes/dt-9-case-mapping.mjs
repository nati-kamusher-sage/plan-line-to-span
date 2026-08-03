// DT-9: the case-to-test mapping, checked against the catalogue itself.
// A coverage claim that is not derived from the source document is a claim about
// what the author remembered. This reads the catalogue and fails on any gap.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CATALOGUE = fileURLToPath(new URL('../../acceptance-cases.md', import.meta.url));
const catalogueIds = [...readFileSync(CATALOGUE, 'utf8').matchAll(/\| (AC-[A-Z]+-\d+)/g)].map(m => m[1]);

// Test layers. Each acceptance case is executed by exactly one layer.
const LAYERS = {
  contract:  'Drives the public contract surface end to end: request in, response and log out.',
  property:  'Generated inputs compared against an independent oracle.',
  harness:   'Requires a test-only hook or capability beyond the contract surface.',
};

// The mapping. Every case names its layer and what it needs beyond a plain request.
const MAP = {
  // Initialization and lifecycle
  'AC-INIT-01': ['contract'], 'AC-INIT-02': ['contract'], 'AC-INIT-03': ['contract'],
  'AC-INIT-04': ['contract'], 'AC-INIT-05': ['contract'],
  'AC-INIT-06': ['harness', 'pause-during-initialize'],
  'AC-INIT-07': ['contract'], 'AC-INIT-08': ['contract'],
  'AC-INIT-09': ['harness', 'inject-index-failure'],
  // Benefit lifecycle
  ...Object.fromEntries(Array.from({length: 11}, (_, i) =>
    [`AC-BEN-${String(i+1).padStart(2,'0')}`, ['contract']])),
  // Matching
  ...Object.fromEntries(Array.from({length: 11}, (_, i) =>
    [`AC-MATCH-${String(i+1).padStart(2,'0')}`, ['contract']])),
  // Global and zero-dimensional
  'AC-GLOBAL-01': ['contract'], 'AC-GLOBAL-02': ['contract'],
  'AC-GLOBAL-03': ['contract'], 'AC-GLOBAL-04': ['contract'],
  'AC-ZERO-01':   ['contract'],
  // Validation
  'AC-VAL-01': ['contract'], 'AC-VAL-02': ['contract'],
  'AC-VAL-03': ['harness', 'raw-json-with-duplicate-members'],
  'AC-VAL-04': ['contract'], 'AC-VAL-05': ['contract'],
  'AC-VAL-06': ['contract'], 'AC-VAL-07': ['contract'],
  // Serial processing
  'AC-SERIAL-01': ['contract'],
  // Observability
  'AC-OBS-01': ['harness', 'capture-stdout'], 'AC-OBS-02': ['harness', 'capture-stdout'],
  'AC-OBS-03': ['harness', 'capture-stdout'], 'AC-OBS-04': ['harness', 'capture-stdout'],
};

// Tests that exist beyond the acceptance catalogue, each traced to its obligation.
const SUPPLEMENTARY = {
  'differential-matching':   'DT-2a DEC-13: R*-tree vs naive linear-scan matcher over generated models',
  'differential-mapping':    'DT-2: interval containment vs parent-walk ancestor oracle',
  'handlers-never-await':    'DT-5 DEC-39: an await reopens the interleaving DEC-38 assumes impossible',
  'emitter-sole-stdout-writer': 'DT-8: the privacy guarantee covers the emitter path only',
  'schema-examples-validate':'WP-7: the eight interface examples validate against the schema',
  'performance-growth':      'DT-7 DEC-48: cost at 8N below 4x cost at N, with the naive matcher as control',
};

let fail = 0;
const t = (cond, msg) => { if (!cond) { fail++; console.log(`FAIL ${msg}`); } };

console.log('--- coverage against the catalogue ---');
const mapped = new Set(Object.keys(MAP));
const missing = catalogueIds.filter(id => !mapped.has(id));
const invented = [...mapped].filter(id => !catalogueIds.includes(id));
console.log(`catalogue cases : ${catalogueIds.length}`);
console.log(`mapped cases    : ${mapped.size}`);
t(missing.length === 0, `unmapped cases: ${missing.join(', ')}`);
t(invented.length === 0, `mapped but not in catalogue: ${invented.join(', ')}`);
if (!missing.length && !invented.length) console.log('pass  every catalogue case is mapped, none invented');

console.log('\n--- distribution by layer ---');
const byLayer = {};
for (const [id, [layer]] of Object.entries(MAP)) (byLayer[layer] ??= []).push(id);
for (const [l, ids] of Object.entries(byLayer)) console.log(`  ${l.padEnd(10)} ${String(ids.length).padStart(2)}  ${LAYERS[l]}`);
t(Object.keys(byLayer).every(l => l in LAYERS), 'unknown layer used');

console.log('\n--- cases needing a test-only capability ---');
const caps = {};
for (const [id, [layer, cap]] of Object.entries(MAP)) if (cap) (caps[cap] ??= []).push(id);
for (const [c, ids] of Object.entries(caps)) console.log(`  ${c.padEnd(34)} ${ids.join(', ')}`);
t(Object.keys(caps).length === 4, `expected 4 distinct capabilities, found ${Object.keys(caps).length}`);

console.log('\n--- supplementary tests and their obligations ---');
for (const [n, why] of Object.entries(SUPPLEMENTARY)) console.log(`  ${n.padEnd(28)} ${why}`);

console.log(fail ? `\n${fail} FAILURES` : `\nmapping complete: ${catalogueIds.length} cases, ${Object.keys(SUPPLEMENTARY).length} supplementary tests`);
process.exit(fail ? 1 : 0);
