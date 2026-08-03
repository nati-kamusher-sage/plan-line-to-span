// Does a real R*-tree tolerate zero axes? Test the algorithms that assume >=1 dim.
const box0 = [];                       // zero-dimensional box: no intervals at all
const area   = b => b.reduce((p,[lo,hi]) => p*(hi-lo), 1);   // empty product = 1
const margin = b => b.reduce((s,[lo,hi]) => s+(hi-lo), 0);   // empty sum = 0
const contains = (b,pt) => b.every(([lo,hi],d) => pt[d]>=lo && pt[d]<=hi); // vacuously true
console.log('zero-dim area  =', area(box0),   '(product over no axes)');
console.log('zero-dim margin=', margin(box0), '(sum over no axes)');
console.log('contains(point=[]) =', contains(box0,[]), '(vacuous truth -> global matches all)');

// The split heuristic is where it breaks: it must choose among axes.
const chooseSplitAxis = b => { let best=null,bi=-1;
  for (let d=0; d<b.length; d++) { const m=b[d][1]-b[d][0]; if(best===null||m<best){best=m;bi=d;} }
  return bi; };
console.log('chooseSplitAxis over 0 axes =', chooseSplitAxis(box0), '(-1: no axis to split on)');
console.log('\n=> containment is fine; the split path is undefined with 0 axes.');
console.log('=> a zero-dim index can never need to split: at most ONE span ({}) can exist.');
