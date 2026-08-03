// Does the designed component ORDER produce the contract's codes?
// Order: RequestParser -> Dispatcher(state) -> DimensionModelBuilder | (SpanResolver -> FormulaValidator) -> BenefitStore -> IndexAdapter
const CODES=['MALFORMED_REQUEST','INVALID_DIMENSION_DEFINITION','UNKNOWN_DIMENSION','UNKNOWN_DIMENSION_VALUE','INVALID_FORMULA','DUPLICATE_SPAN','NOT_FOUND','INVALID_STATE','INDEX_FAILURE'];
function pipeline(req, state, store){
  // 1 RequestParser: envelope shape only. Per IC 7, formula/format are NOT structurally judged here.
  if (req.envelopeBroken) return 'MALFORMED_REQUEST';
  // 2 Dispatcher: state gate (IC 6.1)
  const isInit = req.op === 'initialize';
  if (state === 'initializing') return 'INVALID_STATE';
  if (!isInit && state !== 'ready') return 'INVALID_STATE';
  // 3 initialize -> model builder
  if (isInit) return req.badFormat || req.badHierarchy ? 'INVALID_DIMENSION_DEFINITION' : 'OK';
  // 4 SpanResolver: semantic dimension checks
  if (req.unknownDim)   return 'UNKNOWN_DIMENSION';
  if (req.unknownValue) return 'UNKNOWN_DIMENSION_VALUE';
  // 5 FormulaValidator (only ops carrying a formula)
  if (req.badFormula) return 'INVALID_FORMULA';
  // 6 BenefitStore: identity outcomes
  if (req.op==='createBenefit' && store.has) return 'DUPLICATE_SPAN';
  if (['updateBenefit','deleteBenefit','queryBenefit'].includes(req.op) && !store.has) return 'NOT_FOUND';
  // 7 IndexAdapter
  if (req.indexFails) return 'INDEX_FAILURE';
  return 'OK';
}
const T=[
 ['envelope missing fields',{envelopeBroken:1,op:'createBenefit'},'ready',{},'MALFORMED_REQUEST'],
 ['benefit op before init',{op:'createBenefit'},'uninitialized',{},'INVALID_STATE'],
 ['benefit op while failed',{op:'createBenefit'},'failed',{},'INVALID_STATE'],
 ['initialize from failed (retry)',{op:'initialize'},'failed',{},'OK'],
 ['initialize from uninitialized',{op:'initialize'},'uninitialized',{},'OK'],
 ['initialize while initializing',{op:'initialize'},'initializing',{},'INVALID_STATE'],
 ['reinitialize from ready',{op:'initialize'},'ready',{},'OK'],
 ['bad format -> semantic not malformed',{op:'initialize',badFormat:1},'ready',{},'INVALID_DIMENSION_DEFINITION'],
 ['dangling parent',{op:'initialize',badHierarchy:1},'ready',{},'INVALID_DIMENSION_DEFINITION'],
 ['unknown dimension',{op:'queryBenefit',unknownDim:1},'ready',{},'UNKNOWN_DIMENSION'],
 ['unknown value',{op:'queryBenefit',unknownValue:1},'ready',{},'UNKNOWN_DIMENSION_VALUE'],
 ['null formula -> semantic not malformed',{op:'createBenefit',badFormula:1},'ready',{},'INVALID_FORMULA'],
 ['duplicate span',{op:'createBenefit'},'ready',{has:1},'DUPLICATE_SPAN'],
 ['delete absent',{op:'deleteBenefit'},'ready',{has:0},'NOT_FOUND'],
 ['index failure',{op:'createBenefit',indexFails:1},'ready',{has:0},'INDEX_FAILURE'],
 // precedence: state gate must win over payload problems
 ['state beats bad payload',{op:'createBenefit',unknownDim:1},'uninitialized',{},'INVALID_STATE'],
 // precedence: dimension resolution before formula
 ['unknown dim beats bad formula',{op:'createBenefit',unknownDim:1,badFormula:1},'ready',{},'UNKNOWN_DIMENSION'],
];
let f=0;
for(const [n,r,s,st,want] of T){ const got=pipeline(r,s,st);
  if(got!==want){f++;console.log(`FAIL ${n}: got ${got} want ${want}`);} }
console.log(`${T.length-f}/${T.length} pipeline orderings produce the contract's code`);
process.exit(f?1:0);
