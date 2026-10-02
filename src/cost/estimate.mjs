// Cost estimate for a diagram: price book + per-service usage assumptions -> monthly USD, with every
// assumption, rate and source recorded. Pure and deterministic: all arithmetic happens here, in code.
// Basis (stated in every report): public on-demand list prices; excludes free tier, taxes, support plans,
// Savings Plans / RI / Spot / enterprise discounts, and data transfer unless a node supplies `egressGbPerMonth`.
import { loadPriceBook, tiered, round4, PricingError } from "./pricebook.mjs";
import { PRICERS, SERVICE_PRICER, NO_CHARGE, line } from "./pricers.mjs";

export const CATEGORY = { lambda: "Compute", fargate: "Compute", ec2: "Compute", elb: "Network", nat: "Network", egress: "Network",
  bedrock: "AI and agents", guardrails: "AI and agents", agentcore: "AI and agents", textract: "AI and agents", comprehend: "AI and agents", comprehendmedical: "AI and agents",
  dynamodb: "Data and storage", s3: "Data and storage", rds: "Data and storage", aurora: "Data and storage", opensearch: "Data and storage",
  apigw: "Integration", sqs: "Integration", sns: "Integration", sfn: "Integration", events: "Integration",
  cloudwatch: "Security and operations", kms: "Security and operations", waf: "Security and operations", cognito: "Security and operations", secrets: "Security and operations" };

function readerFor(userUsage, scale, assumptions) {
  const record = (key, value, source, scaled) => { if (!assumptions.has(key)) assumptions.set(key, { key, value, source, ...(scaled ? { scaledByTraffic: true } : {}) }); };
  const u = (key, dflt) => {
    const v = userUsage?.[key];
    if (v !== undefined) { record(key, v, "spec"); return v; }
    if (dflt === undefined) throw new PricingError(`usage.${key} is required for this service`);
    record(key, dflt, "default");
    return dflt;
  };
  const vol = (key, dflt) => { const v = u(key, dflt); assumptions.set(key, { ...assumptions.get(key), scaledByTraffic: true }); return v * scale; };
  return { u, vol };
}

function pricerFor(n, usage) {
  if (usage.pricer) return usage.pricer;
  const k = n.icon.kind, id = n.icon.entry.id;
  if (k === "service") {
    if (id === "bedrock") return /guardrail/i.test(`${n.item.label} ${n.item.sublabel || ""}`) ? "guardrails" : "bedrock";
    return SERVICE_PRICER[id] || null;
  }
  if (k === "resource" && id === "vpc:nat-gateway") return "nat";
  return null;
}

