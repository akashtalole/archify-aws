// Price List ingestion (public AWS Price List bulk files, no credentials). On-demand rates only.
// Normalizes each offer file into compact rate rows; `scanLarge` handles files too big for JSON.parse.
import fs from "node:fs";

export const PRICE_BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/";
const KEEP_ATTRS = ["instanceType", "operatingSystem", "tenancy", "preInstalledSw", "capacitystatus", "databaseEngine", "deploymentOption", "licenseModel",
  "model", "inferenceType", "servicename", "volumeApiName", "volumeType", "storageClass", "group", "groupDescription", "operation", "transferType",
  "fromLocation", "toLocation", "vcpu", "memory", "location", "instanceFamily", "usagetype", "regionCode"];

/** Strip the region prefix from a usage type so matching is region independent (USE1-Request -> Request). */
export function stripRegion(u) {
  return String(u || "").replace(/^([A-Z]{2,5}\d|[a-z]{2}-[a-z]+-\d)-(?=[A-Za-z])/, "");
}

/** Turn one product + its on-demand term dimensions into rows. */
export function rowsFor(sku, product, onDemandTerms) {
  const a = product.attributes || {};
  const attrs = {};
  for (const k of KEEP_ATTRS) if (a[k] !== undefined && a[k] !== "NA" && a[k] !== "") attrs[k] = a[k];
  const out = [];
  for (const term of Object.values(onDemandTerms || {})) for (const pd of Object.values(term.priceDimensions || {})) {
    const usd = pd.pricePerUnit?.USD;
    if (usd === undefined) continue;
    out.push({ sku, u: stripRegion(a.usagetype), fam: product.productFamily || null, unit: pd.unit, usd, b: Number(pd.beginRange ?? 0), e: pd.endRange === "Inf" ? null : Number(pd.endRange), d: (pd.description || "").slice(0, 120), a: attrs });
  }
  return out;
}

/** Parse a normal-sized offer document. keep(product) decides which products to retain. */
export function normalizeOffer(doc, keep) {
  const rows = [];
  for (const [sku, p] of Object.entries(doc.products || {})) if (keep(p)) rows.push(...rowsFor(sku, p, doc.terms?.OnDemand?.[sku]));
  return { version: doc.version, publicationDate: doc.publicationDate, offerCode: doc.offerCode, rows };
}

// ---- byte scanner for very large offer files (EC2 ~450 MB): never builds one giant string
function skipValue(buf, i) { // returns index just past the JSON value starting at i (object/array/string/scalar)
  const c = buf[i];
  if (c === 0x7b || c === 0x5b) { // { [
    let depth = 0, inStr = false;
    for (; i < buf.length; i++) {
      const b = buf[i];
      if (inStr) { if (b === 0x5c) i++; else if (b === 0x22) inStr = false; }
      else if (b === 0x22) inStr = true;
      else if (b === 0x7b || b === 0x5b) depth++;
      else if (b === 0x7d || b === 0x5d) { depth--; if (depth === 0) return i + 1; }
    }
    throw new Error("unterminated JSON value");
  }
  if (c === 0x22) { for (i++; i < buf.length; i++) { if (buf[i] === 0x5c) i++; else if (buf[i] === 0x22) return i + 1; } throw new Error("unterminated string"); }
  while (i < buf.length && buf[i] !== 0x2c && buf[i] !== 0x7d && buf[i] !== 0x5d) i++;
  return i;
}
function* entries(buf, objStart) { // yields [key, valueStart, valueEnd] for each member of the object whose '{' is at objStart
  let i = objStart + 1;
  for (;;) {
    while (i < buf.length && (buf[i] <= 0x20 || buf[i] === 0x2c)) i++;
    if (buf[i] === 0x7d) return;
    const ks = i + 1; i = skipValue(buf, i);
    const key = buf.toString("utf8", ks, i - 1);
    while (buf[i] !== 0x3a) i++;
    i++; while (buf[i] <= 0x20) i++;
    const vs = i; i = skipValue(buf, i);
    yield [key, vs, i];
  }
}
const findObject = (buf, name, from = 0) => { const k = Buffer.from(`"${name}"`); let at = buf.indexOf(k, from); while (at >= 0) { let j = at + k.length; while (buf[j] <= 0x20) j++; if (buf[j] === 0x3a) { j++; while (buf[j] <= 0x20) j++; if (buf[j] === 0x7b) return j; } at = buf.indexOf(k, at + 1); } return -1; };

export function scanLarge(file, keep) {
  const buf = fs.readFileSync(file);
  const meta = {};
  for (const k of ["version", "publicationDate", "offerCode"]) { const m = buf.toString("utf8", 0, 4096).match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`)); if (m) meta[k] = m[1]; }
  const pStart = findObject(buf, "products");
  if (pStart < 0) throw new Error("no products object");
  const kept = new Map();
  for (const [sku, s, e] of entries(buf, pStart)) {
    const raw = buf.toString("utf8", s, e);
    // cheap pre-filter on the raw text before parsing JSON
    const p = JSON.parse(raw);
    if (keep(p)) kept.set(sku, p);
  }
  const tStart = findObject(buf, "terms"); const odStart = findObject(buf, "OnDemand", tStart);
  const rows = [];
  for (const [sku, s, e] of entries(buf, odStart)) if (kept.has(sku)) rows.push(...rowsFor(sku, kept.get(sku), JSON.parse(buf.toString("utf8", s, e))));
  return { ...meta, rows };
}
