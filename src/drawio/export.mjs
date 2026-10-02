// draw.io (diagrams.net) export. Produces an uncompressed .drawio file that uses draw.io's built-in AWS shape
// library (mxgraph.aws4.*) so every icon, group and connector stays editable in draw.io. Styles follow draw.io's
// own AWS palette entries (see data/drawio/aws4.json, extracted from Sidebar-AWS4.js). An icon with no draw.io
// equivalent is embedded as the official SVG instead.
import fs from "node:fs";
import crypto from "node:crypto";
import { iconFile, resolveIcon } from "../catalog.mjs";
import { GROUP_KINDS } from "../groups.mjs";
import { stepText } from "../render.mjs";
import { drawioShapeFor, categoryColor, hasShape } from "./map.mjs";

const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
const html = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n) => Math.round(n * 10) / 10;
const cid = (kind, id) => `${kind}-${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;

const CONSTRAINTS_RES = "points=[[0,0,0],[0.25,0,0],[0.5,0,0],[0.75,0,0],[1,0,0],[0,1,0],[0.25,1,0],[0.5,1,0],[0.75,1,0],[1,1,0],[0,0.25,0],[0,0.5,0],[0,0.75,0],[1,0.25,0],[1,0.5,0],[1,0.75,0]];";
const CONSTRAINTS_GRP = "points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];";
const LABEL_BELOW = "verticalLabelPosition=bottom;verticalAlign=top;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;";

/** Style of an icon cell. Service icons use resourceIcon (as draw.io's AWS palette does); resources and general icons use their own shape. */
function iconStyle(icon) {
  const m = drawioShapeFor(icon);
  if (m && m.kind === "resourceIcon")
    return { style: `sketch=0;${CONSTRAINTS_RES}outlineConnect=0;fontColor=#232F3E;fillColor=${m.fill};strokeColor=#ffffff;dashed=0;${LABEL_BELOW}shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${m.name};`, shape: m.name };
  if (m)
    return { style: `sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;fillColor=${m.fill || "#232F3D"};strokeColor=none;dashed=0;${LABEL_BELOW}pointerEvents=1;shape=mxgraph.aws4.${m.name};`, shape: m.name };
  const svg = fs.readFileSync(iconFile(icon.entry));
  return { style: `shape=image;image=data:image/svg+xml,${svg.toString("base64")};outlineConnect=0;fontColor=#232F3E;dashed=0;${LABEL_BELOW}imageAspect=1;`, shape: null };
}

const GRP = "outlineConnect=0;gradientColor=none;html=1;whiteSpace=wrap;fontSize=12;fontStyle=0;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;";
const PLAIN = "fillColor=none;verticalAlign=top;fontStyle=0;whiteSpace=wrap;html=1;container=1;pointerEvents=0;collapsible=0;recursiveResize=0;";
const grp = (icon, stroke, fill, font, dashed, extra = "") => `${CONSTRAINTS_GRP}${GRP}shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.${icon};${extra}strokeColor=${stroke};fillColor=${fill};verticalAlign=top;align=left;spacingLeft=30;fontColor=${font};dashed=${dashed};`;
/** draw.io's own AWS group styles, one per archify-aws group kind. */
const GROUP_STYLE = {
  "aws-cloud": grp("group_aws_cloud_alt", "#232F3E", "none", "#232F3E", 0),
  "region": grp("group_region", "#00A4A6", "none", "#147EBA", 1),
  "az": `${PLAIN}strokeColor=#147EBA;dashed=1;fontColor=#147EBA;`,
  "vpc": grp("group_vpc2", "#8C4FFF", "none", "#AAB7B8", 0),
  "public-subnet": grp("group_security_group", "#7AA116", "#F2F6E8", "#248814", 0, "grStroke=0;"),
  "private-subnet": grp("group_security_group", "#00A4A6", "#E6F6F7", "#147EBA", 0, "grStroke=0;"),
  "security-group": `${PLAIN}strokeColor=#DD3522;fontColor=#DD3522;`,
  "asg": `${CONSTRAINTS_GRP}${GRP}shape=mxgraph.aws4.groupCenter;grIcon=mxgraph.aws4.group_auto_scaling_group;grStroke=1;strokeColor=#D86613;fillColor=none;verticalAlign=top;align=center;fontColor=#D86613;dashed=1;spacingTop=25;`,
  "account": grp("group_account", "#CD2264", "none", "#CD2264", 0),
  "corporate-dc": grp("group_corporate_data_center", "#7D8998", "none", "#5A6C86", 0),
  "server-contents": grp("group_on_premise", "#7D8998", "none", "#5A6C86", 0),
  "ec2-contents": grp("group_ec2_instance_contents", "#D86613", "none", "#D86613", 0),
  "spot-fleet": grp("group_spot_fleet", "#D86613", "none", "#D86613", 0),
  "generic": `${PLAIN}strokeColor=#5A6C86;fontColor=#5A6C86;`,
  "generic-dashed": `${PLAIN}strokeColor=#5A6C86;fontColor=#5A6C86;dashed=1;`,
};

