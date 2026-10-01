// Per-service cost models. Each pricer turns a node's usage assumptions into line items using rates from the
// price book (never hard-coded prices). Quantities are per month; free tier, taxes, support and discounts are excluded.
import { tiered, round4, PricingError, HOURS_PER_MONTH } from "./pricebook.mjs";

const num = (x) => Number(x);
const unitDiv = (unit) => { const m = String(unit).match(/^(\d+)\s*([KM])\b/i); return m ? Number(m[1]) * (m[2].toUpperCase() === "M" ? 1e6 : 1e3) : 1; };

/** Build a line item: qty (in the rate's unit) priced through tiers. `variable` lines scale with traffic. */
export function line(label, rows, qty, { variable = true, qtyLabel } = {}) {
  const t = tiered(rows, qty);
  return { label, qty, unit: rows[0].unit, usd: round4(t.usd), rate: rows.length === 1 ? Number(rows[0].usd) : null, tiered: t.tiers.length > 1, sku: rows[0].sku, usagetype: rows[0].u, variable, ...(qtyLabel ? { qtyLabel } : {}) };
}
const sumLines = (ls) => ls.reduce((s, l) => s + l.usd, 0);

// ---------------------------------------------------------------- generic helpers for Bedrock model matching
const normModel = (s) => String(s || "").toLowerCase().replace(/embeddings/g, "embedding").replace(/\(amazon bedrock edition\)/g, "").replace(/[^a-z0-9.]+/g, " ").trim();
export function findBedrockModel(pb, text) {
  const q = normModel(text);
  if (!q) throw new PricingError("usage.model is required (e.g. \"Claude Sonnet 5.5\" or \"Nova 2.0 Lite\")");
  const names = new Map();
  for (const code of ["AmazonBedrock", "AmazonBedrockFoundationModels"]) {
    if (!pb.has(code)) continue;
    for (const r of pb.rows(code)) { const n = bedrockModelName(r); if (n) names.set(n, code); }
  }
  const all = [...names.keys()];
  const exact = all.filter((n) => normModel(n) === q);
  const pick = exact.length ? exact : all.filter((n) => q.split(" ").every((t) => normModel(n).split(" ").includes(t)));
  if (!pick.length) throw new PricingError(`no Bedrock model matches "${text}" in the price book`);
  if (pick.length > 1 && !exact.length) throw new PricingError(`"${text}" matches several Bedrock models (${pick.slice(0, 6).join("; ")}) — use the full model name`);
  return { name: pick[0], code: names.get(pick[0]) };
}
/** Model name for a Price List row. Titan rows carry no `model` attribute, so it is derived from the usage type
 *  (e.g. "TitanEmbeddingV2-Text-input-tokens" -> "Titan Embedding V2 Text"). */
