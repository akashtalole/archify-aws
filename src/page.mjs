import { esc } from "./render.mjs";
import { PILLAR_INFO, GENAI } from "./review.mjs";

const STATUS = { gap: ["Gap", "to confirm"], consider: ["Consider", ""], ok: ["Looks good", ""] };

export function renderPage(diagram, review, theme) {
  const spec = diagram.spec;
  const svg = diagram.svg(theme);
  const steps = diagram.steps;
  const stepsHtml = steps.length ? `<section class="card"><h2>Flow</h2><ol class="steps">${steps.map((r) => `<li data-from="${esc(r.from)}" data-to="${esc(r.to)}"><span class="n">${r.step}</span><span>${r.desc ? esc(r.desc) : `${esc(r.fromLabel)} → ${esc(r.toLabel)}${r.label ? ` <em>(${esc(r.label)})</em>` : ""}`}</span></li>`).join("")}</ol></section>` : "";
  let reviewHtml = "";
  if (review) {
    const cards = Object.entries(PILLAR_INFO).map(([key, p]) => {
      const items = review.findings.filter((f) => f.pillar === key);
      if (!items.length) return "";
      const s = review.summary[key];
      return `<div class="pillar"><h3><a href="${p.url}" target="_blank" rel="noopener">${esc(p.name)}</a><span class="tally">${s.gap ? `<b class="gap">${s.gap} gap</b>` : ""}${s.consider ? `<b class="consider">${s.consider} consider</b>` : ""}${s.ok ? `<b class="ok">${s.ok} ok</b>` : ""}</span></h3>
<ul>${items.map((f) => `<li class="${f.status}" data-nodes="${esc(f.nodes.join(" "))}"><span class="chip ${f.status}">${STATUS[f.status][0]}</span><div><strong>${esc(f.title)}</strong>${f.lens === "generative-ai" ? ' <span class="lens">Gen AI Lens</span>' : ""}<p>${esc(f.detail)}</p></div></li>`).join("")}</ul></div>`;
    }).join("");
    const principles = review.genAI ? `<div class="pillar"><h3><a href="${GENAI.url}" target="_blank" rel="noopener">Generative AI Lens design principles</a></h3><ul class="plain">${GENAI.designPrinciples.map((d) => `<li><div><strong>${esc(d.name)}</strong><p>${esc(d.text)}</p></div></li>`).join("")}</ul></div>` : "";
    reviewHtml = `<section class="card"><h2>Well-Architected review <small>advisory — inferred from the services and boundaries drawn, not from configuration</small></h2><div class="pillars">${cards}${principles}</div></section>`;
  }
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
</style></head>
<body class="${theme === "dark" ? "dark" : ""}">
<header><h1>${esc(spec.meta.title)}</h1><div class="tools"><button id="theme">Light / dark</button><button id="dl">Download SVG</button></div></header>
<main>
<section class="card diagram" id="stage">${svg}</section>
${stepsHtml}${reviewHtml}
</main>
<footer>Generated by archify-aws · AWS Architecture Icons © Amazon Web Services, Inc. or its affiliates · Review is advisory</footer>
<script>
(()=>{const svg=document.querySelector("svg.aws"),body=document.body;
const setTheme=t=>{svg.classList.toggle("theme-dark",t==="dark");svg.classList.toggle("theme-light",t!=="dark");body.classList.toggle("dark",t==="dark")};
document.getElementById("theme").onclick=()=>setTheme(body.classList.contains("dark")?"light":"dark");
document.getElementById("dl").onclick=()=>{const b=new Blob([svg.outerHTML],{type:"image/svg+xml"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="architecture.svg";a.click()};
const edges=[...svg.querySelectorAll(".edge")],nodes=[...svg.querySelectorAll(".node")];
const focus=ids=>{if(!ids){svg.querySelectorAll(".dim,.hl").forEach(e=>e.classList.remove("dim","hl"));return}
 edges.forEach(e=>{const on=ids.has(e.dataset.from)||ids.has(e.dataset.to);e.classList.toggle("dim",!on);e.classList.toggle("hl",on)});
 nodes.forEach(n=>{const id=n.dataset.id;const on=ids.has(id)||edges.some(e=>(e.dataset.from===id&&ids.has(e.dataset.to))||(e.dataset.to===id&&ids.has(e.dataset.from)));n.classList.toggle("dim",!on)})};
nodes.forEach(n=>{n.addEventListener("mouseenter",()=>focus(new Set([n.dataset.id])));n.addEventListener("mouseleave",()=>focus(null))});
document.querySelectorAll(".steps li").forEach(li=>{li.addEventListener("mouseenter",()=>focus(new Set([li.dataset.from,li.dataset.to])));li.addEventListener("mouseleave",()=>focus(null))});
document.querySelectorAll(".pillar li[data-nodes]").forEach(li=>{const ids=li.dataset.nodes.split(" ").filter(Boolean);if(!ids.length)return;
 li.addEventListener("mouseenter",()=>{nodes.forEach(n=>n.classList.toggle("dim",!ids.includes(n.dataset.id)));edges.forEach(e=>e.classList.add("dim"))});li.addEventListener("mouseleave",()=>focus(null))});
})();
</script></body></html>`;
}
