import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, resolveIcon, searchIcons, iconsAvailable, catalog } from "../src/catalog.mjs";
import { validateSpec } from "../src/spec.mjs";
import { wrapLabel } from "../src/layout.mjs";

const needIcons = { skip: !iconsAvailable() && "icons not fetched (run npm run icons:fetch)" };
const load = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "examples", n + ".json"), "utf8"));

test("catalog covers the AWS icon package", () => {
  assert.ok(catalog.services.length > 250);
  assert.ok(catalog.groups.some((g) => g.key === "Region"));
});

test("icon aliases resolve to catalog entries", () => {
  for (const a of ["s3", "alb", "lambda", "ec2", "bedrock", "kms", "waf", "cloudwatch", "api-gateway", "sqs", "dynamodb"]) {
    assert.ok(resolveIcon(a), `alias ${a}`);
  }
  assert.equal(resolveIcon("res:vpc:nat-gateway").kind, "resource");
  assert.equal(resolveIcon("users").kind, "general");
  assert.equal(resolveIcon("not-a-service"), null);
  assert.ok(searchIcons("bedrock").some((h) => h.id === "bedrock"));
});

test("label wrapping never breaks a word and caps at two lines for typical names", () => {
  assert.deepEqual(wrapLabel("Application Load Balancer"), ["Application Load", "Balancer"]);
  assert.deepEqual(wrapLabel("AWS WAF"), ["AWS WAF"]);
});

test("validator reports unknown icons with suggestions, bad edges and duplicate ids", () => {
  const spec = { meta: { title: "t" }, root: { children: [{ id: "a", icon: "bedrok", label: "A" }, { id: "a", icon: "s3", label: "B" }] }, edges: [{ from: "a", to: "zzz" }] };
  const { errors } = validateSpec(spec);
  assert.ok(errors.some((e) => /unknown icon "bedrok"/.test(e)));
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
  assert.ok(errors.some((e) => /unknown "to"/.test(e)));
});

test("layout-only stacks cannot be edge endpoints", () => {
  const spec = { meta: { title: "t" }, root: { children: [{ id: "s", kind: "stack", children: [{ id: "a", icon: "s3", label: "A" }] }, { id: "b", icon: "s3", label: "B" }] }, edges: [{ from: "s", to: "b" }] };
  assert.ok(validateSpec(spec).errors.some((e) => /layout-only/.test(e)));
});

for (const name of ["three-tier", "serverless-api", "genai-rag", "healthcare-agentic-platform", "healthcare-governance", "healthcare-agentcore-services"]) {
  test(`example ${name} renders with no routing warnings and aligned connected icons`, needIcons, async () => {
    const { buildModel } = await import("../src/build.mjs");
    const { renderSvg } = await import("../src/render.mjs");
    const { model, warnings } = buildModel(load(name));
    assert.deepEqual(warnings.filter((w) => !/more than one edge/.test(w)), []);
    const svg = renderSvg(model, load(name));
    assert.match(svg, /^<svg /);
    assert.equal((svg.match(/<symbol /g) || []).length, new Set(svg.match(/<symbol id="[^"]+"/g)).size, "symbols deduplicated");
    // gradient ids from different icons must not collide
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, "unique ids");
    // no route may pass through a node it is not attached to
    for (const r of model.routes) for (const n of Object.values(model.nodes)) {
      if (n.id === r.edge.from || n.id === r.edge.to) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [a, b] = [r.pts[i], r.pts[i + 1]], c = n.iconRect;
        const hit = Math.max(a[0], b[0]) > c.x && Math.min(a[0], b[0]) < c.x + c.w && Math.max(a[1], b[1]) > c.y && Math.min(a[1], b[1]) < c.y + c.h;
        assert.ok(!hit, `${r.edge.from}->${r.edge.to} crosses ${n.id}`);
      }
    }
  });
}

test("review flags the classic gaps and recognises remedies", needIcons, async () => {
  const { buildModel } = await import("../src/build.mjs");
  const { reviewSpec } = await import("../src/review.mjs");
  const bare = { meta: { title: "t" }, root: { layout: "row", children: [
    { id: "u", icon: "users", label: "Users" }, { id: "cf", icon: "cloudfront", label: "CloudFront" },
    { id: "pub", kind: "public-subnet", children: [{ id: "db", icon: "rds", label: "RDS" }, { id: "ec2", icon: "ec2", label: "EC2" }] }] },
    edges: [{ from: "u", to: "cf" }, { from: "cf", to: "ec2" }, { from: "ec2", to: "db" }] };
  const r = reviewSpec(bare, buildModel(bare).model);
  const status = (id) => r.findings.find((f) => f.id === id)?.status;
  assert.equal(status("SEC-EDGE"), "gap");
  assert.equal(status("SEC-DB-PUBLIC"), "gap");
  assert.equal(status("OPS-OBSERVE"), "gap");
  const good = reviewSpec(load("three-tier"), buildModel(load("three-tier")).model);
  assert.equal(good.findings.find((f) => f.id === "SEC-EDGE").status, "ok");
  assert.equal(good.findings.find((f) => f.id === "REL-MULTIAZ").status, "ok");
});

