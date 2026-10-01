// Layered placement of a graph into nested row/column/stack containers (used by Mermaid and IaC import).
// items: [{id, label, icon, children?: items, kind?}], edges: [{from,to,label,dashed}]. dir: "LR" | "TD".
export function layerItems(items, edges, dir = "LR", depth = 0) {
  if (items.length <= 1) return items.map(strip);
  const owner = new Map();
  const mark = (it, top) => { owner.set(it.id, top); for (const c of it.children || []) mark(c, top); };
  items.forEach((it) => mark(it, it.id));
  // edges between distinct top-level items, cycle edges dropped so layering terminates
  const pairs = [];
  const seen = new Set();
  for (const e of edges) {
    const a = owner.get(e.from), b = owner.get(e.to);
    if (!a || !b || a === b) continue;
    const k = a + ">" + b;
    if (!seen.has(k)) { seen.add(k); pairs.push([a, b]); }
  }
  const adj = new Map(items.map((i) => [i.id, []]));
  pairs.forEach(([a, b]) => adj.get(a).push(b));
  const state = new Map(), back = new Set();
  const dfs = (u) => { state.set(u, 1); for (const v of adj.get(u)) { if (state.get(v) === 1) back.add(u + ">" + v); else if (!state.get(v)) dfs(v); } state.set(u, 2); };
  items.forEach((i) => { if (!state.get(i.id)) dfs(i.id); });
  const dag = pairs.filter(([a, b]) => !back.has(a + ">" + b));
  const layer = new Map(items.map((i) => [i.id, 0]));
  for (let pass = 0; pass < items.length; pass++) { let ch = false; for (const [a, b] of dag) if (layer.get(b) < layer.get(a) + 1) { layer.set(b, layer.get(a) + 1); ch = true; } if (!ch) break; }
  const nLayers = Math.max(...layer.values()) + 1;
  const cols = Array.from({ length: nLayers }, () => []);
  items.forEach((i) => cols[layer.get(i.id)].push(i));
  // order within a layer by the average position of predecessors (reduces crossings)
  const pos = new Map();
  cols.forEach((col, ci) => {
    if (ci > 0) col.sort((x, y) => bary(x.id, dag, pos) - bary(y.id, dag, pos));
    col.forEach((it, k) => pos.set(it.id, k));
  });
  const colNodes = cols.filter((c) => c.length).map((col, i) => ({ id: `layer${depth}_${i}`, kind: "stack", layout: dir === "LR" ? "column" : "row", gap: dir === "LR" ? 56 : 64, children: col.map(strip) }));
  return colNodes.length === 1 ? colNodes[0].children : colNodes;
  function strip(it) { return it.children ? { ...it, children: layerItems(it.children, edges, dir === "LR" ? "LR" : "TD", depth + 1), layout: dir === "LR" ? "row" : "column", gap: 56 } : it; }
}
const bary = (id, dag, pos) => { const ps = dag.filter(([, b]) => b === id).map(([a]) => pos.get(a) ?? 0); return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 0; };
