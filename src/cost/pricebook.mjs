// Price book access: loads data/prices/<region>.json (built by scripts/fetch-prices.mjs from the public AWS Price List).
// All lookups are explicit and fail loudly on ambiguity — a silently wrong SKU is worse than "not estimated".
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../catalog.mjs";

export class PricingError extends Error {}
export const HOURS_PER_MONTH = 730; // AWS Price List convention used by the AWS billing/cost skill

export function loadPriceBook(region = "us-east-1") {
  const f = path.join(ROOT, "data", "prices", `${region}.json`);
  if (!fs.existsSync(f)) throw new PricingError(`no price book for ${region}; run \`node scripts/fetch-prices.mjs --region ${region}\``);
  const book = JSON.parse(fs.readFileSync(f, "utf8"));
  const rows = (code) => { const s = book.services[code]; if (!s) throw new PricingError(`price book has no ${code}; run scripts/fetch-prices.mjs --services ${code}`); return s.rows; };
  return {
    region, retrievedAt: book.retrievedAt,
    has: (code) => !!book.services[code],
    rows,
    publication: (code) => book.services[code]?.publicationDate ?? null,
    publications: (codes) => Object.fromEntries([...codes].filter((c) => book.services[c]).map((c) => [c, book.services[c].publicationDate])),
    /** One pricing dimension (possibly tiered). Throws if the predicate matches more than one SKU. */
    dim(code, pred, what) {
      const hit = rows(code).filter(pred);
      if (!hit.length) throw new PricingError(`no Price List rate for ${what} (${code})`);
      const bySku = new Map();
      for (const r of hit) (bySku.get(r.sku) || bySku.set(r.sku, []).get(r.sku)).push(r);
      const sig = (rs) => rs.slice().sort((a, b) => a.b - b.b).map((r) => `${r.b}|${r.e}|${r.usd}|${r.unit}`).join(";");
      const sigs = new Set([...bySku.values()].map(sig));
      // several SKUs are fine when they carry the same price (e.g. a "legacy" and a "current" listing); differing prices are ambiguous
      if (sigs.size > 1) throw new PricingError(`ambiguous Price List match for ${what} (${code}): ${bySku.size} SKUs with different rates (${[...new Set(hit.map((r) => r.u))].join(", ")}) — be more specific`);
      return [...bySku.values()][0].slice().sort((a, b) => a.b - b.b);
    },
    /** Zero-or-more: like dim but returns null when nothing matches. */
    tryDim(code, pred, what) { try { return this.dim(code, pred, what); } catch (e) { if (/^no Price List rate/.test(e.message)) return null; throw e; } },
  };
}

/** Tiered monthly cost for a quantity over rows with beginRange/endRange. Returns {usd, tiers:[{from,to,qty,rate,usd}]}. */
export function tiered(rows, qty) {
  let usd = 0;
  const tiers = [];
  for (const r of rows) {
    const rate = Number(r.usd);
    const hi = r.e === null ? Infinity : r.e;
    const seg = Math.max(0, Math.min(qty, hi) - r.b);
    if (seg > 0) { usd += seg * rate; tiers.push({ from: r.b, to: r.e, qty: seg, rate, usd: seg * rate }); }
  }
  return { usd, tiers };
}
export const round4 = (x) => Math.round(x * 1e4) / 1e4;
export const money = (x) => (x < 1 && x > 0 ? "$" + x.toFixed(4) : "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