test("generative AI lens rules fire for Bedrock workloads", needIcons, async () => {
  const { buildModel } = await import("../src/build.mjs");
  const { reviewSpec } = await import("../src/review.mjs");
  const spec = { meta: { title: "t" }, root: { layout: "row", children: [{ id: "u", icon: "users", label: "Users" }, { id: "fm", icon: "bedrock", label: "Amazon Bedrock" }] }, edges: [{ from: "u", to: "fm" }] };
  const r = reviewSpec(spec, buildModel(spec).model);
  assert.ok(r.genAI);
  assert.equal(r.findings.find((f) => f.id === "GENAI-GUARDRAILS").status, "gap");
  assert.equal(r.findings.find((f) => f.id === "GENAI-ENDPOINT").status, "gap");
  const full = load("genai-rag");
  const g = reviewSpec(full, buildModel(full).model);
  assert.equal(g.findings.find((f) => f.id === "GENAI-GUARDRAILS").status, "ok");
  assert.equal(g.findings.find((f) => f.id === "GENAI-OBSERVE").status, "ok");
});

test("sequence diagrams validate, render and expose nodes/edges for the viewer", needIcons, async () => {
  const { buildDiagram, SpecError } = await import("../src/pipeline.mjs");
  const spec = load("agent-tool-call.sequence");
  const d = buildDiagram(spec);
  assert.equal(d.type, "sequence");
  const svg = d.svg("light");
  assert.equal((svg.match(/class="node"/g) || []).length, spec.participants.length);
  assert.ok((svg.match(/class="edge"/g) || []).length >= 14);
  assert.equal(d.steps.length, d.steps.map((s) => s.step).filter((v, i, a) => a.indexOf(v) === i).length, "unique step numbers");
  assert.throws(() => buildDiagram({ ...spec, messages: [{ from: "user", to: "nobody", label: "x" }] }), SpecError);
  assert.throws(() => buildDiagram({ ...spec, groups: [{ kind: "vpc", members: ["user", "runtime"] }] }), /api.*between/);
});

test("dataflow stages compile to labelled columns inside an AWS boundary", needIcons, async () => {
  const { buildDiagram } = await import("../src/pipeline.mjs");
  const d = buildDiagram(load("clinical-notes.dataflow"));
  assert.equal(d.type, "dataflow");
  assert.deepEqual(d.warnings.filter((w) => !/more than one edge/.test(w)), []);
  const kinds = d.model.groups.map((g) => g.kind);
  assert.ok(kinds.includes("aws-cloud"));
  // the source stage is external, so it sits outside the boundary
  const src = d.model.groups.find((g) => g.id === "src");
  assert.equal(src.parent, null);
});

test("router approaches every port along its normal (no edge grazing an icon)", needIcons, async () => {
  const { buildDiagram } = await import("../src/pipeline.mjs");
  const d = buildDiagram(load("clinical-notes.dataflow"));
  for (const r of d.model.routes) {
    const last = r.pts.slice(-2);
    const n = d.model.nodes[r.edge.to];
    if (!n) continue;
    const [a, b] = last;
    const onIconEdge = (b[0] === n.iconRect.x || b[0] === n.iconRect.x + n.iconRect.w) ? a[1] === b[1] : (b[1] === n.iconRect.y ? a[0] === b[0] : true);
    assert.ok(onIconEdge, `${r.edge.from}->${r.edge.to} must meet the icon perpendicular to its side`);
  }
});

