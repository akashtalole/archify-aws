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

for (const name of ["three-tier", "serverless-api", "genai-rag"]) {
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