export function bedrockModelName(r) {
  if (r.a.model) return r.a.model;
  const t = /^(Titan[A-Za-z0-9]*(?:-[A-Za-z]+)?)-(?:input|output)-tokens/.exec(r.u);
  if (t) return t[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ");
  return r.a.servicename;
}
function classifyTokenRow(r) {
  const u = r.u.toLowerCase();
  let kind = null;
  if (/cache[-_]read/.test(u)) kind = "cacheRead"; else if (/cache[-_]write/.test(u)) kind = "cacheWrite";
  else if (/input[-_]tokens/.test(u)) kind = "input"; else if (/output[-_]tokens/.test(u)) kind = "output";
  if (!kind) return null;
  if (/custom|customization|provisioned|1h|reserved/.test(u)) return null;
  const mode = /batch/.test(u) ? "batch" : /flex/.test(u) ? "flex" : /priority/.test(u) ? "priority" : /global|cross[-_]?region/.test(u) ? "global" : "standard";
  return { kind, mode };
}
function bedrockRates(pb, model, mode) {
  const out = {};
  for (const r of pb.rows(model.code)) {
    if (bedrockModelName(r) !== model.name) continue;
    const c = classifyTokenRow(r);
    if (c && c.mode === mode && !out[c.kind]) out[c.kind] = r;
  }
  return out;
}

// ---------------------------------------------------------------- pricers
export const PRICERS = {
  lambda: {
    label: "AWS Lambda",
    run({ pb, u, vol }) {
      const req = vol("requestsPerMonth", 1e6), ms = u("avgDurationMs", 200), mem = u("memoryMb", 512), arch = u("arch", "x86");
      const arm = arch === "arm64" || arch === "arm";
      const gbs = req * (ms / 1000) * (mem / 1024);
      const r = pb.dim("AWSLambda", (x) => x.u === (arm ? "Request-ARM" : "Request"), "Lambda requests");
      const d = pb.dim("AWSLambda", (x) => x.u === (arm ? "Lambda-GB-Second-ARM" : "Lambda-GB-Second"), "Lambda duration");
      return { lines: [line(`Requests (${arm ? "arm64" : "x86"})`, r, req), line("Compute duration (GB-seconds)", d, gbs, { qtyLabel: `${Math.round(gbs).toLocaleString("en-US")} GB-s` })] };
    },
  },
  apigw: {
    label: "Amazon API Gateway",
    run({ pb, u, vol }) {
      const type = u("type", "rest"), req = vol("requestsPerMonth", 1e6);
      const rows = pb.dim("AmazonApiGateway", (x) => x.u === (type === "http" ? "ApiGatewayHttpRequest" : "ApiGatewayRequest"), `API Gateway ${type} requests`);
      return { lines: [line(`${type.toUpperCase()} API requests`, rows, req)] };
    },
  },
  dynamodb: {
    label: "Amazon DynamoDB",
    run({ pb, u, vol }) {
      const rd = vol("readRequestsPerMonth", 5e6), wr = vol("writeRequestsPerMonth", 1e6), gb = vol("storageGb", 10);
      const rR = pb.dim("AmazonDynamoDB", (x) => x.u === "ReadRequestUnits", "DynamoDB on-demand reads");
      const wR = pb.dim("AmazonDynamoDB", (x) => x.u === "WriteRequestUnits", "DynamoDB on-demand writes");
      const sR = pb.dim("AmazonDynamoDB", (x) => x.u === "TimedStorage-ByteHrs" && /Indexed DataStore$/.test(x.a.volumeType || "") , "DynamoDB table storage");
      return { lines: [line("On-demand read request units", rR, rd), line("On-demand write request units", wR, wr), line("Table storage (GB-month)", sR, gb, { variable: true })], notes: ["On-demand capacity mode; the Price List storage tier includes its first 25 GB at no charge."] };
    },
  },
  s3: {
    label: "Amazon S3",
    run({ pb, u, vol }) {
      const cls = u("storageClass", "standard"), gb = vol("storageGb", 100), put = vol("putRequestsPerMonth", 1e5), get = vol("getRequestsPerMonth", 1e6);
      const key = { standard: "TimedStorage-ByteHrs", "standard-ia": "TimedStorage-SIA-ByteHrs", "one-zone-ia": "TimedStorage-ZIA-ByteHrs", "glacier-instant": "TimedStorage-GIR-ByteHrs", "intelligent-tiering": "TimedStorage-INT-FA-ByteHrs" }[cls];
      if (!key) throw new PricingError(`unsupported S3 storageClass "${cls}" (standard, standard-ia, one-zone-ia, glacier-instant, intelligent-tiering)`);
      return { lines: [line(`Storage, ${cls} (GB-month)`, pb.dim("AmazonS3", (x) => x.u === key, `S3 ${cls} storage`), gb),
        line("PUT/COPY/POST/LIST requests", pb.dim("AmazonS3", (x) => x.u === "Requests-Tier1", "S3 tier 1 requests"), put),
        line("GET and other requests", pb.dim("AmazonS3", (x) => x.u === "Requests-Tier2", "S3 tier 2 requests"), get)] };
    },
  },
  sqs: {
    label: "Amazon SQS",
    run({ pb, u, vol }) {
      const fifo = u("fifo", false), req = vol("requestsPerMonth", 3e6);
      return { lines: [line(`${fifo ? "FIFO" : "Standard"} queue requests`, pb.dim("AWSQueueService", (x) => x.u === (fifo ? "Requests-FIFO-RBP" : "Requests-RBP"), "SQS requests"), req)] };
    },
  },
  sns: {
    label: "Amazon SNS",
    run({ pb, vol }) { return { lines: [line("Publish API requests", pb.dim("AmazonSNS", (x) => x.u === "Requests-Tier1", "SNS requests"), vol("publishesPerMonth", 1e6))], notes: ["Excludes delivery charges for HTTP/SMTP/SMS endpoints; SQS and Lambda deliveries are free."] }; },
  },
  sfn: {
    label: "AWS Step Functions",
    run({ pb, vol }) { return { lines: [line("Standard workflow state transitions", pb.dim("AmazonStates", (x) => x.u === "StateTransition", "Step Functions transitions"), vol("stateTransitionsPerMonth", 1e6))] }; },
  },
  events: {
    label: "Amazon EventBridge",
    run({ pb, vol }) { return { lines: [line("Custom events (64 KB chunks)", pb.dim("AWSEvents", (x) => x.u === "Event-64K-Chunks" && x.a.operation === "PutEvents", "EventBridge custom events"), vol("eventsPerMonth", 1e6))] }; },
  },
  cloudwatch: {
    label: "Amazon CloudWatch",
    run({ pb, u, vol }) {
      const ing = vol("logIngestGbPerMonth", 10), ret = vol("logStorageGb", 10), m = u("customMetrics", 20), a = u("alarms", 10);
      return { lines: [line("Log ingestion (GB)", pb.dim("AmazonCloudWatch", (x) => x.u === "DataProcessing-Bytes", "CloudWatch log ingestion"), ing),
        line("Log storage (GB-month)", pb.dim("AmazonCloudWatch", (x) => x.u === "TimedStorage-ByteHrs", "CloudWatch log storage"), ret),
        line("Custom metrics", pb.dim("AmazonCloudWatch", (x) => x.u === "CW:MetricMonitorUsage", "CloudWatch metrics"), m, { variable: false }),
        line("Standard-resolution alarms", pb.dim("AmazonCloudWatch", (x) => x.u === "CW:AlarmMonitorUsage", "CloudWatch alarms"), a, { variable: false })] };
    },
  },
  kms: {
    label: "AWS KMS",
    run({ pb, u, vol }) { return { lines: [line("Customer managed keys", pb.dim("awskms", (x) => x.u === "KMS-Keys", "KMS keys"), u("keys", 1), { variable: false }), line("API requests", pb.dim("awskms", (x) => x.u === "KMS-Requests", "KMS requests"), vol("requestsPerMonth", 1e5))] }; },
  },
  waf: {
    label: "AWS WAF",
    run({ pb, u, vol }) {
      return { lines: [line("Web ACLs", pb.dim("awswaf", (x) => x.u === "WebACLV2", "WAF web ACL"), u("webAcls", 1), { variable: false }),
        line("Rules", pb.dim("awswaf", (x) => x.u === "RuleV2", "WAF rule"), u("rules", 5), { variable: false }),
        line("Requests inspected", pb.dim("awswaf", (x) => x.u === "Request", "WAF requests"), vol("requestsPerMonth", 1e6))], notes: ["Managed rule groups with their own fees (e.g. Bot Control) are not included."] };
    },
  },
  cognito: {
    label: "Amazon Cognito",
    run({ pb, u, vol }) {
      const tier = u("tier", "essentials"), mau = vol("mau", 1000);
      const code = { essentials: "CognitoEssentialsMAU", lite: "CognitoLiteMAU", plus: "CognitoPlusMAU" }[tier];
      if (!code) throw new PricingError(`unsupported Cognito tier "${tier}" (essentials, lite, plus)`);
      return { lines: [line(`Monthly active users (${tier})`, pb.dim("AmazonCognito", (x) => x.u === code, `Cognito ${tier} MAU`), mau)], notes: ["Excludes the free tier."] };
    },
  },
  secrets: {
    label: "AWS Secrets Manager",
    run({ pb, u, vol }) { return { lines: [line("Secrets", pb.dim("AWSSecretsManager", (x) => /Secrets$/.test(x.u), "Secrets"), u("secrets", 5), { variable: false }), line("API calls", pb.dim("AWSSecretsManager", (x) => /APIRequest$/.test(x.u), "Secrets API"), vol("apiCallsPerMonth", 1e5))] }; },
  },
  textract: {
    label: "Amazon Textract",
    run({ pb, u, vol }) {
      const feature = u("feature", "text"), pages = vol("pagesPerMonth", 10000);
      const key = { text: "SyncTextPagesProcessed", forms: "SyncFormsPagesProcessed", tables: "SyncTablesPagesProcessed", layout: "SyncLayoutPagesProcessed", queries: "SyncQueriesPagesProcessed", "forms+tables": "SyncFormsQueriesTablesPagesProcessed" }[feature];
      if (!key) throw new PricingError(`unsupported Textract feature "${feature}" (text, forms, tables, layout, queries)`);
      return { lines: [line(`Pages, ${feature} (sync)`, pb.dim("AmazonTextract", (x) => x.u === key, `Textract ${feature}`), pages)] };
    },
  },
  comprehend: {
    label: "Amazon Comprehend",
    run({ pb, u, vol }) {
      const feature = u("feature", "DetectEntities");
      return { lines: [line(`${feature} (100-character units)`, pb.dim("comprehend", (x) => x.u === feature, `Comprehend ${feature}`), vol("unitsPerMonth", 1e6))] };
    },
  },
  comprehendmedical: {
    label: "Amazon Comprehend Medical",
    run({ pb, u, vol }) {
      const feature = u("feature", "DetectEntities");
      return { lines: [line(`${feature} (units)`, pb.dim("comprehendmedical", (x) => x.u === feature, `Comprehend Medical ${feature}`), vol("unitsPerMonth", 1e6))] };
    },
  },
  opensearch: {
    label: "Amazon OpenSearch Service",
    run({ pb, u, vol }) {
      const mode = u("mode", "provisioned");
      if (mode === "serverless") {
        const idx = u("indexingOcu", 2), srch = u("searchOcu", 2), gb = vol("storageGb", 100);
        const ocu = (key) => pb.dim("AmazonES", (x) => x.u === key, key);
        return { lines: [line("Indexing OCU-hours", ocu("IndexingOCU"), idx * HOURS_PER_MONTH, { variable: false }), line("Search OCU-hours", ocu("SearchOCU"), srch * HOURS_PER_MONTH, { variable: false }), line("Managed storage (GB-month)", pb.dim("AmazonES", (x) => x.u === "StorageUsedInHotByteHour", "OpenSearch Serverless storage"), gb)], notes: ["Serverless OCUs shown at the configured baseline; actual OCUs follow load."] };
      }
      const type = u("instanceType", "r6g.large.search"), n = u("instanceCount", 2), gb = u("storageGbPerNode", 100);
      const inst = pb.dim("AmazonES", (x) => /^ESInstance:/.test(x.u) && x.a.instanceType === type, `OpenSearch instance ${type}`);
      const st = pb.dim("AmazonES", (x) => x.u === "ES:GP3-Storage", "OpenSearch gp3 storage");
      return { lines: [line(`${n} × ${type} (hours)`, inst, n * HOURS_PER_MONTH, { variable: false }), line(`EBS gp3 storage (${n} × ${gb} GB-month)`, st, n * gb, { variable: false })] };
    },
  },
  fargate: {
    label: "AWS Fargate",
    run({ pb, u }) {
      const tasks = u("tasks", 2), vcpu = u("vcpu", 1), mem = u("memoryGb", 2), hrs = u("hoursPerMonth", HOURS_PER_MONTH), arm = u("arch", "x86") === "arm64";
      const cpu = pb.dim("AmazonECS", (x) => x.u === (arm ? "Fargate-ARM-vCPU-Hours:perCPU" : "Fargate-vCPU-Hours:perCPU"), "Fargate vCPU");
      const gb = pb.dim("AmazonECS", (x) => x.u === (arm ? "Fargate-ARM-GB-Hours" : "Fargate-GB-Hours"), "Fargate memory");
      return { lines: [line(`vCPU-hours (${tasks} tasks × ${vcpu} vCPU)`, cpu, tasks * vcpu * hrs, { variable: false }), line(`Memory GB-hours (${tasks} × ${mem} GB)`, gb, tasks * mem * hrs, { variable: false })] };
    },
  },
  ec2: {
    label: "Amazon EC2",
    run({ pb, u }) {
      const type = u("instanceType", "m5.large"), n = u("count", 2), hrs = u("hoursPerMonth", HOURS_PER_MONTH), ebs = u("ebsGbPerInstance", 50);
      const inst = pb.dim("AmazonEC2", (x) => x.fam === "Compute Instance" && x.a.instanceType === type, `EC2 ${type} (Linux, shared, on-demand)`);
      const lines = [line(`${n} × ${type} (hours, on-demand Linux)`, inst, n * hrs, { variable: false })];
      if (ebs > 0) lines.push(line("EBS gp3 storage (GB-month)", pb.dim("AmazonEC2", (x) => /VolumeUsage\.gp3$/.test(x.u), "EBS gp3"), n * ebs, { variable: false }));
      return { lines, notes: ["On-demand rates; Savings Plans/Reserved Instances/Spot can reduce this."] };
    },
  },
  rds: {
    label: "Amazon RDS",
    run({ pb, u }) {
      const cls = u("instanceClass", "db.r6g.large"), engine = u("engine", "PostgreSQL"), multi = u("multiAz", true), gb = u("storageGb", 100);
      const dep = multi ? "Multi-AZ" : "Single-AZ";
      const inst = pb.dim("AmazonRDS", (x) => x.fam === "Database Instance" && x.a.instanceType === cls && x.a.databaseEngine === engine && x.a.deploymentOption === dep, `RDS ${engine} ${cls} ${dep}`);
      const st = pb.dim("AmazonRDS", (x) => x.fam === "Database Storage" && x.a.databaseEngine === engine && x.a.deploymentOption === dep && x.a.volumeType === "General Purpose-GP3", `RDS ${engine} gp3 storage ${dep}`);
      return { lines: [line(`${cls} ${engine} ${dep} (hours)`, inst, HOURS_PER_MONTH, { variable: false }), line("gp3 storage (GB-month)", st, gb, { variable: false })], notes: ["Excludes backup storage beyond free allocation, Provisioned IOPS and data transfer."] };
    },
  },
  aurora: {
    label: "Amazon Aurora",
    run({ pb, u }) {
      const cls = u("instanceClass", "db.r6g.large"), engine = u("engine", "Aurora PostgreSQL"), n = u("instances", 2), gb = u("storageGb", 100);
      const inst = pb.dim("AmazonRDS", (x) => x.fam === "Database Instance" && x.a.instanceType === cls && x.a.databaseEngine === engine && !/IO-Optimized|Serverless|Limitless/i.test(x.u), `Aurora ${engine} ${cls}`);
      const st = pb.dim("AmazonRDS", (x) => x.fam === "Database Storage" && x.a.databaseEngine === engine && x.u === "Aurora:StorageUsage", `Aurora ${engine} storage`);
      return { lines: [line(`${n} × ${cls} (hours)`, inst, n * HOURS_PER_MONTH, { variable: false }), line("Cluster storage (GB-month)", st, gb, { variable: false })], notes: ["Excludes Aurora I/O requests (Standard configuration), backups and data transfer."] };
    },
  },
  elb: {
    label: "Elastic Load Balancing",
    run({ pb, u }) {
      const type = u("type", "application"), lcu = u("avgLcu", 5);
      const fam = { application: "Load Balancer-Application", network: "Load Balancer-Network" }[type];
      if (!fam) throw new PricingError(`unsupported load balancer type "${type}" (application, network)`);
      return { lines: [line(`${type} load balancer (hours)`, pb.dim("AWSELB", (x) => x.fam === fam && x.u === "LoadBalancerUsage", `${type} LB hours`), HOURS_PER_MONTH, { variable: false }), line("Load balancer capacity units (LCU-hours)", pb.dim("AWSELB", (x) => x.fam === fam && x.u === "LCUUsage", `${type} LCU`), lcu * HOURS_PER_MONTH)] };
    },
  },
  nat: {
    label: "NAT gateway",
    run({ pb, u, vol }) { return { lines: [line("NAT gateway hours", pb.dim("AmazonEC2", (x) => x.u === "NatGateway-Hours", "NAT hours"), u("count", 2) * HOURS_PER_MONTH, { variable: false }), line("Data processed (GB)", pb.dim("AmazonEC2", (x) => x.u === "NatGateway-Bytes", "NAT data"), vol("gbProcessedPerMonth", 100))] }; },
  },
  guardrails: {
    label: "Amazon Bedrock Guardrails",
    run({ pb, u, vol }) {
      const units = vol("textUnitsPerMonth", 2e5), pol = u("policies", ["content", "pii"]);
      const key = { content: /^Guardrail-ContentPolicyUnitsConsumed$/, topics: /^Guardrail-TopicPolicyUnitsConsumed$/, pii: /^Guardrail-SensitiveInformationPolicyPaidUnitsConsumed$/, grounding: /^Guardrail-ContextualGroundingPolicyUnitsConsumed$/, "prompt-attack": /^GuardrailChecks-PromptAttackCheckUnitsConsumed$/ };
      const lines = pol.map((p) => { if (!key[p]) throw new PricingError(`unsupported guardrail policy "${p}" (${Object.keys(key).join(", ")})`); return line(`${p} policy (1 text unit ≈ 1,000 characters)`, pb.dim("AmazonBedrock", (x) => key[p].test(x.u), `Guardrails ${p}`), units); });
      return { lines };
    },
  },
  bedrock: {
    label: "Amazon Bedrock model inference",
    run({ pb, u, vol }) {
      const modelText = u("model", undefined);
      const model = findBedrockModel(pb, modelText);
      const mode = u("mode", "standard");
      const rates = bedrockRates(pb, model, mode);
      if (!rates.input) throw new PricingError(`no ${mode} input token rate for ${model.name} in the price book`);
      const inTok = vol("inputTokensPerMonth", 5e6), outTok = vol("outputTokensPerMonth", 1e6), cacheRead = vol("cacheReadTokensPerMonth", 0);
      const q = (r, tokens) => tokens / unitDiv(r.unit);
      const lines = [line(`${model.name}: input tokens (${mode})`, [rates.input], q(rates.input, inTok), { qtyLabel: `${Math.round(inTok).toLocaleString("en-US")} tokens` }),
        ...(rates.output ? [line(`${model.name}: output tokens (${mode})`, [rates.output], q(rates.output, outTok), { qtyLabel: `${Math.round(outTok).toLocaleString("en-US")} tokens` })] : [])]; // embedding models have no output rate
      if (cacheRead > 0 && rates.cacheRead) lines.push(line("Prompt cache reads", [rates.cacheRead], q(rates.cacheRead, cacheRead)));
      return { lines, model: model.name, notes: [`Model matched in the Price List: ${model.name}. Rates are on-demand ${mode} inference in this region.`] };
    },
    whatIf({ pb, usage, base }) { return null; },
  },
  agentcore: {
    label: "Amazon Bedrock AgentCore",
    run({ pb, u, vol, node }) {
      const component = u("component", detectAgentCoreComponent(node));
      const ac = (re, what) => pb.dim("AmazonBedrockAgentCore", (x) => re.test(x.u), what);
      const compute = (prefix, sessions, minutes, vcpu, mem, active, ver) => {
        const hrs = sessions * minutes / 60;
        return [line(`${prefix} vCPU-hours (${active * 100}% active)`, ac(new RegExp(`^${prefix}:Consumption-based:vCPU${ver}$`), `${prefix} vCPU`), hrs * vcpu * active),
          line(`${prefix} memory GB-hours`, ac(new RegExp(`^${prefix}:Consumption-based:Memory${ver}$`), `${prefix} memory`), hrs * mem)];
      };
      switch (component) {
        case "runtime": {
          const v2 = u("platform", "v1") === "v2" ? "-v2" : "";
          return { lines: compute("Runtime", vol("sessionsPerMonth", 10000), u("avgSessionMinutes", 10), u("vcpu", 1), u("memoryGb", 2), u("cpuActiveFraction", 0.3), v2), notes: ["Runtime bills CPU for active processing and memory for the session; idle wait on model calls is not billed as CPU. Platform V2 uses different (higher) per-unit rates."] };
        }
        case "gateway": {
          return { lines: [line("API/tool invocations", ac(/^Gateway:Consumption-based:API-Invocations$/, "Gateway invocations"), vol("invocationsPerMonth", 1e6)),
            line("Tool search invocations", ac(/^Gateway:Consumption-based:Search-API$/, "Gateway search"), vol("searchesPerMonth", 0)),
            line("Tools indexed (tool-months)", ac(/^Gateway:Consumption-based:Tool-Indexing$/, "Gateway tool indexing"), u("tools", 20), { variable: false })] };
        }
        case "memory": {
          return { lines: [line("Short-term memory events", ac(/^Memory:Consumption-based:Short-Term-Memory$/, "Memory short-term"), vol("shortTermEventsPerMonth", 1e5)),
            line("Long-term memories stored (memory-months, built-in strategies)", ac(/^Memory:Consumption-based:Long-Term-Memory-Storage:Built-in-memory$/, "Memory LTM storage"), vol("longTermMemoriesStored", 1e5)),
            line("Long-term memory retrievals", ac(/^Memory:Consumption-based:Long-Term-Memory-Retrieval$/, "Memory retrieval"), vol("retrievalsPerMonth", 1e5))] };
        }
        case "codeinterpreter": return { lines: compute("CodeInterpreter", vol("sessionsPerMonth", 1000), u("avgSessionMinutes", 5), u("vcpu", 1), u("memoryGb", 2), u("cpuActiveFraction", 1), "") };
        case "browser": return { lines: compute("BrowserTool", vol("sessionsPerMonth", 1000), u("avgSessionMinutes", 5), u("vcpu", 1), u("memoryGb", 2), u("cpuActiveFraction", 1), "") };
        case "evaluations": return { lines: [line("Built-in evaluator input (1M tokens)", ac(/^Evaluations:Consumption-based:BuiltIn-Input:Tier1$/, "Evaluations input"), vol("inputMTokens", 5)), line("Built-in evaluator output (1M tokens)", ac(/^Evaluations:Consumption-based:BuiltIn-Output:Tier1$/, "Evaluations output"), vol("outputMTokens", 1))], notes: ["Uses the first-tier evaluator rates; custom evaluators are billed per evaluation."] };
        default: return { lines: [], notItemized: `No separate ${component} charge is listed in the AWS Price List for AgentCore (Observability data is billed through CloudWatch). Verify on the AgentCore pricing page.` };
      }
    },
  },
};

export function detectAgentCoreComponent(node) {
  const t = `${node?.item?.label || ""} ${node?.item?.sublabel || ""} ${node?.id || ""}`.toLowerCase();
  if (/code ?interpreter/.test(t)) return "codeinterpreter";
  if (/browser/.test(t)) return "browser";
  if (/evaluation/.test(t)) return "evaluations";
  if (/gateway/.test(t)) return "gateway";
  if (/memory/.test(t)) return "memory";
  if (/observab/.test(t)) return "observability";
  if (/identity/.test(t)) return "identity";
  if (/policy/.test(t)) return "policy";
  if (/registry/.test(t)) return "registry";
  if (/optimi[sz]ation/.test(t)) return "optimization";
  return "runtime"; // supervisor / check-family / harness / "AgentCore Runtime"
}

// icon service id -> pricer. Anything else is classified in estimate.mjs (free / not estimated / not billable).
export const SERVICE_PRICER = {
  lambda: "lambda", "api-gateway": "apigw", dynamodb: "dynamodb", "simple-storage-service": "s3", "simple-queue-service": "sqs", "simple-notification-service": "sns",
  "step-functions": "sfn", eventbridge: "events", cloudwatch: "cloudwatch", "key-management-service": "kms", waf: "waf", cognito: "cognito", "secrets-manager": "secrets",
  textract: "textract", comprehend: "comprehend", "comprehend-medical": "comprehendmedical", "opensearch-service": "opensearch", fargate: "fargate", ec2: "ec2",
  rds: "rds", aurora: "aurora", "elastic-load-balancing": "elb", "bedrock-agentcore": "agentcore",
};
export const NO_CHARGE = new Set(["identity-and-access-management", "iam-identity-center", "organizations", "cloudformation", "control-tower", "verified-permissions-free"]);
export { sumLines };
