// Sequence diagrams with AWS icons as participants. Spec:
//  { diagram_type:"sequence", meta:{title,...}, participants:[{id,icon,label,sublabel}],
//    groups?:[{kind,label,members:[ids]}]  (contiguous participants inside an AWS boundary),
//    messages:[{from,to,label,kind:"sync|async|return|self",desc?}  |  {note:"text", over:[ids]} ],
//    fragments?:[{kind:"loop|alt|opt|par",label,from:i,to:j,elseAt?:k,elseLabel?}] (indexes into messages) }
import { resolveIcon, iconFile, catalog, groupIconFile, didYouMean } from "./catalog.mjs";
import { GROUP_KINDS } from "./groups.mjs";
import { symbol, esc, baseCss, ARROW_MARKER, THEMES } from "./render.mjs";
import { wrapLabel } from "./layout.mjs";

const M = 40, ICON = 64, HEAD_H = ICON + 6 + 3 * 14, ROW = 54;

export function validateSequence(spec) {
  const errors = [], warnings = [];
  if (!spec.meta?.title) errors.push("meta.title is required");
  const ps = spec.participants || [];
  if (ps.length < 2) errors.push("participants needs at least two entries");
  const ids = new Set();
  ps.forEach((p) => {
    if (!/^[A-Za-z][\w-]*$/.test(p.id || "")) errors.push(`participant id "${p.id}" must match /^[A-Za-z][\\w-]*$/`);
    if (ids.has(p.id)) errors.push(`duplicate participant id "${p.id}"`);
    ids.add(p.id);
    if (!p.icon || !resolveIcon(p.icon)) errors.push(`participant "${p.id}": unknown icon "${p.icon}"${didYouMean(p.icon || "").length ? ` — did you mean: ${didYouMean(p.icon || "").join(", ")}?` : ""}`);
  });
  const msgs = spec.messages || [];
  if (!msgs.length) errors.push("messages must not be empty");
  msgs.forEach((m, i) => {
    if (m.note !== undefined) { (m.over || []).forEach((o) => { if (!ids.has(o)) errors.push(`message #${i + 1}: note over unknown participant "${o}"`); }); return; }
    if (!ids.has(m.from)) errors.push(`message #${i + 1}: unknown from "${m.from}"`);
    if (!ids.has(m.to)) errors.push(`message #${i + 1}: unknown to "${m.to}"`);
    if (m.kind && !["sync", "async", "return", "self"].includes(m.kind)) errors.push(`message #${i + 1}: kind must be sync, async, return or self`);
    if (m.kind === "self" && m.from !== m.to) errors.push(`message #${i + 1}: self messages need from === to`);
    if (m.kind !== "self" && m.from === m.to) errors.push(`message #${i + 1}: from and to are the same (use kind "self")`);
    if (!m.label) warnings.push(`message #${i + 1} has no label`);
  });
  (spec.fragments || []).forEach((f, i) => {
    if (!["loop", "alt", "opt", "par"].includes(f.kind)) errors.push(`fragment #${i + 1}: kind must be loop, alt, opt or par`);
    if (!(Number.isInteger(f.from) && Number.isInteger(f.to) && f.from >= 0 && f.to >= f.from && f.to < msgs.length)) errors.push(`fragment #${i + 1}: from/to must be message indexes (0-based, from <= to)`);
  });
  (spec.groups || []).forEach((g, i) => {
    if (!GROUP_KINDS[g.kind]) errors.push(`group #${i + 1}: unknown kind "${g.kind}"`);
    const idx = (g.members || []).map((m) => ps.findIndex((p) => p.id === m));
    if (!idx.length || idx.includes(-1)) errors.push(`group #${i + 1}: members must be participant ids`);
    else if (Math.max(...idx) - Math.min(...idx) + 1 !== idx.length) errors.push(`group #${i + 1}: members must be adjacent participants`);
  });
  return { errors, warnings };
}

