import { buildModel, spanToBox, planLineToPoint, applies } from './dt-2-mapping.mjs';
const vals=[{key:'r'}]; for(let i=0;i<200;i++) vals.push({key:'c'+i,parentKey:'r'});
const model=buildModel({dimensions:[{id:'loc',values:vals}]});
const boxes = vals.slice(1,50).map(v=>spanToBox({loc:v.key},model));  // first 49 leaves
const mbr = boxes.reduce((m,b)=>[Math.min(m[0],b[0][0]),Math.max(m[1],b[0][1])],[Infinity,-Infinity]);
for (const probe of ['c7','c120']) {
  const pt = planLineToPoint({loc:probe}, model);
  const inMbr = mbr[0] <= pt[0][0] && pt[0][1] <= mbr[1];
  const matches = boxes.filter(b=>applies(b,pt)).length;
  console.log(`probe ${probe.padEnd(5)} interval=${JSON.stringify(pt[0]).padEnd(11)} inMBR=${String(inMbr).padEnd(5)} matches=${matches}` +
    (inMbr?'':'  <- pruned: 49 boxes skipped with one comparison'));
}
console.log('\nMBR of the 49-leaf group =',JSON.stringify(mbr));
