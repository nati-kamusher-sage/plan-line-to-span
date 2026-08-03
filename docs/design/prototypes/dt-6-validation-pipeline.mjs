// DT-6: validation pipeline driven by the REAL schema (DT-1 DEC-6),
// run against the twelve invalid messages from the readiness review.
// Requires: npm install ajv   (Draft 2020-12 build)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const SCHEMA_PATH = fileURLToPath(new URL('../../schemas/plan-line-to-span-v1.schema.json', import.meta.url));
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv({ allErrors: false, strict: false });
const validateRequest = ajv.compile({ $ref: '#/$defs/request', ...SCHEMA });

const MAX_FORMULA_BYTES = 65536;

// ---- Stage 1: RequestParser. Envelope structure only (DT-4 DEC-28).
// formula and format are structurally unconstrained in the schema by design,
// so they fall through to their semantic owners.
function parse(raw) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return { err: 'MALFORMED_REQUEST', at: 'RequestParser' }; }
  }
  return validateRequest(raw) ? { ok: raw } : { err: 'MALFORMED_REQUEST', at: 'RequestParser' };
}

// ---- Stage 2: state gate (DT-5).
const accepts = (state, op) => state === 'initializing' ? false
  : (op === 'initialize' ? true : state === 'ready');

// ---- Stage 3a: DimensionModelBuilder (initialize only).
function buildModel(payload) {
  if (payload.format !== 'plan-line-to-span-dimensions/v1')
    return { err: 'INVALID_DIMENSION_DEFINITION', at: 'DimensionModelBuilder' };
  const seenDim = new Set();
  for (const d of payload.dimensions) {
    if (seenDim.has(d.id)) return { err: 'INVALID_DIMENSION_DEFINITION', at: 'DimensionModelBuilder' };
    seenDim.add(d.id);
    const keys = new Set(d.values.map(v => v.key));
    if (keys.size !== d.values.length) return { err: 'INVALID_DIMENSION_DEFINITION', at: 'DimensionModelBuilder' };
    for (const v of d.values)
      if (v.parentKey !== undefined && !keys.has(v.parentKey))
        return { err: 'INVALID_DIMENSION_DEFINITION', at: 'DimensionModelBuilder' };
    // cycle check
    const parent = new Map(d.values.map(v => [v.key, v.parentKey]));
    for (const start of keys) {
      let slow = start, fast = start;
      while (fast !== undefined) {
        fast = parent.get(fast); if (fast === undefined) break;
        fast = parent.get(fast); slow = parent.get(slow);
        if (fast !== undefined && fast === slow)
          return { err: 'INVALID_DIMENSION_DEFINITION', at: 'DimensionModelBuilder' };
      }
    }
  }
  return { ok: { dims: payload.dimensions } };
}

// ---- Stage 3b: SpanResolver (semantic dimension checks).
function resolve(map, model) {
  for (const [dimId, key] of Object.entries(map)) {
    const d = model.dims.find(x => x.id === dimId);
    if (!d) return { err: 'UNKNOWN_DIMENSION', at: 'SpanResolver' };
    if (!d.values.some(v => v.key === key)) return { err: 'UNKNOWN_DIMENSION_VALUE', at: 'SpanResolver' };
  }
  return { ok: map };
}

// ---- Stage 4: FormulaValidator.
function checkFormula(f) {
  if (f === null || typeof f !== 'object' || Array.isArray(f))
    return { err: 'INVALID_FORMULA', at: 'FormulaValidator' };
  if (Buffer.byteLength(JSON.stringify(f), 'utf8') > MAX_FORMULA_BYTES)
    return { err: 'INVALID_FORMULA', at: 'FormulaValidator' };
  return { ok: f };
}

// ---- The pipeline.
export function pipeline(raw, { state = 'ready', model = null, store = new Set() } = {}) {
  const p = parse(raw);            if (p.err) return p;
  const req = p.ok;
  if (!accepts(state, req.operation)) return { err: 'INVALID_STATE', at: 'OperationDispatcher' };
  if (req.operation === 'initialize') {
    const m = buildModel(req.payload); return m.err ? m : { ok: 'initialized' };
  }
  const map = req.operation === 'queryEmployee' ? req.payload.dimensions : req.payload.span;
  const r = resolve(map, model);   if (r.err) return r;
  if ('formula' in req.payload) { const f = checkFormula(req.payload.formula); if (f.err) return f; }
  const key = JSON.stringify(Object.keys(map).sort().map(k => [k, map[k]]));
  if (req.operation === 'createBenefit' && store.has(key)) return { err: 'DUPLICATE_SPAN', at: 'BenefitStore' };
  if (['updateBenefit','deleteBenefit','queryBenefit'].includes(req.operation) && !store.has(key))
    return { err: 'NOT_FOUND', at: 'BenefitStore' };
  return { ok: 'done' };
}

