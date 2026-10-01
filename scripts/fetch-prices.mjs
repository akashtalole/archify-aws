#!/usr/bin/env node
// Builds data/prices/<region>.json from the public AWS Price List bulk files (on-demand rates).
//   node scripts/fetch-prices.mjs [--region us-east-1] [--services AWSLambda,AmazonS3,...] [--skip-large]
// The Price List is public on-demand pricing only; it does not reflect your discounts, credits or free tier.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { PRICE_BASE, normalizeOffer, scanLarge, stripRegion } from "../src/cost/pricefile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const region = opt("--region", "us-east-1");
const only = opt("--services")?.split(",");
const U = (re) => (p) => re.test(stripRegion(p.attributes?.usagetype));
const any = () => true;

// code -> product filter. Keep the snapshot small: only the pricing dimensions the pricers use.
export const SERVICES = {
  AWSLambda: U(/^(Request|Lambda-GB-Second)(-ARM)?$/),
  AmazonS3: U(/^(TimedStorage-(ByteHrs|SIA-ByteHrs|ZIA-ByteHrs|GIR-ByteHrs|GDA-ByteHrs|INT-FA-ByteHrs|GlacierByteHrs)|Requests-Tier[12])$/),
  AmazonDynamoDB: U(/^(ReadRequestUnits|WriteRequestUnits|TimedStorage-ByteHrs|ReadCapacityUnit-Hrs|WriteCapacityUnit-Hrs)$/),
  AmazonApiGateway: U(/^(ApiGatewayRequest|ApiGatewayHttpRequest)$/),
  AWSQueueService: U(/^(Requests-RBP|Requests-FIFO-RBP)$/),
  AmazonSNS: U(/^(Requests-Tier1|DeliveryAttempts-(HTTP|SMTP|SQS|LAMBDA|SMS))$/),
  AmazonStates: U(/^(StateTransition|StepFunctions-Request|StepFunctions-GB-Second)$/),
  AmazonCloudWatch: U(/^(DataProcessing-Bytes|CW:MetricMonitorUsage|CW:AlarmMonitorUsage|TimedStorage-ByteHrs|CW:Requests)$/),
  AmazonBedrock: (p) => /tokens|Guardrail/i.test(p.attributes?.usagetype || ""),
  AmazonBedrockFoundationModels: (p) => /tokens/i.test(p.attributes?.usagetype || ""),
  AmazonBedrockAgentCore: (p) => !/Instance-based/.test(p.attributes?.usagetype || ""),
  AmazonTextract: U(/PagesProcessed$/),
  AmazonES: (p) => /^(ESInstance:|ES:|OpenSearch|.*OCU|StorageUsed)/.test(stripRegion(p.attributes?.usagetype)),
  AmazonECS: U(/^Fargate-(ARM-)?(vCPU-Hours:perCPU|GB-Hours)$/),
  awskms: U(/KMS-(Keys|Requests)$/),
  awswaf: U(/^(WebACLV2|WebACL|RuleV2|Rule|RequestV2-\d+KB|Request)$/),
  AmazonCognito: U(/^Cognito(UserPools|Essentials|Lite|Plus)?MAU$/),
  AWSEvents: U(/^Event-64K-Chunks$/),
  comprehend: any, comprehendmedical: any,
  AWSELB: U(/^(LoadBalancerUsage|LCUUsage)$/),
  AmazonCloudFront: any, AWSSecretsManager: any,
  AWSDataTransfer: (p) => p.attributes?.transferType === "AWS Outbound" && p.attributes?.toLocation === "External",
  AmazonRDS: (p) => /^(Database Instance|Database Storage)$/.test(p.productFamily) && /^(PostgreSQL|MySQL|MariaDB|Aurora PostgreSQL|Aurora MySQL)$/.test(p.attributes?.databaseEngine || "") && (p.productFamily === "Database Storage" || /^No license required$|^$/.test(p.attributes?.licenseModel || "")),
  // ~450 MB: scanned byte-wise. Linux/shared/on-demand instances, NAT gateway, and gp3 storage only.
  AmazonEC2: { large: true, keep: (p) => (p.productFamily === "Compute Instance" && p.attributes?.operatingSystem === "Linux" && p.attributes?.tenancy === "Shared" && p.attributes?.preInstalledSw === "NA" && p.attributes?.capacitystatus === "Used")
    || (p.productFamily === "NAT Gateway") || (p.productFamily === "Storage" && p.attributes?.volumeApiName === "gp3") },
};

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

const out = path.join(root, "data", "prices", `${region}.json`);
const book = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : { schema_version: "archify-aws.price-book.v1", region, services: {} };
book.retrievedAt = new Date().toISOString();
for (const [code, cfg] of Object.entries(SERVICES)) {
  if (only && !only.includes(code)) continue;
  const large = typeof cfg === "object";
  if (large && args.includes("--skip-large")) { console.error(`skip ${code} (--skip-large)`); continue; }
  const url = `${PRICE_BASE}${code}/current/${region}/index.json`;
  process.stderr.write(`${code} ${large ? "(large) " : ""}… `);
  try {
    const tmp = path.join(os.tmpdir(), `price-${code}-${process.pid}.json`);
    await download(url, tmp);
    const norm = large ? scanLarge(tmp, cfg.keep) : normalizeOffer(JSON.parse(fs.readFileSync(tmp, "utf8")), cfg);
    fs.rmSync(tmp, { force: true });
    book.services[code] = { source: url, version: norm.version, publicationDate: norm.publicationDate, rows: norm.rows };
    process.stderr.write(`${norm.rows.length} rates (publication ${norm.publicationDate})\n`);
  } catch (e) { process.stderr.write(`FAILED: ${e.message}\n`); }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(book) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), out)} — ${Object.keys(book.services).length} services, ${(fs.statSync(out).size / 1048576).toFixed(2)} MB`);
