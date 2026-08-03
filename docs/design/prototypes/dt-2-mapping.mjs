// DT-2 prototype: dimension-to-axis mapping via nested-interval (pre/post) labelling.
//
// Core claim under test: if every hierarchy value is labelled with an interval
// [enter, leave] from a depth-first traversal, then
//     v is an ancestor-or-self of w   <=>   interval(v) contains interval(w)
// which turns OC 9.2 ancestor matching into a pure containment test.

export const FULL = Symbol('full-axis');

// ---------- Interval labelling ----------
// Depth-first, assigning each node [enter, leave] with children nested strictly inside.
// A forest is handled by sweeping every root in order on the same axis.
export function labelDimension(values) {
  const byKey = new Map(values.map(v => [v.key, v]));
  const children = new Map();
  const roots = [];
  for (const v of values) {
    if (v.parentKey === undefined || v.parentKey === null) roots.push(v.key);
    else {
      if (!children.has(v.parentKey)) children.set(v.parentKey, []);
      children.get(v.parentKey).push(v.key);
    }
  }
  const label = new Map();
  let counter = 0;
  const visit = (key) => {
    const enter = counter++;
    for (const c of (children.get(key) ?? [])) visit(c);
    const leave = counter++;
    label.set(key, [enter, leave]);
  };
  for (const r of roots) visit(r);           // forest: each root swept in turn
  return { label, roots, size: counter };
}

export function buildModel(dimensionFile) {
  const dims = dimensionFile.dimensions.map(d => ({
    id: d.id,
    ...labelDimension(d.values),
  }));
  return { dims, axisOf: new Map(dims.map((d, i) => [d.id, i])) };
}

// ---------- Span -> box ----------
// Constrained dimension: the value's own interval.
// Omitted dimension: the whole axis (DT-3's wildcard rule).
export function spanToBox(span, model) {
  return model.dims.map(d => {
    if (!(d.id in span)) return FULL;
    const iv = d.label.get(span[d.id]);
    if (!iv) throw new Error(`UNKNOWN_DIMENSION_VALUE:${d.id}=${span[d.id]}`);
    return iv;
  });
}

// ---------- Plan line -> query point ----------
// A plan line supplies a value per dimension it carries. For matching we need
// the *point* of that value; a span applies when its interval contains it.
// A dimension absent from the plan line can satisfy only an unconstrained span.
const ABSENT = Symbol('absent');
export function planLineToPoint(planLine, model) {
  return model.dims.map(d => {
    if (!(d.id in planLine)) return ABSENT;
    const iv = d.label.get(planLine[d.id]);
    if (!iv) throw new Error(`UNKNOWN_DIMENSION_VALUE:${d.id}=${planLine[d.id]}`);
    return iv;
  });
}

// ---------- The containment test (OC 9.2) ----------
// Per axis: span constraint C vs plan-line value P.
//   C === FULL              -> satisfied (span omits this dimension)
//   P === ABSENT            -> NOT satisfied (span constrains a dim the plan line lacks)
//   otherwise               -> C contains P  (ancestor-or-self)
export function applies(box, point) {
  for (let i = 0; i < box.length; i++) {
    const C = box[i], P = point[i];
    if (C === FULL) continue;
    if (P === ABSENT) return false;
    if (!(C[0] <= P[0] && P[1] <= C[1])) return false;
  }
  return true;
}

// ---------- Exact identity (OC 9.1) ----------
// Hierarchy must NOT broaden this. Identity is the canonical span itself,
// never the geometry: two different spans can never share an interval pair,
// but relying on geometry would invite hierarchy leakage.
export function canonicalKey(span) {
  return JSON.stringify(Object.keys(span).sort().map(k => [k, String(span[k])]));
}
