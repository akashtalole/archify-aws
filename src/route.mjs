// Orthogonal edge router: enumerates elbow routes between ports and scores them on
// obstacle collisions, bends, length, and crossings with edges routed earlier.
const STUB = 22;
const DIRS = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };

const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
function segHitsRect(a, b, r) {
  const minx = Math.min(a[0], b[0]), maxx = Math.max(a[0], b[0]), miny = Math.min(a[1], b[1]), maxy = Math.max(a[1], b[1]);
  return maxx > r.x && minx < r.x + r.w && maxy > r.y && miny < r.y + r.h;
}
function segCross(a, b, c, d) {
  const h1 = a[1] === b[1], h2 = c[1] === d[1];
  if (h1 === h2) return false;
  const [h0, h1b, v0, v1] = h1 ? [a, b, c, d] : [c, d, a, b];
  const x = v0[0], y = h0[1];
  return x > Math.min(h0[0], h1b[0]) + 1 && x < Math.max(h0[0], h1b[0]) - 1 && y > Math.min(v0[1], v1[1]) + 1 && y < Math.max(v0[1], v1[1]) - 1;
}
function overlap(a, b, c, d) {
  if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < 6) {
    return Math.max(0, Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])));
  }
  if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < 6) {
    return Math.max(0, Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])));
  }
  return 0;
}
function simplify(pts) {
  const o = [];
  for (const p of pts) {
    if (o.length && o[o.length - 1][0] === p[0] && o[o.length - 1][1] === p[1]) continue;
    o.push(p);
  }
  for (let i = o.length - 2; i > 0; i--) {
    const a = o[i - 1], b = o[i], c = o[i + 1];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) o.splice(i, 1);
  }
  return o;
}
/** Drop the port stubs (first/last STUB px) so what remains must stay clear of the endpoints' own cells. */
function trim(pts) {
  const o = pts.map((p) => p.slice());
  const cut = (from, to) => {
    const dx = Math.sign(to[0] - from[0]), dy = Math.sign(to[1] - from[1]);
    const len = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    const d = Math.min(STUB, len);
    return [from[0] + dx * d, from[1] + dy * d];
  };
  const n = o.length;
  o[0] = cut(pts[0], pts[1]);
  o[n - 1] = cut(pts[n - 1], pts[n - 2]);
  return o;
}
const portOf = (box, side, pad = 0) => {
  const cx = box.x + box.w / 2, cy = box.cy ?? box.y + box.h / 2;
  return side === "L" ? [box.x, cy] : side === "R" ? [box.x + box.w, cy] : side === "T" ? [cx, box.y] : [cx, box.y + box.h + pad];
};

/** ends: {box, cell?}. obstacles: rects to avoid. placed: previously routed polylines. */
export function routeEdge(a, b, obstacles, placed, bounds, soft = [], borders = [], regions = []) {
  // regions: groups that contain neither endpoint — a route should go around them, not through them
  const inside = (r, box) => { const cx = box.x + box.w / 2, cy = box.cy ?? box.y + box.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; };
  const foreign = regions.filter((r) => !inside(r, a.box) && !inside(r, b.box));
  const chanY = foreign.flatMap((r) => [r.y - 18, r.y + r.h + 18]), chanX = foreign.flatMap((r) => [r.x - 18, r.x + r.w + 18]);
  const cands = [];
  for (const sa of Object.keys(DIRS)) for (const sb of Object.keys(DIRS)) {
    const pa = portOf(a.box, sa, a.bottomPad || 0), pb = portOf(b.box, sb, b.bottomPad || 0);
    const da = DIRS[sa], db = DIRS[sb];
    const p1 = [pa[0] + da[0] * STUB, pa[1] + da[1] * STUB], q1 = [pb[0] + db[0] * STUB, pb[1] + db[1] * STUB];
    const hA = da[1] === 0, hB = db[1] === 0;
    const mids = [];
    const mx = (p1[0] + q1[0]) / 2, my = (p1[1] + q1[1]) / 2;
    const add = (shape) => cands.push({ pts: simplify([pa, p1, ...shape, q1, pb]), sa, sb });
    if (hA && hB) {
      for (const o of [0, -24, 24, -48, 48]) add([[mx + o, p1[1]], [mx + o, q1[1]]]);
      // detour around: via top/bottom channel
      const ys = [Math.min(p1[1], q1[1]) - 60, Math.max(p1[1], q1[1]) + 60, ...chanY];
      for (const yy of ys) add([[p1[0], yy], [q1[0], yy]]);
    } else if (!hA && !hB) {
      for (const o of [0, -24, 24, -48, 48]) add([[p1[0], my + o], [q1[0], my + o]]);
      const xs = [Math.min(p1[0], q1[0]) - 60, Math.max(p1[0], q1[0]) + 60, ...chanX];
      for (const xx of xs) add([[xx, p1[1]], [xx, q1[1]]]);
    } else if (hA && !hB) add([[q1[0], p1[1]]]);
    else add([[p1[0], q1[1]]]);
  }
  let best = null;
  for (const c of cands) {
    const pts = c.pts;
    let score = 0;
    // a route must leave and enter through the port normal, otherwise it grazes the box edge
    const dirOf = (p, q) => [Math.sign(q[0] - p[0]), Math.sign(q[1] - p[1])];
    const d0 = dirOf(pts[0], pts[1]), dn = dirOf(pts[pts.length - 1], pts[pts.length - 2]);
    if (d0[0] !== DIRS[c.sa][0] || d0[1] !== DIRS[c.sa][1] || dn[0] !== DIRS[c.sb][0] || dn[1] !== DIRS[c.sb][1]) score += 50000;
    // exits must leave away from the box (stub direction already guarantees) — penalize U-turns
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      score += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
      for (const o of obstacles) if (segHitsRect(p, q, o)) { score += 6000; }
      for (const o of soft) if (segHitsRect(p, q, o)) { score += 260; }
      // a route may leave/enter its own node only through its port stubs, never cut across it
      for (const [u, v] of borders) score += overlap(p, q, u, v) * 3;
      for (const e of placed) for (let j = 0; j < e.length - 1; j++) {
        if (segCross(p, q, e[j], e[j + 1])) score += 350;
        score += Math.max(0, overlap(p, q, e[j], e[j + 1]) - 24) * 8;
      }
      if (bounds && (q[0] < bounds.x || q[1] < bounds.y || q[0] > bounds.x + bounds.w || q[1] > bounds.y + bounds.h)) score += 3000;
    }
    // a route may leave/enter its own node only through its port stubs, never cut across it
    const core = trim(pts);
    for (let i = 0; i < core.length - 1; i++) for (const own of [a.cell, b.cell]) if (own && segHitsRect(core[i], core[i + 1], inflate(own, -1))) score += 6000;
    // arrows that end below a node's label look detached from the icon; prefer left/right/top entry
    if (a.bottomPad && c.sa === "B") score += 220;
    if (b.bottomPad && c.sb === "B") score += 220;
    if (c.sa === "T" || c.sb === "T") score += 25;
    // crossing a group that neither endpoint belongs to is confusing: it reads as passing "through" that boundary
    for (const r of foreign) for (let i = 0; i < pts.length - 1; i++) if (segHitsRect(pts[i], pts[i + 1], inflate(r, -2))) { score += 320; break; }
    score += (pts.length - 2) * 60;
    // facing penalty: leaving a side that points away from the target
    const first = pts[0], second = pts[1];
    if (!best || score < best.score) best = { pts, score, ...c };
  }
  return best;
}