function runNode(n, ctx, scale) {
  const usage = { ...(n.item.usage || {}), ...(ctx.overrides?.[n.id] || {}) };
  const label = n.item.label || n.id;
  const base = { id: n.id, label, service: n.icon.entry.name, assumptions: [], notes: [], lines: [], monthlyUsd: 0 };
  if (n.icon.kind === "general") return { ...base, status: "not-billable", notes: ["General icon: not a billable AWS resource."] };
  if (usage.monthlyUsd !== undefined) return { ...base, status: "override", pricer: "override", category: usage.category || "Other", monthlyUsd: round4(Number(usage.monthlyUsd)), notes: [usage.note || "Monthly cost supplied in the spec (usage.monthlyUsd); not computed from the Price List."] };
  const pricer = pricerFor(n, usage);
  if (!pricer) {
    if (n.icon.kind === "service" && NO_CHARGE.has(n.icon.entry.id)) return { ...base, status: "no-charge", notes: [`${n.icon.entry.name} has no direct charge.`] };
    return { ...base, status: "not-estimated", notes: [`No cost model for ${n.icon.entry.name} yet. Supply \`usage.monthlyUsd\` on the node to include it.`] };
  }
  const model = PRICERS[pricer];
  if (!model) return { ...base, status: "error", notes: [`unknown pricer "${pricer}"`] };
  const assumptions = new Map();
  const { u, vol } = readerFor(usage, scale, assumptions);
  try {
    const res = model.run({ pb: ctx.pb, u, vol, node: n });
    const lines = res.lines.slice();
    if (usage.egressGbPerMonth) {
      const g = ctx.pb.dim("AWSDataTransfer", (r) => r.u === "DataTransfer-Out-Bytes" && r.a.fromLocation && r.a.fromLocation !== "Global", "data transfer out to the internet");
      lines.push(line("Data transfer out to the internet (GB)", g, usage.egressGbPerMonth * scale));
      ctx.services.add("AWSDataTransfer");
    }
    const total = round4(lines.reduce((s, l) => s + l.usd, 0));
    for (const code of pricerServiceCodes(pricer)) ctx.services.add(code);
    return { ...base, status: res.notItemized ? "not-itemized" : "estimated", pricer, category: CATEGORY[pricer] || "Other", monthlyUsd: total, lines, assumptions: [...assumptions.values()], notes: [...(res.notes || []), ...(res.notItemized ? [res.notItemized] : [])], ...(res.model ? { model: res.model } : {}) };
  } catch (e) {
    if (!(e instanceof PricingError)) throw e;
    return { ...base, status: "needs-input", pricer, category: CATEGORY[pricer] || "Other", assumptions: [...assumptions.values()], notes: [e.message] };
  }
}
const SERVICE_CODES = { lambda: ["AWSLambda"], apigw: ["AmazonApiGateway"], dynamodb: ["AmazonDynamoDB"], s3: ["AmazonS3"], sqs: ["AWSQueueService"], sns: ["AmazonSNS"], sfn: ["AmazonStates"], events: ["AWSEvents"],
  cloudwatch: ["AmazonCloudWatch"], kms: ["awskms"], waf: ["awswaf"], cognito: ["AmazonCognito"], secrets: ["AWSSecretsManager"], textract: ["AmazonTextract"], comprehend: ["comprehend"],
  comprehendmedical: ["comprehendmedical"], opensearch: ["AmazonES"], fargate: ["AmazonECS"], ec2: ["AmazonEC2"], rds: ["AmazonRDS"], aurora: ["AmazonRDS"], elb: ["AWSELB"], nat: ["AmazonEC2"],
  guardrails: ["AmazonBedrock"], bedrock: ["AmazonBedrock", "AmazonBedrockFoundationModels"], agentcore: ["AmazonBedrockAgentCore"] };
const pricerServiceCodes = (p) => SERVICE_CODES[p] || [];

function runAll(nodes, ctx, scale) { return nodes.map((n) => runNode(n, ctx, scale)); }
const sum = (xs) => round4(xs.reduce((s, x) => s + x, 0));

export function estimateCost(diagram, { region, scale = 1, usage: overrides, scales = [1, 3, 10], asOf = new Date() } = {}) {
  const spec = diagram.spec || {};
  const rgn = region || spec.meta?.cost?.region || "us-east-1";
  const pb = loadPriceBook(rgn);
  const ctx = { pb, overrides, services: new Set() };
  const nodes = diagram.nodeList || [];
  const results = runAll(nodes, ctx, scale);
  const counted = results.filter((r) => ["estimated", "override"].includes(r.status));
  const monthly = sum(counted.map((r) => r.monthlyUsd));
  const byCategory = {};
  for (const r of counted) byCategory[r.category] = sum([(byCategory[r.category] || 0), r.monthlyUsd]);
  const defaulted = results.flatMap((r) => r.assumptions.filter((a) => a.source === "default").map((a) => ({ node: r.id, key: a.key, value: a.value })));
  const count = (st) => results.filter((r) => r.status === st).length;
  const sensitivity = scales.map((s) => ({ scale: s, monthlyUsd: s === scale ? monthly : sum(runAll(nodes, { pb, overrides, services: new Set() }, s).filter((r) => ["estimated", "override"].includes(r.status)).map((r) => r.monthlyUsd)) }));
  const whatIfs = computeWhatIfs(nodes, ctx, results, scale);
  return {
    schema_version: "archify-aws.cost.v1",
    asOf: asOf.toISOString().slice(0, 10), region: rgn, currency: "USD", scale,
    basis: "Public on-demand AWS list prices from the AWS Price List. Excludes free tier, taxes, support plans, Savings Plans/Reserved Instances/Spot and enterprise discounts, and data transfer unless a node sets egressGbPerMonth. Monthly = 730 hours. Not a quote: confirm with the AWS Pricing Calculator.",
    totals: { monthlyUsd: monthly, annualUsd: round4(monthly * 12), byCategory },
    coverage: { nodes: results.length, estimated: count("estimated"), override: count("override"), noCharge: count("no-charge"), notBillable: count("not-billable"), notItemized: count("not-itemized"), needsInput: count("needs-input"), notEstimated: count("not-estimated"), error: count("error") },
    confidence: defaulted.length ? "indicative" : "usage-based",
    defaultedAssumptions: defaulted,
    nodes: results, sensitivity, whatIfs,
    priceBook: { region: rgn, retrievedAt: pb.retrievedAt, publications: pb.publications(ctx.services) },
  };
}

