import { esc, stepText } from "./render.mjs";
import { VIEWER_CSS, VIEWER_JS } from "./viewer.mjs";
import { toDrawio } from "./drawio/export.mjs";
import { costTab, waTab, REPORT_CSS, REPORT_JS } from "./report.mjs";

export function renderPage(diagram, wa, theme, cost = null) {
  const spec = diagram.spec;
  const svg = diagram.svg(theme);
  const steps = diagram.steps;
  const stepsHtml = steps.length ? `<section class="card"><h2>Flow</h2><ol class="steps">${steps.map((r) => `<li data-step="${r.step}" data-from="${esc(r.from)}" data-to="${esc(r.to)}"><span class="n">${r.step}</span><span>${esc(stepText(r.desc, r.fromLabel, r.toLabel, r.label))}</span></li>`).join("")}</ol></section>` : "";
  const drawioXml = toDrawio(diagram);
  const costById = Object.fromEntries((cost?.nodes || []).filter((n) => n.monthlyUsd > 0).map((n) => [n.id, Math.round(n.monthlyUsd * 100) / 100]));
  const tabBtn = (id, label, extra = "") => `<button role="tab" data-tab="${id}" aria-selected="${id === "diagram"}">${label}${extra}</button>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.meta.title)} — AWS architecture</title>
<style>
:root{--pbg:#f2f3f3;--card:#fff;--ink:#16191f;--muted:#545b64;--bd:#d5dbdb;--gap:#d13212;--consider:#b36b00;--ok:#1d8102}
body.dark{--pbg:#0f1623;--card:#161E2D;--ink:#f2f3f3;--muted:#aab4c3;--bd:#2f3b4f;--gap:#ff6a4d;--consider:#f0a742;--ok:#4cc05a}
*{box-sizing:border-box}body{margin:0;background:var(--pbg);color:var(--ink);font:14px/1.5 Arial,Helvetica,sans-serif}
header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 20px;background:#232F3E;color:#fff;flex-wrap:wrap}
header h1{margin:0;font-size:16px}header .tools{display:flex;gap:8px}
button{font:inherit;padding:6px 12px;border:1px solid #fff6;background:transparent;color:#fff;border-radius:4px;cursor:pointer}button:hover{background:#fff2}
main{max-width:1500px;margin:0 auto;padding:16px;display:grid;gap:16px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:6px;padding:16px}
.card h2{margin:0 0 12px;font-size:16px}.card h2 small{font-weight:400;color:var(--muted);margin-left:8px;font-size:12px}
.diagram{overflow:auto;padding:0}.diagram svg{display:block;max-width:none;height:auto}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.steps li{display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:4px;cursor:default}.steps li:hover{background:var(--pbg)}
.n{flex:none;width:22px;height:22px;border-radius:50%;background:#000;color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center}body.dark .n{background:#fff;color:#000}
.pillars{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
.pillar{border:1px solid var(--bd);border-radius:6px;padding:12px}.pillar h3{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;gap:8px}
.pillar h3 a{color:inherit}.tally b{font-size:11px;margin-left:6px;font-weight:700}.tally .gap,.chip.gap{color:var(--gap)}.tally .consider,.chip.consider{color:var(--consider)}.tally .ok,.chip.ok{color:var(--ok)}
.pillar ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pillar li{display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:4px}.pillar li:hover{background:var(--pbg)}
.pillar li p{margin:2px 0 0;color:var(--muted);font-size:12.5px}.chip{flex:none;font-size:11px;font-weight:700;border:1px solid currentColor;border-radius:10px;padding:1px 8px;white-space:nowrap}
.lens{font-size:10px;border:1px solid var(--bd);border-radius:8px;padding:0 6px;color:var(--muted)}
footer{padding:8px 20px 24px;text-align:center;color:var(--muted);font-size:12px}
${VIEWER_CSS}
${REPORT_CSS}
</style></head>
<body class="${theme === "dark" ? "dark" : ""}">
<header><h1>${esc(spec.meta.title)}</h1><div class="tools"><button id="find" title="Find a node (/)">Find</button><button id="present" title="Presentation (p)">Present</button><button id="guide" title="Shortcuts (?)">Guide</button><button id="theme" title="Theme (t)">Light / dark</button><span class="menu"><button>Export ▾</button><span class="items"><button data-x="copy">Copy PNG</button><button data-x="png">Download PNG</button><button data-x="jpeg">Download JPEG</button><button data-x="webp">Download WebP</button><button data-x="svg">Download SVG (light + dark)</button><button data-x="drawio">Download draw.io (.drawio)</button></span></span></div></header>
<div id="bar"></div>
<nav class="tabs" role="tablist">${tabBtn("diagram", "Diagram")}${cost ? tabBtn("cost", "Cost", ` <small>${costBadge(cost)}</small>`) : ""}${wa ? tabBtn("wa", "Well-Architected review", ` <small>${waBadge(wa)}</small>`) : ""}</nav>
<main>
<div class="tab on" id="tab-diagram"><section class="card diagram" id="stage">${svg}</section>
${stepsHtml}</div>
${cost ? `<div class="tab" id="tab-cost">${costTab(cost, spec.meta.cost?.note)}</div>` : ""}
${wa ? `<div class="tab" id="tab-wa">${waTab(wa)}</div>` : ""}
</main>
<footer>Generated by archify-aws · AWS Architecture Icons © Amazon Web Services, Inc. or its affiliates · Cost is an indicative estimate and the review is advisory</footer>
<script type="application/json" id="drawio-data">${JSON.stringify(drawioXml).replace(/</g, "\\u003c")}</script>
<script>window.__archifyCost=${JSON.stringify(costById)};</script>
<script>${VIEWER_JS}</script>
<script>${REPORT_JS}</script></body></html>`;
}

const costBadge = (c) => "$" + Math.round(c.totals.monthlyUsd).toLocaleString("en-US") + "/mo";
const waBadge = (r) => { const f = r.findingCounts; return f.Critical ? f.Critical + " critical" : f.High ? f.High + " high" : r.findings.length + " finding" + (r.findings.length === 1 ? "" : "s"); };
