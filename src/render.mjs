import fs from "node:fs";
import { GROUP_KINDS } from "./groups.mjs";
import { catalog, resolveIcon, iconFile, groupIconFile } from "./catalog.mjs";
import { K } from "./layout.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const symCache = new Map();
/** Turn an AWS icon SVG file into a <symbol>, namespacing ids so gradients never collide. */
export function symbol(symId, file) {
  if (symCache.has(symId + file)) return symCache.get(symId + file);
  let svg = fs.readFileSync(file, "utf8").replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = svg.match(/<svg\b([^>]*)>/);
  const vb = (root[1].match(/viewBox="([^"]+)"/) || [])[1] || "0 0 64 64";
  let inner = svg.slice(root.index + root[0].length, svg.lastIndexOf("</svg>")).replace(/<title>[\s\S]*?<\/title>/g, "").replace(/<desc>[\s\S]*?<\/desc>/g, "");
  const ids = [...inner.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of new Set(ids)) {
    const n = `${symId}__${id}`.replace(/[^\w-]/g, "_");
    const esc2 = id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    inner = inner.replace(new RegExp(`\\bid="${esc2}"`, "g"), `id="${n}"`)
      .replace(new RegExp(`url\\(#${esc2}\\)`, "g"), `url(#${n})`)
      .replace(new RegExp(`href="#${esc2}"`, "g"), `href="#${n}"`);
  }
  const out = `<symbol id="${symId}" viewBox="${vb}">${inner.trim()}</symbol>`;
  symCache.set(symId + file, out);
  return out;
}

export const THEMES = {
  light: { bg: "#ffffff", fg: "#000000", muted: "#545b64", line: "#232F3E", halo: "#ffffff", badge: "#000000", badgeFg: "#ffffff" },
  dark: { bg: "#161E2D", fg: "#ffffff", muted: "#aab4c3", line: "#d5dbdb", halo: "#161E2D", badge: "#ffffff", badgeFg: "#000000" },
};
export const cssVars = (t) => Object.entries(THEMES[t]).map(([k, v]) => `--${k}:${v}`).join(";");