/** Deterministic what-ifs computed from the same price book (never estimated by reasoning). */
function computeWhatIfs(nodes, ctx, results, scale) {
  const out = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const r of results) {
    const n = byId.get(r.id);
    const usage = { ...(n.item.usage || {}), ...(ctx.overrides?.[n.id] || {}) };
    if (r.status !== "estimated") continue;
    const rerun = (patch) => { const alt = runNode({ ...n, item: { ...n.item, usage: { ...usage, ...patch } } }, { ...ctx, overrides: {}, services: new Set() }, scale); return alt.status === "estimated" ? alt.monthlyUsd : null; };
    if (r.pricer === "lambda" && (usage.arch || "x86") === "x86") {
      const alt = rerun({ arch: "arm64" });
      if (alt !== null && alt < r.monthlyUsd) out.push({ id: `lambda-arm64:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Run ${r.label} on arm64 (Graviton)`, monthlyDeltaUsd: round4(alt - r.monthlyUsd), basis: "Same usage re-priced with arm64 request and duration rates; assumes the code runs unchanged on arm64." });
    }
    if (r.pricer === "rds" && (usage.multiAz ?? true)) {
      const alt = rerun({ multiAz: false });
      if (alt !== null) out.push({ id: `rds-multiaz:${r.id}`, node: r.id, pillar: "reliability", title: `Cost of Multi-AZ for ${r.label}`, monthlyDeltaUsd: round4(r.monthlyUsd - alt), basis: "Multi-AZ price minus Single-AZ price for the same instance class, engine and storage — the monthly price of the reliability benefit.", tradeoff: true });
    }
    if (r.pricer === "bedrock" && usage.batchEligiblePct > 0 && (usage.mode || "standard") === "standard") {
      const std = r.monthlyUsd, batch = rerun({ mode: "batch" });
      if (batch !== null && batch < std) out.push({ id: `bedrock-batch:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Move ${usage.batchEligiblePct}% of ${r.label} traffic to batch inference`, monthlyDeltaUsd: round4(-(std - batch) * usage.batchEligiblePct / 100), basis: "Standard vs batch token rates from the Price List, applied to the stated batch-eligible share." });
    }
    if (r.pricer === "s3" && usage.infrequentPct > 0 && (usage.storageClass || "standard") === "standard") {
      const alt = rerun({ storageClass: "standard-ia" });
      if (alt !== null) out.push({ id: `s3-ia:${r.id}`, node: r.id, pillar: "cost-optimization", title: `Tier ${usage.infrequentPct}% of ${r.label} data to Standard-IA`, monthlyDeltaUsd: round4((alt - r.monthlyUsd) * usage.infrequentPct / 100), basis: "Storage line re-priced at Standard-IA; excludes retrieval fees and the 128 KB / 30-day minimums." });
    }
  }
  return out.filter((w) => w.monthlyDeltaUsd !== 0);
}
