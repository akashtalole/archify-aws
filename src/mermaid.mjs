// Mermaid -> archify-aws spec. Supports flowchart/graph (nodes, subgraphs, labelled edges, chains, `&`)
// and sequenceDiagram (participants, sync/return/async/self messages, notes, loop/alt/opt/par).
// Mermaid styling is ignored; topology and meaning are kept and mapped to AWS icons via iconguess.
import { guessIcon } from "./iconguess.mjs";
import { layerItems } from "./layers.mjs";

const safeId = (s) => { let id = String(s).replace(/[^\w-]+/g, "_"); if (!/^[A-Za-z]/.test(id)) id = "n" + id; return id; };
const GROUP_BY_TITLE = [[/aws cloud/i, "aws-cloud"], [/\bregion\b/i, "region"], [/availability zone|\baz\b/i, "az"], [/\bvpc\b/i, "vpc"], [/public subnet/i, "public-subnet"], [/private subnet/i, "private-subnet"], [/security group/i, "security-group"], [/auto ?scaling/i, "asg"], [/\baccount\b/i, "account"], [/on.?prem|data ?cent(er|re)|corporate/i, "corporate-dc"]];
const groupKind = (title) => (GROUP_BY_TITLE.find(([re]) => re.test(title)) || [null, "generic"])[1];

export function importMermaid(text, { title, number = false } = {}) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  const first = lines.findIndex((l) => !/^---$|^\w+:/.test(l) || /^(graph|flowchart|sequenceDiagram|stateDiagram)/.test(l));
  const head = lines[first] || "";
  if (/^sequenceDiagram/.test(head)) return importSequence(lines.slice(first + 1), title);
  if (/^(graph|flowchart)\b/.test(head)) return importFlow(lines.slice(first + 1), head, title, number);
  if (/^stateDiagram/.test(head)) throw new Error("stateDiagram import is not supported (use a flowchart or sequenceDiagram)");
  throw new Error("unrecognized Mermaid input: expected `flowchart`/`graph` or `sequenceDiagram` on the first line");
}

function importFlow(lines, head, title, number) {
  const dir = (head.match(/\b(LR|RL|TD|TB|BT)\b/) || [, "TD"])[1];
  const horizontal = dir === "LR" || dir === "RL";
  const nodes = new Map();      // id -> {id,label}
  const parent = new Map();     // node/subgraph id -> subgraph id
  const subs = new Map();       // id -> {id,label,children:[ids]}
  const order = [];             // creation order of node & subgraph ids at any depth
  const edges = [];
  const stack = [];
  const touch = (id, label) => {
    if (!nodes.has(id)) { nodes.set(id, { id, label: label ?? id }); order.push(id); if (stack.length) parent.set(id, stack[stack.length - 1]); }
    else if (label != null && nodes.get(id).label === id) nodes.get(id).label = label;
    return id;
  };
  const clean = (s) => String(s ?? "").replace(/<br\s*\/?>/gi, " ").replace(/&quot;/g, '"').replace(/\\n/g, " ").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();

  for (const raw of lines) {
    let line = raw;
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/.test(line)) continue;
    let m;
    if ((m = line.match(/^subgraph\s+(.*)$/))) {
      const rest = m[1].trim();
      let id, label;
      const b = rest.match(/^([A-Za-z_][\w-]*)\s*\[\s*"?([^\]"]*)"?\s*\]$/);
      if (b) { id = b[1]; label = clean(b[2]); } else { label = clean(rest); id = safeId(label || "group" + subs.size); }
      id = safeId(id);
      subs.set(id, { id, label, children: [] });
      if (stack.length) parent.set(id, stack[stack.length - 1]);
      order.push(id); stack.push(id); continue;
    }
    if (line === "end") { stack.pop(); continue; }
    for (const stmt of line.split(";").map((s) => s.trim()).filter(Boolean)) parseStatement(stmt);
  }
  function parseNodeList(s) {
    // "A & B[Label]" -> [{id}]; returns [ids, rest]
    const ids = [];
    let rest = s.trim();
    for (;;) {
      const tok = parseNodeToken(rest);
      if (!tok) return [ids, rest];
      const id = safeId(tok.id);
      ids.push(touch(id, tok.label ? clean(tok.label) : null));
      rest = rest.slice(tok.len).trim();
      if (rest.startsWith("&")) { rest = rest.slice(1).trim(); continue; }
      return [ids, rest];
    }
  }
  function parseStatement(stmt) {
    let [left, rest] = parseNodeList(stmt);
    if (!left.length) return;
    while (rest) {
      let m, label = "", dashed = false;
      if ((m = rest.match(/^--\s+([^>-][^>]*?)\s+-->/))) { label = m[1]; rest = rest.slice(m[0].length); }
      else if ((m = rest.match(/^-\.\s*([^.]+?)\s*\.->/))) { label = m[1]; dashed = true; rest = rest.slice(m[0].length); }
      else if ((m = rest.match(/^==\s+([^=]+?)\s+==>/))) { label = m[1]; rest = rest.slice(m[0].length); }
      else if ((m = rest.match(/^(<?-->|<?---|<?==>|<?===|<?-\.->|<?-\.-|--[xo]|~~~)/))) { dashed = /\./.test(m[1]); rest = rest.slice(m[0].length); if (m[1].startsWith("~")) { rest = rest.trim(); } }
      else return;
      rest = rest.trim();
      const pipe = rest.match(/^\|([^|]*)\|/);
      if (pipe) { label = pipe[1]; rest = rest.slice(pipe[0].length).trim(); }
      const [right, after] = parseNodeList(rest);
      if (!right.length) return;
      for (const a of left) for (const b of right) edges.push({ from: a, to: b, label: clean(label), dashed });
      left = right; rest = after;
    }
  }
  // assemble containers
  const itemOf = (id) => {
    if (subs.has(id)) {
      const s = subs.get(id);
      return { id, kind: groupKind(s.label), label: s.label, children: order.filter((x) => parent.get(x) === id).map(itemOf) };
    }
    const n = nodes.get(id);
    const g = guessIcon(n.label, id === n.label ? "" : "");
    report.mappings.push({ id, label: n.label, icon: g.icon, confidence: g.confidence, matched: g.matched });
    return { id, label: n.label, icon: g.icon };
  };
  const report = { mappings: [], warnings: [] };
  const top = order.filter((id) => !parent.has(id)).map(itemOf);
  for (const e of edges) { if (!nodes.has(e.from) && !subs.has(e.from)) report.warnings.push(`edge references unknown ${e.from}`); }
  const rootChildren = layerItems(top, edges, horizontal ? "LR" : "TD");
  const spec = {
    meta: { title: title || "Imported diagram", subtitle: "Imported from Mermaid; verify icon choices", output: "imported.html" },
    root: { layout: horizontal ? "row" : "column", gap: 70, children: rootChildren },
    edges: edges.map((e, i) => ({ from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}), ...(e.dashed ? { style: "dashed" } : {}), ...(number ? { step: i + 1 } : {}) })),
  };
  if (dir === "RL" || dir === "BT") report.warnings.push(`direction ${dir} is rendered ${horizontal ? "left-to-right" : "top-to-bottom"}`);
  report.unmapped = report.mappings.filter((m) => m.confidence === "fallback").map((m) => m.id);
  return { type: "architecture", spec, report };
}