// ---- viewer runtime (needs Chrome; skipped otherwise)
test("viewer: deep links drive reach and route over authored edges only", async (t) => {
  const { chromeAvailable, dumpDom } = await import("../src/browser.mjs");
  if (!iconsAvailable() || !chromeAvailable()) return t.skip("needs icons and Chrome");
  const { execFileSync } = await import("node:child_process");
  const out = path.join(ROOT, ".cache", "viewer-test.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, "bin", "archify-aws.mjs"), "render", path.join(ROOT, "examples", "genai-rag.json"), "-o", out, "--no-review"]);
  const bar = (dom) => ((dom.match(/<div id="bar"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  let r = dumpDom(out, { hash: "#route=users~fm" });
  assert.match(bar(r.dom), /3 hops/);
  assert.equal(r.errors.length, 0);
  r = dumpDom(out, { hash: "#route=fm~users" });
  assert.match(bar(r.dom), /no directed route/);
  r = dumpDom(out, { hash: "#focus=orch&reach=downstream" });
  assert.match(bar(r.dom), /4 node\(s\), 4 relationship/);
  r = dumpDom(out, { search: "?present=1&theme=dark" });
  assert.match(r.dom, /<body[^>]*class="[^"]*present/);
  assert.match(r.dom, /<body[^>]*class="[^"]*dark/);
});

// ---- Mermaid import
test("mermaid flowchart import: shapes, chains, subgraphs, labels and icon mapping with confidence", async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  const r = importMermaid(`flowchart LR
    U([Customer Browser]) -->|HTTPS| CDN[CloudFront CDN] --> API[API Gateway]
    subgraph AWS Cloud
      API --> F[Orders Lambda]
      F -.-> D[(Orders DynamoDB)]
    end
    F --> P[Payment Gateway]`);
  assert.equal(r.type, "architecture");
  const map = Object.fromEntries(r.report.mappings.map((m) => [m.id, m]));
  assert.equal(map.CDN.icon, "cloudfront");
  assert.equal(map.F.icon, "lambda");
  assert.equal(map.D.icon, "dynamodb");
  assert.equal(map.P.confidence, "fallback", "unknown services are reported, not guessed");
  assert.deepEqual(r.report.unmapped, ["P"]);
  assert.equal(r.spec.edges.length, 5);
  assert.ok(r.spec.edges.some((e) => e.from === "F" && e.to === "D" && e.style === "dashed"));
  assert.ok(r.spec.edges.some((e) => e.label === "HTTPS"));
  const groups = JSON.stringify(r.spec.root).match(/"kind":"aws-cloud"/g);
  assert.equal(groups.length, 1, "subgraph named AWS Cloud becomes the aws-cloud group");
});

test("mermaid sequence import: message kinds, notes and fragments", async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  const r = importMermaid(`sequenceDiagram
    participant A as API Gateway
    participant L as Orders Lambda
    A->>L: invoke
    L-->>A: ok
    loop retry
      L-)A: event
    end
    Note over A,L: shared note
    L->>L: validate`);
  assert.equal(r.type, "sequence");
  assert.deepEqual(r.spec.messages.map((m) => m.kind || (m.note ? "note" : "sync")), ["sync", "return", "async", "note", "self"]);
  assert.deepEqual(r.spec.fragments, [{ kind: "loop", label: "retry", from: 2, to: 2 }]);
});

test("imported specs validate and render", needIcons, async () => {
  const { importMermaid } = await import("../src/mermaid.mjs");
  const { buildDiagram } = await import("../src/pipeline.mjs");
  for (const f of ["orders-flow.mmd", "checkout.sequence.mmd"]) {
    const r = importMermaid(fs.readFileSync(path.join(ROOT, "examples", "mermaid", f), "utf8"));
    const d = buildDiagram(r.spec);
    assert.match(d.svg("light"), /^<svg /);
  }
  assert.throws(() => importMermaid("pie title x\n a: 1"), /unrecognized/);
});

// ---- IaC import
test("terraform import resolves glue resources into source->target edges and groups VPC-attached nodes", async () => {
  const { importIac } = await import("../src/iac.mjs");
  const r = importIac(path.join(ROOT, "examples", "iac", "terraform"));
  const e = (a, b) => r.spec.edges.find((x) => x.from === a && x.to === b);
  assert.ok(e("web", "site"), "cloudfront -> s3 origin");
  assert.ok(e("orders_2", "orders") || r.spec.edges.some((x) => /orders/.test(x.from) && /orders/.test(x.to)), "api -> lambda via integration/permission");
  const labels = r.spec.edges.map((x) => x.label).filter(Boolean);
  assert.ok(labels.includes("subscribes") && labels.includes("triggers"));
  assert.deepEqual(Object.keys(r.report.skipped).sort(), ["aws_db_subnet_group", "aws_subnet", "iam", "logs"]);
  assert.match(JSON.stringify(r.spec.root), /"kind":"vpc"/);
  // logs/iam can be opted in
  const r2 = importIac(path.join(ROOT, "examples", "iac", "terraform"), { include: ["logs", "iam"] });
  assert.ok(r2.report.nodes > r.report.nodes);
});

