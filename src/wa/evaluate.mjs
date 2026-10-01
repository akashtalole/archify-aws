// Well-Architected review engine. Implements the structure of the AWS `aws-well-architected-review` skill
// (agent-toolkit-for-aws) for diagram evidence: frozen corpus -> every BP gets one of five statuses ->
// impact x likelihood risk -> Eisenhower prioritization -> report data. All arithmetic is deterministic code.
import { loadCorpus, corpusAgeDays } from "./corpus.mjs";
import { LEGACY_RULES, LEGACY_LENS_RULES, PROCEDURAL_RULES, STATUS, OWNER } from "./rules.mjs";

export const MODES = ["full", "quick", "pillar", "score"];
export const RISK_ORDER = ["Critical", "High", "Medium", "Low"];
const IMPACT = ["Minor", "Moderate", "Severe"];
const money = (x) => "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The skill's risk matrix. */
export function riskLevel(impact, likelihood) {
  if (impact === "Severe") return likelihood === "High" ? "Critical" : "High";
  if (impact === "Moderate") return likelihood === "Low" || likelihood === "Medium" ? "Medium" : "High";
  return likelihood === "High" ? "Medium" : "Low"; // Minor
}
const bump = (impact, d) => IMPACT[Math.max(0, Math.min(2, IMPACT.indexOf(impact) + d))];

function mergeStatus(entries) {
  const st = entries.map((e) => e.status);
  const any = (s) => st.includes(s);
  if (any("Not Implemented")) return "Not Implemented";
  if (any("Partially Implemented")) return "Partially Implemented";
  if (any("Implemented")) return any("Cannot Determine") ? "Partially Implemented" : "Implemented";
  if (any("Cannot Determine")) return "Cannot Determine";
  return "Not Applicable";
}
const needsFor = (title) => /process|plan|culture|owner|train|skill|exercise|playbook|runbook|incident|review|communicat|escalat|sponsor|goal|ksl|knowledge|lesson|improve|culture|team|governance|requirement|priorit|partnership|budget|forecast/i.test(title) ? "process or organizational evidence"
  : /encrypt|permission|credential|policy|configur|quota|rotate|patch|image|access|secret|key|certificate|network|subnet|traffic/i.test(title) ? "IaC or configuration evidence" : "runtime or operational evidence";

function buildCtx(diagram, cost, isGenAI) {
  const nodes = diagram.nodeList.map((n) => ({ id: n.id, label: `${n.item.label || n.id} ${n.item.sublabel || ""}`, svc: n.icon.kind === "service" ? n.icon.entry.id : null, kind: n.icon.kind, res: n.icon.kind === "resource" ? n.icon.entry.id : null, item: n.item }));
  return {
    nodes, groups: diagram.groupList, edges: diagram.edgeList, cost, isGenAI, spec: diagram.spec,
    has: (...ids) => nodes.some((n) => n.svc && ids.includes(n.svc)),
    of: (...ids) => nodes.filter((n) => n.svc && ids.includes(n.svc)),
    labelHas: (re) => nodes.filter((n) => re.test(n.label) || re.test(n.id)),
  };
}

