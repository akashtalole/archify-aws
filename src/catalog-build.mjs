// Builds data/catalog.json from an extracted icon directory (see scripts/fetch-icons.mjs).
import fs from "node:fs";
import path from "node:path";

const shortId = (key) =>
  key.replace(/^(Amazon|AWS)-/, "").replace(/^Elastic-Load-Balancing$/, "Elastic-Load-Balancing").toLowerCase();
const human = (key) => key.replace(/-/g, " ").replace(/\band\b/gi, (m) => m.toLowerCase());
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)])
    : [];
const firstFill = (svg) => (svg.match(/Icon-Architecture-BG[^>]*fill="(#[0-9A-Fa-f]{6})"/) || [])[1] || null;

export function buildCatalog(iconsDir) {
  const rel = (f) => path.relative(iconsDir, f).split(path.sep).join("/");
  const services = [], resources = [], groups = [], general = [], categories = {};
  for (const f of walk(path.join(iconsDir, "service")).sort()) {
    const m = path.basename(f).match(/^Arch_(.+)_64\.svg$/);
    if (!m) continue;
    const category = rel(f).split("/")[1];
    const color = firstFill(fs.readFileSync(f, "utf8"));
    if (color && !categories[category]) categories[category] = color;
    services.push({ key: m[1], id: shortId(m[1]), name: human(m[1]), category, file: rel(f) });
  }
  for (const f of walk(path.join(iconsDir, "resource")).sort()) {
    const b = path.basename(f);
    const g = b.match(/^Res_(.+?)_48(?:_Light)?\.svg$/);
    if (!g) continue;
    const category = rel(f).split("/")[1];
    if (category === "General-Icons") {
      general.push({ key: g[1], id: g[1].toLowerCase(), name: human(g[1]), file: rel(f) });
      continue;
    }
    const [svc, ...rest] = g[1].split("_");
    resources.push({
      key: g[1], id: rest.length ? `${shortId(svc)}:${rest.join("_").toLowerCase()}` : shortId(svc) + ":resource", service: svc,
      name: human(g[1].replace(/_/g, " — ")), category, file: rel(f),
    });
  }
  for (const f of walk(path.join(iconsDir, "group")).sort()) {
    const m = path.basename(f).match(/^(.+)_32(_Dark)?\.svg$/);
    if (!m) continue;
    groups.push({ key: m[1], dark: !!m[2], file: rel(f) });
  }
  return { generatedFrom: "AWS Architecture Icons release 24-2026.07.31", categories, services, resources, groups, general };
}
