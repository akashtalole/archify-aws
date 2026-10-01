// Heuristic AWS Well-Architected review of a diagram spec. It reads WHICH services and groups are
// drawn and how they connect; it cannot see configuration, so every result is advisory
// ("consider"/"gap" to confirm), never a verdict. Rules map to the six framework pillars and,
// for generative AI workloads, to the Generative AI Lens design principles.
import fs from "node:fs";
import path from "node:path";
import { ROOT, resolveIcon } from "./catalog.mjs";
import { walk } from "./spec.mjs";

const WA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "well-architected.json"), "utf8"));
export const PILLAR_INFO = WA.framework.pillars;
export const GENAI = WA["generative-ai-lens"];

const STATEFUL = ["rds", "aurora", "dynamodb", "elasticache", "documentdb", "neptune", "memorydb", "opensearch-service", "redshift", "efs", "fsx", "keyspaces", "timestream"];
const DATA = [...STATEFUL, "simple-storage-service", "elastic-block-store", "kendra"];
const EDGE = ["cloudfront", "api-gateway", "elastic-load-balancing", "app-runner", "global-accelerator", "amplify", "appsync"];
const OBS = ["cloudwatch", "x-ray", "managed-service-for-grafana", "managed-service-for-prometheus", "cloudtrail", "opensearch-service"];
const COMPUTE = ["ec2", "lambda", "fargate", "elastic-container-service", "elastic-kubernetes-service", "app-runner", "batch"];
const AI = ["bedrock", "bedrock-agentcore", "sagemaker-ai", "sagemaker", "q", "kendra"];
const MODEL = ["bedrock", "bedrock-agentcore", "sagemaker-ai", "sagemaker", "q"];

