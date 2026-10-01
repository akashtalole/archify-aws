import { GROUP_KINDS } from "./groups.mjs";
import { resolveIcon } from "./catalog.mjs";

export const K = { ICON: 64, CHAR: 6.4, LINE: 14, GAP: 72, PAD: 24, HEADER: 40, MARGIN: 40, TITLE_H: 76 };

/** Wrap a label into at most two lines (AWS guidance), never breaking mid-word. */
export function wrapLabel(text, maxChars = 18) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}
const textW = (s) => Math.ceil(s.length * K.CHAR);

function measureNode(n, warnings) {
  let lines = n.label ? wrapLabel(n.label) : [];
  if (lines.length > 2) {
    // rebalance onto two lines using a wider limit before warning
    lines = wrapLabel(n.label, Math.ceil(n.label.length / 2) + 3);
    if (lines.length > 2) warnings.push(`node "${n.id}": label needs more than two lines (AWS guidance: max two); shorten it or use a short form`);
  }
  n._lines = lines;
  const sub = n.sublabel ? [String(n.sublabel)] : [];
  const w = Math.max(88, ...lines.map(textW), ...sub.map((s) => Math.ceil(s.length * 5.8))) + 8;
  const h = K.ICON + 6 + measure.labelLines * K.LINE;
  return { w, h };
}

function measure(item, warnings) {
  if (item.spacer !== undefined) {
    const s = item.spacer;
    item._m = { w: typeof s === "number" ? s : s.w || 0, h: typeof s === "number" ? s : s.h || 0 };
    item._anchor = item._m.h / 2;
    return item._m;
  }
  if (!item.children) { item._anchor = K.ICON / 2; return (item._m = measureNode(item, warnings)); }
  const kids = item.children.map((c) => measure(c, warnings));
  const layout = item.layout || "row";
  const gap = item.gap ?? K.GAP;
  let cw = 0, ch = 0;
  let anchor;
  if (layout === "row") {
    cw = kids.reduce((a, k) => a + k.w, 0) + gap * Math.max(0, kids.length - 1);
    if ((item.align || "center") === "center") {
      // align children on their anchors (icon centers for nodes) so connected icons share a centerline
      const base = Math.max(0, ...item.children.map((c) => c._anchor));
      item._base = base;
      ch = Math.max(0, ...item.children.map((c) => base - c._anchor + c._m.h));
      anchor = base;
    } else { ch = Math.max(0, ...kids.map((k) => k.h)); anchor = ch / 2; }
  } else if (layout === "column") {
    ch = kids.reduce((a, k) => a + k.h, 0) + gap * Math.max(0, kids.length - 1); cw = Math.max(0, ...kids.map((k) => k.w));
    let y = 0; const ys = item.children.map((c) => { const v = y + c._anchor; y += c._m.h + gap; return v; });
    anchor = (ys[0] + ys[ys.length - 1]) / 2;
  }
  else {
    const cols = item.columns || Math.ceil(Math.sqrt(kids.length));
    item._cols = cols;
    const rows = Math.ceil(kids.length / cols);
    item._colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...kids.filter((_, i) => i % cols === c).map((k) => k.w)));
    item._rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...kids.slice(r * cols, r * cols + cols).map((k) => k.h)));
    cw = item._colW.reduce((a, b) => a + b, 0) + gap * (cols - 1);
    ch = item._rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1);
    anchor = ch / 2;
  }
  if (item === measure.root) { item._m = { w: cw, h: ch }; item._anchor = anchor; return item._m; }
  const style = GROUP_KINDS[item.kind] || GROUP_KINDS.generic;
  if (item.kind === "stack") {
    item._pad = { top: 0, side: 0, bottom: 0 };
    item._m = { w: cw, h: ch };
    item._inner = { w: cw, h: ch };
    item._anchor = anchor;
    return item._m;
  }
  const label = item.label ?? style.label;
  const hasHeader = !!(label || style.icon || item.icon);
  const top = hasHeader ? K.HEADER + 8 : K.PAD;
  const labelW = hasHeader ? 32 + 10 + textW(label || "") + K.PAD : 0;
  item._pad = { top, side: K.PAD, bottom: K.PAD };
  item._label = label;
  item._m = { w: Math.max(cw + 2 * K.PAD, labelW), h: ch + top + K.PAD };
  item._inner = { w: cw, h: ch };
  item._anchor = top + anchor;
  return item._m;
}

function place(item, x, y, out, depth, parent) {
  const m = item._m;
  if (item.spacer !== undefined) return;
  if (!item.children) {
    const cx = x + m.w / 2;
    const entry = resolveIcon(item.icon);
    out.nodes[item.id] = {
      id: item.id, item, icon: entry, parent: parent?.id ?? null,
      cell: { x, y, w: m.w, h: m.h },
      iconRect: { x: cx - K.ICON / 2, y, w: K.ICON, h: K.ICON },
      lines: item._lines,
    };
    return;
  }
  const isRoot = depth === 0;
  const pad = isRoot ? { top: 0, side: 0, bottom: 0 } : item._pad;
  if (!isRoot && item.kind !== "stack") out.groups.push({ id: item.id, item, kind: item.kind, depth, rect: { x, y, w: m.w, h: m.h }, label: item._label, parent: parent?.id ?? null });
  const inner = item._inner || m;
  const ix = x + pad.side + (m.w - 2 * pad.side - inner.w) / 2;
  const iy = y + pad.top;
  const layout = item.layout || "row";
  const gap = item.gap ?? K.GAP;
  const align = item.align || "center";
  const off = (avail, sz) => (align === "start" ? 0 : align === "end" ? avail - sz : (avail - sz) / 2);
  let cx = ix, cy = iy;
  if (layout === "row") {
    for (const c of item.children) {
      const dy = align === "center" ? item._base - c._anchor : off(inner.h, c._m.h);
      place(c, cx, iy + dy, out, depth + 1, isRoot ? null : item); cx += c._m.w + gap;
    }
  } else if (layout === "column") {
    for (const c of item.children) { place(c, ix + off(inner.w, c._m.w), cy, out, depth + 1, isRoot ? null : item); cy += c._m.h + gap; }
  } else {
    const cols = item._cols;
    item.children.forEach((c, i) => {
      const r = Math.floor(i / cols), col = i % cols;
      const px = ix + item._colW.slice(0, col).reduce((a, b) => a + b + gap, 0);
      const py = iy + item._rowH.slice(0, r).reduce((a, b) => a + b + gap, 0);
      place(c, px + off(item._colW[col], c._m.w), py + off(item._rowH[r], c._m.h), out, depth + 1, isRoot ? null : item);
    });
  }
}

export function layoutSpec(spec) {
  const warnings = [];
  const root = spec.root;
  measure.root = root;
  measure.labelLines = JSON.stringify(root).includes('"sublabel"') ? 3 : 2;
  const m = measure(root, warnings);
  const out = { nodes: {}, groups: [], warnings };
  const top = K.MARGIN + K.TITLE_H;
  place(root, K.MARGIN, top, out, 0, null);
  out.width = Math.max(m.w + 2 * K.MARGIN, 520);
  out.height = top + m.h + K.MARGIN;
  // center content horizontally if the title/min width made the canvas wider
  const dx = (out.width - (m.w + 2 * K.MARGIN)) / 2;
  if (dx > 0) {
    for (const n of Object.values(out.nodes)) { n.cell.x += dx; n.iconRect.x += dx; }
    for (const g of out.groups) g.rect.x += dx;
  }
  return out;
}