test("SAM import: implicit API, SQS/schedule events with direction, no reversed duplicate refs", async () => {
  const { importIac } = await import("../src/iac.mjs");
  const r = importIac(path.join(ROOT, "examples", "iac", "sam"));
  const has = (a, b) => r.spec.edges.some((x) => x.from === a && x.to === b);
  assert.ok(has("ServerlessApi", "Intake"));
  assert.ok(has("NotesQueue", "Processor"), "SQS event: queue triggers function");
  assert.ok(!has("Processor", "NotesQueue"), "event refs must not also create the reverse edge");
  assert.ok(has("Topic", "NotesQueue"), "subscription glue: topic -> queue");
  assert.ok(r.spec.edges.some((x) => /rate\(1 day\)/.test(x.label || "")));
});

test("iac import errors clearly on empty input and renders", needIcons, async () => {
  const { importIac } = await import("../src/iac.mjs");
  const { buildDiagram } = await import("../src/pipeline.mjs");
  assert.throws(() => importIac(path.join(ROOT, "references")), /no Terraform or CloudFormation/);
  for (const d of ["terraform", "sam"]) {
    const spec = importIac(path.join(ROOT, "examples", "iac", d)).spec;
    assert.deepEqual(buildDiagram(spec).warnings.filter((w) => !/more than one edge/.test(w)), []);
  }
});

// ---- finalize, schemas, guide
test("finalize passes on a good spec and writes a deterministic receipt", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { finalize } = await import("../src/finalize.mjs");
  const out = path.join(ROOT, ".cache", "fin", "t.html");
  const a = finalize(path.join(ROOT, "examples", "three-tier.json"), { outHtml: out, png: false });
  const b = finalize(path.join(ROOT, "examples", "three-tier.json"), { outHtml: out, png: false });
  assert.equal(a.ok, true);
  assert.deepEqual(a.stages.map((s) => s.name), ["validate", "analyze", "render", "check", "browser-check"]);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "receipt is deterministic (no timestamps or timings)");
  assert.equal(a.visualReview, "not-performed");
  assert.match(a.outputs.html.sha256, /^[0-9a-f]{64}$/);
});

test("finalize stops at the first failing gate and lists every error", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { finalize } = await import("../src/finalize.mjs");
  const bad = path.join(ROOT, ".cache", "bad.json");
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.writeFileSync(bad, JSON.stringify({ meta: { title: "bad" }, root: { children: [{ id: "a", icon: "bedrok", label: "A" }, { id: "b", icon: "s3", label: "B" }] }, edges: [{ from: "a", to: "zz" }] }));
  const r = finalize(bad, { outHtml: path.join(ROOT, ".cache", "bad.html") });
  assert.equal(r.ok, false);
  assert.deepEqual(r.stages.map((s) => s.name + ":" + s.status), ["validate:fail"]);
  assert.ok(r.stages[0].detail.errors.some((e) => /bedrok/.test(e)) && r.stages[0].detail.errors.some((e) => /zz/.test(e)));
});

test("committed JSON Schemas are in sync with the code's enums", async () => {
  const { buildSchemas } = await import("../src/schemas.mjs");
  const { GROUP_KINDS } = await import("../src/groups.mjs");
  for (const [name, schema] of Object.entries(buildSchemas())) {
    const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, "schemas", `${name}.schema.json`), "utf8"));
    assert.deepEqual(onDisk, schema, `${name}.schema.json is stale — run node scripts/build-schemas.mjs`);
  }
  assert.deepEqual(buildSchemas().architecture.$defs.groupKind.enum, Object.keys(GROUP_KINDS));
});

test("guide routes scenarios to the right diagram type", async () => {
  const { guideScenario } = await import("../src/schemas.mjs");
  assert.equal(guideScenario("show the request lifecycle and call flow between API Gateway and Lambda with retries").type, "sequence");
  assert.equal(guideScenario("ETL pipeline ingesting streams into a data lake and warehouse").type, "dataflow");
  const a = guideScenario("multi-AZ VPC architecture for a Bedrock RAG agent platform");
  assert.equal(a.type, "architecture");
  assert.equal(a.template, "genai-rag");
  assert.ok(a.hints.some((h) => /Generative AI detected/.test(h)));
});

test("icon search matches whole words and honours aliases (regression: 'ses' hit databases, 'sns' hit nothing)", async () => {
  const { searchIcons } = await import("../src/catalog.mjs");
  const ids = (q) => searchIcons(q, 5).map((h) => h.id);
  assert.ok(ids("ses").includes("simple-email-service"));
  assert.ok(!ids("ses").some((i) => ["rds", "aurora", "neptune"].includes(i)));
  assert.equal(ids("sns")[0], "simple-notification-service");
  assert.equal(ids("textract")[0], "textract");
});

