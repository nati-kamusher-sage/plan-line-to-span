// DT-5: the lifecycle as executable data, checked against IC 6.1 verbatim.
export const STATES = ['uninitialized','initializing','ready','failed'];
export const OPS = ['initialize','createBenefit','updateBenefit','deleteBenefit','queryBenefit','queryEmployee'];

// The gate. Derived from IC 6.1: initialize is accepted unless already initializing;
// every other operation requires ready.
export function accepts(state, op) {
  if (state === 'initializing') return false;
  return op === 'initialize' ? true : state === 'ready';
}

// Transitions. A rejected operation never changes state (OC 14.2).
// `outcome` of 'start' is an accepted request beginning; 'success'/'failure' are
// completions of work already in flight, so they are NOT subject to the intake gate.
export function next(state, op, outcome, priorState) {
  if (outcome === 'start') {
    if (!accepts(state, op)) return state;            // rejected intake: unchanged
    return op === 'initialize' ? 'initializing' : state;
  }
  // completion
  if (state !== 'initializing') return state;         // benefit ops never move state
  if (outcome === 'success') return 'ready';
  // failure: Failed only when no preceding valid Ready model existed (OC 8.4, DT-3)
  return priorState === 'ready' ? 'ready' : 'failed';
}

// ---- IC 6.1 table, transcribed exactly from the contract ----
const IC61 = {
  uninitialized: { initialize: 'accept', other: 'INVALID_STATE' },
  initializing:  { initialize: 'INVALID_STATE', other: 'INVALID_STATE' },
  ready:         { initialize: 'accept', other: 'accept' },
  failed:        { initialize: 'accept', other: 'INVALID_STATE' },
};

let fail = 0;
const t = (n, got, want) => { if (JSON.stringify(got)!==JSON.stringify(want)) { fail++; console.log(`FAIL ${n}: got ${got} want ${want}`);} };

// Exit criterion: every (state, operation) cell agrees with IC 6.1.
for (const s of STATES) {
  for (const op of OPS) {
    const want = (op === 'initialize' ? IC61[s].initialize : IC61[s].other) === 'accept';
    t(`IC6.1 ${s}/${op}`, accepts(s, op), want);
  }
}

// Lifecycle paths from OC 8 and the acceptance cases.
t('AC-INIT-01 uninit -> initializing -> ready', next(next('uninitialized','initialize','start'),'initialize','success','uninitialized'), 'ready');
t('AC-INIT-02 first init failure -> failed',    next('initializing','initialize','failure','uninitialized'), 'failed');
t('AC-INIT-03 retry from failed accepted',      accepts('failed','initialize'), true);
t('AC-INIT-04 reinit success stays ready',      next('initializing','initialize','success','ready'), 'ready');
t('AC-INIT-05 reinit failure returns to ready', next('initializing','initialize','failure','ready'), 'ready');
t('AC-INIT-06 op during init rejected',         accepts('initializing','queryEmployee'), false);
t('AC-INIT-07 op before init rejected',         accepts('uninitialized','createBenefit'), false);
t('AC-INIT-08 benefit op from failed rejected', accepts('failed','createBenefit'), false);
t('AC-INIT-09 index failure keeps ready',       next('ready','createBenefit','failure','ready'), 'ready');

// No transition leaves Ready except explicit reinitialization (OC 8.3, DT-3).
for (const op of OPS.filter(o=>o!=='initialize'))
  for (const oc of ['success','failure'])
    t(`ready stable under ${op}/${oc}`, next('ready',op,oc,'ready'), 'ready');

// Rejected operations never change state (OC 14.2).
for (const s of STATES) for (const op of OPS) if (!accepts(s,op))
  t(`rejected ${s}/${op} unchanged`, next(s,op,'start',s), s);

// Reachability: every state reachable, no state stranded.
const reach = new Set(['uninitialized']); let grew = true;
while (grew) { grew = false;
  for (const s of [...reach]) for (const op of OPS) for (const oc of ['start','success','failure']) {
    const n = next(s,op,oc,s==='initializing'?'uninitialized':s); if (!reach.has(n)) { reach.add(n); grew = true; } } }
t('all four states reachable', [...reach].sort(), [...STATES].sort());

console.log(fail ? `\n${fail} FAILURES` : `\nall lifecycle checks passed (${STATES.length*OPS.length} gate cells + paths + invariants)`);
process.exit(fail?1:0);