export function reviewWorkload(diagram, { cost = null, mode = "full", pillars = null, filter = "all", lens = "auto", criticality, name, now = new Date(), corpora } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown review mode "${mode}" (${MODES.join(", ")})`);
  const spec = diagram.spec || {};
  const legacy = diagram.review();
  const crit = criticality || spec.meta?.workload?.criticality || "standard";
  const fw = corpora?.framework || loadCorpus("framework");
  const useLens = lens === "generative-ai" || (lens === "auto" && (legacy.genAI || (spec.meta?.lens || []).includes("generative-ai")));
  const lc = useLens ? corpora?.["generative-ai"] || loadCorpus("generative-ai") : null;
  const ctx = buildCtx(diagram, cost, useLens);
  const fwIds = new Set(fw.bps.map((b) => b.bp_id)), lensIds = new Set(lc ? lc.bps.map((b) => b.bp_id) : []);

  // ---- 1. rule outcomes -> {bp -> entries}
  const outcomes = []; // one per rule: {key,title,pillar,source,fw:{bp:{status,evidence}},lens:{...},risk meta,nodes,legacyStatus}
  const byLegacy = new Map(legacy.findings.map((f) => [f.id, f]));
  for (const def of [...LEGACY_RULES, ...LEGACY_LENS_RULES]) {
    const f = byLegacy.get(def.legacy);
    if (!f) continue;
    const map = (bpDefs, valid) => Object.fromEntries(Object.entries(bpDefs).filter(([id]) => valid.has(id)).map(([id, o]) => {
      const status = o[f.status] || (f.status === "ok" ? def.okAs || "Implemented" : f.status === "gap" ? "Not Implemented" : def.considerAs || "Cannot Determine");
      const ev = `Diagram: ${f.title}.${f.nodes?.length ? ` Nodes: ${f.nodes.join(", ")}.` : ""} ${f.detail}`;
      return [id, { status, evidence: ev }];
    }));
    outcomes.push({ key: def.legacy, title: f.title, pillar: f.pillar, source: "diagram", fw: map(def.fw || {}, fwIds), lens: map(def.lens || {}, lensIds), def, nodes: f.nodes || [], legacyStatus: f.status });
  }
  for (const rule of PROCEDURAL_RULES) {
    const r = rule.evaluate(ctx);
    if (!r) continue;
    outcomes.push({ key: rule.id, title: r.title, pillar: rule.pillar, source: rule.id.startsWith("COST") ? "cost estimate" : "diagram", fw: Object.fromEntries(Object.entries(r.fw || {}).filter(([id]) => fwIds.has(id))), lens: Object.fromEntries(Object.entries(r.lens || {}).filter(([id]) => lensIds.has(id))), def: null, procedural: r, nodes: r.nodes || [] });
  }

  // ---- 2. BP ledger over the frozen corpus
  const entriesByBp = new Map();
  for (const o of outcomes) for (const [which, set] of [["fw", fw], ["lens", lc]]) for (const [id, v] of Object.entries(o[which] || {})) {
    if (!entriesByBp.has(id)) entriesByBp.set(id, []);
    entriesByBp.get(id).push({ ...v, rule: o.key, title: o.title });
  }
  const selectedPillars = pillars?.length ? new Set(pillars.map((p) => String(p).toLowerCase())) : null;
  const inScope = (b) => !selectedPillars || [...selectedPillars].some((p) => b.pillar_id.startsWith(p) || b.pillar_id.includes(p));
  const ledgerOf = (corpus, source) => corpus.bps.filter(inScope).map((b) => {
    const entries = entriesByBp.get(b.bp_id) || [];
    const status = entries.length ? mergeStatus(entries) : "Cannot Determine";
    const evidence = entries.length ? entries.map((e) => e.evidence).join(" ") : `Not observable from the architecture diagram; needs ${needsFor(b.bp_title)}.`;
    return { bp_id: b.bp_id, pillar_id: b.pillar_id, pillar_name: b.pillar_name, question_id: b.question_id, bp_title: b.bp_title, bp_url: b.bp_url, status, evidence, rules: entries.map((e) => e.rule), source, hasEvidence: entries.length > 0 };
  });
  const ledger = ledgerOf(fw, "framework");
  const lensLedger = lc ? ledgerOf(lc, "generative-ai") : [];

  // ---- 3. findings (Not/Partially Implemented with risk metadata) and items to confirm
  const adjust = (pillar, impact, ruleKey) => {
    if (crit === "critical" && ["reliability", "security"].includes(pillar)) return { impact: bump(impact, 1), note: "criticality: critical (stricter standard)" };
    if ((crit === "low") && pillar === "reliability") return { impact: bump(impact, -1), note: "criticality: low (simpler architecture accepted)" };
    return { impact, note: null };
  };
  const findings = [], toConfirm = [];
  for (const o of outcomes) {
    const allBps = { ...Object.fromEntries(Object.entries(o.fw).map(([k, v]) => [k, { ...v, lens: false }])), ...Object.fromEntries(Object.entries(o.lens).map(([k, v]) => [k, { ...v, lens: true }])) };
    const gapBps = Object.entries(allBps).filter(([, v]) => ["Not Implemented", "Partially Implemented"].includes(v.status));
    const cdBps = Object.entries(allBps).filter(([, v]) => v.status === "Cannot Determine");
    // risk metadata: rule-level or per-BP (procedural rules may carry it on a BP)
    const bpMeta = gapBps.map(([id, v]) => ({ id, ...v })).find((x) => x.impact) || null;
    const meta = o.def || bpMeta || (o.procedural && { impact: o.procedural.impact, likelihood: o.procedural.likelihood, effort: o.procedural.effort, weeks: o.procedural.weeks, rec: o.procedural.rec, measure: o.procedural.measure });
    if (gapBps.length && meta?.impact) {
      const pillar = o.pillar;
      const adj = adjust(pillar, meta.impact, o.key);
      const likelihood = o.def && o.legacyStatus === "consider" ? (meta.likelihood === "High" ? "Medium" : meta.likelihood) : meta.likelihood; // absence-by-omission is less certain than a drawn defect
      const risk = riskLevel(adj.impact, likelihood);
      const status = mergeStatus(gapBps.map(([, v]) => v));
      findings.push({ rule: o.key, pillar, lens: gapBps.every(([, v]) => v.lens) ? "generative-ai" : (gapBps.some(([, v]) => v.lens) ? "both" : "framework"), title: o.title, status, bps: gapBps.map(([id]) => id), evidence: gapBps.map(([, v]) => v.evidence).filter((x, i, a) => a.indexOf(x) === i).join(" "), impact: adj.impact, likelihood, risk, adjustment: adj.note, recommendation: meta.rec, measure: meta.measure, effort: meta.effort || "Medium", weeks: meta.weeks || 4, nodes: o.nodes });
    } else if (cdBps.length && o.def && o.legacyStatus === "consider") {
      toConfirm.push({ rule: o.key, pillar: o.pillar, title: o.title, bps: cdBps.map(([id]) => id), why: "Not shown in the diagram — it may exist but be undrawn. Confirm, then add it to the diagram or the backlog.", recommendation: o.def.rec });
    }
  }
  const rank = (r) => RISK_ORDER.indexOf(r);
  findings.sort((a, b) => rank(a.risk) - rank(b.risk) || a.pillar.localeCompare(b.pillar) || a.rule.localeCompare(b.rule));
  findings.forEach((f, i) => { f.id = `F-${String(i + 1).padStart(3, "0")}`; });

  // ---- 4. Eisenhower quadrants + SMART remediation
  const importance = (f) => (["Critical", "High"].includes(f.risk) || (f.risk === "Medium" && ["security", "reliability"].includes(f.pillar) && ["critical", "high"].includes(crit))) ? "High" : "Low";
  const due = (weeks) => new Date(now.getTime() + weeks * 7 * 86400000).toISOString().slice(0, 10);
  for (const f of findings) {
    f.importance = importance(f);
    f.quadrant = f.importance === "High" ? (f.effort === "Low" ? "Do First" : "Plan") : (f.effort === "High" ? "Defer" : "Delegate");
    f.owner = f.lens !== "framework" ? "ML platform team" : OWNER[f.pillar] || "Workload owner";
    f.smart = `By ${due(f.weeks)} (${f.weeks} week${f.weeks === 1 ? "" : "s"}): ${f.recommendation} Success measure: ${f.measure}`;
  }
  const quadrants = { "Do First": [], Plan: [], Delegate: [], Defer: [] };
  for (const f of findings) quadrants[f.quadrant].push(f.id);

  // ---- 5. questions (framework + lens) and pillar scores
  const qOf = (corpus, led) => corpus.questions.filter((q) => !selectedPillars || led.some((b) => b.question_id === q.question_id)).map((q) => {
    const bs = led.filter((b) => b.question_id === q.question_id);
    const det = bs.filter((b) => ["Implemented", "Partially Implemented", "Not Implemented"].includes(b.status));
    const status = bs.length ? mergeStatus(bs.map((b) => ({ status: b.status === "Cannot Determine" && det.length ? "Not Applicable" : b.status }))) : "Cannot Determine";
    const f = findings.filter((x) => x.bps.some((id) => bs.some((b) => b.bp_id === id)));
    const worst = f.length ? f.slice().sort((a, b) => rank(a.risk) - rank(b.risk))[0].risk : (det.length ? "Low" : "Not Applicable");
    return { question_id: q.question_id, question: q.question_title, pillar_id: q.pillar_id, status: det.length ? status : "Cannot Determine", risk: det.length ? (f.length ? worst : "None") : "Not Applicable", bps: bs.length, evidenced: bs.filter((b) => b.hasEvidence).length, keyEvidence: (bs.find((b) => b.hasEvidence)?.evidence || "—").slice(0, 160), question_url: q.question_url };
  });
  const questions = qOf(fw, ledger), lensQuestions = lc ? qOf(lc, lensLedger) : [];
  const scoreOf = (led, corpus) => corpus.pillars.filter((p) => led.some((b) => b.pillar_id === p.id)).map((p) => {
    const bs = led.filter((b) => b.pillar_id === p.id), count = (s) => bs.filter((b) => b.status === s).length;
    const I = count("Implemented"), P = count("Partially Implemented"), N = count("Not Implemented"), det = I + P + N;
    const score = det >= 3 ? Math.round((1 + 4 * (I + 0.5 * P) / det) * 10) / 10 : null;
    const pf = findings.filter((f) => f.pillar === p.id && (f.lens !== "framework") === (corpus === lc));
    const impl = outcomes.filter((o) => o.pillar === p.id && [...Object.values(o.fw), ...Object.values(o.lens)].some((v) => v.status === "Implemented")).map((o) => o.title);
    return { id: p.id, name: p.name, score, totalBps: bs.length, determinable: det, coverage: Math.round(1000 * det / (bs.length || 1)) / 10, counts: { Implemented: I, "Partially Implemented": P, "Not Implemented": N, "Not Applicable": count("Not Applicable"), "Cannot Determine": count("Cannot Determine") }, findings: { Critical: pf.filter((f) => f.risk === "Critical").length, High: pf.filter((f) => f.risk === "High").length, Medium: pf.filter((f) => f.risk === "Medium").length, Low: pf.filter((f) => f.risk === "Low").length }, strength: impl[0] || "—", gap: pf[0]?.title || "No gaps evidenced in the diagram" };
  });
  const pillarsOut = scoreOf(ledger, fw), lensPillars = lc ? scoreOf(lensLedger, lc) : [];
  const scored = pillarsOut.filter((p) => p.score !== null);
  const overall = scored.length ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length * 10) / 10 : null;

  // ---- 6. cross-pillar trade-offs, computed from the estimate and the diagram
  const tradeoffs = [];
  if (cost) {
    for (const w of cost.whatIfs.filter((x) => x.tradeoff)) tradeoffs.push({ pillars: ["reliability", "cost-optimization"], title: w.title, detail: `${money(Math.abs(w.monthlyDeltaUsd))}/month more than the single-AZ equivalent (${w.basis})`, resolution: "Keep Multi-AZ for production data stores; use single-AZ only in non-production environments.", costUsd: w.monthlyDeltaUsd });
    const ai = cost.totals.byCategory["AI and agents"] || 0;
    const gr = cost.nodes.filter((n) => n.pricer === "guardrails" && n.status === "estimated");
    if (gr.length && ai > 0) { const g = gr.reduce((s, n) => s + n.monthlyUsd, 0); tradeoffs.push({ pillars: ["security", "cost-optimization", "performance-efficiency"], title: "Guardrails on model traffic", detail: `Guardrails cost ${money(g)}/month (${Math.round(100 * g / ai)}% of AI spend) and add a synchronous screening step to each model call.`, resolution: "Apply the strictest policies where harm is highest (final responses, PII) and measure per-policy value before enabling every policy on every call.", costUsd: g }); }
    const cw = cost.nodes.find((n) => n.pricer === "cloudwatch" && n.status === "estimated");
    if (cw && cw.monthlyUsd > 0) tradeoffs.push({ pillars: ["operational-excellence", "cost-optimization"], title: "Observability volume", detail: `CloudWatch is ${money(cw.monthlyUsd)}/month in this estimate, mostly log ingestion; richer telemetry improves detection but ingestion is billed per GB.`, resolution: "Sample verbose traces, set retention per log group, and keep full-fidelity logs for security and audit sources only.", costUsd: cw.monthlyUsd });
    const ev = cost.nodes.find((n) => /evaluations/i.test(n.label) && n.status === "estimated");
    if (ev) tradeoffs.push({ pillars: ["operational-excellence", "cost-optimization"], title: "Continuous agent evaluation", detail: `Evaluations cost ${money(ev.monthlyUsd)}/month at the assumed sampling volume.`, resolution: "Sample a fraction of production traffic and run the full golden set before each release.", costUsd: ev.monthlyUsd });
  }

  // ---- 7. executive summary, coverage audit, next steps
  const count = (r) => findings.filter((f) => f.risk === r).length;
  const detAll = ledger.filter((b) => ["Implemented", "Partially Implemented", "Not Implemented"].includes(b.status)).length;
  const lensDet = lensLedger.filter((b) => ["Implemented", "Partially Implemented", "Not Implemented"].includes(b.status)).length;
  const coverage = {
    framework: { source: fw.name, indexUrl: fw.manifest.provenance.indexUrl, retrievedAt: fw.manifest.provenance.retrievedAt, ageDays: corpusAgeDays(fw), pillars: fw.manifest.counts.pillars, questions: fw.manifest.counts.questions, bps: fw.manifest.counts.bps, assessedBps: ledger.length, withEvidence: detAll, cannotDetermine: ledger.filter((b) => b.status === "Cannot Determine").length, notApplicable: ledger.filter((b) => b.status === "Not Applicable").length },
    lens: lc ? { source: lc.name, indexUrl: lc.manifest.provenance.indexUrl, retrievedAt: lc.manifest.provenance.retrievedAt, ageDays: corpusAgeDays(lc), questions: lc.manifest.counts.questions, bps: lc.manifest.counts.bps, assessedBps: lensLedger.length, withEvidence: lensDet, cannotDetermine: lensLedger.filter((b) => b.status === "Cannot Determine").length } : null,
    freshness: "Corpus read from a committed snapshot of the live documentation index (not re-fetched during this review). Re-read it with `archify-aws wa corpus --refresh`.",
    evidenceSources: ["architecture diagram (services, boundaries, relationships)", ...(cost ? ["cost estimate from the AWS Price List"] : [])],
    limits: "Statuses reflect what the diagram and spec show. Process, configuration and runtime evidence are not observable here, so those BPs are 'Cannot Determine' rather than guessed.",
  };
  const strengths = outcomes.filter((o) => [...Object.values(o.fw), ...Object.values(o.lens)].some((v) => v.status === "Implemented")).map((o) => o.title);
  const maturity = overall === null ? null : { score: overall, justification: `${detAll} of ${fw.bps.length} framework best practices have diagram evidence (${Math.round(100 * detAll / fw.bps.length)}%); among those, ${ledger.filter((b) => b.status === "Implemented").length} implemented, ${ledger.filter((b) => b.status === "Partially Implemented").length} partial, ${ledger.filter((b) => b.status === "Not Implemented").length} not implemented. Provisional: scores cover evidenced practices only.` };
  const nextSteps = findings.filter((f) => f.quadrant === "Do First").slice(0, 5).map((f) => ({ id: f.id, title: f.title, action: f.recommendation, owner: f.owner }));
  const report = {
    schema_version: "archify-aws.wa-review.v1", mode, filter, lens: useLens ? "generative-ai" : "general", criticality: crit,
    workload: { name: name || spec.meta?.workload?.name || spec.meta?.title || "Workload", description: spec.meta?.workload?.description || spec.meta?.subtitle || "", diagramType: diagram.type, nodes: diagram.stats.nodes },
    date: now.toISOString().slice(0, 10), scope: selectedPillars ? [...selectedPillars] : null,
    coverage, maturity, pillars: pillarsOut, lensPillars, questions, lensQuestions,
    ledger: mode === "full" || mode === "pillar" ? ledger : [], lensLedger: mode === "full" || mode === "pillar" ? lensLedger : [],
    findings: findings.filter((f) => filter === "critical" ? f.risk === "Critical" : filter === "critical-high" ? ["Critical", "High"].includes(f.risk) : true),
    findingCounts: { Critical: count("Critical"), High: count("High"), Medium: count("Medium"), Low: count("Low") },
    toConfirm, tradeoffs, quadrants, strengths: [...new Set(strengths)].slice(0, 8), nextSteps,
    costLink: cost ? { monthlyUsd: cost.totals.monthlyUsd, confidence: cost.confidence } : null,
    banner: "Classification: CONFIDENTIAL — This report contains sensitive infrastructure details and unremediated security findings. Restrict distribution to authorized personnel. Do not post to broadly visible channels or ticketing systems without explicit approval.",
  };
  report.legend = { statuses: STATUS, risk: "Impact × Likelihood matrix from the AWS Well-Architected review skill (Severe+High = Critical; Severe+Medium/Low or Moderate+High = High; Moderate+Medium/Low or Minor+High = Medium; otherwise Low)." };
  return report;
}