export function reviewSpec(spec, model) {
  const nodes = Object.values(model.nodes).map((n) => ({ id: n.id, svc: n.icon.kind === "service" ? n.icon.entry.id : n.icon.kind === "resource" ? n.icon.entry.id.split(":")[0] : null, kind: n.icon.kind, res: n.icon.kind === "resource" ? n.icon.entry.id : null, gen: n.icon.kind === "general" ? n.icon.entry.id : null, label: (n.item.label || "") + " " + (n.item.sublabel || ""), parent: n.parent }));
  const groups = model.groups;
  const byId = (id) => nodes.find((n) => n.id === id);
  const ofSvc = (...ids) => nodes.filter((n) => n.svc && ids.includes(n.svc));
  const has = (...ids) => ofSvc(...ids).length > 0;
  const labelHas = (re) => nodes.filter((n) => re.test(n.label) || re.test(n.id));
  const ancestors = (id) => { const out = []; let g = groups.find((x) => x.id === (byId(id)?.parent ?? id)); while (g) { out.push(g); g = groups.find((x) => x.id === g.parent); } return out; };
  const azCount = groups.filter((g) => g.kind === "az").length;
  const isGenAI = (spec.meta.lens || []).includes("generative-ai") || has(...MODEL);
  const findings = [];
  const add = (pillar, id, status, title, detail, nodesIds = [], lens = "framework") => findings.push({ pillar, id, status, title, detail, nodes: nodesIds.map((n) => n.id || n), lens });

  // ---- Security
  const entry = ofSvc(...EDGE);
  if (entry.length) {
    const waf = has("waf", "shield", "network-firewall") || labelHas(/\bwaf\b|shield/i).length;
    add("security", "SEC-EDGE", waf ? "ok" : "gap", waf ? "Edge protection present" : "Internet-facing entry has no WAF / Shield shown",
      "Protect public entry points (CloudFront, API Gateway, load balancers) with AWS WAF and AWS Shield, and restrict origins.", waf ? ofSvc("waf", "shield", "network-firewall") : entry);
  }
  const dbPublic = nodes.filter((n) => STATEFUL.includes(n.svc) && ancestors(n.id).some((g) => g.kind === "public-subnet"));
  if (dbPublic.length) add("security", "SEC-DB-PUBLIC", "gap", "Data store drawn in a public subnet", "Keep databases and caches in private subnets; allow access only from the application tier via security groups.", dbPublic);
  else if (nodes.some((n) => STATEFUL.includes(n.svc))) add("security", "SEC-DB-PRIVATE", "ok", "Data stores are not placed in public subnets", "Least-privilege network placement for stateful services.", []);
  if (ofSvc(...DATA).length) {
    const kms = has("key-management-service") || labelHas(/\bkms\b/i).length;
    add("security", "SEC-ENCRYPT", kms ? "ok" : "consider", kms ? "Key management shown" : "No AWS KMS shown for data at rest",
      "Encrypt data at rest and in transit; use AWS KMS customer managed keys where you need key policy, rotation or audit control.", ofSvc("key-management-service"));
  }
  if (entry.length) {
    const authn = has("cognito", "iam-identity-center", "identity-and-access-management", "verified-permissions") || labelHas(/auth|oidc|saml|sso/i).length;
    add("security", "SEC-IDENTITY", authn ? "ok" : "consider", authn ? "Identity service shown" : "No identity / authentication service shown",
      "Authenticate and authorize every request (Amazon Cognito, IAM Identity Center, IAM roles, Verified Permissions) and use temporary credentials.", ofSvc("cognito", "iam-identity-center", "identity-and-access-management"));
  }
  if (nodes.length >= 4) {
    const detect = has("guardduty", "security-hub", "cloudtrail", "config", "inspector", "macie", "detective");
    add("security", "SEC-DETECT", detect ? "ok" : "consider", detect ? "Detection / audit services shown" : "No detection or audit services shown",
      "Enable AWS CloudTrail, GuardDuty and Security Hub (and Config/Inspector/Macie as relevant) for logging, threat detection and response.", ofSvc("guardduty", "security-hub", "cloudtrail", "config", "inspector", "macie", "detective"));
  }
  if (ofSvc("rds", "aurora", "documentdb", "redshift").length) {
    const sec = has("secrets-manager") || labelHas(/secret/i).length;
    add("security", "SEC-SECRETS", sec ? "ok" : "consider", sec ? "Secrets management shown" : "No Secrets Manager shown for database credentials",
      "Store and rotate credentials in AWS Secrets Manager (or use IAM database authentication) instead of embedding them.", ofSvc("secrets-manager"));
  }

  // ---- Reliability
  const stateful = nodes.filter((n) => ["rds", "aurora", "elasticache", "documentdb", "neptune", "opensearch-service", "ec2"].includes(n.svc));
  if (stateful.length) {
    const inVpc = stateful.some((n) => ancestors(n.id).some((g) => g.kind === "vpc"));
    if (inVpc || azCount) {
      const multi = azCount >= 2 || labelHas(/multi-?az/i).length > 0;
      add("reliability", "REL-MULTIAZ", multi ? "ok" : "gap", multi ? "Workload spans multiple Availability Zones" : "Workload is drawn in a single (or no) Availability Zone",
        "Deploy across at least two AZs; use Multi-AZ for databases and spread compute with Auto Scaling behind a load balancer.", multi ? [] : stateful);
    }
  }
  if (ofSvc("ec2").length) {
    const scale = groups.some((g) => g.kind === "asg") || has("auto-scaling");
    add("reliability", "REL-SCALE", scale ? "ok" : "consider", scale ? "Auto Scaling shown" : "EC2 without an Auto Scaling group",
      "Use Auto Scaling groups (or managed compute) so capacity follows demand and failed instances are replaced automatically.", ofSvc("ec2"));
  }
  if (ofSvc("rds", "aurora", "dynamodb", "efs", "elastic-block-store", "simple-storage-service").length) {
    const bk = has("backup", "elastic-disaster-recovery") || labelHas(/backup|replica|snapshot|pitr/i).length;
    add("reliability", "REL-BACKUP", bk ? "ok" : "consider", bk ? "Backup / recovery shown" : "No backup or recovery capability shown",
      "Define RPO/RTO and back up data with AWS Backup, snapshots, point-in-time recovery or cross-Region replication.", ofSvc("backup", "elastic-disaster-recovery"));
  }
  if (entry.length && ofSvc(...COMPUTE).length >= 2) {
    const async = has("simple-queue-service", "simple-notification-service", "eventbridge", "step-functions", "managed-streaming-for-apache-kafka", "kinesis", "mq");
    add("reliability", "REL-DECOUPLE", async ? "ok" : "consider", async ? "Asynchronous decoupling shown" : "No queue / event service shown between tiers",
      "Decouple components with Amazon SQS, SNS or EventBridge so spikes and downstream failures do not cascade; add retries with backoff and timeouts.", ofSvc("simple-queue-service", "simple-notification-service", "eventbridge", "step-functions"));
  }

  // ---- Operational excellence
  if (nodes.length >= 3) {
    const obs = has(...OBS.filter((o) => o !== "opensearch-service")) || labelHas(/observab|monitor|grafana|prometheus/i).length;
    add("operational-excellence", "OPS-OBSERVE", obs ? "ok" : "gap", obs ? "Observability shown" : "No monitoring / observability shown",
      "Collect metrics, logs and traces (Amazon CloudWatch, AWS X-Ray, managed Grafana/Prometheus) and define alarms tied to business outcomes.", ofSvc("cloudwatch", "x-ray", "managed-service-for-grafana", "managed-service-for-prometheus"));
    const iac = has("cloudformation", "cloud-development-kit", "codepipeline", "codebuild", "codedeploy", "codecommit", "systems-manager", "proton") || labelHas(/terraform|cdk|ci\/?cd|pipeline/i).length;
    add("operational-excellence", "OPS-IAC", iac ? "ok" : "consider", iac ? "IaC / delivery pipeline shown" : "No infrastructure-as-code or CI/CD shown",
      "Define infrastructure as code and deploy through a pipeline with small, reversible changes (CloudFormation/CDK, CodePipeline).", ofSvc("cloudformation", "cloud-development-kit", "codepipeline", "codebuild", "codedeploy"));
  }

  // ---- Performance efficiency
  if (entry.length && nodes.some((n) => ["users", "client", "mobile-client", "internet"].includes(n.gen))) {
    const cdn = has("cloudfront", "global-accelerator");
    add("performance-efficiency", "PERF-EDGE", cdn ? "ok" : "consider", cdn ? "Edge delivery shown" : "No CDN / edge acceleration shown for end users",
      "Serve content close to users with Amazon CloudFront or AWS Global Accelerator to cut latency.", ofSvc("cloudfront", "global-accelerator"));
  }
  if (ofSvc("rds", "aurora").length) {
    const cache = has("elasticache", "memorydb", "cloudfront") || labelHas(/cache|dax|read replica/i).length;
    add("performance-efficiency", "PERF-CACHE", cache ? "ok" : "consider", cache ? "Caching shown" : "Relational database with no cache / read scaling shown",
      "Add caching (ElastiCache, CloudFront) or read replicas for read-heavy access, and choose the data store that fits the access pattern.", ofSvc("elasticache", "memorydb"));
  }

  // ---- Cost optimization
  const nat = nodes.filter((n) => n.res === "vpc:nat-gateway" || /nat gateway/i.test(n.label));
  if (nat.length && has("simple-storage-service", "dynamodb")) {
    const ep = has("privatelink") || labelHas(/vpc endpoint|gateway endpoint|privatelink/i).length;
    add("cost-optimization", "COST-ENDPOINT", ep ? "ok" : "consider", ep ? "VPC endpoints shown" : "NAT gateway with S3/DynamoDB and no VPC endpoint",
      "Gateway endpoints for S3 and DynamoDB are free and avoid NAT data-processing charges; also improves security.", nat);
  }
  if (nodes.length >= 3) {
    const fin = has("budgets", "cost-explorer", "cost-and-usage-report", "billing-conductor") || labelHas(/budget|cost/i).length;
    add("cost-optimization", "COST-VISIBILITY", fin ? "ok" : "consider", fin ? "Cost visibility shown" : "No cost visibility shown",
      "Tag resources, set AWS Budgets and use Cost Explorer so spend maps to workloads and owners.", ofSvc("budgets", "cost-explorer"));
  }

  // ---- Sustainability
  if (nodes.length >= 3) {
    const managed = ofSvc("lambda", "fargate", "app-runner", "dynamodb", "aurora", "simple-storage-service", "step-functions").length;
    const ec2 = ofSvc("ec2").length;
    const ok = managed >= ec2 && managed > 0;
    add("sustainability", "SUS-MANAGED", ok ? "ok" : "consider", ok ? "Managed / serverless services dominate" : "Mostly self-managed compute",
      "Prefer managed and serverless services, right-size, use Graviton-based instances, and scale to demand to raise utilization and cut idle capacity.", ok ? [] : ofSvc("ec2"));
  }

  // ---- Generative AI Lens
  if (isGenAI) {
    const L = "generative-ai";
    const mods = ofSvc(...MODEL);
    const guard = labelHas(/guardrail/i).length || has("bedrock-guardrails") || spec.meta.guardrails === true;
    add("security", "GENAI-GUARDRAILS", guard ? "ok" : "gap", guard ? "Guardrails shown" : "No guardrails around model input/output",
      "Design for controlled autonomy: apply Amazon Bedrock Guardrails (or equivalent) to filter harmful content, PII and prompt attacks on both prompts and responses.", mods, L);
    const invlog = has("cloudwatch", "cloudtrail", "s3") || labelHas(/invocation log|trace|observab/i).length;
    add("operational-excellence", "GENAI-OBSERVE", invlog ? "ok" : "gap", invlog ? "Model telemetry destination shown" : "No model invocation logging / observability shown",
      "Implement comprehensive observability: log model invocations, latency, token usage, guardrail interventions and user feedback to CloudWatch/S3, and keep an audit trail with CloudTrail.", mods, L);
    const direct = (spec.edges || []).filter((e) => { const a = byId(e.from), b = byId(e.to); return a && b && ["users", "client", "mobile-client", "internet"].includes(a.gen) && MODEL.includes(b.svc); });
    if (direct.length) add("security", "GENAI-ENDPOINT", "gap", "Clients call the model directly", "Secure interaction boundaries: front models with an authenticated, throttled API layer (API Gateway / app tier) rather than exposing them to clients.", direct.map((e) => e.to), L);
    const insideVpc = nodes.some((n) => COMPUTE.includes(n.svc) && ancestors(n.id).some((g) => g.kind === "vpc"));
    if (insideVpc) {
      const pl = has("privatelink") || labelHas(/privatelink|vpc endpoint/i).length;
      add("security", "GENAI-PRIVATE", pl ? "ok" : "consider", pl ? "Private model connectivity shown" : "VPC compute calls model APIs without a VPC endpoint shown",
        "Keep prompts and responses off the public internet: use AWS PrivateLink interface endpoints for Amazon Bedrock and SageMaker runtime.", mods, L);
    }
    const retrieval = has("opensearch-service", "kendra", "aurora", "memorydb", "neptune", "documentdb") || labelHas(/vector|knowledge base|rag|retriev/i).length;
    add("performance-efficiency", "GENAI-RETRIEVAL", retrieval ? "ok" : "consider", retrieval ? "Retrieval / grounding data shown" : "No retrieval / grounding data source shown",
      "Ground responses in enterprise data (RAG with a vector store or Knowledge Bases) and measure retrieval quality; version prompts, models and data sources.", ofSvc("opensearch-service", "kendra", "aurora"), L);
    const regions = groups.filter((g) => g.kind === "region").length;
    add("reliability", "GENAI-RESILIENCE", regions >= 2 || labelHas(/cross-region|inference profile|fallback/i).length ? "ok" : "consider", regions >= 2 ? "Multiple Regions shown" : "Single-Region model inference",
      "Establish distributed resilience: plan for throttling and quota limits (retries, queues, provisioned throughput) and consider cross-Region inference profiles or a fallback model.", mods, L);
    add("cost-optimization", "GENAI-COST", labelHas(/cache|batch|router|smaller model/i).length ? "ok" : "consider", "Model cost controls", 
      "Optimize resource efficiency: select the smallest model that meets quality targets, use prompt caching / batch inference where possible, and track cost per request.", mods, L);
    if (has("bedrock-agentcore") || labelHas(/\bagent\b/i).length) add("security", "GENAI-AGENCY", labelHas(/human|approval|least.privilege/i).length ? "ok" : "consider", "Agents and excessive agency",
      "Limit tool permissions with least-privilege IAM roles, scope tool inputs/outputs, and add human approval for high-impact actions.", ofSvc("bedrock-agentcore"), L);
    add("sustainability", "GENAI-SUS", "consider", "Model and hosting efficiency", "Prefer right-sized or distilled models, serverless inference (Bedrock) and efficient accelerators; avoid always-on endpoints for spiky traffic.", mods, L);
  }

  const order = Object.keys(PILLAR_INFO);
  findings.sort((a, b) => order.indexOf(a.pillar) - order.indexOf(b.pillar) || (a.status === "ok") - (b.status === "ok"));
  const summary = Object.fromEntries(order.map((p) => [p, { gap: 0, consider: 0, ok: 0 }]));
  for (const f of findings) summary[f.pillar][f.status]++;
  return { findings, summary, genAI: isGenAI };
}
