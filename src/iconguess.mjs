// Conservative label -> AWS icon mapping for imported diagrams. Never silently invents: every result
// carries a confidence (exact | keyword | fallback) so the importer can report what needs a human look.
import { resolveIcon, searchIcons } from "./catalog.mjs";

// [pattern, icon id]; first match wins, so list specific before generic.
const KEYWORDS = [
  [/\b(api gateway|apigw|rest api|http api|api gw)\b/, "api-gateway"],
  [/\b(load balancer|alb|nlb|elb)\b/, "elastic-load-balancing"],
  [/\b(cdn|cloudfront|edge cache)\b/, "cloudfront"],
  [/\b(dns|route ?53)\b/, "route-53"],
  [/\b(waf|web application firewall)\b/, "waf"],
  [/\b(ddos|shield)\b/, "shield"],
  [/\b(guardrails?)\b/, "bedrock"],
  [/\b(agentcore|agent runtime|agent platform)\b/, "bedrock-agentcore"],
  [/\b(agents?)\b/, "bedrock-agentcore"],
  [/\b(llm|foundation model|bedrock|gen ?ai|claude|gpt|nova|model invocation)\b/, "bedrock"],
  [/\b(sagemaker|ml model|training job|ml platform|inference endpoint)\b/, "sagemaker-ai"],
  [/\b(fhir|healthlake|ehr data)\b/, "healthlake"],
  [/\b(comprehend)\b/, "comprehend"], [/\b(textract|ocr)\b/, "textract"], [/\b(transcribe|speech to text)\b/, "transcribe"],
  [/\b(rekognition|image analysis)\b/, "rekognition"],
  [/\b(vector (store|db|database)|opensearch|elasticsearch|search (index|engine|service))\b/, "opensearch-service"],
  [/\b(kendra|enterprise search)\b/, "kendra"],
  [/\b(queue|sqs|message buffer)\b/, "simple-queue-service"],
  [/\b(topic|sns|pub ?\/? ?sub|fan.?out|notifications?)\b/, "simple-notification-service"],
  [/\b(event ?bridge|event bus|events?)\b/, "eventbridge"],
  [/\b(kafka|msk)\b/, "managed-streaming-for-apache-kafka"],
  [/\b(kinesis|data stream|streaming)\b/, "kinesis"], [/\b(firehose)\b/, "data-firehose"],
  [/\b(state machine|step functions?|workflow|orchestrat\w*)\b/, "step-functions"],
  [/\b(data lake|lake formation)\b/, "lake-formation"],
  [/\b(etl|glue|data catalog|crawler)\b/, "glue"], [/\b(athena|ad hoc quer\w+)\b/, "athena"],
  [/\b(data warehouse|warehouse|redshift)\b/, "redshift"], [/\b(emr|spark|hadoop)\b/, "emr"],
  [/\b(bucket|object store|object storage|s3|blob)\b/, "simple-storage-service"],
  [/\b(file system|efs|nfs shared)\b/, "efs"], [/\b(block storage|ebs|volume)\b/, "elastic-block-store"],
  [/\b(nosql|dynamo\w*|key.?value store)\b/, "dynamodb"],
  [/\b(aurora)\b/, "aurora"],
  [/\b(database|db|sql|postgres\w*|mysql|mariadb|rds|relational)\b/, "rds"],
  [/\b(cache|redis|memcached|elasticache|valkey)\b/, "elasticache"],
  [/\b(lambda|function|serverless|handler)\b/, "lambda"],
  [/\b(kubernetes|k8s|eks)\b/, "elastic-kubernetes-service"],
  [/\b(fargate)\b/, "fargate"], [/\b(container|docker|ecs|microservice|service mesh)\b/, "elastic-container-service"],
  [/\b(app runner)\b/, "app-runner"], [/\b(batch job|batch)\b/, "batch"],
  [/\b(vm|virtual machine|server|instance|ec2|host|bastion)\b/, "ec2"],
  [/\b(auth\w*|login|sso|identity|oauth|oidc|idp|cognito|sign.?in|user pool)\b/, "cognito"],
  [/\b(iam|role|permissions?|rbac)\b/, "identity-and-access-management"],
  [/\b(secrets?|vault|credentials?)\b/, "secrets-manager"],
  [/\b(kms|encryption|encrypt|cmk)\b/, "key-management-service"],
  [/\b(guardduty|threat detection)\b/, "guardduty"], [/\b(audit|cloudtrail)\b/, "cloudtrail"],
  [/\b(monitor\w*|metrics?|logs?|logging|observab\w*|alarms?|cloudwatch|telemetry|dashboards?)\b/, "cloudwatch"],
  [/\b(tracing|traces?|x-?ray)\b/, "x-ray"],
  [/\b(backup)\b/, "backup"],
  [/\b(ci ?\/? ?cd|pipeline|codepipeline)\b/, "codepipeline"], [/\b(build|codebuild)\b/, "codebuild"],
  [/\b(terraform|cloudformation|iac|infrastructure as code|cdk)\b/, "cloudformation"],
  [/\b(vpc|virtual private cloud|network)\b/, "virtual-private-cloud"],
  [/\b(vpn)\b/, "site-to-site-vpn"], [/\b(direct connect)\b/, "direct-connect"], [/\b(transit gateway)\b/, "transit-gateway"],
  [/\b(email|ses|mail)\b/, "simple-email-service"],
  [/\b(iot|device|sensor)\b/, "iot-core"],
  [/\b(amplify|frontend hosting|spa)\b/, "amplify"], [/\b(graphql|appsync)\b/, "appsync"],
];
const GENERAL = [
  [/\b(users?|clients?|customers?|browser|patients?|clinicians?|staff|operators?|employees?|developers?|admins?|actors?|people)\b/, "users"],
  [/\b(mobile|ios|android|phone)\b/, "mobile"],
  [/\b(internet|public web|external)\b/, "internet"],
  [/\b(on.?prem\w*|data ?cent(er|re)|legacy|mainframe|ehr|pacs|hl7|erp|crm)\b/, "gen:server"],
  [/\b(document|pdf|report|file)\b/, "gen:document"],
];

