// Builds data/drawio/aws4.json: every AWS shape in draw.io's built-in AWS library (mxgraph.aws4.*) with its
// palette fill colour and title, extracted from draw.io's Sidebar-AWS4.js (Apache-2.0, jgraph/drawio).
//   node scripts/build-drawio-map.mjs [path/to/Sidebar-AWS4.js]   (downloads it when no path is given)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/diagramly/sidebar/Sidebar-AWS4.js";
const src = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : await (await fetch(URL_)).text();

const out = {};
const parts = src.split(/\n\tSidebar\.prototype\.(addAWS4\w+Palette) = function/);
for (let i = 1; i < parts.length; i += 2) {
  const palette = parts[i], body = parts[i + 1], vars = {};
  for (const m of body.matchAll(/var (n\d?) = (.*?);\n/g)) {
    const fill = /fillColor=(#[0-9A-Fa-f]{6}|none)/.exec(m[2]);
    vars[m[1]] = { fill: fill ? fill[1] : null, pointer: /pointerEvents=1/.test(m[2]) };
  }
  for (const m of body.matchAll(/createVertexTemplateEntry\((n\d?) \+ 'resourceIcon;resIcon=' \+ gn \+ '\.([a-z0-9_]+);',\s*([\s\S]*?), '([^']*)', '([^']*)'/g))
    out[m[2]] = { kind: "resourceIcon", fill: vars[m[1]]?.fill ?? null, title: m[5], palette };
  for (const m of body.matchAll(/createVertexTemplateEntry\((n\d?) \+ '([a-z0-9_]+);',\s*([\s\S]*?), '([^']*)', '([^']*)'/g)) {
    if (m[2] === "resourceIcon" || out[m[2]]) continue;
    out[m[2]] = { kind: "shape", fill: vars[m[1]]?.fill ?? null, title: m[5], palette, pointer: !!vars[m[1]]?.pointer };
  }
}
if (Object.keys(out).length < 500) throw new Error(`only ${Object.keys(out).length} shapes parsed — draw.io's Sidebar-AWS4.js format may have changed`);
fs.mkdirSync(path.join(ROOT, "data", "drawio"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data", "drawio", "aws4.json"), JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} shapes (${Object.values(out).filter((v) => v.kind === "resourceIcon").length} resourceIcon) -> data/drawio/aws4.json`);