export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function pathD(pts) { return pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" "); }
export const segLen = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/** Returns the standalone SVG markup. */
export function renderSvg(model, spec, theme = spec.meta.theme || "light") {
  const { nodes, groups, routes, width, height } = model;
  const defs = new Map();
  const use = (symId, file) => { if (!defs.has(symId)) defs.set(symId, symbol(symId, file)); return symId; };
  const body = [];

  // title
  body.push(`<text class="title" x="${K.MARGIN}" y="${K.MARGIN + 6}">${esc(spec.meta.title)}</text>`);
  if (spec.meta.subtitle) body.push(`<text class="subtitle" x="${K.MARGIN}" y="${K.MARGIN + 30}">${esc(spec.meta.subtitle)}</text>`);

  // groups, outermost first
  for (const g of [...groups].sort((a, b) => a.depth - b.depth)) {
    const st = GROUP_KINDS[g.kind] || GROUP_KINDS.generic;
    let color = g.item.color || st.color, iconUse = null, iconUseDark = null;
    if (g.kind === "custom") {
      const ic = resolveIcon(g.item.icon);
      color = g.item.color || catalog.categories[ic.entry.category] || color;
      iconUse = use("svc-" + ic.entry.key, iconFile(ic.entry));
    } else if (st.icon) {
      const f = groupIconFile(st.icon, false), fd = groupIconFile(st.icon, true);
      iconUse = use("grp-" + st.icon, f);
      if (fd && fd !== f) iconUseDark = use("grp-" + st.icon + "-dark", fd);
    }
    const r = g.rect;
    const fill = st.fillLight === "none" ? "none" : theme === "dark" ? st.fillDark : st.fillLight;
    body.push(`<g class="group" data-id="${esc(g.id || "")}">`);
    body.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${color}" stroke-width="1.25"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""} data-fill-light="${st.fillLight}" data-fill-dark="${st.fillDark}" class="grect"/>`);
    if (iconUse) {
      if (iconUseDark) {
        body.push(`<use class="only-light" href="#${iconUse}" x="${r.x}" y="${r.y}" width="32" height="32"/>`);
        body.push(`<use class="only-dark" href="#${iconUseDark}" x="${r.x}" y="${r.y}" width="32" height="32"/>`);
      } else body.push(`<use href="#${iconUse}" x="${r.x}" y="${r.y}" width="32" height="32"/>`);
    }
    if (g.label) body.push(`<text class="glabel" x="${r.x + (iconUse ? 40 : 10)}" y="${r.y + (iconUse ? 21 : 20)}">${esc(g.label)}</text>`);
    body.push(`</g>`);
  }

  // edges: badges first (they claim space), then labels on the longest free segment
  const steps = [];
  const taken = Object.values(nodes).map((n) => ({ x: n.cell.x, y: n.cell.y, w: n.cell.w, h: n.cell.h }));
  const segRects = routes.flatMap((rt, ri) => rt.pts.slice(0, -1).map((p, k) => ({ ri, a: p, b: rt.pts[k + 1] })));
  const lineHit = (r, self) => segRects.some((sg) => sg.ri !== self && Math.max(sg.a[0], sg.b[0]) > r.x && Math.min(sg.a[0], sg.b[0]) < r.x + r.w && Math.max(sg.a[1], sg.b[1]) > r.y && Math.min(sg.a[1], sg.b[1]) < r.y + r.h);
  const hit = (r) => taken.some((t) => r.x < t.x + t.w && r.x + r.w > t.x && r.y < t.y + t.h && r.y + r.h > t.y);
  const at = (a, b, d) => { const l = segLen(a, b) || 1, t = Math.min(1, d / l); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const badgePos = routes.map((rt, ri) => {
    if (rt.edge.step === undefined) return null;
    const pts = rt.pts;
    const opts = [];
    for (const d of [24, 44, 64]) opts.push(at(pts[0], pts[1], d));
    for (const d of [24, 44]) opts.push(at(pts[pts.length - 1], pts[pts.length - 2], d));
    const pick = opts.find((o) => !lineHit({ x: o[0] - 12, y: o[1] - 12, w: 24, h: 24 }, ri) && !taken.some((t) => o[0] + 12 > t.x && o[0] - 12 < t.x + t.w && o[1] + 12 > t.y && o[1] - 12 < t.y + t.h && t.badge)) || opts[0];
    taken.push({ x: pick[0] - 12, y: pick[1] - 12, w: 24, h: 24, badge: true });
    return pick;
  });
  const labelPos = routes.map((rt, ri) => {
    const e = rt.edge, pts = rt.pts;
    if (!e.label) return null;
    const tw = Math.ceil(e.label.length * 6.1);
    const segs = pts.slice(0, -1).map((p, k) => ({ k, len: segLen(p, pts[k + 1]) })).sort((a, b) => b.len - a.len);
    let first = null;
    for (const sg of segs) {
      const [a, b] = [pts[sg.k], pts[sg.k + 1]];
      const horiz = a[1] === b[1];
      for (const t of [0.5, 0.35, 0.65, 0.22, 0.78]) {
        const cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t;
        const r = horiz ? { x: cx - tw / 2, y: cy - 22, w: tw, h: 16 } : { x: cx + 18, y: cy - 8, w: tw, h: 16 };
        const cand = { r, horiz, cx, cy };
        first ??= cand;
        if (sg.len >= tw + 12 * horiz && !hit(r) && !lineHit(r, ri)) { taken.push(r); return cand; }
      }
    }
    taken.push(first.r);
    return first;
  });
  routes.forEach((rt, i) => {
    const e = rt.edge, pts = rt.pts;
    const dash = e.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
    const arrow = e.arrow || "end";
    const mk = `${arrow === "none" ? "" : ' marker-end="url(#arw)"'}${arrow === "both" ? ' marker-start="url(#arw)"' : ""}`;
    body.push(`<g class="edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-step="${e.step ?? ""}">`);
    body.push(`<path d="${pathD(pts)}" fill="none" class="eline" stroke-width="2"${dash}${mk}/>`);
    const lp = labelPos[i];
    if (lp) body.push(lp.horiz
      ? `<text class="elabel" x="${lp.cx}" y="${lp.cy - 8}" text-anchor="middle">${esc(e.label)}</text>`
      : `<text class="elabel" x="${lp.cx + 18}" y="${lp.cy + 4}" text-anchor="start">${esc(e.label)}</text>`);
    const bp = badgePos[i];
    if (bp) {
      body.push(`<g class="badge"><circle cx="${bp[0]}" cy="${bp[1]}" r="11"/><text x="${bp[0]}" y="${bp[1] + 4.5}" text-anchor="middle">${e.step}</text></g>`);
      steps.push(e);
    }
    body.push(`</g>`);
  });

  // nodes
  for (const n of Object.values(nodes)) {
    const sym = use(n.icon.kind === "service" ? "svc-" + n.icon.entry.key : `${n.icon.kind === "resource" ? "res" : "gen"}-${n.icon.entry.key}`, iconFile(n.icon.entry));
    const ir = n.iconRect, cx = ir.x + ir.w / 2;
    body.push(`<g class="node" data-id="${esc(n.id)}" data-label="${esc(n.item.label || n.id)}" data-service="${esc(n.icon.entry.name)}" data-category="${esc(n.icon.entry.category || "General")}"><title>${esc(n.item.label || n.id)} (${esc(n.icon.entry.name)})</title>`);
    body.push(`<use href="#${sym}" x="${ir.x}" y="${ir.y}" width="${ir.w}" height="${ir.h}"/>`);
    n.lines.forEach((ln, i) => body.push(`<text class="nlabel" x="${cx}" y="${ir.y + ir.h + 17 + i * K.LINE}" text-anchor="middle">${esc(ln)}</text>`));
    if (n.item.sublabel) body.push(`<text class="nsub" x="${cx}" y="${ir.y + ir.h + 17 + n.lines.length * K.LINE}" text-anchor="middle">${esc(n.item.sublabel)}</text>`);
    body.push(`</g>`);
  }

  const css = baseCss();

  const marker = ARROW_MARKER;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="aws theme-${theme}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(spec.meta.title)}">
<title>${esc(spec.meta.title)}</title>
<style>${css}</style>
<defs>${marker}${[...defs.values()].join("")}</defs>
<rect class="bg" width="${width}" height="${height}"/>
${body.join("\n")}
</svg>`;
}

export function baseCss() {
  return `.aws{${cssVars("light")}}
.aws.theme-dark{${cssVars("dark")}}
.aws .bg{fill:var(--bg)}
.aws text{font-family:Arial,Helvetica,sans-serif;fill:var(--fg)}
.aws .title{font-size:22px;font-weight:700}
.aws .subtitle{font-size:13px;fill:var(--muted)}
.aws .glabel,.aws .nlabel,.aws .elabel{font-size:12px}
.aws .nsub{font-size:10.5px;fill:var(--muted)}
.aws .elabel{paint-order:stroke;stroke:var(--halo);stroke-width:4px;stroke-linejoin:round}
.aws .eline{stroke:var(--line)}
.aws .arw{fill:none;stroke:var(--line);stroke-width:1.6}
.aws .badge circle{fill:var(--badge)}
.aws .badge text{fill:var(--badgeFg);font-weight:700;font-size:12px}
.aws .only-dark{display:none}.aws.theme-dark .only-dark{display:inline}.aws.theme-dark .only-light{display:none}
.aws.theme-dark .grect[data-fill-dark="none"]{fill:none}
.aws .dim{opacity:.18}.aws .hl .eline{stroke-width:3}
.aws .edge,.aws .node{transition:opacity .12s}`;
}
export const ARROW_MARKER = `<marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="arw" d="M1.5 1.5 L8.5 5 L1.5 8.5"/></marker>`;
