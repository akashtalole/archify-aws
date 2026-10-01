// Infrastructure-as-code -> architecture spec. Reads Terraform (*.tf), CloudFormation/SAM (YAML or JSON)
// with zero-dependency scanners (no full parsers: resources, references, SAM events) and produces the same
// spec the rest of the tool renders. It reports what it skipped so nothing is silently dropped.
import fs from "node:fs";
import path from "node:path";
import { layerItems } from "./layers.mjs";

// kind -> icon; `tf` and `cfn` are the type patterns that map to it. Order = upstream-first priority for glue edges.
const KINDS = [
  { k: "dns", icon: "route-53", tf: /^aws_route53_(zone|record)$/, cfn: /^AWS::Route53::HostedZone$/ },
  { k: "cdn", icon: "cloudfront", tf: /^aws_cloudfront_distribution$/, cfn: /^AWS::CloudFront::Distribution$/ },
  { k: "waf", icon: "waf", tf: /^aws_wafv2_web_acl$/, cfn: /^AWS::WAFv2::WebACL$/ },
  { k: "api", icon: "api-gateway", tf: /^aws_(api_gateway_rest_api|apigatewayv2_api)$/, cfn: /^AWS::(ApiGateway::RestApi|ApiGatewayV2::Api|Serverless::(Api|HttpApi))$/ },
  { k: "lb", icon: "elastic-load-balancing", tf: /^aws_(lb|alb)$/, cfn: /^AWS::ElasticLoadBalancingV2::LoadBalancer$/ },
  { k: "auth", icon: "cognito", tf: /^aws_cognito_user_pool$/, cfn: /^AWS::Cognito::UserPool$/ },
  { k: "rule", icon: "eventbridge", tf: /^aws_cloudwatch_event_rule$|^aws_scheduler_schedule$/, cfn: /^AWS::Events::Rule$|^AWS::Scheduler::Schedule$/ },
  { k: "topic", icon: "simple-notification-service", tf: /^aws_sns_topic$/, cfn: /^AWS::SNS::Topic$/ },
  { k: "bucket", icon: "simple-storage-service", tf: /^aws_s3_bucket$/, cfn: /^AWS::S3::Bucket$/ },
  { k: "queue", icon: "simple-queue-service", tf: /^aws_sqs_queue$/, cfn: /^AWS::SQS::Queue$/ },
  { k: "stream", icon: "kinesis", tf: /^aws_kinesis_stream$/, cfn: /^AWS::Kinesis::Stream$/ },
  { k: "firehose", icon: "data-firehose", tf: /^aws_kinesis_firehose_delivery_stream$/, cfn: /^AWS::KinesisFirehose::DeliveryStream$/ },
  { k: "flow", icon: "step-functions", tf: /^aws_sfn_state_machine$/, cfn: /^AWS::(StepFunctions::StateMachine|Serverless::StateMachine)$/ },
  { k: "fn", icon: "lambda", tf: /^aws_lambda_function$/, cfn: /^AWS::(Lambda::Function|Serverless::Function)$/ },
  { k: "compute", icon: "ec2", tf: /^aws_(instance|launch_template)$/, cfn: /^AWS::EC2::Instance$/ },
  { k: "ecs", icon: "elastic-container-service", tf: /^aws_ecs_service$/, cfn: /^AWS::ECS::Service$/ },
  { k: "eks", icon: "elastic-kubernetes-service", tf: /^aws_eks_cluster$/, cfn: /^AWS::EKS::Cluster$/ },
  { k: "ecr", icon: "elastic-container-registry", tf: /^aws_ecr_repository$/, cfn: /^AWS::ECR::Repository$/ },
  { k: "agent", icon: "bedrock", tf: /^aws_bedrockagent_(agent|knowledge_base)$|^aws_bedrock_guardrail$/, cfn: /^AWS::Bedrock::(Agent|KnowledgeBase|Guardrail|Flow)$/ },
  { k: "ml", icon: "sagemaker-ai", tf: /^aws_sagemaker_(endpoint|model)$/, cfn: /^AWS::SageMaker::(Endpoint|Model)$/ },
  { k: "cache", icon: "elasticache", tf: /^aws_elasticache_(cluster|replication_group)$/, cfn: /^AWS::ElastiCache::(CacheCluster|ReplicationGroup)$/ },
  { k: "db", icon: "rds", tf: /^aws_db_instance$/, cfn: /^AWS::RDS::DBInstance$/ },
  { k: "aurora", icon: "aurora", tf: /^aws_rds_cluster$/, cfn: /^AWS::RDS::DBCluster$/ },
  { k: "ddb", icon: "dynamodb", tf: /^aws_dynamodb_table$/, cfn: /^AWS::(DynamoDB::Table|Serverless::SimpleTable)$/ },
  { k: "search", icon: "opensearch-service", tf: /^aws_(opensearch_domain|elasticsearch_domain|opensearchserverless_collection)$/, cfn: /^AWS::(OpenSearchService::Domain|OpenSearchServerless::Collection|Elasticsearch::Domain)$/ },
  { k: "dw", icon: "redshift", tf: /^aws_redshift_cluster$/, cfn: /^AWS::Redshift::Cluster$/ },
  { k: "glue", icon: "glue", tf: /^aws_glue_(job|crawler|catalog_database)$/, cfn: /^AWS::Glue::(Job|Crawler|Database)$/ },
  { k: "athena", icon: "athena", tf: /^aws_athena_workgroup$/, cfn: /^AWS::Athena::WorkGroup$/ },
  { k: "efs", icon: "efs", tf: /^aws_efs_file_system$/, cfn: /^AWS::EFS::FileSystem$/ },
  { k: "kms", icon: "key-management-service", tf: /^aws_kms_key$/, cfn: /^AWS::KMS::Key$/ },
  { k: "secret", icon: "secrets-manager", tf: /^aws_secretsmanager_secret$/, cfn: /^AWS::SecretsManager::Secret$/ },
  { k: "nat", icon: "res:vpc:nat-gateway", tf: /^aws_nat_gateway$/, cfn: /^AWS::EC2::NatGateway$/ },
  { k: "igw", icon: "res:vpc:internet-gateway", tf: /^aws_internet_gateway$/, cfn: /^AWS::EC2::InternetGateway$/ },
  { k: "cicd", icon: "codepipeline", tf: /^aws_codepipeline$/, cfn: /^AWS::CodePipeline::Pipeline$/ },
  { k: "build", icon: "codebuild", tf: /^aws_codebuild_project$/, cfn: /^AWS::CodeBuild::Project$/ },
  { k: "logs", icon: "cloudwatch", tf: /^aws_cloudwatch_log_group$/, cfn: /^AWS::Logs::LogGroup$/, optional: "logs" },
  { k: "iam", icon: "identity-and-access-management", tf: /^aws_iam_role$/, cfn: /^AWS::IAM::Role$/, optional: "iam" },
];
const PRIORITY = KINDS.map((x) => x.k);
const GLUE = {
  tf: /_(policy|permission|attachment|integration|route|stage|listener|target|subscription|notification|mapping|association|deployment|method|resource|method_response|integration_response|authorizer)$/,
  cfn: /^AWS::(Lambda::(Permission|EventSourceMapping)|ApiGateway(V2)?::(Method|Integration|Route|Stage|Deployment|Authorizer)|SNS::(Subscription|TopicPolicy)|SQS::QueuePolicy|S3::BucketPolicy|ElasticLoadBalancingV2::(Listener|TargetGroup))$/,
};
const GROUPS = { tf: /^aws_vpc$/, cfn: /^AWS::EC2::VPC$/ };
const VPC_HINT = /\b(subnet_ids?|subnet_id|vpc_config|db_subnet_group_name|SubnetIds?|VpcConfig|DBSubnetGroupName|VPCZoneIdentifier)\b/;