test("guide suggests companion diagrams for human-in-the-loop and deployment scenarios", async () => {
  const { guideScenario } = await import("../src/schemas.mjs");
  const g = guideScenario("compliance review assistant checks documents against 100 checks with human in the loop approval, then deploy rule changes through a pipeline with sign-off");
  assert.deepEqual(g.diagrams.map((d) => d.type), ["architecture", "sequence", "dataflow"]);
  assert.ok(g.hints.some((h) => /Human-in-the-loop/.test(h)));
});

// ---- compliance review assistant use case (end-to-end through finalize)
for (const f of ["compliance/architecture.json", "compliance/review-run.sequence.json", "compliance/lifecycle.dataflow.json", "compliance-agentcore/architecture.json", "compliance-agentcore/review-run.sequence.json"]) {
  test(`compliance example ${f} passes finalize`, async (t) => {
    if (!iconsAvailable()) return t.skip("icons not fetched");
    const { finalize } = await import("../src/finalize.mjs");
    const r = finalize(path.join(ROOT, "examples", f), { outHtml: path.join(ROOT, ".cache", "compliance", f.replace(/\//g, "-").replace(/\.json$/, ".html")), png: false });
    assert.equal(r.ok, true, JSON.stringify(r.stages.filter((s) => s.status === "fail")));
  });
}

test("router keeps edges out of groups that neither endpoint belongs to", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { buildDiagram } = await import("../src/pipeline.mjs");
  const d = buildDiagram(load("healthcare-agentcore-services") && JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "compliance", "architecture.json"), "utf8")));
  const sfnToHitl = d.model.routes.find((r) => r.edge.from === "sfn" && r.edge.to === "hitl");
  const engine = d.model.groups.find((g) => g.id === "engine").rect;
  for (let i = 0; i < sfnToHitl.pts.length - 1; i++) {
    const [a, b] = [sfnToHitl.pts[i], sfnToHitl.pts[i + 1]];
    const through = Math.max(a[0], b[0]) > engine.x + 2 && Math.min(a[0], b[0]) < engine.x + engine.w - 2 && Math.max(a[1], b[1]) > engine.y + 2 && Math.min(a[1], b[1]) < engine.y + engine.h - 2;
    assert.ok(!through, "human-review route must go around the check engine group");
  }
});

test("sequence: else-branch notes get label room and fragments contain their notes", async (t) => {
  if (!iconsAvailable()) return t.skip("icons not fetched");
  const { renderSequence } = await import("../src/sequence.mjs");
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "compliance-agentcore", "review-run.sequence.json"), "utf8"));
  const svg = renderSequence(spec).svg;
  const alt = spec.fragments.find((f) => f.kind === "alt");
  assert.equal(spec.messages[alt.elseAt].note !== undefined, true, "fixture has a note in the else branch");
  const label = svg.match(/<text class="fraglabel"[^>]*y="([\d.]+)">\[all pass/);
  const note = svg.match(/<g class="note"><rect x="[\d.]+" y="([\d.]+)"/g).pop().match(/y="([\d.]+)"/);
  assert.ok(Number(note[1]) > Number(label[1]) + 4, "note starts below the else label");
});

test("AgentCore Policy is drawn with the AgentCore icon, never the Verified Permissions icon", () => {
  for (const f of ["agent-tool-call.sequence.json", "compliance-agentcore/review-run.sequence.json", "healthcare-agentcore-services.json", "compliance-agentcore/architecture.json"]) {
    const txt = fs.readFileSync(path.join(ROOT, "examples", f), "utf8");
    const j = JSON.parse(txt);
    const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (/AgentCore Policy/.test(o.label || "")) assert.notEqual(o.icon, "verified-permissions", f); Object.values(o).forEach(walk); } };
    walk(j);
  }
});

// ---- Well-Architected corpus (AWS aws-well-architected-review skill: index-driven, validated, never invented)
const tocFixture = { contents: [
  { title: "Intro", href: "intro.html" },
  { title: "Appendix", href: "appendix.html", contents: [
    { title: "Security", href: "a-sec.html", contents: [
      { title: "Identity", href: "a-id.html", contents: [
        { title: "SEC 1. How do you manage identities?", href: "sec-01.html", contents: [
          { title: "SEC01-BP01 Use strong sign-in", href: "sec_1_1.html" }, { title: "SEC01-BP02 Use temporary credentials", href: "sec_1_2.html" }] }] }] },
    { title: "Reliability", href: "a-rel.html", contents: [
      { title: "Foundations", href: "a-f.html", contents: [
        { title: "REL 1. How do you manage quotas?", href: "rel-01.html", contents: [{ title: "REL01-BP01 Aware of quotas", href: "rel_1_1.html" }] }] }] }] } ] };

