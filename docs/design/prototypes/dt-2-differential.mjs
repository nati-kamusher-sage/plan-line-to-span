import { buildModel, spanToBox, planLineToPoint, applies } from './dt-2-mapping.mjs';
// DEC-13 in miniature: interval mapping vs a naive ancestor-walk oracle.
let seed=42; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
const ri=n=>Math.floor(rnd()*n);

function randomDim(id,n){ const vals=[{key:'v0'}];
  for(let i=1;i<n;i++) vals.push({key:'v'+i, parentKey: rnd()<0.25? undefined : 'v'+ri(i)});
  return {id, values: vals.map(v=>v.parentKey===undefined?{key:v.key}:v)}; }

// oracle: walk parent links
function ancestorOrSelf(values,a,b){ const p=new Map(values.map(v=>[v.key,v.parentKey]));
  let c=b; while(c!==undefined){ if(c===a) return true; c=p.get(c);} return false; }

let checked=0, bad=0;
for(let trial=0; trial<300; trial++){
  const nd=1+ri(3), dims=[];
  for(let d=0; d<nd; d++) dims.push(randomDim('d'+d, 2+ri(7)));
  const model=buildModel({dimensions:dims});
  for(let k=0;k<40;k++){
    const span={}, line={};
    for(const d of dims){ if(rnd()<0.6) span[d.id]=d.values[ri(d.values.length)].key;
                          if(rnd()<0.8) line[d.id]=d.values[ri(d.values.length)].key; }
    const got = applies(spanToBox(span,model), planLineToPoint(line,model));
    // oracle per OC 9.2
    let want=true;
    for(const d of dims){ if(!(d.id in span)) continue;
      if(!(d.id in line)){ want=false; break; }
      if(!ancestorOrSelf(d.values, span[d.id], line[d.id])){ want=false; break; } }
    checked++;
    if(got!==want){ bad++; if(bad<4) console.log('MISMATCH',JSON.stringify({span,line})); }
  }
}
console.log(`${checked-bad}/${checked} agree with naive ancestor-walk oracle (${300} random models)`);
process.exit(bad?1:0);
