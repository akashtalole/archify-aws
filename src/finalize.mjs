// finalize: validate -> render -> strict artifact checks -> real-browser check -> deterministic receipt.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDiagram, SpecError } from "./pipeline.mjs";
import { renderPage } from "./page.mjs";
import { svgToPng } from "./png.mjs";
import { chromeAvailable, dumpDom } from "./browser.mjs";
import { catalog, iconsAvailable } from "./catalog.mjs";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const TOOL = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export function finalize(specPath, { outHtml, theme, png = true, requireBrowser = false, review = true } = {}) {
  const stages = [];
  const stage = (name, fn) => {
    try { const detail = fn(); const st = detail?.skipped ? "skipped" : "pass"; stages.push({ name, status: st, ...(detail ? { detail } : {}) }); return detail ?? {}; }
    catch (e) { stages.push({ name, status: "fail", detail: { errors: e.errors || [e.message] } }); return null; }
  };
  const specBuf = fs.readFileSync(specPath);
  const receipt = { ok: false, tool: "archify-aws", version: TOOL, iconRelease: catalog.generatedFrom, input: { path: path.relative(process.cwd(), specPath), sha256: sha(specBuf) }, stages, outputs: {}, summary: {} };
  let d;
  const v = stage("validate", () => {
    if (!iconsAvailable()) throw new Error("AWS icons not found — run `archify-aws fetch-icons`");
    const spec = JSON.parse(specBuf.toString("utf8"));
    d = buildDiagram(spec);
    return { type: d.type, nodes: d.stats.nodes, groups: d.stats.groups, edges: d.stats.edges };
  });
  if (!v) return receipt;
  Object.assign(receipt.summary, { type: d.type, ...d.stats, size: d.size });
  const th = theme || d.spec.meta?.theme || "light";
  const html = path.resolve(outHtml || d.spec.meta?.output || specPath.replace(/\.json$/, ".html"));
  const svgFile = html.replace(/\.html$/, ".svg");
  const rev = review && d.spec.meta?.review !== false ? d.review() : null;
  const r = stage("render", () => {
    fs.mkdirSync(path.dirname(html), { recursive: true });
    fs.writeFileSync(html, renderPage(d, rev, th));
    fs.writeFileSync(svgFile, d.svg(th));
    receipt.outputs.html = { path: path.relative(process.cwd(), html), sha256: sha(fs.readFileSync(html)), bytes: fs.statSync(html).size };
    receipt.outputs.svg = { path: path.relative(process.cwd(), svgFile), sha256: sha(fs.readFileSync(svgFile)) };
    return {};
  });
  if (!r) return receipt;
  stage("check", () => {
    const page = fs.readFileSync(html, "utf8"), svg = fs.readFileSync(svgFile, "utf8");
    const problems = [];
    const real = d.warnings.filter((w) => !/used by more than one edge/.test(w));
    if (real.length) problems.push(...real.map((w) => "layout: " + w));
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    if (ids.length !== new Set(ids).size) problems.push("svg: duplicate ids (icon gradients would collide)");
    const symbols = new Set([...svg.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of svg.matchAll(/<use [^>]*href="#([^"]+)"/g)) if (!symbols.has(m[1])) problems.push(`svg: <use> references missing symbol ${m[1]}`);
    if (!/<title>[^<]+<\/title>/.test(svg)) problems.push("svg: missing <title>");
    if (/<script[^>]*\ssrc=|<link[^>]*stylesheet|@import|\bfetch\(|XMLHttpRequest|<img[^>]*src=["']?http/.test(page)) problems.push("page: external resource or network call found (output must be standalone)");
    const nodeEls = (svg.match(/class="node"/g) || []).length;
    if (nodeEls !== d.stats.nodes) problems.push(`svg: ${nodeEls} node elements but ${d.stats.nodes} nodes in the model`);
    if (problems.length) { const e = new Error("check failed"); e.errors = problems; throw e; }
    return { warnings: d.warnings.length, standalone: true };
  });
  const failedSoFar = stages.some((s) => s.status === "fail");
  if (!failedSoFar) {
    stage("browser-check", () => {
      if (!chromeAvailable()) { if (requireBrowser) throw new Error("Chrome/Chromium not found (set CHROME_PATH)"); return { skipped: "Chrome/Chromium not found" }; }
      const { dom, errors } = dumpDom(html, { search: "?check=1" });
      const m = dom.match(/<pre id="archify-check">([\s\S]*?)<\/pre>/);
      if (!m) throw new Error("viewer did not initialise (no self-check output)");
      const c = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
      const problems = [];
      if (errors.length) problems.push(...errors.map((e) => "console: " + e.slice(0, 200)));
      if (!c.ready) problems.push("viewer not ready");
      if (c.nodes !== d.stats.nodes) problems.push(`viewer found ${c.nodes} nodes, expected ${d.stats.nodes}`);
      if (c.edges !== d.stats.edges) problems.push(`viewer found ${c.edges} edges, expected ${d.stats.edges}`);
      if (c.overflowX > 0) problems.push(`page overflows horizontally by ${c.overflowX}px at 1440px`);
      if (c.minFontPx < 9) problems.push(`smallest text renders at ${c.minFontPx}px (< 9px)`);
      if (c.badUse) problems.push(`${c.badUse} icon reference(s) do not resolve in the browser`);
      if (c.selftest !== "ok") problems.push("viewer self-test: " + c.selftest);
      if (problems.length) { const e = new Error("browser check failed"); e.errors = problems; throw e; }
      return { viewport: "1440x900", minFontPx: c.minFontPx, overflowX: c.overflowX, consoleErrors: 0, viewerNodes: c.nodes, viewerEdges: c.edges };
    });
    if (png && chromeAvailable() && !stages.some((s) => s.status === "fail")) {
      stage("export-png", () => {
        const f = html.replace(/\.html$/, ".png");
        svgToPng(svgFile, f, d.size.width, d.size.height);
        receipt.outputs.png = { path: path.relative(process.cwd(), f), sha256: sha(fs.readFileSync(f)) };
        return {};
      });
    }
  }
  if (rev) receipt.review = { advisory: true, summary: rev.summary, gaps: rev.findings.filter((f) => f.status === "gap").map((f) => f.id), considerations: rev.findings.filter((f) => f.status === "consider").map((f) => f.id) };
  receipt.visualReview = "not-performed"; // finalize proves mechanics, not aesthetics: open the PNG/HTML and look
  receipt.ok = !stages.some((s) => s.status === "fail");
  return receipt;
}