const walk = (dir, exts, acc = []) => {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(\.|node_modules$|cdk\.out$|dist$)/.test(d.name) && d.name !== ".") continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, exts, acc); else if (exts.some((e) => d.name.endsWith(e))) acc.push(f);
  }
  return acc;
};
const human = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------- Terraform
function terraformResources(text, file) {
  const out = [];
  const re = /(^|\n)\s*resource\s+"(aws_[a-z0-9_]+)"\s+"([^"]+)"\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length, depth = 1, inStr = false;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (inStr) { if (ch === "\\") i++; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true;
      else if (ch === "#" || (ch === "/" && text[i + 1] === "/")) { while (i < text.length && text[i] !== "\n") i++; }
      else if (ch === "{") depth++; else if (ch === "}") depth--;
      i++;
    }
    out.push({ type: m[2], name: m[3], body: text.slice(m.index + m[0].length, i - 1), file, id: `${m[2]}.${m[3]}` });
  }
  return out;
}
const tfRefs = (r, byId) => [...new Set([...r.body.matchAll(/\b(aws_[a-z0-9_]+)\.([A-Za-z0-9_-]+)/g)].map((x) => `${x[1]}.${x[2]}`))].filter((id) => id !== r.id && byId.has(id));

// ---------------- CloudFormation / SAM
function cfnResources(text, file) {
  if (/^\s*\{/.test(text)) {
    let j; try { j = JSON.parse(text); } catch { return []; }
    return Object.entries(j.Resources || {}).map(([name, v]) => ({ type: v.Type, name, body: JSON.stringify(v), file, id: name, json: v }));
  }
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^Resources\s*:/.test(l));
  if (start < 0) return [];
  const out = [];
  let baseIndent = null, cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*#/.test(l)) { if (cur) cur.lines.push(l); continue; }
    const ind = l.match(/^\s*/)[0].length;
    if (ind === 0) break; // next top-level section
    if (baseIndent === null) baseIndent = ind;
    const key = ind === baseIndent && l.match(/^\s*([A-Za-z0-9]+)\s*:\s*$/);
    if (key) { cur = { name: key[1], lines: [] }; out.push(cur); continue; }
    cur?.lines.push(l);
  }
  return out.map((r) => {
    const body = r.lines.join("\n");
    const type = (body.match(/^\s*Type\s*:\s*['"]?([A-Za-z0-9:]+)['"]?\s*$/m) || [])[1];
    return { type, name: r.name, body, file, id: r.name, lines: r.lines };
  }).filter((r) => r.type);
}
function withoutEvents(r) {
  const lines = r.lines || [];
  const at = lines.findIndex((l) => /^\s*Events\s*:\s*$/.test(l));
  if (at < 0) return r.body;
  const ind = lines[at].match(/^\s*/)[0].length;
  let end = at + 1;
  while (end < lines.length && (!lines[end].trim() || lines[end].match(/^\s*/)[0].length > ind)) end++;
  return [...lines.slice(0, at), ...lines.slice(end)].join("\n"); // events are handled separately, with direction
}
function cfnRefs(r0, byId) {
  const r = { ...r0, body: /Serverless::Function/.test(r0.type || "") ? withoutEvents(r0) : r0.body };
  const names = new Set();
  const add = (n) => { if (n && byId.has(n) && n !== r.id) names.add(n); };
  for (const m of r.body.matchAll(/!Ref\s+['"]?(\w+)|Ref\s*:\s*['"]?(\w+)|"Ref"\s*:\s*"(\w+)"/g)) add(m[1] || m[2] || m[3]);
  for (const m of r.body.matchAll(/!GetAtt\s+['"]?(\w+)|Fn::GetAtt\s*:\s*\[?\s*['"]?(\w+)|"Fn::GetAtt"\s*:\s*\[\s*"(\w+)"/g)) add(m[1] || m[2] || m[3]);
  for (const m of r.body.matchAll(/\$\{(\w+)(?:\.\w+)?\}/g)) add(m[1]);
  for (const m of r.body.matchAll(/DependsOn\s*:\s*['"]?(\w+)/g)) add(m[1]);
  return [...names];
}
/** SAM function events -> [{kind, label, refs}] (Api/HttpApi/SQS/SNS/S3/Kinesis/DynamoDB/Schedule/EventBridge). */
function samEvents(r) {
  const lines = r.lines || [];
  const at = lines.findIndex((l) => /^\s*Events\s*:\s*$/.test(l));
  if (at < 0) return [];
  const ind = lines[at].match(/^\s*/)[0].length;
  const events = [];
  let cur = null;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const li = l.match(/^\s*/)[0].length;
    if (li <= ind) break;
    if (/^\s*[A-Za-z0-9]+\s*:\s*$/.test(l) && li === ind + 2) { cur = { lines: [] }; events.push(cur); continue; }
    cur?.lines.push(l);
  }
  return events.map((e) => {
    const body = e.lines.join("\n");
    const type = (body.match(/^\s*Type\s*:\s*['"]?(\w+)/m) || [])[1];
    const path_ = (body.match(/Path\s*:\s*['"]?([^'"\n]+)/) || [])[1], method = (body.match(/Method\s*:\s*['"]?(\w+)/) || [])[1];
    return { type, body, label: path_ ? `${(method || "ANY").toUpperCase()} ${path_.trim()}` : "" };
  }).filter((e) => e.type);
}

export function importIac(root, { include = [], title } = {}) {
  const target = path.resolve(root);
  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? walk(target, [".tf", ".yaml", ".yml", ".json", ".template"]) : [target];
  const report = { source: target, files: [], formats: [], resources: 0, nodes: 0, skipped: {}, glue: 0, warnings: [] };
  const all = [];
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    let rs = [], fmt = null;
    if (f.endsWith(".tf")) { rs = terraformResources(text, f).map((r) => ({ ...r, fmt: "tf" })); fmt = "terraform"; }
    else if (/AWSTemplateFormatVersion|^Resources\s*:|"Resources"\s*:|Transform\s*:\s*AWS::Serverless/m.test(text)) { rs = cfnResources(text, f).map((r) => ({ ...r, fmt: "cfn" })); fmt = /AWS::Serverless/.test(text) ? "sam" : "cloudformation"; }
    if (rs.length) { all.push(...rs); report.files.push(path.relative(process.cwd(), f)); if (!report.formats.includes(fmt)) report.formats.push(fmt); }
  }
  if (!all.length) throw new Error(`no Terraform or CloudFormation/SAM resources found in ${root}`);
  report.resources = all.length;
  const byId = new Map(all.map((r) => [r.id, r]));
  const classify = (r) => {
    const ty = r.type;
    if ((r.fmt === "tf" ? GROUPS.tf : GROUPS.cfn).test(ty)) return { role: "vpc" };
    if ((r.fmt === "tf" ? GLUE.tf.test(ty) : GLUE.cfn.test(ty))) return { role: "glue" };
    const kind = KINDS.find((k) => (r.fmt === "tf" ? k.tf : k.cfn).test(ty));
    if (kind) return kind.optional && !include.includes(kind.optional) ? { role: "skip", why: kind.optional } : { role: "node", kind };
    return { role: "skip", why: ty };
  };
  const nodes = new Map(), glue = [], vpcs = [];
  const used = new Set();
  const uniq = (r) => { let id = nodeId(r.name); if (used.has(id)) id = nodeId(r.type.replace(/^aws_|^AWS::/, "").replace(/::/g, "_") + "_" + r.name); used.add(id); return id; };
  for (const r of all) {
    const c = classify(r); r.cls = c;
    if (c.role === "node") nodes.set(r.id, { r, kind: c.kind, id: uniq(r), label: human(r.name), sublabel: r.type.replace(/^aws_|^AWS::/, "").replace(/::/g, " "), vpc: VPC_HINT.test(r.body) });
    else if (c.role === "glue") glue.push(r);
    else if (c.role === "vpc") vpcs.push(r);
    else report.skipped[c.why] = (report.skipped[c.why] || 0) + 1;
  }
  report.glue = glue.length;
  const refsOf = (r) => (r.fmt === "tf" ? tfRefs(r, byId) : cfnRefs(r, byId));
  const edges = [], seen = new Set();
  const addEdge = (a, b, label, dashed) => { if (!a || !b || a === b || !nodes.has(a) || !nodes.has(b)) return; const k = a + ">" + b; if (seen.has(k)) return; seen.add(k); edges.push({ from: nodes.get(a).id, to: nodes.get(b).id, ...(label ? { label } : {}), ...(dashed ? { style: "dashed" } : {}) }); };
  const pr = (id) => { const n = nodes.get(id); return n ? PRIORITY.indexOf(n.kind.k) : 999; };
  // direct references: A uses B
  for (const n of nodes.values()) for (const ref of refsOf(n.r)) {
    const target_ = byId.get(ref);
    if (nodes.has(ref)) addEdge(n.r.id, ref);
    else if (target_?.cls.role === "glue") { /* resolved below */ }
  }
  // glue resources connect the most "upstream" referenced node to the others (API integration, permission, subscription, ...)
  const resolveGlue = (g, depth = 0) => {
    const refs = refsOf(g).flatMap((id) => (nodes.has(id) ? [id] : byId.get(id)?.cls.role === "glue" && depth < 2 ? resolveGlue(byId.get(id), depth + 1) : []));
    return [...new Set(refs)];
  };
  for (const g of glue) {
    const refs = resolveGlue(g).sort((a, b) => pr(a) - pr(b));
    if (refs.length >= 2) for (const t of refs.slice(1)) addEdge(refs[0], t, glueLabel(g));
  }
  // SAM events
  const synth = new Map();
  for (const n of [...nodes.values()]) if (n.r.fmt === "cfn" && /Serverless::Function/.test(n.r.type)) {
    for (const ev of samEvents(n.r)) {
      if (/^(Api|HttpApi)$/.test(ev.type)) {
        const explicit = refsOf({ ...n.r, body: ev.body, lines: undefined, id: n.r.id }).find((id) => nodes.has(id) && nodes.get(id).kind.k === "api");
        let apiId = explicit;
        if (!apiId) { apiId = "__api"; if (!nodes.has(apiId)) { nodes.set(apiId, { r: { type: "AWS::Serverless::Api", fmt: "cfn" }, kind: KINDS.find((k) => k.k === "api"), id: "ServerlessApi", label: "API Gateway", sublabel: "implicit (SAM events)" }); synth.set(apiId, true); } }
        addEdge(apiId, n.r.id, ev.label);
      } else if (/^(Schedule|EventBridgeRule|CloudWatchEvent|ScheduleV2)$/.test(ev.type)) {
        const rid = "__rule_" + n.r.id; nodes.set(rid, { r: { type: "AWS::Events::Rule", fmt: "cfn" }, kind: KINDS.find((k) => k.k === "rule"), id: "Rule" + nodeId(n.r.id), label: "Schedule / event rule", sublabel: ev.type });
        addEdge(rid, n.r.id, ev.label || (ev.body.match(/Schedule\w*\s*:\s*['"]?([^'"\n]+)/) || [])[1]?.trim());
      } else {
        for (const ref of refsOf({ ...n.r, body: ev.body, lines: undefined, id: n.r.id })) if (nodes.has(ref)) addEdge(ref, n.r.id, ev.type.toLowerCase(), true);
      }
    }
  }
  // ---- build items (optionally wrap VPC-attached nodes in a VPC group, everything in AWS Cloud)
  const mk = (n) => ({ id: n.id, icon: n.kind.icon, label: n.label, sublabel: n.sublabel });
  const inVpc = [], outside = [];
  for (const n of nodes.values()) (n.vpc && vpcs.length ? inVpc : outside).push(n);
  const names = new Set(), ids = (list) => list;
  const items = outside.map(mk);
  if (inVpc.length) items.push({ id: "vpc", kind: "vpc", label: "VPC", children: inVpc.map(mk) });
  if (nodes.size > 40) report.warnings.push(`${nodes.size} resources become nodes — consider narrowing the path or splitting the diagram (readable range is ~6-20).`);
  const layered = layerItems(items, edges, "LR");
  const cloud = { id: "cloud", kind: "aws-cloud", layout: "row", gap: 64, children: layered };
  const spec = {
    meta: { title: title || `${path.basename(target)} — architecture from ${report.formats.join(" + ")}`, subtitle: `${nodes.size} resources, ${edges.length} relationships inferred from references; verify against the deployed system`, output: "iac-diagram.html" },
    root: { layout: "row", gap: 70, children: [cloud] },
    edges,
  };
  report.nodes = nodes.size;
  report.edges = edges.length;
  if (!edges.length) report.warnings.push("no relationships could be inferred from references");
  return { type: "architecture", spec, report };
  function nodeId(s) { let id = s.replace(/[^\w-]+/g, "_"); if (!/^[A-Za-z]/.test(id)) id = "r" + id; return id; }
  function glueLabel(g) {
    if (/subscription/.test(g.type)) return "subscribes";
    if (/event_source_mapping|EventSourceMapping/.test(g.type)) return "triggers";
    if (/notification/.test(g.type)) return "notifies";
    if (/permission|Permission/.test(g.type)) return "invokes";
    return undefined;
  }
}
