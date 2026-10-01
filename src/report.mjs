// HTML sections for the Cost and Well-Architected tabs. Pure string rendering of already-computed data.
import { esc } from "./render.mjs";

const usd = (x) => "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: x < 100 ? 2 : 0, maximumFractionDigits: x < 100 ? 2 : 0 });
const usd2 = (x) => "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const STATUS_CLASS = { "Implemented": "ok", "Partially Implemented": "part", "Not Implemented": "bad", "Not Applicable": "na", "Cannot Determine": "cd" };
const chip = (s) => `<span class="st ${STATUS_CLASS[s] || "cd"}">${esc(s)}</span>`;
const risk = (r) => `<span class="rk ${slug(r)}">${esc(r)}</span>`;
const pillarName = (r, id) => (r.pillars.concat(r.lensPillars).find((p) => p.id === id) || {}).name || id;

export function costTab(cost, note) {
  if (!cost) return `<section class="card"><h2>Cost estimate</h2><p class="muted">Cost estimation was turned off for this render.</p></section>`;
  const t = cost.totals, cov = cost.coverage;
  const cats = Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...cats.map(([, v]) => v), 1);
  const rows = cost.nodes.filter((n) => n.monthlyUsd > 0).sort((a, b) => b.monthlyUsd - a.monthlyUsd);
  const top = rows[0]?.monthlyUsd || 1;
  const asm = cost.nodes.filter((n) => n.assumptions.length && n.status !== "not-billable");
  const badge = (a) => `<span class="src ${a.source}">${a.source === "spec" ? "from spec" : a.source === "default" ? "assumed" : esc(a.source)}</span>`;
  const other = cost.nodes.filter((n) => n.monthlyUsd === 0 && n.status !== "not-billable");
  return `<section class="card"><h2>Cost estimate <small>${esc(cost.region)} · price list as of ${esc(cost.asOf)} · ${cost.confidence === "indicative" ? "indicative — some usage is assumed" : "from stated usage"}</small></h2>
<div class="tiles"><div class="tile"><b>${usd(t.monthlyUsd)}</b><span>per month</span></div><div class="tile"><b>${usd(t.annualUsd)}</b><span>per year</span></div>
<div class="tile"><b>${cov.estimated + cov.override}/${cov.nodes}</b><span>components priced</span></div><div class="tile"><b>${cov.notItemized + cov.needsInput + cov.notEstimated}</b><span>not priced (see below)</span></div></div>
<p class="muted">${esc(cost.basis)}</p>
${note ? `<p><b>Usage basis.</b> ${esc(note)}</p>` : ""}
<label class="tog"><input type="checkbox" id="costOverlay"> Show monthly cost on the diagram</label></section>
<section class="card"><h2>By category</h2><div class="bars">${cats.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${Math.max(1, 100 * v / max)}%"></i><b>${usd(v)} · ${Math.round(100 * v / t.monthlyUsd)}%</b></div>`).join("")}</div></section>
<section class="card"><h2>By component <small>click a row to highlight it on the diagram</small></h2><div class="scroll"><table class="tbl" id="costTable"><thead><tr><th>Component</th><th>Service</th><th>Status</th><th class="r">$ / month</th><th>Line items</th></tr></thead><tbody>${rows.map((n) => `<tr data-node="${esc(n.id)}"><td>${esc(n.label)}</td><td>${esc(n.service || "")}</td><td>${esc(n.status)}</td><td class="r"><span class="mini" style="width:${Math.max(2, 100 * n.monthlyUsd / top)}%"></span>${usd(n.monthlyUsd)}</td><td><details><summary>${n.lines.length} line${n.lines.length === 1 ? "" : "s"}</summary><ul class="lines">${n.lines.map((l) => `<li>${esc(l.label)}: ${Number(l.qty).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${esc(l.unit)} × ${usd2(l.rate)}${l.tiered ? " (tiered)" : ""} = <b>${usd2(l.usd)}</b></li>`).join("")}</ul>${n.notes.length ? `<p class="muted">${n.notes.map(esc).join(" ")}</p>` : ""}</details></td></tr>`).join("")}</tbody></table></div>
${other.length ? `<h3>Not priced</h3><ul class="plain">${other.map((n) => `<li><strong>${esc(n.label)}</strong> — ${esc(n.status)}${n.notes.length ? `: ${esc(n.notes.join(" "))}` : ""}</li>`).join("")}</ul>` : ""}</section>
<section class="card"><h2>Assumptions <small>${cost.defaultedAssumptions.length} defaulted — replace them with your own numbers in each node's <code>usage</code></small></h2><div class="scroll"><table class="tbl"><thead><tr><th>Component</th><th>Assumption</th><th>Value</th><th>Source</th></tr></thead><tbody>${asm.flatMap((n) => n.assumptions.map((a) => `<tr><td>${esc(n.label)}</td><td>${esc(a.key)}</td><td>${esc(typeof a.value === "object" ? JSON.stringify(a.value) : a.value)}</td><td>${badge(a)}</td></tr>`)).join("")}</tbody></table></div></section>
<section class="card"><h2>Sensitivity &amp; what-if</h2><div class="tiles">${cost.sensitivity.map((s) => `<div class="tile"><b>${usd(s.monthlyUsd)}</b><span>at ${s.scale}× traffic</span></div>`).join("")}</div>
${cost.whatIfs.length ? `<ul class="plain">${cost.whatIfs.map((w) => `<li><strong>${esc(w.title)}</strong> — ${w.monthlyDeltaUsd < 0 ? "saves" : "adds"} ${usd(Math.abs(w.monthlyDeltaUsd))}/month. <span class="muted">${esc(w.basis || "")}</span></li>`).join("")}</ul>` : `<p class="muted">No what-if options apply to these services.</p>`}</section>
<section class="card"><h2>Price list provenance</h2><p class="muted">Retrieved ${esc(cost.priceBook.retrievedAt)} from the public AWS Price List bulk API. Per-service publication dates:</p><p class="muted">${Object.entries(cost.priceBook.publications).map(([k, v]) => `${esc(k)} ${esc(v.slice(0, 10))}`).join(" · ")}</p><p class="muted">Only public on-demand rates are used. This is not a quote — confirm in the <a href="https://calculator.aws/" target="_blank" rel="noopener">AWS Pricing Calculator</a>.</p></section>`;
}

export function waTab(r) {
  if (!r) return `<section class="card"><h2>Well-Architected review</h2><p class="muted">The review was turned off for this render.</p></section>`;
  const c = r.coverage, fc = r.findingCounts;
  const pill = (p) => `<tr><td>${esc(p.name)}</td><td class="r">${p.score === null ? "—" : p.score.toFixed(1) + (p.coverage < 25 ? ' <span class="muted" title="Fewer than 25% of this pillar\'s best practices are evidenced">provisional</span>' : "")}</td><td class="r">${p.determinable}/${p.totalBps} (${p.coverage}%)</td><td>${["Implemented", "Partially Implemented", "Not Implemented", "Not Applicable", "Cannot Determine"].map((s) => `<span class="st ${STATUS_CLASS[s]}" title="${s}">${p.counts[s]}</span>`).join(" ")}</td><td>${esc(p.strength)}</td><td>${esc(p.gap)}</td></tr>`;
  const pillTable = (list) => `<div class="scroll"><table class="tbl"><thead><tr><th>Pillar</th><th class="r">Score (1–5)</th><th class="r">Evidenced BPs</th><th title="Implemented · Partial · Not implemented · N/A · Cannot determine">I · P · N · NA · CD</th><th>Strongest area</th><th>Main gap</th></tr></thead><tbody>${list.map(pill).join("")}</tbody></table></div>`;
  const qTable = (qs, label) => `<h3>${label}</h3><div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Question</th><th>Pillar</th><th>Status</th><th>Risk</th><th class="r">BPs (evidenced)</th><th>Key evidence</th></tr></thead><tbody>${qs.map((q) => `<tr><td><a href="${esc(q.question_url)}" target="_blank" rel="noopener">${esc(q.question_id)}</a></td><td>${esc(q.question)}</td><td>${esc(pillarName(r, q.pillar_id))}</td><td>${chip(q.status)}</td><td>${q.risk === "None" || q.risk === "Not Applicable" ? `<span class="muted">${esc(q.risk)}</span>` : risk(q.risk)}</td><td class="r">${q.bps} (${q.evidenced})</td><td>${esc(q.keyEvidence)}</td></tr>`).join("")}</tbody></table></div>`;
  const ledger = (rows, label, id) => rows.length ? `<h3>${label} <small>${rows.length} best practices — nothing truncated</small></h3>
<div class="filters" data-ledger="${id}"><select class="fs" aria-label="Filter by status"><option value="">All statuses</option>${["Implemented", "Partially Implemented", "Not Implemented", "Not Applicable", "Cannot Determine"].map((s) => `<option>${s}</option>`).join("")}</select><select class="fp" aria-label="Filter by pillar"><option value="">All pillars</option>${[...new Set(rows.map((x) => x.pillar_name))].map((p) => `<option>${esc(p)}</option>`).join("")}</select><input class="fq" type="search" placeholder="Search ID, title or evidence"><span class="cnt muted"></span></div>
<div class="scroll"><table class="tbl ledger" id="${id}"><thead><tr><th>ID</th><th>Pillar</th><th>Best practice</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows.map((b) => `<tr data-s="${esc(b.status)}" data-p="${esc(b.pillar_name)}"><td><a href="${esc(b.bp_url)}" target="_blank" rel="noopener">${esc(b.bp_id)}</a></td><td>${esc(b.pillar_name)}</td><td>${esc(b.bp_title)}</td><td>${chip(b.status)}</td><td>${esc(b.evidence)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const finding = (f) => `<article class="finding ${slug(f.risk)}" id="${f.id}" data-nodes="${esc(f.nodes.join(" "))}"><header><b>${f.id}</b> ${risk(f.risk)} <strong>${esc(f.title)}</strong><span class="muted"> · ${esc(pillarName(r, f.pillar))}${f.lens !== "framework" ? " · Generative AI Lens" : ""} · ${esc(f.bps.join(", "))}</span></header>
<p><b>Evidence.</b> ${esc(f.evidence)}</p><p><b>Impact × likelihood.</b> ${esc(f.impact)} × ${esc(f.likelihood)}${f.adjustment ? ` (${esc(f.adjustment)})` : ""} → ${esc(f.risk)}. <b>Status:</b> ${esc(f.status)}.</p><p><b>Recommendation.</b> ${esc(f.recommendation)}</p><p><b>Priority.</b> ${esc(f.quadrant)} · effort ${esc(f.effort)} · owner ${esc(f.owner)}</p></article>`;
  const byRisk = ["Critical", "High", "Medium", "Low"].map((k) => { const fs = r.findings.filter((f) => f.risk === k); return fs.length ? `<h3>${k} risk (${fs.length})</h3>${fs.map(finding).join("")}` : ""; }).join("");
  const fnd = r.findings.length ? byRisk : `<p>No gaps are evidenced in the diagram. That is not a clean bill of health: see the coverage audit for what could not be determined.</p>`;
  const quad = Object.entries(r.quadrants).map(([k, ids]) => `<div class="quad"><h4>${k}</h4>${ids.length ? `<ul>${ids.map((i) => `<li><a href="#${i}">${i}</a> ${esc((r.findings.find((f) => f.id === i) || {}).title)}</li>`).join("")}</ul>` : `<p class="muted">None</p>`}</div>`).join("");
  const exec = `${r.mode === "score" ? "Score-only mode. " : ""}This ${r.lens === "generative-ai" ? "Well-Architected Framework and Generative AI Lens" : "Well-Architected Framework"} review of <b>${esc(r.workload.name)}</b> (${r.criticality} criticality) assessed the architecture diagram only. ${c.framework.withEvidence} of ${c.framework.assessedBps} framework best practices${c.lens ? ` and ${c.lens.withEvidence} of ${c.lens.assessedBps} lens best practices` : ""} have diagram evidence; the rest are <i>Cannot Determine</i> because process, configuration and runtime evidence is not in the diagram. ${r.findings.length ? `It found ${fc.Critical} critical, ${fc.High} high, ${fc.Medium} medium and ${fc.Low} low risk${r.findings.length === 1 ? "" : "s"}.` : "No risks are evidenced."}${r.costLink ? ` Estimated run cost is ${usd(r.costLink.monthlyUsd)}/month (${r.costLink.confidence}).` : ""}`;
  return `<section class="card wa"><div class="banner">${esc(r.banner)}</div>
<h2>Well-Architected review <small>${esc(r.workload.name)} · ${esc(r.date)} · mode ${esc(r.mode)}${r.scope ? " · pillars " + esc(r.scope.join(", ")) : ""}</small></h2>
<h3>Coverage audit</h3><ul class="plain"><li><strong>${esc(c.framework.source)}</strong> — ${c.framework.pillars} pillars, ${c.framework.questions} questions, ${c.framework.bps} best practices, from <a href="${esc(c.framework.indexUrl)}" target="_blank" rel="noopener">the live documentation index</a>, snapshot ${esc(c.framework.retrievedAt.slice(0, 10))} (${c.framework.ageDays} day${c.framework.ageDays === 1 ? "" : "s"} old).</li>
${c.lens ? `<li><strong>${esc(c.lens.source)}</strong> — ${c.lens.questions} questions, ${c.lens.bps} best practices, snapshot ${esc(c.lens.retrievedAt.slice(0, 10))}.</li>` : ""}
<li>Assessed ${c.framework.assessedBps} framework BPs${c.lens ? ` and ${c.lens.assessedBps} lens BPs` : ""}: ${c.framework.withEvidence}${c.lens ? ` + ${c.lens.withEvidence}` : ""} with diagram evidence, ${c.framework.cannotDetermine}${c.lens ? ` + ${c.lens.cannotDetermine}` : ""} cannot be determined.</li>
<li>Evidence sources: ${c.evidenceSources.map(esc).join("; ")}.</li><li class="muted">${esc(c.freshness)} ${esc(c.limits)}</li></ul>
<h3>Executive summary</h3><p>${exec}</p>
<div class="tiles"><div class="tile crit"><b>${fc.Critical}</b><span>Critical</span></div><div class="tile high"><b>${fc.High}</b><span>High</span></div><div class="tile med"><b>${fc.Medium}</b><span>Medium</span></div><div class="tile low"><b>${fc.Low}</b><span>Low</span></div>${r.maturity ? `<div class="tile"><b>${r.maturity.score.toFixed(1)}</b><span>provisional maturity (1–5)</span></div>` : ""}</div>
${r.maturity ? `<p class="muted">${esc(r.maturity.justification)}</p>` : ""}
${r.strengths.length ? `<p><b>Strengths.</b> ${r.strengths.map(esc).join("; ")}.</p>` : ""}
<h3>Architecture overview</h3><p class="muted">The reviewed architecture is the Diagram tab (${r.workload.nodes} components, ${esc(r.workload.diagramType)} diagram). Hover a finding to highlight the components involved.</p>
<h3>Pillar scorecard</h3>${pillTable(r.pillars)}${r.lensPillars.length ? `<h3>Generative AI Lens scorecard</h3>${pillTable(r.lensPillars)}` : ""}
<p class="muted">Score = 1 + 4 × (implemented + ½ partial) ÷ evidenced BPs; shown only when ≥ 3 BPs are evidenced. It reflects evidenced practices, not the whole pillar.</p>
${r.mode === "score" ? "" : `${qTable(r.questions, "Framework questions")}${r.lensQuestions.length ? qTable(r.lensQuestions, "Generative AI Lens questions") : ""}${ledger(r.ledger, "Framework best-practice ledger", "ledger-fw")}${ledger(r.lensLedger, "Generative AI Lens best-practice ledger", "ledger-lens")}`}
<h3>Findings</h3>${fnd}
${r.toConfirm.length ? `<h3>To confirm <small>not drawn, so not counted as gaps</small></h3><ul class="plain">${r.toConfirm.map((x) => `<li><strong>${esc(x.title)}</strong> <span class="muted">${esc(x.bps.join(", "))}</span> — ${esc(x.recommendation)}</li>`).join("")}</ul>` : ""}
${r.tradeoffs.length ? `<h3>Cross-pillar trade-offs</h3><ul class="plain">${r.tradeoffs.map((x) => `<li><strong>${esc(x.title)}</strong> <span class="muted">${x.pillars.map((p) => esc(pillarName(r, p))).join(" ↔ ")}</span><br>${esc(x.detail)} <i>Resolution:</i> ${esc(x.resolution)}</li>`).join("")}</ul>` : ""}
<h3>Eisenhower prioritization</h3><div class="quads">${quad}</div>
${r.findings.length ? `<h3>Prioritized remediation plan</h3><div class="scroll"><table class="tbl"><thead><tr><th>ID</th><th>Risk</th><th>Quadrant</th><th>SMART goal</th><th>Owner</th></tr></thead><tbody>${r.findings.slice().sort((a, b) => ["Do First", "Plan", "Delegate", "Defer"].indexOf(a.quadrant) - ["Do First", "Plan", "Delegate", "Defer"].indexOf(b.quadrant)).map((f) => `<tr><td><a href="#${f.id}">${f.id}</a></td><td>${risk(f.risk)}</td><td>${esc(f.quadrant)}</td><td>${esc(f.smart)}</td><td>${esc(f.owner)}</td></tr>`).join("")}</tbody></table></div>` : ""}
<h3>Next steps</h3><ol>${r.nextSteps.map((s) => `<li><b>${s.id}</b> ${esc(s.title)} — ${esc(s.action)} <span class="muted">(${esc(s.owner)})</span></li>`).join("") || "<li>Add the missing process, configuration and runtime evidence to turn <i>Cannot Determine</i> practices into assessed ones.</li>"}<li>Re-run the review after changes, and when the architecture or documentation changes.</li></ol>
<p class="muted">${esc(r.legend.risk)}</p></section>`;
}

export const REPORT_CSS = `
.tabs{display:flex;gap:4px;max-width:1500px;margin:12px auto 0;padding:0 16px;border-bottom:1px solid var(--bd)}
.tabs button{color:var(--ink);border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;background:transparent;padding:8px 16px}
.tabs button[aria-selected=true]{background:var(--card);border-color:var(--bd);font-weight:700;margin-bottom:-1px}
.tab{display:none;gap:16px}.tab.on{display:grid}
.tiles{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}.tile{border:1px solid var(--bd);border-radius:6px;padding:10px 16px;min-width:120px}.tile b{display:block;font-size:22px}.tile span{color:var(--muted);font-size:12px}
.tile.crit b{color:#d13212}.tile.high b{color:#e07b00}.tile.med b{color:#b36b00}.tile.low b{color:#1d8102}
.bars{display:grid;gap:6px}.bar{display:grid;grid-template-columns:200px 1fr auto;gap:10px;align-items:center}.bar i{display:block;height:14px;background:#ED7100;border-radius:2px}
.scroll{overflow:auto}.tbl{border-collapse:collapse;width:100%;font-size:13px}.tbl th,.tbl td{border-bottom:1px solid var(--bd);padding:6px 8px;text-align:left;vertical-align:top}.tbl th{position:sticky;top:0;background:var(--card)}.r{text-align:right!important;white-space:nowrap}
.mini{display:inline-block;height:6px;background:#ED712066;margin-right:6px;vertical-align:middle;max-width:80px}
.lines{margin:4px 0;padding-left:18px}.tbl tr[data-node]{cursor:pointer}.tbl tr.sel{background:var(--pbg)}
.src{font-size:11px;border:1px solid var(--bd);border-radius:8px;padding:0 6px}.src.default{color:var(--consider)}.src.spec{color:var(--ok)}
.st,.rk{font-size:11px;font-weight:700;border:1px solid currentColor;border-radius:10px;padding:1px 8px;white-space:nowrap}
.st.ok{color:var(--ok)}.st.part{color:var(--consider)}.st.bad{color:var(--gap)}.st.na,.st.cd{color:var(--muted)}
.rk.critical{color:#d13212}.rk.high{color:#e07b00}.rk.medium{color:#b36b00}.rk.low{color:#1d8102}
.banner{background:#d1321215;border:1px solid var(--gap);border-radius:4px;padding:8px 12px;margin-bottom:12px;font-size:12.5px}
.wa h3{margin:20px 0 8px;font-size:14px}.wa h3 small,.card h3 small{font-weight:400;color:var(--muted)}
.finding{border:1px solid var(--bd);border-left:4px solid var(--muted);border-radius:4px;padding:8px 12px;margin:8px 0}.finding.critical{border-left-color:#d13212}.finding.high{border-left-color:#e07b00}.finding.medium{border-left-color:#b36b00}.finding.low{border-left-color:#1d8102}.finding p{margin:4px 0}
.quads{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.quad{border:1px solid var(--bd);border-radius:6px;padding:8px 12px}.quad h4{margin:0 0 4px}.quad ul{margin:0;padding-left:18px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}.filters select,.filters input{font:inherit;padding:4px 8px;background:var(--card);color:var(--ink);border:1px solid var(--bd);border-radius:4px}
.muted{color:var(--muted)}ul.plain{list-style:none;padding:0;display:grid;gap:6px}.tog{display:inline-flex;gap:6px;align-items:center;margin-top:6px}
.costtag text{font:700 12px Arial;fill:#fff;text-anchor:middle}.costtag rect{fill:#ED7100}
`;

export const REPORT_JS = `
(function(){
var tabs=[].slice.call(document.querySelectorAll(".tabs button")),panes=[].slice.call(document.querySelectorAll(".tab"));
function show(n,push){tabs.forEach(function(b){b.setAttribute("aria-selected",b.dataset.tab===n)});panes.forEach(function(p){p.classList.toggle("on",p.id==="tab-"+n)});
 if(push){try{var u=new URL(location.href);u.searchParams.set("tab",n);history.replaceState(null,"",u)}catch(e){}}}
tabs.forEach(function(b){b.addEventListener("click",function(){show(b.dataset.tab,true)})});
var q=new URLSearchParams(location.search).get("tab");if(q&&document.getElementById("tab-"+q))show(q,false);
document.querySelectorAll(".filters").forEach(function(f){var t=document.getElementById(f.dataset.ledger),rows=[].slice.call(t.tBodies[0].rows),s=f.querySelector(".fs"),p=f.querySelector(".fp"),x=f.querySelector(".fq"),c=f.querySelector(".cnt");
 function run(){var n=0,k=x.value.toLowerCase();rows.forEach(function(r){var ok=(!s.value||r.dataset.s===s.value)&&(!p.value||r.dataset.p===p.value)&&(!k||r.textContent.toLowerCase().indexOf(k)>=0);r.hidden=!ok;if(ok)n++});c.textContent=n+" of "+rows.length+" shown"}
 [s,p].forEach(function(e){e.addEventListener("change",run)});x.addEventListener("input",run);run()});
var ov=document.getElementById("costOverlay");
function money(v){return v>=100?"$"+Math.round(v).toLocaleString("en-US"):"$"+v.toFixed(2)}
if(ov)ov.addEventListener("change",function(){var NS="http://www.w3.org/2000/svg";document.querySelectorAll(".costtag").forEach(function(e){e.remove()});if(!ov.checked)return;var C=window.__archifyCost||{};
 document.querySelectorAll(".node").forEach(function(n){var v=C[n.dataset.id];var u=n.querySelector("use");if(!v||!u)return;var x=+u.getAttribute("x")+ +u.getAttribute("width")/2,y=+u.getAttribute("y")+ +u.getAttribute("height")+4,t=money(v)+"/mo",w=t.length*7+10;
  var g=document.createElementNS(NS,"g");g.setAttribute("class","costtag");var r=document.createElementNS(NS,"rect");r.setAttribute("x",x-w/2);r.setAttribute("y",y-2);r.setAttribute("width",w);r.setAttribute("height",16);r.setAttribute("rx",8);var tx=document.createElementNS(NS,"text");tx.setAttribute("x",x);tx.setAttribute("y",y+10);tx.textContent=t;g.appendChild(r);g.appendChild(tx);n.appendChild(g)})});
document.querySelectorAll("#costTable tr[data-node]").forEach(function(r){r.addEventListener("click",function(){var id=r.dataset.node;show("diagram",true);var n=document.querySelector('.node[data-id="'+id+'"]');document.querySelectorAll("#costTable tr").forEach(function(t){t.classList.toggle("sel",t===r)});if(n){n.scrollIntoView({block:"center",inline:"center"});n.classList.add("pulse")}})});
document.querySelectorAll(".finding[data-nodes]").forEach(function(a){var ids=a.dataset.nodes.split(" ").filter(Boolean);if(!ids.length)return;a.addEventListener("mouseenter",function(){document.querySelectorAll(".node").forEach(function(n){n.classList.toggle("dim",ids.indexOf(n.dataset.id)<0)})});a.addEventListener("mouseleave",function(){document.querySelectorAll(".node").forEach(function(n){n.classList.remove("dim")})})});
})();`;
