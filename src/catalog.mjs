import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ICON_DIR = path.resolve(process.env.ARCHIFY_AWS_ICONS || path.join(ROOT, "assets", "aws-icons"));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
export const catalog = readJson("catalog.json");
export const aliases = readJson("aliases.json");

const norm = (s) => String(s).toLowerCase().trim().replace(/^(amazon|aws)[\s-]+/, "").replace(/[^a-z0-9:]+/g, "-").replace(/^-|-$/g, "");
const index = (list, f) => { const m = new Map(); for (const e of list) { const k = f(e); if (!m.has(k)) m.set(k, e); } return m; };
const svcById = index(catalog.services, (s) => s.id);
const svcByKey = index(catalog.services, (s) => norm(s.key));
const resById = index(catalog.resources, (r) => r.id);
const genById = index(catalog.general, (g) => g.id);

/** Resolve an icon reference to {kind, entry}. Accepts service ids, aliases, full keys,
 *  `res:<id>` / `resource:<id>`, `general:<id>` / `gen:<id>`. Returns null when unknown. */
export function resolveIcon(ref) {
  const raw = String(ref);
  const m = raw.match(/^(res|resource|gen|general|svc|service):(.+)$/i);
  const kind = m ? ({ res: "resource", resource: "resource", gen: "general", general: "general", svc: "service", service: "service" })[m[1].toLowerCase()] : null;
  const id = norm(m ? m[2] : raw);
  if (!kind || kind === "service") {
    const hit = svcById.get(aliases.service[id] || id) || svcByKey.get(id);
    if (hit) return { kind: "service", entry: hit };
  }
  if (!kind || kind === "resource") {
    const hit = resById.get(aliases.resource[id] || id);
    if (hit) return { kind: "resource", entry: hit };
  }
  if (!kind || kind === "general") {
    const hit = genById.get(aliases.general[id] || id);
    if (hit) return { kind: "general", entry: hit };
  }
  return null;
}

/** Ranked search over services, resources and general icons. */
export function searchIcons(query, limit = 15) {
  const toks = norm(query).split("-").filter(Boolean);
  const rows = [
    ...catalog.services.map((e) => ({ kind: "service", id: e.id, name: e.name, cat: e.category, hay: `${e.id} ${e.key} ${e.category}` })),
    ...catalog.resources.map((e) => ({ kind: "resource", id: "res:" + e.id, name: e.name, cat: e.category, hay: `${e.id} ${e.key}` })),
    ...catalog.general.map((e) => ({ kind: "general", id: "gen:" + e.id, name: e.name, cat: "General", hay: e.id })),
  ];
  const aliasHits = Object.entries(aliases.service).filter(([a]) => toks.includes(a)).map(([, v]) => v);
  return rows
    .map((r) => {
      const h = r.hay.toLowerCase().replace(/[^a-z0-9:]+/g, " ");
      let score = toks.reduce((n, t) => n + (h.includes(t) ? 1 : 0), 0);
      if (score < toks.length) return null;
      if (r.kind === "service") score += 1;
      if (aliasHits.includes(r.id)) score += 3;
      if (norm(r.id.replace(/^\w+:/, "")) === norm(query)) score += 5;
      return { ...r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit);
}

export function iconFile(entry) { return path.join(ICON_DIR, entry.file); }
export function groupIconFile(key, dark = false) {
  const g = catalog.groups.find((x) => x.key === key && !!x.dark === dark) || catalog.groups.find((x) => x.key === key);
  return g ? path.join(ICON_DIR, g.file) : null;
}
export function iconsAvailable() { return fs.existsSync(path.join(ICON_DIR, "service")); }

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
/** Closest service/alias ids for a mistyped icon reference (edit distance), for validator hints. */
export function didYouMean(ref, n = 3) {
  const q = norm(String(ref).replace(/^\w+:/, ""));
  const pool = [...new Set([...catalog.services.map((s) => s.id), ...Object.keys(aliases.service), ...catalog.general.map((g) => g.id)])];
  return pool.map((id) => ({ id, d: lev(q, id) })).filter((x) => x.d <= Math.max(2, Math.floor(q.length * 0.35))).sort((a, b) => a.d - b.d || a.id.length - b.id.length).slice(0, n).map((x) => x.id);
}
