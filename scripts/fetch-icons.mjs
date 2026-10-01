#!/usr/bin/env node
// Downloads the official AWS Architecture Icons package, extracts only the SVGs
// (service @64, resource @48, category, group) into assets/aws-icons/ and
// rebuilds data/catalog.json. The icons are NOT committed to this repo: AWS
// distributes them under its own terms (https://aws.amazon.com/architecture/icons/).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readZip } from "../src/zip.mjs";
import { buildCatalog } from "../src/catalog-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_URL =
  "https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip";

const args = process.argv.slice(2);
const zipArg = args.find((a) => a.endsWith(".zip") && fs.existsSync(a));
const url = args.find((a) => a.startsWith("http")) || process.env.ARCHIFY_AWS_ICON_URL || DEFAULT_URL;
const out = path.resolve(process.env.ARCHIFY_AWS_ICONS || path.join(root, "assets", "aws-icons"));

let buf;
if (zipArg) buf = fs.readFileSync(zipArg);
else {
  console.error(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  buf = Buffer.from(await res.arrayBuffer());
}

const keep = (n) =>
  n.endsWith(".svg") &&
  !n.startsWith("__MACOSX") &&
  (/Architecture-Service-Icons_[^/]+\/Arch_[^/]+\/64\//.test(n) ||
    /Resource-Icons_[^/]+\/Res_[^/]+\/(Res_48_Light\/)?[^/]*_48(_Light)?\.svg$/.test(n) ||
    /Category-Icons_[^/]+\/Arch-Category_32\//.test(n) ||
    /Architecture-Group-Icons_[^/]+\//.test(n));

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
for (const e of readZip(buf)) {
  if (e.isDir || !keep(e.name)) continue;
  // flatten to <kind>/<category>/<file>.svg
  const parts = e.name.split("/");
  const file = parts[parts.length - 1];
  const kind = parts[0].startsWith("Architecture-Service") ? "service"
    : parts[0].startsWith("Resource") ? "resource"
    : parts[0].startsWith("Category") ? "category" : "group";
  const cat = kind === "service" || kind === "resource" ? parts[1].replace(/^(Arch|Res)_/, "") : "_";
  const dest = path.join(out, kind, cat, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, e.data());
  n++;
}
console.error(`Extracted ${n} SVG icons to ${path.relative(process.cwd(), out)}`);
const cat = buildCatalog(out);
fs.writeFileSync(path.join(root, "data", "catalog.json"), JSON.stringify(cat, null, 1) + "\n");
console.error(`Catalog: ${cat.services.length} services, ${cat.resources.length} resources, ${cat.groups.length} groups, ${cat.general.length} general`);
