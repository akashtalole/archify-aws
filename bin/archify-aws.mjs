#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, catalog, searchIcons, resolveIcon, iconsAvailable, ICON_DIR } from "../src/catalog.mjs";
import { buildDiagram, SpecError, typeOf } from "../src/pipeline.mjs";
import { renderPage } from "../src/page.mjs";
import { analyze } from "../src/analysis.mjs";
import { toDrawio } from "../src/drawio/export.mjs";
import { validateDrawio } from "../src/drawio/validate.mjs";
import { reviewWorkload } from "../src/wa/evaluate.mjs";
import { GROUP_KINDS } from "../src/groups.mjs";
import { svgToPng } from "../src/png.mjs";
import { importMermaid } from "../src/mermaid.mjs";
import { importIac } from "../src/iac.mjs";
import { finalize } from "../src/finalize.mjs";
import { buildSchemas, guideScenario } from "../src/schemas.mjs";
import { estimateCost } from "../src/cost/estimate.mjs";
import { money } from "../src/cost/pricebook.mjs";
import { loadCorpus, acquireCorpus, saveCorpus, corpusAgeDays, SOURCES as WA_SOURCES } from "../src/wa/corpus.mjs";

const HELP = `archify-aws — AWS architecture diagrams from typed JSON (official AWS Architecture Icons)

Usage
  archify-aws render <spec.json> [-o out.html] [--svg] [--png] [--drawio] [--theme light|dark] [--no-review] [--no-cost] [--strict] [--json]
  archify-aws finalize <spec.json> [-o out.html] [--theme t] [--no-png] [--require-browser] [--json]   validate → render → checks → browser check → receipt
  archify-aws validate <spec.json> [--json]
  archify-aws review <spec.json> [--json]            Well-Architected + Generative AI Lens hints
  archify-aws icons search <term> [--limit n]        find service/resource/general icon ids
  archify-aws icons info <id>                        resolve an id or alias
  archify-aws icons categories | groups              list categories / group kinds
  archify-aws import mermaid <file.mmd|-> [-o spec.json] [--title T] [--number] [--render] [--json]
  archify-aws import iac <dir|file> [-o spec.json] [--include logs,iam] [--title T] [--render] [--json]   (Terraform, CloudFormation, SAM)
  archify-aws init [three-tier|serverless-api|genai-rag] [-o spec.json]
  archify-aws fetch-icons [icons.zip|url]            download the official icon package
  archify-aws schema [architecture|sequence|dataflow]      JSON Schema (path, or contents with --json)
  archify-aws guide "<scenario>" [--json]                  which diagram type and template fit
  archify-aws wa corpus [--lens generative-ai] [--refresh] [--json]   Well-Architected questions and best practices (live index or snapshot)
  archify-aws wa review <spec.json> [--mode full|quick|pillar|score] [--pillars p,q] [--filter critical|critical-high|all] [--criticality c] [--json]   Well-Architected review (framework + Generative AI Lens)
  archify-aws export <spec.json> [--format drawio] [-o out.drawio]   draw.io file using draw.io's built-in AWS shapes
  archify-aws cost <spec.json> [--region r] [--scale 1,3,10] [--usage usage.json] [--json]   monthly estimate from the AWS Price List
  archify-aws doctor

Exit codes: 0 ok · 1 invalid spec / usage / failed gate · 2 --strict and layout warnings present · 3 icons missing
`;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith("-") && !["-o", "--theme", "--limit"].includes(argv[i - 1]));
const json = flag("--json");
const out = (o) => console.log(JSON.stringify(o, null, 2));
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
const readSpec = (f) => { if (!f) die("missing <spec.json>\n" + HELP); try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { die(`cannot read ${f}: ${e.message}`); } };
const needIcons = () => { if (!iconsAvailable()) die(`AWS icons not found at ${ICON_DIR}\nRun: archify-aws fetch-icons   (downloads the official package; see THIRD_PARTY_NOTICES.md)`, 3); };

