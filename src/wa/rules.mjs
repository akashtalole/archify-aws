// Evidence rules: what a diagram (and the cost estimate) can say about specific Well-Architected best practices.
// Every BP id used here is validated against the live-index corpus (see test) — ids are never invented.
// Statuses (AWS aws-well-architected-review skill): Implemented | Partially Implemented | Not Implemented | Not Applicable | Cannot Determine.
// A diagram shows architecture, not process or configuration, so most BPs stay "Cannot Determine"; that is reported, not hidden.

export const STATUS = ["Implemented", "Partially Implemented", "Not Implemented", "Not Applicable", "Cannot Determine"];
export const OWNER = { "operational-excellence": "DevOps / SRE", security: "Security engineering", reliability: "Platform / SRE", "performance-efficiency": "Application team", "cost-optimization": "FinOps + engineering", sustainability: "Platform team" };

/** Rules derived from the heuristic findings in review.mjs: legacy id -> BP outcomes. */
export const LEGACY_RULES = [
  { legacy: "SEC-EDGE", fw: { "SEC05-BP03": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Put AWS WAF (with Shield) in front of every internet-facing entry point; start with AWS managed rule groups in count mode, then enforce.", measure: "100% of public endpoints behind a web ACL with logging enabled" },
  { legacy: "SEC-DB-PUBLIC", fw: { "SEC05-BP01": {}, "SEC05-BP02": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 1,
    rec: "Move databases and caches to private subnets and allow access only from the application tier through security-group references.", measure: "No stateful store reachable from the internet (verify with a reachability analysis)" },
  { legacy: "SEC-DB-PRIVATE", fw: { "SEC05-BP01": {} }, impact: "Moderate", likelihood: "Low", effort: "Low", weeks: 1, rec: "Keep stateful stores in private subnets.", measure: "—" },
  { legacy: "SEC-ENCRYPT", fw: { "SEC08-BP01": {} }, impact: "Severe", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Manage encryption keys in AWS KMS (customer managed keys where you need key policy, rotation or audit control) and enforce encryption at rest on every data store.", measure: "All data stores report encryption with a CMK; key rotation enabled" },
  { legacy: "SEC-IDENTITY", fw: { "SEC02-BP04": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Authenticate and authorize every request through a centralized identity provider (Amazon Cognito, IAM Identity Center) with MFA and temporary credentials.", measure: "All user and machine access federated; zero long-lived access keys" },
  { legacy: "SEC-DETECT", fw: { "SEC04-BP01": {}, "SEC04-BP02": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Enable CloudTrail (organization trail), GuardDuty and Security Hub, and send logs and findings to a central, access-restricted account.", measure: "Org-wide trail and GuardDuty enabled in all accounts and Regions in scope" },
  { legacy: "SEC-SECRETS", fw: { "SEC02-BP03": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 1,
    rec: "Store database and API credentials in AWS Secrets Manager with rotation, or use IAM database authentication.", measure: "No credentials in code, images or environment files" },
  { legacy: "REL-MULTIAZ", fw: { "REL10-BP01": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Deploy across at least two Availability Zones: Multi-AZ databases, compute spread by Auto Scaling behind a load balancer.", measure: "Workload survives loss of one AZ in a game day" },
  { legacy: "REL-SCALE", fw: { "REL07-BP01": {}, "REL07-BP03": {}, "PERF02-BP05": {}, "SUS02-BP01": {}, "COST09-BP03": {} }, considerAs: "Not Implemented", impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Use Auto Scaling groups (or managed compute such as Lambda/Fargate) so capacity follows demand and failed instances are replaced automatically.", measure: "Capacity scales with load and an instance failure self-heals without manual action" },
  { legacy: "REL-BACKUP", fw: { "REL09-BP01": {}, "REL09-BP03": {} }, impact: "Severe", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Back up data automatically with AWS Backup (cross-account/cross-Region vault where required) and test restores against your RPO/RTO.", measure: "Automated backups with a successful restore test each quarter" },
  { legacy: "REL-DECOUPLE", fw: { "REL04-BP02": {}, "SUS03-BP01": {}, "COST09-BP02": {} }, impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Decouple tiers with Amazon SQS, SNS or EventBridge so traffic spikes and downstream failures do not cascade; add retries with backoff and timeouts.", measure: "Downstream outage does not fail upstream requests; queues absorb bursts" },
  { legacy: "OPS-OBSERVE", fw: { "OPS04-BP02": {}, "OPS08-BP01": {}, "OPS08-BP02": {}, "REL06-BP01": {}, "REL11-BP01": {}, "PERF05-BP02": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Collect metrics, logs and traces (CloudWatch, X-Ray/OpenTelemetry) and define alarms tied to business outcomes.", measure: "Dashboards and alarms for every tier; mean time to detect < 5 minutes" },
  { legacy: "OPS-IAC", fw: { "OPS05-BP04": {}, "OPS05-BP10": {}, "REL08-BP05": {}, "SEC11-BP06": {} }, impact: "Moderate", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Define infrastructure as code and deploy through a pipeline with small, reversible changes and automated rollback.", measure: "100% of production changes deployed from a pipeline" },
  { legacy: "PERF-EDGE", fw: { "PERF04-BP02": {}, "PERF04-BP06": {} }, impact: "Minor", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Serve content close to users with Amazon CloudFront or AWS Global Accelerator to reduce latency.", measure: "p95 latency for remote users reduced against baseline" },
  { legacy: "PERF-CACHE", fw: { "PERF03-BP05": {} }, impact: "Minor", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Add caching (ElastiCache, CloudFront) or read replicas for read-heavy access.", measure: "Cache hit ratio above target; database read load reduced" },
  { legacy: "COST-ENDPOINT", fw: { "COST08-BP03": {}, "COST08-BP02": {} }, impact: "Minor", likelihood: "High", effort: "Low", weeks: 1,
    rec: "Add S3/DynamoDB gateway endpoints (free) to avoid NAT data-processing charges and keep traffic on the AWS network.", measure: "S3/DynamoDB traffic no longer processed by NAT" },
  { legacy: "COST-VISIBILITY", fw: { "COST01-BP03": {}, "COST01-BP06": {}, "COST03-BP05": {} }, impact: "Minor", likelihood: "High", effort: "Low", weeks: 1,
    rec: "Set AWS Budgets with alert thresholds, enable Cost Anomaly Detection and cost allocation tags so spend maps to this workload.", measure: "Budget alerts and anomaly monitor active; 100% of resources tagged" },
  { legacy: "SUS-MANAGED", fw: { "SUS05-BP03": {} }, considerAs: "Partially Implemented", impact: "Minor", likelihood: "Medium", effort: "Medium", weeks: 6,
    rec: "Prefer managed and serverless services, right-size, use Graviton, and scale to demand to raise utilization.", measure: "Average compute utilization above target; idle capacity removed" },
];
export const LEGACY_LENS_RULES = [
  { legacy: "GENAI-GUARDRAILS", lens: { "GENSEC02-BP01": {} }, impact: "Severe", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Apply Amazon Bedrock Guardrails (or equivalent) to prompts and responses: harmful content, PII, prompt attacks and, for RAG, contextual grounding.", measure: "Guardrails enforced on 100% of model invocations; interventions logged" },
  { legacy: "GENAI-OBSERVE", lens: { "GENOPS02-BP01": {}, "GENOPS02-BP02": {}, "GENSEC03-BP01": {}, "GENSEC01-BP04": {} }, impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
    rec: "Log model invocations, latency, token usage and guardrail interventions to CloudWatch/S3 and keep an audit trail with CloudTrail.", measure: "Invocation logging on for all models; dashboards for latency, tokens and interventions" },
  { legacy: "GENAI-ENDPOINT", lens: { "GENSEC01-BP01": {}, "GENSEC04-BP02": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Front models with an authenticated, throttled API layer instead of exposing them to clients; validate and sanitize inputs.", measure: "No client reaches a model endpoint except through the API layer" },
  { legacy: "GENAI-PRIVATE", lens: { "GENSEC01-BP02": {} }, impact: "Moderate", likelihood: "Low", effort: "Low", weeks: 2,
    rec: "Use AWS PrivateLink interface endpoints for Amazon Bedrock and SageMaker runtime so prompts and responses stay off the public internet.", measure: "Model API traffic from VPC compute uses interface endpoints" },
  { legacy: "GENAI-RETRIEVAL", lens: { "GENPERF04-BP01": {} }, okAs: "Cannot Determine", impact: "Minor", likelihood: "Medium", effort: "Medium", weeks: 4,
    rec: "Ground responses in enterprise data (RAG) and test embeddings for retrieval latency and relevance.", measure: "Retrieval quality measured on a labelled set" },
  { legacy: "GENAI-RESILIENCE", lens: { "GENREL05-BP01": {} }, impact: "Moderate", likelihood: "Low", effort: "Medium", weeks: 4,
    rec: "Plan for throttling and quota limits (retries, queues, provisioned throughput) and consider cross-Region inference profiles or a fallback model.", measure: "Inference continues within SLO when the primary model is throttled" },
  { legacy: "GENAI-COST", lens: { "GENCOST01-BP01": {} }, impact: "Minor", likelihood: "High", effort: "Low", weeks: 2,
    rec: "Select the smallest model that meets quality targets; use prompt caching and batch inference where possible; track cost per request.", measure: "Cost per request tracked and below target" },
  { legacy: "GENAI-AGENCY", lens: { "GENSEC05-BP01": {} }, impact: "Severe", likelihood: "Medium", effort: "Medium", weeks: 3,
    rec: "Limit agent tool permissions (least privilege, deterministic policy at the tool boundary) and add human approval for high-impact actions.", measure: "Every tool call authorized by policy; high-impact actions require approval" },
  { legacy: "GENAI-SUS", lens: { "GENSUS03-BP01": {} }, impact: "Minor", likelihood: "Low", effort: "Medium", weeks: 6,
    rec: "Prefer right-sized or distilled models and serverless inference; avoid always-on endpoints for spiky traffic.", measure: "Smallest viable model per use case; no idle endpoints" },
];

const has = (ctx, ...ids) => ctx.has(...ids);
/** Procedural rules. Each returns an array of {fw?, lens?: {BP: {status, evidence}}, ...meta} or []. */
export const PROCEDURAL_RULES = [
  { id: "ACCOUNTS", pillar: "security", evaluate(ctx) {
      const orgs = ctx.of("organizations", "control-tower"), acctGroups = ctx.groups.filter((g) => g.kind === "account");
      if (!orgs.length && acctGroups.length < 2) return null;
      const ev = `Diagram shows ${acctGroups.length} account boundar${acctGroups.length === 1 ? "y" : "ies"}${orgs.length ? ` and ${orgs.map((n) => n.label.trim()).join(", ")}` : ""}.`;
      return { title: "Multi-account structure with organizational guardrails", fw: { "SEC01-BP01": { status: "Implemented", evidence: ev }, "COST02-BP03": { status: "Implemented", evidence: ev }, ...(has(ctx, "organizations") ? { "SEC03-BP05": { status: "Implemented", evidence: "AWS Organizations is drawn: service control policies can enforce permission guardrails." } } : {}) }, nodes: orgs.map((n) => n.id) };
    } },
  { id: "DATACLASS", pillar: "security", evaluate(ctx) {
      const n = ctx.of("macie", "comprehend", "comprehend-medical");
      if (!n.length) return null;
      return { title: "Automated sensitive-data identification", fw: { "SEC07-BP03": { status: "Implemented", evidence: `${n.map((x) => x.label.trim()).join(", ")} drawn for automated identification of sensitive data.` } }, nodes: n.map((x) => x.id) };
    } },
  { id: "TRACING", pillar: "operational-excellence", evaluate(ctx) {
      const trace = ctx.of("x-ray").length || ctx.labelHas(/open ?telemetry|otel|tracing|traces/i).length || ctx.labelHas(/observability/i).filter((n) => /agentcore/i.test(n.label)).length;
      if (!trace) return null;
      const nodes = [...ctx.of("x-ray"), ...ctx.labelHas(/open ?telemetry|otel|tracing|traces|observability/i)].map((n) => n.id);
      const ev = `Tracing/telemetry is drawn (${[...new Set(nodes)].join(", ")}).`;
      return { title: "Distributed tracing", fw: { "OPS04-BP05": { status: "Implemented", evidence: ev }, "REL06-BP07": { status: "Implemented", evidence: ev } }, lens: ctx.isGenAI ? { "GENOPS03-BP02": { status: "Implemented", evidence: ev } } : undefined, nodes: [...new Set(nodes)] };
    } },
  { id: "HYBRID", pillar: "reliability", evaluate(ctx) {
      const dx = ctx.of("direct-connect", "site-to-site-vpn", "client-vpn"), onprem = ctx.groups.filter((g) => g.kind === "corporate-dc").length || ctx.labelHas(/on.?prem|data cent|hospital|ehr/i).length;
      if (!dx.length && !onprem) return { title: "Hybrid connectivity", fw: { "REL02-BP02": { status: "Not Applicable", evidence: "No on-premises or private-link connectivity is drawn." }, "PERF04-BP03": { status: "Not Applicable", evidence: "No dedicated connectivity or VPN is drawn." } } };
      if (!dx.length) return { title: "Hybrid connectivity", fw: { "REL02-BP02": { status: "Cannot Determine", evidence: "On-premises systems are drawn but no private connection is shown." } } };
      const redundant = dx.length >= 2;
      return { title: "Hybrid connectivity redundancy", fw: { "REL02-BP02": { status: redundant ? "Implemented" : "Partially Implemented", evidence: redundant ? `${dx.length} private connections drawn.` : "A single private connection is drawn; redundant connectivity (second Direct Connect location or VPN backup) is not shown.", ...(redundant ? {} : { impact: "Severe", likelihood: "Low", effort: "Medium", weeks: 6, rec: "Provision redundant connectivity to on-premises: a second Direct Connect connection in a different location, with Site-to-Site VPN as backup.", measure: "Loss of one link keeps hybrid traffic flowing in a failover test" }) }, "PERF04-BP03": { status: "Implemented", evidence: `${dx.map((n) => n.label.trim()).join(", ")} provides dedicated connectivity.` } }, nodes: dx.map((n) => n.id) };
    } },
  { id: "AGENT-GOVERNANCE", pillar: "security", evaluate(ctx) {
      if (!ctx.isGenAI) return null;
      const policy = ctx.labelHas(/agentcore policy|policy engine|cedar/i).concat(ctx.of("verified-permissions"));
      const gateway = ctx.labelHas(/agentcore gateway/i);
      const eva = ctx.labelHas(/agentcore evaluations|evaluations/i);
      const lens = {};
      if (policy.length) lens["GENSEC05-BP01"] = { status: "Implemented", evidence: `${policy.map((n) => n.label.trim()).join(", ")} authorizes agent actions outside the agent's own code${gateway.length ? ", evaluated at the Gateway tool boundary" : ""}.` };
      if (gateway.length) lens["GENSEC01-BP03"] = { status: "Partially Implemented", evidence: `${gateway.map((n) => n.label.trim()).join(", ")} mediates agent access to data stores and APIs; least-privilege scoping of each target is not observable in a diagram.` };
      if (eva.length) { lens["GENOPS01-BP01"] = { status: "Implemented", evidence: `${eva.map((n) => n.label.trim()).join(", ")} evaluates functional performance.` }; lens["GENPERF01-BP02"] = { status: "Partially Implemented", evidence: "Evaluation results are collected; ground-truth dataset ownership is not shown." }; }
      return Object.keys(lens).length ? { title: "Governed agent tool access and evaluation", lens, nodes: [...policy, ...gateway, ...eva].map((n) => n.id) } : null;
    } },
  { id: "HUMAN-REVIEW", pillar: "security", evaluate(ctx) {
      const h = ctx.labelHas(/human review|reviewer|augmented ai|approval|human.in.the.loop/i).concat(ctx.of("augmented-ai-a2i"));
      if (!ctx.isGenAI || !h.length) return null;
      const ids = [...new Set(h.map((n) => n.id))];
      return { title: "Human oversight of model outputs", lens: { "GENOPS01-BP02": { status: "Partially Implemented", evidence: `Human review is drawn (${ids.join(", ")}); whether reviewer feedback is collected and monitored is not shown.` }, "GENSEC05-BP01": { status: "Partially Implemented", evidence: `Human approval is drawn for flagged outputs/actions (${ids.join(", ")}); combine with deterministic policy for high-impact tools.` } }, nodes: ids };
    } },
  { id: "PROMPT-CATALOG", pillar: "security", evaluate(ctx) {
      if (!ctx.isGenAI) return null;
      const n = ctx.labelHas(/prompt (catalog|library|management|template)|appconfig|agentcore registry/i).concat(ctx.of("appconfig"));
      if (!n.length) return null;
      return { title: "Managed prompt/tool catalog", lens: { "GENSEC04-BP01": { status: "Partially Implemented", evidence: `${[...new Set(n.map((x) => x.label.trim()))].join(", ")} drawn as a managed catalog; access control and versioning are not observable.` } }, nodes: n.map((x) => x.id) };
    } },
  { id: "COST-MODEL", pillar: "cost-optimization", evaluate(ctx) {
      const c = ctx.cost;
      if (!c) return null;
      const priced = c.coverage.estimated + c.coverage.override, total = c.coverage.nodes - c.coverage.notBillable - c.coverage.noCharge;
      const ev = `A design-time cost model was generated from the AWS Price List: ${priced} of ${total} billable components priced, ${money(c.totals.monthlyUsd)}/month on-demand (${c.confidence}; volumes ${c.defaultedAssumptions.length ? "partly assumed" : "supplied"}).`;
      const out = { title: "Design-time cost model", fw: { "COST06-BP01": { status: "Partially Implemented", evidence: ev }, "COST05-BP02": { status: priced >= total ? "Implemented" : "Partially Implemented", evidence: ev } } };
      const egress = c.nodes.some((n) => n.assumptions?.some((a) => a.key === "egressGbPerMonth"));
      out.fw["COST08-BP01"] = egress ? { status: "Partially Implemented", evidence: "Data transfer out is modelled for at least one component." } : { status: "Cannot Determine", evidence: "Data transfer is excluded from the estimate (no node sets egressGbPerMonth); model it before launch." };
      const compute = (c.totals.byCategory.Compute || 0) + (c.nodes.filter((n) => ["rds", "aurora", "opensearch"].includes(n.pricer)).reduce((s, n) => s + n.monthlyUsd, 0));
      if (compute > 0 && compute / (c.totals.monthlyUsd || 1) >= 0.15) out.fw["COST07-BP04"] = { status: "Cannot Determine", evidence: `Compute and database capacity is ${money(compute)}/month at on-demand rates (${Math.round(100 * compute / c.totals.monthlyUsd)}% of the estimate); whether Savings Plans/Reserved Instances apply is not shown. Evaluate with Cost Explorer recommendations after 30+ days of steady usage.` };
      return out;
    } },
  { id: "COST-AI-CONCENTRATION", pillar: "cost-optimization", evaluate(ctx) {
      const c = ctx.cost;
      if (!c || !ctx.isGenAI) return null;
      const model = c.nodes.filter((n) => n.pricer === "bedrock" && n.status === "estimated");
      if (!model.length) return null;
      const share = model.reduce((s, n) => s + n.monthlyUsd, 0) / (c.totals.monthlyUsd || 1);
      const cache = c.nodes.some((n) => n.assumptions?.some((a) => a.key === "cacheReadTokensPerMonth" && a.value > 0));
      const lens = { "GENCOST01-BP01": { status: share >= 0.5 ? "Partially Implemented" : "Implemented", evidence: `${model.map((n) => n.model || n.label).join(", ")} accounts for ${Math.round(share * 100)}% of the estimated monthly cost (${money(model.reduce((s, n) => s + n.monthlyUsd, 0))}); model right-sizing should be validated against quality targets.`, ...(share >= 0.5 ? { impact: "Moderate", likelihood: "High", effort: "Low", weeks: 3, rec: "Right-size the model per task: evaluate a smaller model on your golden set, route easy checks to it, and use batch inference or prompt caching for repeated context.", measure: "Cost per document tracked; smaller-model share of calls increased without quality regression" } : {}) },
        "GENCOST03-BP03": cache ? { status: "Implemented", evidence: "Prompt cache reads are included in the model usage." } : { status: "Cannot Determine", evidence: "No prompt-cache usage is modelled; repeated instructions/context are a candidate for prompt caching." } };
      return { title: "Model inference dominates cost", lens, nodes: model.map((n) => n.id) };
    } },
];
const money = (x) => "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
