import { validateSpec } from "./spec.mjs";
import { layoutSpec, K } from "./layout.mjs";
import { routeEdge } from "./route.mjs";

/** validate -> layout -> route. Throws on invalid spec; returns {model, warnings}. */
export function buildModel(spec) {
  const { errors, warnings } = validateSpec(spec);
  if (errors.length) { const e = new Error("Invalid spec:\n - " + errors.join("\n - ")); e.errors = errors; throw e; }
  const L = layoutSpec(spec);
  warnings.push(...L.warnings);
  const boxOf = (id) => {
    if (L.nodes[id]) { const n = L.nodes[id]; return { id, box: n.iconRect, bottomPad: n.cell.h - n.iconRect.h, cell: { x: n.iconRect.x, y: n.cell.y, w: n.iconRect.w, h: n.cell.h }, isNode: true }; }
    const g = L.groups.find((x) => x.id === id);
    // L/R ports sit on the group's icon centre line so links to aligned neighbours stay straight
    return { id, box: { ...g.rect, cy: g.anchorY }, bottomPad: 0, cell: null, isNode: false };
  };
  const allCells = Object.values(L.nodes).map((n) => ({ id: n.id, ...n.cell }));
  const bounds = { x: 8, y: K.MARGIN + 20, w: L.width - 16, h: L.height - K.MARGIN - 12 };
  // group headers (icon + label) are soft obstacles: lines should not run through their text
  const headers = L.groups.filter((g) => g.label || g.item.icon || g.kind).map((g) => ({
    id: g.id, x: g.rect.x, y: g.rect.y, w: Math.min(g.rect.w, 40 + Math.ceil((g.label || "").length * K.CHAR) + 8), h: 32,
  }));
  const borders = L.groups.flatMap((g) => {
    const { x, y, w, h } = g.rect;
    return [[[x, y], [x + w, y]], [[x, y + h], [x + w, y + h]], [[x, y], [x, y + h]], [[x + w, y], [x + w, y + h]]];
  });
  const regions = L.groups.map((g) => ({ id: g.id, ...g.rect }));
  const placed = [];
  const routes = [];
  // straight (aligned) connections claim their lines first; the rest are routed around them
  const aligned = (e) => { const a = boxOf(e.from).box, b = boxOf(e.to).box; return Math.abs((a.cy ?? a.y + a.h / 2) - (b.cy ?? b.y + b.h / 2)) < 2 || Math.abs(a.x + a.w / 2 - b.x - b.w / 2) < 2 ? 0 : 1; };
  const ordered = (spec.edges || []).map((e, i) => ({ e, i, al: aligned(e) })).sort((a, b) => a.al - b.al || (a.e.step ?? 1e3) - (b.e.step ?? 1e3) || a.i - b.i);
  for (const { e } of ordered) {
    const a = boxOf(e.from), b = boxOf(e.to);
    const obstacles = allCells.filter((c) => c.id !== e.from && c.id !== e.to).map((c) => ({ x: c.x - 3, y: c.y - 3, w: c.w + 6, h: c.h + 6 }));
    const soft = headers.filter((h) => h.id !== e.from && h.id !== e.to);
    const r = routeEdge(a, b, obstacles, placed, bounds, soft, borders, regions);
    if (r.score >= 6000) warnings.push(`edge ${e.from} -> ${e.to}: no clean route found (it crosses another node); move nodes or reorder children`);
    placed.push(r.pts);
    routes.push({ edge: e, pts: r.pts, score: r.score });
  }
  return { model: { ...L, routes }, warnings };
}
