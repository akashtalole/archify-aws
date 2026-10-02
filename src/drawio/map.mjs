// Maps archify-aws icon catalog entries to draw.io's built-in AWS shapes (mxgraph.aws4.*).
// Names are matched against the shape table extracted from draw.io itself (data/drawio/aws4.json), so a mapped
// shape always exists in the draw.io library; anything unmatched falls back to the embedded official SVG.
import fs from "node:fs";
import { catalog } from "../catalog.mjs";

const TABLE = JSON.parse(fs.readFileSync(new URL("../../data/drawio/aws4.json", import.meta.url), "utf8"));
const norm = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, "").replace(/amazon web services|amazon|aws/g, "").replace(/[^a-z0-9]/g, "");

// Catalog id -> draw.io shape name, where the two libraries name a service differently.
const SERVICE_OVERRIDES = {
  "opensearch-service": "elasticsearch_service",
  "data-firehose": "kinesis_data_firehose",
  "elastic-load-balancing": "elastic_load_balancing",
  "cloudwatch": "cloudwatch_2",
  "efs": "elastic_file_system",
  "virtual-private-cloud": "vpc",
  "simple-storage-service-glacier": "s3_glacier",
  "augmented-ai-a2i": "augmented_ai",
  "outposts-family": "outposts",
  "simple-storage-service-glacier": "glacier",
  "fsx-for-wfs": "fsx_for_windows_file_server",
  "pinpoint-apis": "pinpoint",
  "marketplace_dark": "marketplace",
  "marketplace_light": "marketplace",
};
const SHAPE_OVERRIDES = { database: "generic_database", firewall: "generic_firewall", server: "traditional_server" };

const byTitle = new Map(), byName = new Map();
for (const [name, v] of Object.entries(TABLE)) {
  const bucket = v.kind;
  const key = (m, k) => { const kk = bucket + ":" + k; if (!m.has(kk)) m.set(kk, name); };
  key(byTitle, norm(v.title)); key(byName, norm(name));
}

/** Most common palette fill per catalog category, learnt from the services that matched. */
const categoryFill = new Map();
let learned = false;
function learn() {
  if (learned) return; learned = true;
  const tally = {};
  for (const e of Object.values(catalog.services)) {
    const m = lookupService(e); if (!m) continue;
    const f = TABLE[m.name].fill; if (!f) continue;
    ((tally[e.category] ||= {})[f] = (tally[e.category][f] || 0) + 1);
  }
  for (const [c, t] of Object.entries(tally)) categoryFill.set(c, Object.entries(t).sort((a, b) => b[1] - a[1])[0][0]);
}
export const categoryColor = (cat) => { learn(); return categoryFill.get(cat) || "#232F3D"; };

function lookupService(e) {
  const o = SERVICE_OVERRIDES[e.id];
  if (o && TABLE[o]?.kind === "resourceIcon") return { name: o, kind: "resourceIcon" };
  const n = norm(e.name);
  const hit = byTitle.get("resourceIcon:" + n) || byName.get("resourceIcon:" + n) || byName.get("resourceIcon:" + norm(e.id));
  return hit ? { name: hit, kind: "resourceIcon" } : null;
}
function lookupShape(e) {
  const o = SHAPE_OVERRIDES[e.id];
  if (o && TABLE[o]) return { name: o, kind: "shape" };
  const n = norm(e.name);
  const hit = byTitle.get("shape:" + n) || byName.get("shape:" + n) || byName.get("shape:" + norm(e.id.replace(/^res:|^gen:/, "").replace(/:.*$/, "")));
  return hit ? { name: hit, kind: "shape" } : null;
}

/** icon = resolveIcon(...) result. Returns {name, kind, fill, pointer} or null (use the embedded SVG instead). */
export function drawioShapeFor(icon) {
  const e = icon.entry;
  const m = icon.kind === "service" ? lookupService(e) : lookupShape(e) || (icon.kind === "resource" && e.service ? lookupShape({ ...e, name: e.name }) : null);
  if (!m) return null;
  const t = TABLE[m.name];
  return { name: m.name, kind: t.kind, fill: t.fill || categoryColor(e.category), pointer: !!t.pointer };
}

export const shapeCount = () => Object.keys(TABLE).length;
export const hasShape = (name) => !!TABLE[name];
