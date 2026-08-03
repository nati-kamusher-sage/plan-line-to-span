// DT-8: can the closed-field log builder be defeated by accident?
// The exit criterion is that AC-OBS-04 cannot fail by accident, so the test
// is adversarial: try to smuggle payload data through and confirm each attempt fails.

const EVENT = 'plan_line_to_span.operation_completed';
const OPS = new Set(['initialize','createBenefit','updateBenefit','deleteBenefit','queryBenefit','queryEmployee']);
const CODES = new Set(['MALFORMED_REQUEST','INVALID_DIMENSION_DEFINITION','UNKNOWN_DIMENSION',
  'UNKNOWN_DIMENSION_VALUE','INVALID_FORMULA','DUPLICATE_SPAN','NOT_FOUND','INVALID_STATE','INDEX_FAILURE']);
const STATES = new Set(['uninitialized','initializing','ready','failed']);

// ---- the closed-field builder ----
// Accepts only primitives from bounded sets. There is no field that can carry
// a span, formula, or dimension value, so passing one is a type error, not a leak.
export function buildRecord({ sequence, operation, outcome, durationMs, state, benefitCount,
                              errorCode, matchCount, dimensionCount, dimensionValueCount }) {
  const int = (v, n) => { if (!Number.isInteger(v) || v < 0) throw new TypeError(`${n} must be a non-negative integer`); return v; };
  const pick = (v, set, n) => { if (!set.has(v)) throw new TypeError(`${n} not in permitted set`); return v; };

  const rec = {
    timestamp: new Date().toISOString(),
    event: EVENT,
    sequence: int(sequence, 'sequence'),
    level: outcome === 'success' ? 'info' : (errorCode === 'INDEX_FAILURE' ? 'error' : 'warn'),
    operation: pick(operation, OPS, 'operation'),
    outcome: pick(outcome, new Set(['success','failure']), 'outcome'),
    durationMs: (() => { if (typeof durationMs !== 'number' || !(durationMs >= 0)) throw new TypeError('durationMs'); return durationMs; })(),
    state: pick(state, STATES, 'state'),
    benefitCount: int(benefitCount, 'benefitCount'),
  };
  // Optional fields, each from a bounded domain. Omitted, never null (Obs 3).
  if (errorCode !== undefined)           rec.errorCode = pick(errorCode, CODES, 'errorCode');
  if (matchCount !== undefined)          rec.matchCount = int(matchCount, 'matchCount');
  if (dimensionCount !== undefined)      rec.dimensionCount = int(dimensionCount, 'dimensionCount');
  if (dimensionValueCount !== undefined) rec.dimensionValueCount = int(dimensionValueCount, 'dimensionValueCount');
  return Object.freeze(rec);
}

let fail = 0;
const t = (name, fn, shouldThrow) => {
  let threw = false, err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  const ok = threw === shouldThrow;
  if (!ok) { fail++; console.log(`FAIL ${name}: ${shouldThrow ? 'expected rejection, was accepted' : 'unexpected throw: '+err?.message}`); }
  else console.log(`pass  ${shouldThrow ? 'rejected' : 'accepted'}  ${name}`);
};

const SENTINEL = 'SEKRIT-PLANNING-DATA';
const base = { sequence: 1, operation: 'createBenefit', outcome: 'success',
               durationMs: 0.4, state: 'ready', benefitCount: 3 };

console.log('--- adversarial: attempts to smuggle payload data ---');
t('span object as extra field',      () => buildRecord({ ...base, span: { location: '4' } }), false); // ignored, not carried
t('formula in a known field',        () => buildRecord({ ...base, benefitCount: { f: SENTINEL } }), true);
t('sentinel as operation',           () => buildRecord({ ...base, operation: SENTINEL }), true);
t('sentinel as errorCode',           () => buildRecord({ ...base, outcome: 'failure', errorCode: SENTINEL }), true);
t('sentinel as state',               () => buildRecord({ ...base, state: SENTINEL }), true);
t('dimension value as matchCount',   () => buildRecord({ ...base, operation: 'queryEmployee', matchCount: '20' }), true);
t('negative benefitCount',           () => buildRecord({ ...base, benefitCount: -1 }), true);
t('negative durationMs',             () => buildRecord({ ...base, durationMs: -0.1 }), true);
t('null instead of omitted',         () => buildRecord({ ...base, matchCount: null }), true);

console.log('\n--- the sentinel never reaches the output ---');
const rec = buildRecord({ ...base, span: { location: SENTINEL }, formula: { secret: SENTINEL } });
const line = JSON.stringify(rec);
console.log('  emitted:', line);
if (line.includes(SENTINEL)) { fail++; console.log('FAIL sentinel leaked'); }
else console.log('pass  AC-OBS-04: sentinel absent from the record');

console.log('\n--- record shape (Obs 3) ---');
const allowed = new Set(['timestamp','event','sequence','level','operation','outcome',
  'durationMs','state','benefitCount','errorCode','matchCount','dimensionCount','dimensionValueCount']);
const extra = Object.keys(rec).filter(k => !allowed.has(k));
if (extra.length) { fail++; console.log('FAIL unexpected fields:', extra); }
else console.log('pass  only contract-defined fields present');
if (Object.isFrozen(rec)) console.log('pass  record is frozen after construction');
else { fail++; console.log('FAIL record is mutable'); }

console.log('\n--- level assignment (Obs 3) ---');
const lv = (o, c) => buildRecord({ ...base, outcome: o, ...(c ? { errorCode: c } : {}) }).level;
t('success -> info',          () => { if (lv('success') !== 'info') throw new Error(); }, false);
t('validation failure -> warn',() => { if (lv('failure','UNKNOWN_DIMENSION') !== 'warn') throw new Error(); }, false);
t('INDEX_FAILURE -> error',    () => { if (lv('failure','INDEX_FAILURE') !== 'error') throw new Error(); }, false);

console.log(fail ? `\n${fail} FAILURES` : `\nall privacy and shape checks passed`);
process.exit(fail ? 1 : 0);
