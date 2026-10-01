// Dataflow diagrams compile to the architecture model: each stage becomes a labelled column.
//  { diagram_type:"dataflow", meta, stages:[{id,label,external?:bool,items:[node|group...]}], edges:[...] }
// Consecutive non-external stages are wrapped in an AWS Cloud boundary (meta.boundary=false disables it).
export function compileDataflow(spec) {
  const stages = spec.stages || [];
  const col = (st) => ({ id: st.id, kind: "generic", label: st.label, layout: "column", gap: st.gap ?? 48, children: st.items || [] });
  const children = [];
  let cloud = null;
  for (const st of stages) {
    const external = st.external === true || spec.meta?.boundary === false;
    if (external) { cloud = null; children.push(col(st)); continue; }
    if (!cloud) { cloud = { id: "aws-boundary" + children.length, kind: "aws-cloud", layout: "row", gap: 64, children: [] }; children.push(cloud); }
    cloud.children.push(col(st));
  }
  return { meta: { ...spec.meta }, root: { layout: "row", gap: 64, children }, edges: spec.edges || [] };
}
export function validateDataflow(spec) {
  const errors = [];
  if (!Array.isArray(spec.stages) || spec.stages.length < 2) errors.push("dataflow needs at least two stages");
  (spec.stages || []).forEach((s, i) => {
    if (!/^[A-Za-z][\w-]*$/.test(s.id || "")) errors.push(`stage #${i + 1}: id must match /^[A-Za-z][\\w-]*$/`);
    if (!s.label) errors.push(`stage "${s.id}": label is required`);
    if (!Array.isArray(s.items) || !s.items.length) errors.push(`stage "${s.id}": items must be a non-empty array`);
  });
  return errors;
}
