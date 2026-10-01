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
  assert.deepEqual(a.stages.map((s) => s.name), ["validate", "render", "check", "browser-check"]);
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
for (const f of ["architecture.json", "review-run.sequence.json", "lifecycle.dataflow.json"]) {
  test(`compliance example ${f} passes finalize`, async (t) => {
    if (!iconsAvailable()) return t.skip("icons not fetched");
    const { finalize } = await import("../src/finalize.mjs");
    const r = finalize(path.join(ROOT, "examples", "compliance", f), { outHtml: path.join(ROOT, ".cache", "compliance", f.replace(/\.json$/, ".html")), png: false });
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