class Doc {
  constructor() { this.cells = []; }
  add(xml) { this.cells.push(xml); }
  vertex(id, parent, style, value, x, y, w, h, tooltip) {
    const geo = `<mxGeometry x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" as="geometry"/>`;
    if (tooltip) this.add(`<object label="${attr(value)}" tooltip="${attr(tooltip)}" id="${id}"><mxCell style="${attr(style)}" vertex="1" parent="${parent}">${geo}</mxCell></object>`);
    else this.add(`<mxCell id="${id}" value="${attr(value)}" style="${attr(style)}" vertex="1" parent="${parent}">${geo}</mxCell>`);
  }
  edge(id, parent, style, value, { source, target, points = [], sp, tp, labelPos } = {}) {
    const pts = points.length ? `<Array as="points">${points.map((p) => `<mxPoint x="${r1(p[0])}" y="${r1(p[1])}"/>`).join("")}</Array>` : "";
    const ends = `${sp ? `<mxPoint x="${r1(sp[0])}" y="${r1(sp[1])}" as="sourcePoint"/>` : ""}${tp ? `<mxPoint x="${r1(tp[0])}" y="${r1(tp[1])}" as="targetPoint"/>` : ""}`;
    const geo = `<mxGeometry ${labelPos !== undefined ? `x="${r1(labelPos)}" ` : ""}relative="1" as="geometry">${ends}${pts}</mxGeometry>`;
    this.add(`<mxCell id="${id}" value="${attr(value)}" style="${attr(style)}" edge="1" parent="${parent}"${source ? ` source="${source}"` : ""}${target ? ` target="${target}"` : ""}>${geo}</mxCell>`);
  }
}

const EDGE_BASE = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#232F3E;strokeWidth=2;labelBackgroundColor=#ffffff;fontSize=11;fontColor=#232F3E;";
const BADGE = "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;strokeColor=#ffffff;fontColor=#ffffff;fontStyle=1;fontSize=12;";

function arrowStyle(e) {
  const arrow = e.arrow || "end";
  return `${arrow === "none" ? "endArrow=none;" : "endArrow=open;endFill=0;endSize=8;"}${arrow === "both" ? "startArrow=open;startFill=0;startSize=8;" : ""}${e.style === "dashed" ? "dashed=1;" : ""}`;
}

/** Position of point p along polyline pts as a draw.io label offset in [-1, 1] (0 = middle of the edge). */
function labelOffset(pts, p) {
  const seg = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const total = pts.slice(1).reduce((s, q, i) => s + seg(pts[i], q), 0) || 1;
  let best = { d: Infinity, at: 0 }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = seg(a, b) || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L)));
    const d = Math.hypot(p[0] - (a[0] + (b[0] - a[0]) * t), p[1] - (a[1] + (b[1] - a[1]) * t));
    if (d < best.d) best = { d, at: acc + t * L };
    acc += L;
  }
  return Math.max(-1, Math.min(1, (best.at / total) * 2 - 1));
}