function importSequence(lines, title) {
  const parts = new Map(), messages = [], fragments = [], open = [];
  const addPart = (id, label) => { id = safeId(id); if (!parts.has(id)) parts.set(id, { id, label: label || id }); else if (label) parts.get(id).label = label; return id; };
  const ARROW = /^([^\s-][^\s]*?)\s*(--?>>|--?>|--?\)|--?x)\s*([+-]?)\s*([^\s:]+?)\s*:\s*(.*)$/;
  const clean = (s) => s.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  for (const line of lines) {
    let m;
    if (/^(autonumber|activate|deactivate|rect|title|box)\b/.test(line)) continue;
    if ((m = line.match(/^(?:participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/))) { addPart(m[1], m[2] && clean(m[2])); continue; }
    if ((m = line.match(/^(loop|alt|opt|par|critical|break)\b\s*(.*)$/))) { open.push({ kind: m[1] === "critical" || m[1] === "break" ? "opt" : m[1], label: clean(m[2]), from: messages.length }); continue; }
    if ((m = line.match(/^(else|and)\b\s*(.*)$/))) { if (open.length) { open[open.length - 1].elseAt = messages.length; open[open.length - 1].elseLabel = clean(m[2]); } continue; }
    if (line === "end") { const f = open.pop(); if (f && messages.length > f.from) { const { from, ...rest } = f; fragments.push({ ...rest, from, to: messages.length - 1 }); } continue; }
    if ((m = line.match(/^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i))) { messages.push({ note: clean(m[2]), over: m[1].split(",").map((s) => addPart(s.trim())) }); continue; }
    if ((m = line.match(ARROW))) {
      const from = addPart(m[1]), to = addPart(m[4]);
      const arrow = m[2];
      const kind = from === to ? "self" : /\)/.test(arrow) ? "async" : /^--/.test(arrow) ? "return" : "sync";
      messages.push({ from, to, label: clean(m[5]), ...(kind !== "sync" ? { kind } : {}) });
    }
  }
  const report = { mappings: [], warnings: [] };
  const participants = [...parts.values()].map((p) => {
    const g = guessIcon(p.label);
    report.mappings.push({ id: p.id, label: p.label, icon: g.icon, confidence: g.confidence, matched: g.matched });
    return { id: p.id, icon: g.icon, label: p.label };
  });
  report.unmapped = report.mappings.filter((m) => m.confidence === "fallback").map((m) => m.id);
  const spec = { diagram_type: "sequence", meta: { title: title || "Imported sequence", subtitle: "Imported from Mermaid; verify icon choices", output: "imported.html" }, participants, messages, ...(fragments.length ? { fragments } : {}) };
  return { type: "sequence", spec, report };
}

const OPEN = [["[[", "]]"], ["[(", ")]"], ["([", "])"], ["((", "))"], ["{{", "}}"], ["[", "]"], ["(", ")"], ["{", "}"], [">", "]"]];
/** Parses `ID`, `ID[Label]`, `ID([Label])`, `ID[(Label)]`, `ID{{Label}}`, `ID["quoted [label]"]` and a trailing `:::class`. */
function parseNodeToken(s) {
  const m = s.match(/^([A-Za-z_][\w-]*)/);
  if (!m) return null;
  let len = m[0].length, label = null;
  const rest = s.slice(len);
  for (const [o, c] of OPEN) {
    if (!rest.startsWith(o)) continue;
    let body = rest.slice(o.length), end;
    if (body.startsWith('"')) { const q = body.indexOf('"', 1); end = q >= 0 ? body.indexOf(c, q) : -1; }
    else end = body.indexOf(c);
    if (end < 0) break;
    label = body.slice(0, end).replace(/^"|"$/g, "");
    len += o.length + end + c.length;
    break;
  }
  const cls = s.slice(len).match(/^:::[\w-]+/);
  if (cls) len += cls[0].length;
  return { id: m[1], label, len };
}