const [cmd, ...rest] = pos;
switch (cmd) {
  case "render": {
    needIcons();
    const file = rest[0];
    const spec = readSpec(file);
    let d;
    try { d = buildDiagram(spec); } catch (e) { if (!(e instanceof SpecError)) throw e; if (json) out({ ok: false, errors: e.errors }); else console.error(e.message); process.exit(1); }
    const theme = opt("--theme", spec.meta?.theme || "light");
    const outHtml = path.resolve(opt("-o", spec.meta?.output || file.replace(/\.json$/, "") + ".html"));
    fs.mkdirSync(path.dirname(outHtml), { recursive: true });
    let usage; if (opt("--usage")) usage = readSpec(opt("--usage"));
    let an; try { an = analyze(d, { cost: !flag("--no-cost"), review: !flag("--no-review"), region: opt("--region"), usage }); } catch (e) { die(e.message); }
    const review = an.wa;
    fs.writeFileSync(outHtml, renderPage(d, review, theme, an.cost));
    const res = { ok: true, type: d.type, html: outHtml, size: d.size, nodes: d.stats.nodes, groups: d.stats.groups, edges: d.stats.edges, warnings: d.warnings };
    const base = outHtml.replace(/\.html$/, "");
    if (flag("--drawio")) { const x = toDrawio(d); const bad = validateDrawio(x); if (bad.length) die("draw.io export failed checks:\n- " + bad.join("\n- ")); fs.writeFileSync(base + ".drawio", x); res.drawio = base + ".drawio"; }
    if (flag("--svg") || flag("--png")) { fs.writeFileSync(base + ".svg", d.svg(theme)); res.svg = base + ".svg"; }
    if (flag("--png")) { try { svgToPng(base + ".svg", base + ".png", d.size.width, d.size.height); res.png = base + ".png"; } catch (e) { res.pngError = e.message; } }
    if (an.cost) res.cost = { monthlyUsd: an.cost.totals.monthlyUsd, confidence: an.cost.confidence, coverage: an.cost.coverage };
    if (review) res.review = { findings: review.findingCounts, evidenced: review.coverage.framework.withEvidence, bps: review.coverage.framework.assessedBps };
    if (json) out(res);
    else {
      console.log(`Wrote ${outHtml}${res.svg ? `\n      ${res.svg}` : ""}${res.drawio ? `\n      ${res.drawio}` : ""}${res.png ? `\n      ${res.png}` : ""}`);
      console.log(`${d.type}: ${res.nodes} nodes · ${res.groups} groups · ${res.edges} ${d.type === "sequence" ? "messages" : "edges"} · ${res.size.width}×${res.size.height}`);
      for (const w of d.warnings) console.log(`warning: ${w}`);
      if (an.cost) console.log(`Cost: ${money(res.cost.monthlyUsd)}/month (${res.cost.confidence}) — Cost tab`);
      if (review) { const f = res.review.findings; console.log(`Well-Architected: ${f.Critical} critical · ${f.High} high · ${f.Medium} medium · ${f.Low} low; ${res.review.evidenced}/${res.review.bps} best practices evidenced — Well-Architected tab`); }
      if (res.pngError) console.log(`png: ${res.pngError}`);
    }
    process.exit(flag("--strict") && d.warnings.some((w) => !/used by more than one edge/.test(w)) ? 2 : 0);
  }
  case "export": {
    needIcons();
    const file = rest[0];
    if (!file) die("usage: archify-aws export <spec.json> [--format drawio] [-o out.drawio]");
    const format = opt("--format", "drawio");
    if (format !== "drawio") die(`unknown export format "${format}" (drawio; PNG/SVG/HTML come from render and finalize)`);
    const spec = readSpec(file);
    let d; try { d = buildDiagram(spec); } catch (e) { if (!(e instanceof SpecError)) throw e; die(e.message); }
    const xml = toDrawio(d), bad = validateDrawio(xml);
    if (bad.length) die("draw.io export failed checks:\n- " + bad.join("\n- "));
    const outFile = path.resolve(opt("-o", file.replace(/\.json$/, "") + ".drawio"));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, xml);
    const images = (xml.match(/shape=image;/g) || []).length;
    if (json) out({ ok: true, format: "drawio", file: outFile, cells: (xml.match(/<mxCell /g) || []).length, embeddedImageIcons: images });
    else console.log(`Wrote ${outFile}\n${d.stats.nodes} nodes · ${d.stats.groups} groups · ${d.stats.edges} ${d.type === "sequence" ? "messages" : "edges"}${images ? ` · ${images} icon(s) without a draw.io AWS shape embedded as SVG` : " · all icons use draw.io AWS shapes"}`);
    break;
  }
  case "finalize": {
    needIcons();
    const file = rest[0];
    if (!file) die("missing <spec.json>\n" + HELP);
    const rc = finalize(path.resolve(file), { outHtml: opt("-o"), theme: opt("--theme"), png: !flag("--no-png"), requireBrowser: flag("--require-browser"), review: !flag("--no-review"), cost: !flag("--no-cost") });
    const outBase = rc.outputs.html ? path.resolve(rc.outputs.html.path).replace(/\.html$/, "") : path.resolve(file).replace(/\.json$/, "");
    fs.writeFileSync(outBase + ".receipt.json", JSON.stringify(rc, null, 2) + "\n");
    if (json) out(rc);
    else {
      for (const s of rc.stages) console.log(`${s.status === "pass" ? "✔" : s.status === "skipped" ? "–" : "✘"} ${s.name.padEnd(14)} ${s.status}${s.detail?.skipped ? " (" + s.detail.skipped + ")" : ""}`);
      for (const s of rc.stages.filter((x) => x.status === "fail")) (s.detail.errors || []).forEach((e) => console.log("  - " + e));
      if (rc.ok) {
        console.log(`\n${rc.summary.type}: ${rc.summary.nodes} nodes · ${rc.summary.edges} ${rc.summary.type === "sequence" ? "messages" : "edges"}`);
        for (const [k, v] of Object.entries(rc.outputs)) console.log(`${k.padEnd(5)} ${v.path}`);
        console.log(`receipt ${path.relative(process.cwd(), outBase + ".receipt.json")}`);
        if (rc.cost) console.log(`Cost: ${money(rc.cost.monthlyUsd)}/month (${rc.cost.confidence})`);
        if (rc.review) { const f = rc.review.findings; console.log(`Well-Architected (advisory): ${f.Critical} critical · ${f.High} high · ${f.Medium} medium · ${f.Low} low; ${rc.review.evidenced}/${rc.review.bps} best practices evidenced`); }
        console.log("Visual review: not performed — open the PNG/HTML and look before claiming quality.");
      }
    }
    process.exit(rc.ok ? 0 : 1);
  }
  case "schema": {
    const all = buildSchemas();
    const name = rest[0];
    if (name && !all[name]) die(`unknown schema "${name}" (architecture, sequence, dataflow)`);
    if (json || name === undefined) out(name ? all[name] : Object.keys(all).map((n) => path.join(ROOT, "schemas", n + ".schema.json")));
    else console.log(path.join(ROOT, "schemas", name + ".schema.json"));
    break;
  }
  case "guide": {
    const g = guideScenario(rest.join(" "));
    if (json) out(g); else { console.log(`Use: ${g.type}  (template: archify-aws init ${g.template})`); g.hints.forEach((h) => console.log("• " + h)); }
    break;
  }
  case "validate": {
    const spec = readSpec(rest[0]);
    let errors = [], warnings = [];
    try { warnings = buildDiagram(spec).warnings; } catch (e) { if (!(e instanceof SpecError)) throw e; errors = e.errors; }
    if (json) out({ ok: !errors.length, type: typeOf(spec), errors, warnings });
    else { errors.forEach((e) => console.log("error:", e)); warnings.forEach((w) => console.log("warning:", w)); console.log(errors.length ? `${errors.length} error(s)` : "valid"); }
    process.exit(errors.length ? 1 : 0);
  }
  case "review": {
    needIcons();
    const spec = readSpec(rest[0]);
    let d; try { d = buildDiagram(spec); } catch (e) { if (!(e instanceof SpecError)) throw e; die(e.message); }
    const r = d.review();
    if (json) out(r);
    else for (const f of r.findings) console.log(`${f.status.padEnd(8)} ${f.pillar.padEnd(23)} ${f.id.padEnd(18)} ${f.title}`);
    break;
  }
  case "icons": {
    const [sub, ...q] = rest;
    if (sub === "search") {
      const hits = searchIcons(q.join(" "), Number(opt("--limit", 15)));
      if (json) out(hits); else hits.forEach((h) => console.log(`${h.id.padEnd(44)} ${h.kind.padEnd(8)} ${h.name}`));
    } else if (sub === "info") {
      const r = resolveIcon(q.join(" "));
      if (!r) die("unknown icon", 1);
      out({ kind: r.kind, ...r.entry, category: r.entry.category ?? null, color: catalog.categories[r.entry.category] ?? null });
    } else if (sub === "categories") out(catalog.categories);
    else if (sub === "groups") out(Object.fromEntries(Object.entries(GROUP_KINDS).map(([k, v]) => [k, { defaultLabel: v.label, color: v.color, border: v.dash ? "dashed" : "solid" }])));
    else die(HELP);
    break;
  }
  case "import": {
    const [kind, src] = rest;
    if (kind === "mermaid") {
      const text = src === "-" || !src ? fs.readFileSync(0, "utf8") : fs.readFileSync(src, "utf8");
      let r; try { r = importMermaid(text, { title: opt("--title"), number: flag("--number") }); } catch (e) { die(e.message); }
      const dest = path.resolve(opt("-o", (src && src !== "-" ? src.replace(/\.mmd$|\.md$/, "") : "imported") + ".json"));
      r.spec.meta.output = path.relative(process.cwd(), dest.replace(/\.json$/, ".html")); // output paths resolve from the working directory
      fs.writeFileSync(dest, JSON.stringify(r.spec, null, 2) + "\n");
      if (json) out({ ok: true, spec: dest, type: r.type, ...r.report });
      else {
        console.log(`Wrote ${dest} (${r.type})`);
        const low = r.report.mappings.filter((m) => m.confidence !== "exact");
        if (low.length) console.log("Icon mapping to review:\n" + low.map((m) => `  ${m.id.padEnd(14)} "${m.label}" → ${m.icon} (${m.confidence})`).join("\n"));
        r.report.warnings.forEach((w) => console.log("warning:", w));
      }
      if (flag("--render")) { needIcons(); const rr = spawnSync(process.execPath, [process.argv[1], "render", dest, "--png"], { stdio: "inherit" }); process.exit(rr.status ?? 0); }
      break;
    }
    if (kind === "iac") {
      if (!src) die("usage: archify-aws import iac <dir|file>");
      let r; try { r = importIac(src, { include: (opt("--include", "") || "").split(",").filter(Boolean), title: opt("--title") }); } catch (e) { die(e.message); }
      const dest = path.resolve(opt("-o", "iac-diagram.json"));
      r.spec.meta.output = path.relative(process.cwd(), dest.replace(/\.json$/, ".html"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, JSON.stringify(r.spec, null, 2) + "\n");
      if (json) out({ ok: true, spec: dest, type: r.type, ...r.report });
      else {
        console.log(`Wrote ${dest} — ${r.report.formats.join(" + ")}: ${r.report.resources} resources → ${r.report.nodes} nodes, ${r.report.edges} relationships`);
        const sk = Object.entries(r.report.skipped);
        if (sk.length) console.log("Skipped (not architecture-level; --include logs,iam to show some): " + sk.map(([k, v]) => `${k}×${v}`).join(", "));
        r.report.warnings.forEach((w) => console.log("warning:", w));
      }
      if (flag("--render")) { needIcons(); const rr = spawnSync(process.execPath, [process.argv[1], "render", dest, "--png"], { stdio: "inherit" }); process.exit(rr.status ?? 0); }
      break;
    }
    die("usage: archify-aws import mermaid <file.mmd|-> | import iac <dir|file>");
  }
  case "init": {
    const name = rest[0] || "three-tier";
    const alias = { sequence: "agent-tool-call.sequence", dataflow: "clinical-notes.dataflow" };
    const src = path.join(ROOT, "examples", `${alias[name] || name}.json`);
    if (!fs.existsSync(src)) die(`unknown template "${name}"`);
    const dest = opt("-o", `${name}.json`);
    fs.copyFileSync(src, dest);
    console.log(`Wrote ${dest}`);
    break;
  }
  case "fetch-icons": {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "fetch-icons.mjs"), ...rest], { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  case "wa": {
    const [sub] = rest;
    if (sub === "corpus") {
      const lens = opt("--lens", "framework");
      if (!WA_SOURCES[lens]) die(`unknown lens "${lens}" (${Object.keys(WA_SOURCES).join(", ")})`);
      let c;
      try { c = flag("--refresh") ? await acquireCorpus(lens) : loadCorpus(lens); } catch (e) { die(e.message); }
      if (flag("--refresh")) { if (!c.manifest.valid) die("corpus INVALID: " + c.manifest.errors.join("; ")); saveCorpus(c); }
      if (json) out({ lens, ...c.manifest, ageDays: corpusAgeDays(c) });
      else {
        console.log(`${c.name}: ${c.manifest.counts.pillars} pillars · ${c.manifest.counts.questions} questions · ${c.manifest.counts.bps} best practices (${c.manifest.valid ? "valid" : "INVALID"})`);
        console.log(`source ${c.manifest.provenance.indexUrl}\nretrieved ${c.manifest.provenance.retrievedAt} (${corpusAgeDays(c)} day(s) ago${flag("--refresh") ? ", live" : ", snapshot — use --refresh to re-read"})`);
        for (const [p, n] of Object.entries(c.manifest.counts.perPillar)) console.log(`  ${p.padEnd(24)} ${n}`);
      }
      break;
    }
    if (sub === "review") {
      needIcons();
      const spec = readSpec(rest[1]);
      let d; try { d = buildDiagram(spec); } catch (e) { if (!(e instanceof SpecError)) throw e; die(e.message); }
      let an; try { an = analyze(d, { cost: !flag("--no-cost"), review: true, mode: opt("--mode", "full"), pillars: opt("--pillars") ? opt("--pillars").split(",") : null, filter: opt("--filter", "all"), lens: opt("--lens", "auto"), criticality: opt("--criticality") }); } catch (e) { die(e.message); }
      const r = an.wa;
      if (json) out(r);
      else {
        console.log(`Well-Architected review · ${r.workload.name} · ${r.date} · mode ${r.mode} · ${r.lens} · ${r.criticality}`);
        const f = r.findingCounts; console.log(`${f.Critical} critical · ${f.High} high · ${f.Medium} medium · ${f.Low} low; ${r.coverage.framework.withEvidence}/${r.coverage.framework.assessedBps} framework BPs evidenced${r.coverage.lens ? `, ${r.coverage.lens.withEvidence}/${r.coverage.lens.assessedBps} lens BPs` : ""}`);
        for (const p of [...r.pillars, ...r.lensPillars]) console.log(`  ${p.name.padEnd(30)} ${p.score === null ? "—  " : p.score.toFixed(1)}  evidenced ${p.determinable}/${p.totalBps}`);
        for (const x of r.findings) console.log(`${x.id} ${x.risk.padEnd(8)} ${x.quadrant.padEnd(9)} ${x.title} [${x.bps.join(", ")}]`);
      }
      break;
    }
    die("usage: archify-aws wa corpus [--lens generative-ai] [--refresh] | wa review <spec.json> [--mode full|quick|pillar|score] [--pillars a,b] [--filter critical|critical-high|all] [--lens generative-ai] [--criticality low|standard|high|critical] [--no-cost] [--json]");
  }
  case "cost": {
    needIcons();
    const spec = readSpec(rest[0]);
    let d; try { d = buildDiagram(spec); } catch (e) { if (!(e instanceof SpecError)) throw e; die(e.message); }
    const scales = (opt("--scale", "1,3,10") || "1").split(",").map(Number).filter((x) => x > 0);
    let usage; if (opt("--usage")) usage = readSpec(opt("--usage"));
    let est; try { est = estimateCost(d, { region: opt("--region"), usage, scales, scale: 1 }); } catch (e) { die(e.message); }
    if (json) { out(est); break; }
    console.log(`Monthly estimate · ${est.region} · as of ${est.asOf} · ${est.confidence === "indicative" ? "INDICATIVE (some usage assumed)" : "from stated usage"}`);
    for (const n of est.nodes.filter((x) => x.status !== "not-billable")) {
      const amt = ["estimated", "override"].includes(n.status) ? money(n.monthlyUsd) : `(${n.status})`;
      console.log(`  ${(n.label || n.id).slice(0, 34).padEnd(36)} ${amt.padStart(14)}  ${(n.notes[0] || "").slice(0, 70)}`);
    }
    console.log(`\n  Total ${money(est.totals.monthlyUsd)}/month · ${money(est.totals.annualUsd)}/year`);
    for (const [k, v] of Object.entries(est.totals.byCategory).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(26)} ${money(v).padStart(14)}`);
    console.log("  Sensitivity (traffic ×): " + est.sensitivity.map((s) => `${s.scale}× ${money(s.monthlyUsd)}`).join(" · "));
    const c = est.coverage; console.log(`  Coverage: ${c.estimated + c.override}/${c.nodes} priced · ${c.needsInput} need input · ${c.notEstimated} not modelled · ${c.notItemized} not itemized`);
    for (const w of est.whatIfs) console.log(`  what-if: ${w.title}: ${w.monthlyDeltaUsd < 0 ? "saves" : "adds"} ${money(Math.abs(w.monthlyDeltaUsd))}/month`);
    console.log("\n" + est.basis);
    break;
  }
  case "doctor": {
    const ok = iconsAvailable();
    console.log(`node ${process.version}\nicons: ${ok ? "found" : "MISSING"} (${ICON_DIR})\ncatalog: ${catalog.services.length} services, ${catalog.resources.length} resources, ${catalog.groups.length} group icons`);
    process.exit(ok ? 0 : 3);
  }
  default:
    console.log(HELP);
    process.exit(cmd ? 1 : 0);
}
