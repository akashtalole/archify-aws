#!/usr/bin/env node
// Copies the generated example pages (HTML, SVG, PNG, draw.io) into docs/live/ so the MkDocs site can link to the
// real, interactive output. docs/live is git-ignored: it is rebuilt from examples/ on every docs build.
//   node scripts/stage-docs.mjs && mkdocs serve
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "docs", "live");
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

const sources = [
  ["examples/out", ""], ["examples/compliance/out", "compliance-"], ["examples/compliance-agentcore/out", "compliance-agentcore-"],
  ["examples/iac", "iac-"], ["examples/mermaid", "mermaid-"],
];
let n = 0;
for (const [dir, prefix] of sources) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!/\.(html|svg|png|drawio)$/.test(f)) continue;
    fs.copyFileSync(path.join(abs, f), path.join(dest, prefix + f));
    n++;
  }
}
console.log(`staged ${n} files into docs/live/`);