export function guessIcon(label, hint = "") {
  const text = `${label || ""} ${hint}`.toLowerCase().replace(/[_]+/g, " ");
  const compact = text.replace(/[^a-z0-9 :]+/g, " ").replace(/\s+/g, " ").trim();
  // 1. exact service id / alias / full name (e.g. "Amazon S3", "DynamoDB", "AWS Lambda")
  const exact = resolveIcon(compact) || resolveIcon(compact.replace(/ /g, "-"));
  if (exact) return { icon: refOf(exact), confidence: "exact", matched: exact.entry.name };
  // 2. any single word or adjacent pair that is an exact service id/alias
  const words = compact.split(" ").filter(Boolean);
  for (let n = 2; n >= 1; n--) for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n).join(" ");
    if (g.length < 3) continue;
    const hit = resolveIcon("svc:" + g.replace(/ /g, "-"));
    if (hit) return { icon: refOf(hit), confidence: "exact", matched: hit.entry.name };
  }
  // 3. AWS-centric keyword table
  for (const [re, id] of KEYWORDS) if (re.test(compact)) { const hit = resolveIcon("svc:" + id); if (hit) return { icon: refOf(hit), confidence: "keyword", matched: hit.entry.name }; }
  for (const [re, id] of GENERAL) if (re.test(compact)) { const hit = resolveIcon(id); if (hit) return { icon: refOf(hit), confidence: "keyword", matched: hit.entry.name }; }
  // 4. strict catalog search (every token must match)
  const s = searchIcons(compact, 1)[0];
  if (s && s.kind === "service" && words.length <= 3) return { icon: s.id, confidence: "search", matched: s.name };
  return { icon: "gen:generic-application", confidence: "fallback", matched: null };
}
const refOf = (r) => (r.kind === "service" ? r.entry.id : r.kind === "resource" ? "res:" + r.entry.id : "gen:" + r.entry.id);