export function renderSequence(spec, theme = spec.meta.theme || "light") {
  const ps = spec.participants.map((p) => ({ ...p, icon: resolveIcon(p.icon) }));
  const n = ps.length;
  const labelW = Math.max(...ps.map((p) => Math.max(...wrapLabel(p.label || "").map((l) => l.length * 6.4), (p.sublabel || "").length * 5.8)));
  const colW = Math.max(176, Math.ceil(labelW + 40));
  const x = Object.fromEntries(ps.map((p, i) => [p.id, M + colW * (i + 0.5)]));
  const hasGroups = (spec.groups || []).length > 0;
  const top = M + 76 + (hasGroups ? 48 : 0);
  const defs = new Map();
  const use = (id, file) => { if (!defs.has(id)) defs.set(id, symbol(id, file)); return id; };
  const out = [];
  const msgs = spec.messages;
  // vertical layout
  let y = top + HEAD_H + 36;
  const fragStart = new Set((spec.fragments || []).map((f) => f.from));
  const rows = msgs.map((m, mi) => {
    let h = ROW, lines = [];
    if (m.note !== undefined) { lines = wrapLabel(m.note, 34); h = 26 + lines.length * 15 + 12; }
    else {
      const span = m.kind === "self" ? 150 : Math.abs(x[m.to] - x[m.from]) - 56;
      lines = wrapLabel(m.label || "", Math.max(24, Math.floor((span + 90) / 6.1)));
      h = ROW + Math.max(0, lines.length - 1) * 14;
    }
    const pad = fragStart.has(mi) ? 22 : 0; // room for the fragment tab above the first message
    const row = { y: y + pad + (h - pad) / 2 + pad / 2, top: y, h: h + pad, lines };
    y += h + pad;
    return row;
  });
  const bottom = y + 30;
  const width = M * 2 + colW * n;
  const height = bottom + M;
  const steps = [];
  let stepNo = 0;

  out.push(`<text class="title" x="${M}" y="${M + 6}">${esc(spec.meta.title)}</text>`);
  if (spec.meta.subtitle) out.push(`<text class="subtitle" x="${M}" y="${M + 30}">${esc(spec.meta.subtitle)}</text>`);

  // boundary groups behind participants + lifelines
  for (const g of spec.groups || []) {
    const st = GROUP_KINDS[g.kind];
    const idx = g.members.map((m) => ps.findIndex((p) => p.id === m));
    const x0 = M + colW * Math.min(...idx) + 8, x1 = M + colW * (Math.max(...idx) + 1) - 8;
    const gy = top - 48, label = g.label ?? st.label;
    const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : "";
    out.push(`<g class="group"><rect x="${x0}" y="${gy}" width="${x1 - x0}" height="${bottom - gy}" fill="${st.fillLight === "none" ? "none" : st.fillLight}" stroke="${g.color || st.color}" stroke-width="1.25"${dash}/>`);
    if (st.icon) { const f = groupIconFile(st.icon, false); out.push(`<use href="#${use("grp-" + st.icon, f)}" x="${x0}" y="${gy}" width="32" height="32"/>`); }
    if (label) out.push(`<text class="glabel" x="${x0 + (st.icon ? 40 : 10)}" y="${gy + (st.icon ? 21 : 20)}">${esc(label)}</text>`);
    out.push(`</g>`);
  }
  // lifelines
  for (const p of ps) out.push(`<line class="life" x1="${x[p.id]}" y1="${top + ICON + 6 + 3 * 14}" x2="${x[p.id]}" y2="${bottom - 10}"/>`);

  // fragments (drawn under messages)
  for (const f of spec.fragments || []) {
    const used = msgs.slice(f.from, f.to + 1).flatMap((m) => (m.note !== undefined ? m.over || [] : [m.from, m.to]));
    const cols = used.map((id) => ps.findIndex((p) => p.id === id));
    const x0 = M + colW * Math.min(...cols) + colW * 0.5 - 70, x1 = M + colW * Math.max(...cols) + colW * 0.5 + 70;
    const y0 = rows[f.from].top + 2, y1 = rows[f.to].top + rows[f.to].h - 2;
    out.push(`<g class="frag"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none"/><path class="fragtab" d="M${x0} ${y0} h${Math.max(54, (f.label || "").length * 6 + 58)} v18 l-8 8 h-${Math.max(54, (f.label || "").length * 6 + 58) - 8} z"/><text class="fraglabel" x="${x0 + 6}" y="${y0 + 14}">${esc(f.kind)}${f.label ? ` [${esc(f.label)}]` : ""}</text>`);
    if (f.elseAt !== undefined && rows[f.elseAt]) out.push(`<line class="fragelse" x1="${x0}" y1="${rows[f.elseAt].top}" x2="${x1}" y2="${rows[f.elseAt].top}"/><text class="fraglabel" x="${x0 + 6}" y="${rows[f.elseAt].top + 14}">${esc(f.elseLabel ? `[${f.elseLabel}]` : "[else]")}</text>`);
    out.push(`</g>`);
  }

  // messages
  msgs.forEach((m, i) => {
    const r = rows[i];
    if (m.note !== undefined) {
      const over = (m.over && m.over.length ? m.over : [ps[0].id]).map((id) => x[id]);
      const cx = (Math.min(...over) + Math.max(...over)) / 2, w = Math.max(160, Math.max(...over) - Math.min(...over) + 80);
      out.push(`<g class="note"><rect x="${cx - w / 2}" y="${r.top + 6}" width="${w}" height="${r.h - 12}"/>${r.lines.map((ln, k) => `<text x="${cx}" y="${r.top + 24 + k * 15}" text-anchor="middle">${esc(ln)}</text>`).join("")}</g>`);
      return;
    }
    const kind = m.kind || "sync";
    const x1 = x[m.from], x2 = x[m.to];
    const dash = kind === "return" ? ' stroke-dasharray="6 4"' : "";
    out.push(`<g class="edge" data-from="${esc(m.from)}" data-to="${esc(m.to)}" data-step="${m.step === false ? "" : stepNo + 1}" data-label="${esc(m.label || "")}">`);
    let bx, by = r.y;
    if (kind === "self") {
      out.push(`<path class="eline" fill="none" stroke-width="2" d="M${x1} ${r.y - 12} h40 v24 h-40" marker-end="url(#arw)"/>`);
      r.lines.forEach((ln, k) => out.push(`<text class="elabel" x="${x1 + 50}" y="${r.y + 4 + k * 14 - (r.lines.length - 1) * 7}">${esc(ln)}</text>`));
      bx = x1 + 22; by = r.y - 12;
    } else {
      out.push(`<path class="eline" fill="none" stroke-width="2"${dash} d="M${x1} ${r.y} H${x2}" marker-end="url(#arw)"/>`);
      if (kind === "async") out.push(`<circle class="asyncdot" cx="${x1}" cy="${r.y}" r="3.5"/>`);
      const cx = (x1 + x2) / 2;
      r.lines.forEach((ln, k) => out.push(`<text class="elabel" x="${cx}" y="${r.y - 8 - (r.lines.length - 1 - k) * 14}" text-anchor="middle">${esc(ln)}</text>`));
      bx = x1 + Math.sign(x2 - x1) * 18;
    }
    if (m.step !== false && kind !== "return") {
      stepNo++;
      out.push(`<g class="badge"><circle cx="${bx}" cy="${by}" r="11"/><text x="${bx}" y="${by + 4.5}" text-anchor="middle">${stepNo}</text></g>`);
      steps.push({ step: stepNo, from: m.from, to: m.to, label: m.label, desc: m.desc });
    }
    out.push(`</g>`);
  });

  // participants on top (so lifelines start under them)
  for (const p of ps) {
    const sym = use(p.icon.kind === "service" ? "svc-" + p.icon.entry.key : `${p.icon.kind === "resource" ? "res" : "gen"}-${p.icon.entry.key}`, iconFile(p.icon.entry));
    const cx = x[p.id];
    const lines = wrapLabel(p.label || "");
    out.push(`<g class="node" data-id="${esc(p.id)}" data-label="${esc(p.label || p.id)}" data-service="${esc(p.icon.entry.name)}" data-category="${esc(p.icon.entry.category || "General")}"><title>${esc(p.label || p.id)} (${esc(p.icon.entry.name)})</title><use href="#${sym}" x="${cx - ICON / 2}" y="${top}" width="${ICON}" height="${ICON}"/>`);
    lines.forEach((ln, k) => out.push(`<text class="nlabel" x="${cx}" y="${top + ICON + 17 + k * 14}" text-anchor="middle">${esc(ln)}</text>`));
    if (p.sublabel) out.push(`<text class="nsub" x="${cx}" y="${top + ICON + 17 + lines.length * 14}" text-anchor="middle">${esc(p.sublabel)}</text>`);
    out.push(`</g>`);
  }

  const extra = `
.aws .life{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 4;opacity:.7}
.aws .asyncdot{fill:var(--line)}
.aws .note rect{fill:none;stroke:var(--muted);stroke-width:1.25}.aws .note text{font-size:11.5px}
.aws .frag rect{stroke:var(--muted);stroke-width:1.25}.aws .fragtab{fill:var(--bg);stroke:var(--muted);stroke-width:1.25}
.aws .fraglabel{font-size:11px;font-weight:700}.aws .fragelse{stroke:var(--muted);stroke-dasharray:6 4}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="aws theme-${theme}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(spec.meta.title)}">
<title>${esc(spec.meta.title)}</title>
<style>${baseCss()}${extra}</style>
<defs>${ARROW_MARKER}${[...defs.values()].join("")}</defs>
<rect class="bg" width="${width}" height="${height}"/>
${out.join("\n")}
</svg>`;
  // adapter for the Well-Architected review and the page's flow list
  const nodes = Object.fromEntries(ps.map((p) => [p.id, { id: p.id, item: p, icon: p.icon, parent: (spec.groups || []).find((g) => g.members.includes(p.id)) ? "g:" + (spec.groups || []).findIndex((g) => g.members.includes(p.id)) : null }]));
  const groups = (spec.groups || []).map((g, i) => ({ id: "g:" + i, kind: g.kind, label: g.label, parent: null, item: g }));
  return { svg, width, height, steps, model: { nodes, groups }, reviewSpec: { ...spec, edges: msgs.filter((m) => m.note === undefined).map((m) => ({ from: m.from, to: m.to })) } };
}
