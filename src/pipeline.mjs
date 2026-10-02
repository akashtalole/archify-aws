// One entry point for every diagram type: validate -> layout/route/render -> review input.
import { validateSpec } from "./spec.mjs";
import { buildModel } from "./build.mjs";
import { renderSvg } from "./render.mjs";
import { renderSequence, validateSequence } from "./sequence.mjs";
import { compileDataflow, validateDataflow } from "./dataflow.mjs";
import { reviewSpec } from "./review.mjs";
import { resolveIcon } from "./catalog.mjs";

export const DIAGRAM_TYPES = ["architecture", "sequence", "dataflow"];
export const typeOf = (spec) => spec?.diagram_type || (spec?.participants ? "sequence" : spec?.stages ? "dataflow" : "architecture");

export class SpecError extends Error { constructor(errors) { super("Invalid spec:\n - " + errors.join("\n - ")); this.errors = errors; } }

/** Returns {type, warnings, stats, size, svg(theme), steps, review(), spec}. Throws SpecError. */
export function buildDiagram(input) {
  const type = typeOf(input);
  if (!DIAGRAM_TYPES.includes(type)) throw new SpecError([`unknown diagram_type "${type}" (one of ${DIAGRAM_TYPES.join(", ")})`]);
  if (type === "sequence") {
    const { errors, warnings } = validateSequence(input);
    if (errors.length) throw new SpecError(errors);
    const first = renderSequence(input);
    return {
      type, spec: input, warnings, size: { width: first.width, height: first.height },
      stats: { nodes: input.participants.length, groups: (input.groups || []).length, edges: input.messages.filter((m) => m.note === undefined).length },
      svg: (theme) => renderSequence(input, theme).svg,
      steps: first.steps.map((s) => ({ ...s, fromLabel: label(input.participants, s.from), toLabel: label(input.participants, s.to) })),
      review: () => reviewSpec(first.reviewSpec, first.model),
      nodes: input.participants.map((p) => ({ id: p.id, label: p.label || p.id })),
      nodeList: input.participants.map((p) => ({ id: p.id, item: p, icon: resolveIcon(p.icon) })),
      groupList: (input.groups || []).map((g, i) => ({ id: "g:" + i, kind: g.kind, label: g.label, parent: null })),
      edgeList: input.messages.filter((m) => m.note === undefined).map((m) => ({ from: m.from, to: m.to, label: m.label })),
      layout: first.layout,
    };
  }
  let archSpec = input;
  if (type === "dataflow") {
    const errs = validateDataflow(input);
    if (errs.length) throw new SpecError(errs);
    archSpec = compileDataflow(input);
  }
  const { errors } = validateSpec(archSpec);
  if (errors.length) throw new SpecError(errors);
  const { model, warnings } = buildModel(archSpec);
  const nameOf = (id) => model.nodes[id]?.item.label || model.groups.find((g) => g.id === id)?.label || id;
  return {
    type, spec: archSpec, warnings, size: { width: model.width, height: model.height },
    stats: { nodes: Object.keys(model.nodes).length, groups: model.groups.length, edges: model.routes.length },
    svg: (theme) => renderSvg(model, archSpec, theme),
    steps: model.routes.filter((r) => r.edge.step !== undefined).map((r) => ({ step: r.edge.step, from: r.edge.from, to: r.edge.to, label: r.edge.label, desc: r.edge.desc, fromLabel: nameOf(r.edge.from), toLabel: nameOf(r.edge.to) })).sort((a, b) => a.step - b.step),
    review: () => reviewSpec(archSpec, model),
    nodes: Object.values(model.nodes).map((n) => ({ id: n.id, label: n.item.label || n.id })),
    nodeList: Object.values(model.nodes).map((n) => ({ id: n.id, item: n.item, icon: n.icon })),
    groupList: model.groups.map((g) => ({ id: g.id, kind: g.kind, label: g.label, parent: g.parent })),
    edgeList: model.routes.map((r) => ({ from: r.edge.from, to: r.edge.to, label: r.edge.label })),
    model,
  };
}
const label = (ps, id) => ps.find((p) => p.id === id)?.label || id;