test("WA corpus parser finds the pillar level through a single appendix branch and derives questions", async () => {
  const { parseToc, validateCorpus } = await import("../src/wa/corpus.mjs");
  const c = parseToc(tocFixture, "https://docs.aws.amazon.com/x/");
  assert.deepEqual(c.pillars.map((p) => p.id), ["security", "reliability"]);
  assert.deepEqual(c.bps.map((b) => b.bp_id), ["SEC01-BP01", "SEC01-BP02", "REL01-BP01"]);
  assert.equal(c.questions.find((q) => q.question_id === "SEC01").question_title, "SEC 1. How do you manage identities?");
  assert.equal(c.bps[0].bp_url, "https://docs.aws.amazon.com/x/sec_1_1.html");
  assert.equal(validateCorpus(c).valid, true);
});

test("WA corpus validation gate rejects empty, duplicate and lopsided corpora", async () => {
  const { validateCorpus } = await import("../src/wa/corpus.mjs");
  assert.equal(validateCorpus({ pillars: [], questions: [], bps: [] }).valid, false);
  const bp = (id, q, p) => ({ bp_id: id, bp_title: "t", bp_url: "u", question_id: q, pillar_id: p, pillar_name: p });
  const lopsided = { pillars: [{ id: "a" }, { id: "b" }], questions: [{ question_id: "AAA01" }, { question_id: "BBB01" }],
    bps: [...Array.from({ length: 9 }, (_, i) => bp(`AAA01-BP0${i + 1}`, "AAA01", "a")), bp("BBB01-BP01", "BBB01", "b")] };
  assert.match(validateCorpus(lopsided).errors.join(), /implausible spread/);
  const dup = { pillars: [{ id: "a" }], questions: [{ question_id: "AAA01" }], bps: [bp("AAA01-BP01", "AAA01", "a"), bp("AAA01-BP01", "AAA01", "a")] };
  assert.match(validateCorpus(dup).errors.join(), /duplicate BP/);
  const orphan = { pillars: [{ id: "a" }], questions: [{ question_id: "AAA01" }, { question_id: "AAA02" }], bps: [bp("AAA01-BP01", "AAA01", "a")] };
  assert.match(validateCorpus(orphan).errors.join(), /AAA02 has no best practice/);
});

test("committed WA snapshots are valid, canonical and carry provenance", async () => {
  const { loadCorpus } = await import("../src/wa/corpus.mjs");
  const fw = loadCorpus("framework"), lens = loadCorpus("generative-ai");
  assert.equal(fw.pillars.length, 6);
  assert.ok(fw.bps.length > 250 && lens.bps.length > 40);
  assert.ok(fw.bps.every((b) => /^[A-Z]{2,8}\d{2}-BP\d{2}$/.test(b.bp_id)));
  assert.ok(lens.bps.some((b) => b.bp_id === "GENSEC02-BP01" && /guardrails/i.test(b.bp_title)));
  for (const c of [fw, lens]) { assert.match(c.manifest.provenance.indexUrl, /^https:\/\/docs\.aws\.amazon\.com\/.*toc-contents\.json$/); assert.ok(Date.parse(c.manifest.provenance.retrievedAt)); }
});

// ---- cost estimation (AWS billing-and-cost-management skill rules: deterministic math, Price List only, explicit assumptions)
const costOf = async (spec, opts) => {
  const { buildDiagram } = await import("../src/pipeline.mjs");
  const { estimateCost } = await import("../src/cost/estimate.mjs");
  return estimateCost(buildDiagram(spec), { asOf: new Date("2026-01-15T00:00:00Z"), ...opts });
};
const mini = (usage, icon = "lambda") => ({ meta: { title: "t" }, root: { children: [{ id: "n", icon, label: "Node", usage }] } });

test("tiered pricing walks tier boundaries", async () => {
  const { tiered } = await import("../src/cost/pricebook.mjs");
  const rows = [{ b: 0, e: 100, usd: "1" }, { b: 100, e: 300, usd: "0.5" }, { b: 300, e: null, usd: "0.25" }];
  assert.equal(tiered(rows, 50).usd, 50);
  assert.equal(tiered(rows, 100).usd, 100);
  assert.equal(tiered(rows, 400).usd, 100 + 100 + 25);
  assert.equal(tiered(rows, 0).usd, 0);
});