const wrapXml = (title, model, w, h) => {
  const id = crypto.createHash("sha1").update(title + w + h).digest("base64url").slice(0, 20);
  return `<mxfile host="archify-aws" agent="archify-aws" version="1">\n  <diagram name="${attr(title)}" id="${id}">\n    <mxGraphModel dx="${Math.round(w)}" dy="${Math.round(h)}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.round(w)}" pageHeight="${Math.round(h)}" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n${model}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`;
};

// ------------------------------------------------------------------ architecture and dataflow
function architecture(d) {
  const model = d.model, spec = d.spec;
  d.svg("light"); // layout side effects (badge/label positions) are computed by the renderer
  const doc = new Doc();
  const groups = new Map(model.groups.map((g) => [g.id, g]));
  const real = (id) => { // nearest enclosing group that is drawn (stacks are layout-only)
    let p = id == null ? null : groups.get(id);
    while (p && p.kind === "stack") p = p.parent == null ? null : groups.get(p.parent);
    return p || null;
  };
  const parentOfGroup = (g) => real(g.parent);
  const parentOfNode = (n) => real(n.parent);
  const origin = (g) => (g ? [g.rect.x, g.rect.y] : [0, 0]);
  const chain = (g) => { const c = []; for (let p = g; p; p = parentOfGroup(p)) c.push(p); return c; };
  const pid = (g) => (g ? cid("g", g.id) : "1");

  const title = spec.meta.title;
  doc.vertex("title", "1", "text;html=1;align=left;verticalAlign=top;fontSize=20;fontStyle=1;fontColor=#000000;whiteSpace=wrap;", title, 40, 24, Math.max(300, model.width - 80), 30);
  if (spec.meta.subtitle) doc.vertex("subtitle", "1", "text;html=1;align=left;verticalAlign=top;fontSize=12;fontColor=#545B64;whiteSpace=wrap;", spec.meta.subtitle, 40, 56, Math.max(300, model.width - 80), 24);

  // groups, outermost first
  const drawn = model.groups.filter((g) => g.kind !== "stack").sort((a, b) => a.depth - b.depth);
  for (const g of drawn) {
    const par = parentOfGroup(g), [ox, oy] = origin(par);
    const st = GROUP_KINDS[g.kind];
    const label = g.label ?? st.label ?? "";
    let style = GROUP_STYLE[g.kind];
    let customIcon = null;
    if (g.kind === "custom") { // a custom group takes its service's colour and shows the service icon
      const sv = g.item.icon ? resolveIcon(g.item.icon) : null;
      customIcon = sv;
      const color = g.item.color || (sv ? categoryColor(sv.entry.category) : "#7D8998");
      style = `${PLAIN}strokeColor=${color};fontColor=${color};align=left;spacingLeft=40;`;
    } else if (g.item.color && style) style = style.replace(/strokeColor=#[0-9A-Fa-f]{6}/, `strokeColor=${g.item.color}`);
    doc.vertex(cid("g", g.id), pid(par), style, label, g.rect.x - ox, g.rect.y - oy, g.rect.w, g.rect.h);
    if (customIcon) {
      const ic = iconStyle(customIcon);
      doc.vertex(cid("gi", g.id), cid("g", g.id), ic.style.replace(LABEL_BELOW, "html=1;aspect=fixed;"), "", 0, 0, 32, 32);
    }
  }

  // nodes
  const nodeBox = {};
  for (const n of Object.values(model.nodes)) {
    const par = parentOfNode(n), [ox, oy] = origin(par);
    const ic = iconStyle(n.icon);
    const lines = (n.lines && n.lines.length ? n.lines : [n.item.label || n.id]).map(html);
    const sub = n.item.sublabel ? `<br><font style="font-size:10px" color="#545B64">${html(n.item.sublabel)}</font>` : "";
    const ir = n.iconRect;
    nodeBox[n.id] = { rect: ir, cell: n.cell };
    doc.vertex(cid("n", n.id), pid(par), ic.style, lines.join("<br>") + sub, ir.x - ox, ir.y - oy, ir.w, ir.h);
  }

  // edges and numbered callouts
  const terminal = (id) => {
    if (model.nodes[id]) return { cid: cid("n", id), rect: model.nodes[id].iconRect, chain: chain(parentOfNode(model.nodes[id])) };
    const g = groups.get(id);
    return { cid: cid("g", id), rect: g.rect, chain: chain(parentOfGroup(g)) };
  };
  const constraint = (prefix, t, p) => {
    const fx = (p[0] - t.rect.x) / t.rect.w, fy = (p[1] - t.rect.y) / t.rect.h;
    const cx = Math.max(0, Math.min(1, fx)), cy = Math.max(0, Math.min(1, fy));
    return `${prefix}X=${r1(cx)};${prefix}Y=${r1(cy)};${prefix}Dx=${r1(p[0] - (t.rect.x + cx * t.rect.w))};${prefix}Dy=${r1(p[1] - (t.rect.y + cy * t.rect.h))};${prefix}Perimeter=0;`;
  };
  model.routes.forEach((rt, i) => {
    const e = rt.edge, s = terminal(e.from), t = terminal(e.to);
    const lca = s.chain.find((g) => t.chain.includes(g)) || null, [ox, oy] = origin(lca);
    const pts = rt.pts, inner = pts.slice(1, -1).map((p) => [p[0] - ox, p[1] - oy]);
    const style = EDGE_BASE + arrowStyle(e) + constraint("exit", s, pts[0]) + constraint("entry", t, pts[pts.length - 1]);
    doc.edge(cid("e", i), pid(lca), style, e.label || "", { source: s.cid, target: t.cid, points: inner, labelPos: e.label && rt.labelPos ? labelOffset(pts, [rt.labelPos.cx, rt.labelPos.cy]) : undefined });
    if (rt.badgePos && e.step !== undefined) {
      const nm = (id) => model.nodes[id]?.item.label || groups.get(id)?.label || id;
      const tip = stepText(e.desc, nm(e.from), nm(e.to), e.label);
      doc.vertex(cid("b", i), pid(lca), BADGE, String(e.step), rt.badgePos[0] - ox - 11, rt.badgePos[1] - oy - 11, 22, 22, `${e.step}. ${tip}`);
    }
  });
  return { xml: doc.cells.join("\n"), width: model.width, height: model.height };
}

// ------------------------------------------------------------------ sequence
function sequence(d) {
  const L = d.layout, spec = d.spec, doc = new Doc();
  const { ps, x, top, bottom, rows, badges, ICON, M, colW } = L;
  doc.vertex("title", "1", "text;html=1;align=left;verticalAlign=top;fontSize=20;fontStyle=1;fontColor=#000000;whiteSpace=wrap;", spec.meta.title, M, 24, Math.max(300, d.size.width - 2 * M), 30);
  if (spec.meta.subtitle) doc.vertex("subtitle", "1", "text;html=1;align=left;verticalAlign=top;fontSize=12;fontColor=#545B64;whiteSpace=wrap;", spec.meta.subtitle, M, 56, Math.max(300, d.size.width - 2 * M), 24);

  (spec.groups || []).forEach((g, gi) => {
    const idx = g.members.map((m) => ps.findIndex((p) => p.id === m));
    const x0 = M + colW * Math.min(...idx) + 8, x1 = M + colW * (Math.max(...idx) + 1) - 8, gy = top - 48;
    const st = GROUP_KINDS[g.kind];
    let style = GROUP_STYLE[g.kind] || GROUP_STYLE.generic;
    if (g.color) style = style.replace(/strokeColor=#[0-9A-Fa-f]{6}/, `strokeColor=${g.color}`);
    doc.vertex(cid("g", gi), "1", style, g.label ?? st.label ?? "", x0, gy, x1 - x0, bottom - gy);
  });
  (spec.fragments || []).forEach((f, fi) => {
    const msgs = spec.messages;
    const used = msgs.slice(f.from, f.to + 1).flatMap((m) => (m.note !== undefined ? m.over || [] : [m.from, m.to]));
    const cols = used.map((id) => ps.findIndex((p) => p.id === id));
    const x0 = M + colW * Math.min(...cols) + colW * 0.5 - 92, x1 = M + colW * Math.max(...cols) + colW * 0.5 + 92;
    const y0 = rows[f.from].top + 2, y1 = rows[f.to].top + rows[f.to].h - 2;
    const tab = Math.max(54, (f.label || "").length * 6 + 58);
    doc.vertex(cid("f", fi), "1", `shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;fontStyle=1;fontSize=11;width=${tab};height=20;`, `${f.kind}${f.label ? ` [${f.label}]` : ""}`, x0, y0, x1 - x0, y1 - y0);
    if (f.elseAt !== undefined && rows[f.elseAt]) {
      doc.edge(cid("fe", fi), "1", "endArrow=none;dashed=1;html=1;strokeColor=#545B64;fontSize=11;fontStyle=1;align=left;labelPosition=right;", "", { sp: [x0, rows[f.elseAt].top], tp: [x1, rows[f.elseAt].top] });
      doc.vertex(cid("ft", fi), "1", "text;html=1;align=left;verticalAlign=middle;fontSize=11;fontStyle=1;", f.elseLabel ? `[${f.elseLabel}]` : "[else]", x0 + 4, rows[f.elseAt].top + 2, 120, 18);
    }
  });
  for (const p of ps) doc.edge(cid("life", p.id), "1", "endArrow=none;dashed=1;html=1;strokeColor=#545B64;dashPattern=3 4;", "", { sp: [x[p.id], top + ICON + 6 + 42], tp: [x[p.id], bottom - 10] });

  spec.messages.forEach((m, i) => {
    const r = rows[i];
    if (m.note !== undefined) {
      const over = (m.over && m.over.length ? m.over : [ps[0].id]).map((id) => x[id]);
      const cx = (Math.min(...over) + Math.max(...over)) / 2, w = Math.max(160, Math.max(...over) - Math.min(...over) + 80);
      doc.vertex(cid("note", i), "1", "shape=note;size=10;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#545B64;fontSize=11;align=center;verticalAlign=middle;", r.lines.map(html).join("<br>"), cx - w / 2, r.top + r.pad + 6, w, r.h - r.pad - 12);
      return;
    }
    const kind = m.kind || "sync", x1 = x[m.from], x2 = x[m.to];
    const base = `html=1;rounded=0;strokeColor=#232F3E;strokeWidth=2;labelBackgroundColor=#ffffff;fontSize=11;fontColor=#232F3E;endArrow=open;endFill=0;endSize=8;${kind === "return" ? "dashed=1;" : ""}${kind === "async" ? "startArrow=oval;startFill=1;startSize=4;" : ""}`;
    const label = r.lines.join(" ");
    if (kind === "self") doc.edge(cid("m", i), "1", `${base}edgeStyle=none;`, label, { sp: [x1, r.y - 12], tp: [x1, r.y + 12], points: [[x1 + 40, r.y - 12], [x1 + 40, r.y + 12]] });
    else doc.edge(cid("m", i), "1", `${base}verticalAlign=bottom;`, label, { sp: [x1, r.y], tp: [x2, r.y] });
    const b = badges[i];
    if (b) {
      const nm = (id) => ps.find((q) => q.id === id)?.label || id;
      doc.vertex(cid("b", i), "1", BADGE, String(b.step), b.x - 11, b.y - 11, 22, 22, `${b.step}. ${stepText(m.desc, nm(m.from), nm(m.to), m.label)}`);
    }
  });
  for (const p of ps) {
    const ic = iconStyle(p.icon);
    const lines = (p.label ? p.label.split(/\n/) : [p.id]).map(html);
    const sub = p.sublabel ? `<br><font style="font-size:10px" color="#545B64">${html(p.sublabel)}</font>` : "";
    doc.vertex(cid("n", p.id), "1", ic.style, lines.join("<br>") + sub, x[p.id] - ICON / 2, top, ICON, ICON);
  }
  return { xml: doc.cells.join("\n"), width: d.size.width, height: d.size.height };
}

/** Returns the .drawio file contents for a built diagram (see buildDiagram). */
export function toDrawio(d) {
  const r = d.type === "sequence" ? sequence(d) : architecture(d);
  return wrapXml(d.spec.meta.title, r.xml, r.width, r.height);
}

export { hasShape };
