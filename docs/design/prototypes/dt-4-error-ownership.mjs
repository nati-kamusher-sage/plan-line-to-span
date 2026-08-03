// DT-4 exit criterion: every error code owned by exactly one component.
const OWNERSHIP = {
  MALFORMED_REQUEST:            'RequestParser',
  INVALID_DIMENSION_DEFINITION: 'DimensionModelBuilder',
  INVALID_STATE:                'OperationDispatcher',
  UNKNOWN_DIMENSION:            'SpanResolver',
  UNKNOWN_DIMENSION_VALUE:      'SpanResolver',
  INVALID_FORMULA:              'FormulaValidator',
  DUPLICATE_SPAN:               'BenefitStore',
  NOT_FOUND:                    'BenefitStore',
  INDEX_FAILURE:                'IndexAdapter',
};
const CONTRACT_CODES = ['MALFORMED_REQUEST','INVALID_DIMENSION_DEFINITION','UNKNOWN_DIMENSION',
  'UNKNOWN_DIMENSION_VALUE','INVALID_FORMULA','DUPLICATE_SPAN','NOT_FOUND','INVALID_STATE','INDEX_FAILURE'];

const missing = CONTRACT_CODES.filter(c => !(c in OWNERSHIP));
const extra   = Object.keys(OWNERSHIP).filter(c => !CONTRACT_CODES.includes(c));
console.log('codes in contract :', CONTRACT_CODES.length);
console.log('codes assigned    :', Object.keys(OWNERSHIP).length);
console.log('unassigned        :', missing.length ? missing : 'none');
console.log('assigned-but-fake :', extra.length ? extra : 'none');
const byComp = {};
for (const [c,o] of Object.entries(OWNERSHIP)) (byComp[o] ??= []).push(c);
console.log('\nowning components :', Object.keys(byComp).length);
for (const [o,cs] of Object.entries(byComp)) console.log(`  ${o.padEnd(24)} ${cs.join(', ')}`);
// each code must have exactly one owner: object keys guarantee it, but assert intent
const multi = Object.entries(OWNERSHIP).filter(([c,o]) => Array.isArray(o));
console.log('\nexit criterion:', (!missing.length && !extra.length && !multi.length)
  ? 'MET - all 9 codes, exactly one owner each' : 'NOT MET');