test("Lambda cost equals requests × request rate + GB-seconds × duration rate, read from the price book", needIcons, async () => {
  const { loadPriceBook, tiered } = await import("../src/cost/pricebook.mjs");
  const pb = loadPriceBook("us-east-1");
  const req = pb.dim("AWSLambda", (r) => r.u === "Request", "r"), dur = pb.dim("AWSLambda", (r) => r.u === "Lambda-GB-Second", "d");
  const usage = { requestsPerMonth: 2_000_000, avgDurationMs: 300, memoryMb: 1024, arch: "x86" };
  const est = await costOf(mini(usage));
  const expected = tiered(req, 2_000_000).usd + tiered(dur, 2_000_000 * 0.3 * 1).usd;
  assert.ok(Math.abs(est.nodes[0].monthlyUsd - Math.round(expected * 1e4) / 1e4) < 1e-9, `${est.nodes[0].monthlyUsd} vs ${expected}`);
  assert.equal(est.nodes[0].status, "estimated");
  assert.equal(est.confidence, "usage-based", "all usage supplied by the spec");
});

test("defaults are recorded as assumptions and make the estimate indicative", needIcons, async () => {
  const est = await costOf(mini({ requestsPerMonth: 1e6 }));
  assert.equal(est.confidence, "indicative");
  assert.ok(est.defaultedAssumptions.some((a) => a.key === "avgDurationMs"));
  assert.deepEqual(est.nodes[0].assumptions.find((a) => a.key === "requestsPerMonth"), { key: "requestsPerMonth", value: 1e6, source: "spec", scaledByTraffic: true });
});

test("traffic sensitivity scales variable costs but not fixed hourly costs", needIcons, async () => {
  const lam = await costOf(mini({ requestsPerMonth: 1e6, avgDurationMs: 100, memoryMb: 128 }), { scales: [1, 10] });
  assert.ok(lam.sensitivity[1].monthlyUsd > lam.sensitivity[0].monthlyUsd * 9.9);
  const ec2 = await costOf(mini({ instanceType: "m5.large", count: 2, ebsGbPerInstance: 0 }, "ec2"), { scales: [1, 10] });
  assert.equal(ec2.sensitivity[0].monthlyUsd, ec2.sensitivity[1].monthlyUsd, "instance-hours do not scale with traffic");
});

test("honesty: unmodelled, ambiguous and unknown inputs are reported, never invented", needIcons, async () => {
  const hl = await costOf(mini({}, "healthlake"));
  assert.equal(hl.nodes[0].status, "not-estimated");
  assert.equal(hl.totals.monthlyUsd, 0);
  const noModel = await costOf(mini({ inputTokensPerMonth: 1e6 }, "bedrock"));
  assert.equal(noModel.nodes[0].status, "needs-input");
  assert.match(noModel.nodes[0].notes[0], /usage\.model/);
  const vague = await costOf(mini({ model: "Claude" }, "bedrock"));
  assert.equal(vague.nodes[0].status, "needs-input");
  assert.match(vague.nodes[0].notes[0], /several Bedrock models|no Bedrock model/);
  const typo = await costOf(mini({ instanceType: "m5.nonexistent" }, "ec2"));
  assert.equal(typo.nodes[0].status, "needs-input");
});

test("override costs are labelled as user-supplied; no-charge and general icons are not priced", needIcons, async () => {
  const o = await costOf({ meta: { title: "t" }, root: { children: [{ id: "a", icon: "healthlake", label: "HL", usage: { monthlyUsd: 123.456, note: "from quote" } }, { id: "b", icon: "identity-and-access-management", label: "IAM" }, { id: "c", icon: "users", label: "Users" }] } });
  assert.deepEqual(o.nodes.map((n) => n.status), ["override", "no-charge", "not-billable"]);
  assert.equal(o.totals.monthlyUsd, 123.456);
  assert.equal(o.nodes[0].notes[0], "from quote");
});

test("Bedrock cost matches tokens × per-token rate and Multi-AZ what-if is the real price difference", needIcons, async () => {
  const { loadPriceBook } = await import("../src/cost/pricebook.mjs");
  const pb = loadPriceBook();
  const inRow = pb.rows("AmazonBedrockFoundationModels").find((r) => /Sonnet 5\.5/.test(r.a.servicename || "") && /^MP:\w+_input_tokens_standard-Units$/.test(r.u));
  const outRow = pb.rows("AmazonBedrockFoundationModels").find((r) => /Sonnet 5\.5/.test(r.a.servicename || "") && /^MP:\w+_output_tokens_standard-Units$/.test(r.u));
  const est = await costOf(mini({ model: "Claude Sonnet 5.5", inputTokensPerMonth: 10e6, outputTokensPerMonth: 2e6 }, "bedrock"));
  assert.ok(Math.abs(est.nodes[0].monthlyUsd - (10 * Number(inRow.usd) + 2 * Number(outRow.usd))) < 1e-6);
  const rds = await costOf(mini({ instanceClass: "db.r6g.large", engine: "PostgreSQL", multiAz: true, storageGb: 100 }, "rds"));
  const single = await costOf(mini({ instanceClass: "db.r6g.large", engine: "PostgreSQL", multiAz: false, storageGb: 100 }, "rds"));
  const w = rds.whatIfs.find((x) => /rds-multiaz/.test(x.id));
  assert.ok(Math.abs(w.monthlyDeltaUsd - (rds.totals.monthlyUsd - single.totals.monthlyUsd)) < 1e-4);
  assert.equal(w.tradeoff, true);
});