// ================= the twelve invalid messages from the readiness review =================
const V = 'plan-line-to-span/v1';
const MODEL = { dims: [{ id: 'location', values: [{ key: '4' }, { key: '20', parentKey: '4' }] }] };
const CASES = [
  ['missing envelope fields',        { operation: 'createBenefit' }, {}, 'MALFORMED_REQUEST'],
  ['formula null',                   { contractVersion: V, operation: 'createBenefit', payload: { span: {}, formula: null } }, {}, 'INVALID_FORMULA'],
  ['unknown dimension',              { contractVersion: V, operation: 'queryBenefit', payload: { span: { unknown: 'x' } } }, {}, 'UNKNOWN_DIMENSION'],
  ['unknown value',                  { contractVersion: V, operation: 'queryBenefit', payload: { span: { location: 'not-a-key' } } }, {}, 'UNKNOWN_DIMENSION_VALUE'],
  ['extra top-level field',          { contractVersion: V, operation: 'queryBenefit', payload: { span: {} }, bogus: 1 }, {}, 'MALFORMED_REQUEST'],
  ['update with replacementSpan',    { contractVersion: V, operation: 'updateBenefit', payload: { span: { location: '4' }, formula: {}, replacementSpan: { location: '20' } } }, {}, 'MALFORMED_REQUEST'],
  ['bad contract version',           { contractVersion: 'plan-line-to-span/v2', operation: 'queryBenefit', payload: { span: {} } }, {}, 'MALFORMED_REQUEST'],
  ['numeric dimension value',        { contractVersion: V, operation: 'queryBenefit', payload: { span: { location: 4 } } }, {}, 'MALFORMED_REQUEST'],
  ['init bad format',                { contractVersion: V, operation: 'initialize', payload: { format: 'wrong/v1', dimensions: [] } }, {}, 'INVALID_DIMENSION_DEFINITION'],
  ['init dangling parentKey',        { contractVersion: V, operation: 'initialize', payload: { format: 'plan-line-to-span-dimensions/v1', dimensions: [{ id: 'location', name: 'L', values: [{ key: '20', name: 'NYC', parentKey: '999' }] }] } }, {}, 'INVALID_DIMENSION_DEFINITION'],
  ['queryEmployee wrong payload',    { contractVersion: V, operation: 'queryEmployee', payload: { location: '20' } }, {}, 'MALFORMED_REQUEST'],
  ['requestId too long',             { contractVersion: V, operation: 'queryBenefit', payload: { span: {} }, requestId: 'x'.repeat(129) }, {}, 'MALFORMED_REQUEST'],
];

let fail = 0;
console.log('--- the twelve invalid messages ---');
for (const [name, msg, opts, want] of CASES) {
  const got = pipeline(msg, { state: 'ready', model: MODEL, ...opts });
  const code = got.err ?? 'OK';
  const ok = code === want;
  if (!ok) fail++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${code.padEnd(28)} ${(got.at ?? '-').padEnd(22)} ${name}`);
}

// ---- precedence checks specific to IC 7 ----
console.log('\n--- IC 7 precedence ---');
const P = [
  ['state beats payload error', { contractVersion: V, operation: 'createBenefit', payload: { span: { unknown: 'x' }, formula: {} } }, { state: 'uninitialized' }, 'INVALID_STATE'],
  ['unknown dim beats formula', { contractVersion: V, operation: 'createBenefit', payload: { span: { unknown: 'x' }, formula: null } }, {}, 'UNKNOWN_DIMENSION'],
  ['oversized formula',         { contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { big: 'y'.repeat(70000) } } }, {}, 'INVALID_FORMULA'],
  ['formula array rejected',    { contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: [] } }, {}, 'INVALID_FORMULA'],
  ['valid create succeeds',     { contractVersion: V, operation: 'createBenefit', payload: { span: { location: '4' }, formula: { r: 1 } } }, {}, 'OK'],
  ['retry init from failed',    { contractVersion: V, operation: 'initialize', payload: { format: 'plan-line-to-span-dimensions/v1', dimensions: [] } }, { state: 'failed' }, 'OK'],
];
for (const [name, msg, opts, want] of P) {
  const got = pipeline(msg, { state: 'ready', model: MODEL, ...opts });
  const code = got.err ?? 'OK';
  const ok = code === want;
  if (!ok) fail++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${code.padEnd(28)} ${(got.at ?? '-').padEnd(22)} ${name}`);
}
console.log(fail ? `\n${fail} FAILURES` : `\n${CASES.length + P.length}/${CASES.length + P.length} resolve to the documented code`);
process.exit(fail ? 1 : 0);