test("cost estimate is deterministic and carries provenance", needIcons, async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "compliance", "architecture.json"), "utf8"));
  const a = await costOf(spec), b = await costOf(spec);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.asOf, "2026-01-15");
  assert.match(a.basis, /on-demand/);
  assert.ok(a.priceBook.publications.AmazonBedrockFoundationModels);
  const sumNodes = Math.round(a.nodes.filter((n) => ["estimated", "override"].includes(n.status)).reduce((s, n) => s + n.monthlyUsd, 0) * 1e4) / 1e4;
  assert.equal(a.totals.monthlyUsd, sumNodes);
  assert.equal(a.totals.annualUsd, Math.round(sumNodes * 12 * 1e4) / 1e4);
});

// ---- Well-Architected review engine and report tabs
import { reviewWorkload, riskLevel } from "../src/wa/evaluate.mjs";
import { LEGACY_RULES, LEGACY_LENS_RULES, PROCEDURAL_RULES } from "../src/wa/rules.mjs";
import { loadCorpus as loadWaCorpus } from "../src/wa/corpus.mjs";
import { analyze } from "../src/analysis.mjs";
import { buildDiagram } from "../src/pipeline.mjs";
import { renderPage as renderPageWa } from "../src/page.mjs";

const compliance = () => buildDiagram(JSON.parse(fs.readFileSync(new URL("../examples/compliance-agentcore/architecture.json", import.meta.url), "utf8")));

test("WA rules only cite canonical best-practice IDs from the corpus", () => {
  const fw = new Set(loadWaCorpus("framework").bps.map((b) => b.bp_id)), lens = new Set(loadWaCorpus("generative-ai").bps.map((b) => b.bp_id));
  for (const r of LEGACY_RULES) for (const id of Object.keys(r.fw || {})) assert.ok(fw.has(id), id);
  for (const r of [...LEGACY_RULES, ...LEGACY_LENS_RULES]) for (const id of Object.keys(r.lens || {})) assert.ok(lens.has(id), id);
  assert.ok(PROCEDURAL_RULES.length > 0);
});

test("risk matrix follows the review skill", () => {
  assert.equal(riskLevel("Severe", "High"), "Critical");
  assert.equal(riskLevel("Severe", "Low"), "High");
  assert.equal(riskLevel("Moderate", "High"), "High");
  assert.equal(riskLevel("Moderate", "Medium"), "Medium");
  assert.equal(riskLevel("Minor", "High"), "Medium");
  assert.equal(riskLevel("Minor", "Low"), "Low");
});

test("review assesses every best practice exactly once, deterministically", () => {
  const d = compliance(), { cost } = analyze(d, { review: false }), now = new Date("2026-10-01T00:00:00Z");
  const a = reviewWorkload(d, { cost, now }), b = reviewWorkload(d, { cost, now });
  assert.deepEqual(a, b);
  const fw = loadWaCorpus("framework");
  assert.equal(a.ledger.length, fw.bps.length);
  assert.equal(new Set(a.ledger.map((x) => x.bp_id)).size, fw.bps.length);
  assert.equal(a.lens, "generative-ai");
  assert.ok(a.ledger.some((x) => x.status === "Cannot Determine"));
  for (const f of a.findings) assert.match(f.id, /^F-\d{3}$/);
});

test("review modes and criticality", () => {
  const d = compliance();
  assert.equal(reviewWorkload(d, { mode: "score" }).ledger.length, 0);
  const sec = reviewWorkload(d, { mode: "pillar", pillars: ["security"] });
  assert.ok(sec.ledger.length > 0 && sec.ledger.every((x) => x.pillar_id === "security"));
  assert.throws(() => reviewWorkload(d, { mode: "bogus" }));
});

test("page has Diagram, Cost and Well-Architected tabs with a full ledger", () => {
  const d = compliance(), an = analyze(d), html = renderPageWa(d, an.wa, "light", an.cost);
  for (const id of ["tab-diagram", "tab-cost", "tab-wa"]) assert.ok(html.includes(`id="${id}"`));
  assert.equal((html.match(/<tr data-s="/g) || []).length, an.wa.ledger.length + an.wa.lensLedger.length);
  assert.ok(html.includes("CONFIDENTIAL"));
  assert.ok(!renderPageWa(d, null, "light", null).includes('id="tab-wa"'));
});
