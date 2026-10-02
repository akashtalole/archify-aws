// Well-Architected corpus: every pillar, question and best practice (BP) from the live AWS documentation index.
// Follows the AWS `aws-well-architected-review` skill (agent-toolkit-for-aws): the TOC index is the corpus source,
// patterns are general (no hardcoded pillar list), BP IDs are never invented, and a validation gate must pass
// before any assessment. A committed snapshot makes reviews work offline; `--live` re-reads the index.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../catalog.mjs";

export const SOURCES = {
  framework: { name: "AWS Well-Architected Framework", base: "https://docs.aws.amazon.com/wellarchitected/latest/framework/", file: "framework.json" },
  "generative-ai": { name: "Generative AI Lens", base: "https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/", file: "generative-ai-lens.json" },
};
const BP = /^([A-Z]{2,8})(\d{2})-BP(\d{2})\b\s*(.*)$/;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Pure: parse a TOC index document into records. Throws nothing; validation reports problems. */
export function parseToc(toc, base) {
  const bps = new Map(), questions = new Map(), pillars = [];
  const holdsBp = (n) => JSON.stringify(n).search(/"title"\s*:\s*"[A-Z]{2,8}\d{2}-BP\d{2}/) >= 0;
  // The pillar level is the first level (from the root) with more than one best-practice-bearing sibling.
  // The framework lists everything under a single "Appendix" branch, so descend through single-branch levels.
  let level = (toc.contents || []).filter(holdsBp);
  while (level.length === 1 && !BP.test(level[0].title)) { const next = (level[0].contents || []).filter(holdsBp); if (!next.length) break; level = next; }
  const collect = (node, pillar, question) => {
    for (const c of node.contents || []) {
      const m = c.title.match(BP);
      if (m) {
        const qid = m[1] + m[2], id = `${m[1]}${m[2]}-BP${m[3]}`;
        if (!bps.has(id)) bps.set(id, { bp_id: id, bp_title: m[4].trim(), bp_url: base + c.href, question_id: qid, pillar_id: pillar.id, pillar_name: pillar.name });
        if (question && !questions.has(qid)) questions.set(qid, { question_id: qid, question_title: question.title, question_url: base + question.href, pillar_id: pillar.id });
      } else if (holdsBp(c)) collect(c, pillar, (c.contents || []).some((x) => BP.test(x.title)) ? { title: c.title, href: c.href } : question);
    }
  };
  for (const p of level) { const pillar = { id: slug(p.title), name: p.title, href: p.href }; pillars.push(pillar); collect(p, pillar, null); }
  for (const b of bps.values()) if (!questions.has(b.question_id)) questions.set(b.question_id, { question_id: b.question_id, question_title: b.question_id, question_url: null, pillar_id: b.pillar_id });
  return { pillars, questions: [...questions.values()], bps: [...bps.values()] };
}

/** The skill's validation gate. Returns {valid, errors, counts}. */
export function validateCorpus(c) {
  const errors = [];
  if (!c.bps.length) errors.push("zero best practices parsed (acquisition failure)");
  const ids = new Set(c.bps.map((b) => b.bp_id));
  if (ids.size !== c.bps.length) errors.push("duplicate BP ids after dedupe");
  for (const b of c.bps) if (!/^[A-Z]{2,8}\d{2}-BP\d{2}$/.test(b.bp_id)) errors.push(`non-canonical BP id ${b.bp_id}`);
  const qids = new Set(c.questions.map((q) => q.question_id));
  if (qids.size !== c.questions.length) errors.push("duplicate question ids");
  for (const q of c.questions) if (!c.bps.some((b) => b.question_id === q.question_id)) errors.push(`question ${q.question_id} has no best practice`);
  for (const b of c.bps) { if (!qids.has(b.question_id)) errors.push(`BP ${b.bp_id} refers to unknown question`); if (!c.pillars.some((p) => p.id === b.pillar_id)) errors.push(`BP ${b.bp_id} refers to unknown pillar`); }
  for (const p of c.pillars) if (!c.bps.some((b) => b.pillar_id === p.id)) errors.push(`pillar ${p.name} carries no best practice`);
  const per = Object.fromEntries(c.pillars.map((p) => [p.id, c.bps.filter((b) => b.pillar_id === p.id).length]));
  const total = c.bps.length || 1;
  if (c.pillars.length > 1 && Math.max(...Object.values(per)) / total > 0.8) errors.push("implausible spread: one pillar holds >80% of best practices");
  return { valid: errors.length === 0, errors, counts: { pillars: c.pillars.length, questions: c.questions.length, bps: c.bps.length, perPillar: per } };
}

/** Network: read the live TOC index (HTTPS, docs.aws.amazon.com only) and return a validated corpus. */
export async function acquireCorpus(lens = "framework", { fetchImpl = fetch } = {}) {
  const src = SOURCES[lens];
  if (!src) throw new Error(`unknown corpus "${lens}" (${Object.keys(SOURCES).join(", ")})`);
  const url = src.base + "toc-contents.json";
  if (!url.startsWith("https://docs.aws.amazon.com/")) throw new Error("corpus must be fetched over HTTPS from docs.aws.amazon.com");
  let res;
  for (let attempt = 0; attempt < 2; attempt++) { // the skill retries the index once
    try { res = await fetchImpl(url); if (res.ok) break; } catch (e) { if (attempt) throw new Error(`cannot read ${url}: ${e.message}`); }
  }
  if (!res?.ok) throw new Error(`cannot read ${url}: HTTP ${res?.status}`);
  const parsed = parseToc(await res.json(), src.base);
  const manifest = { ...validateCorpus(parsed), provenance: { indexUrl: url, retrievedAt: new Date().toISOString() } };
  return { schema_version: "archify-aws.wa-corpus.v1", lens, name: src.name, ...parsed, manifest };
}

const snapFile = (lens) => path.join(ROOT, "data", "wa", SOURCES[lens].file);
export function loadCorpus(lens = "framework") {
  if (!SOURCES[lens]) throw new Error(`unknown corpus "${lens}"`);
  const f = snapFile(lens);
  if (!fs.existsSync(f)) throw new Error(`no corpus snapshot for ${lens}; run \`archify-aws wa corpus --refresh\``);
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  const v = validateCorpus(c); // never trust a snapshot silently: revalidate on load
  if (!v.valid) throw new Error(`corpus snapshot for ${lens} failed validation: ${v.errors.join("; ")}`);
  return c;
}
export function saveCorpus(c) { fs.mkdirSync(path.join(ROOT, "data", "wa"), { recursive: true }); fs.writeFileSync(snapFile(c.lens), JSON.stringify(c, null, 1) + "\n"); }
export const corpusAgeDays = (c) => Math.floor((Date.now() - Date.parse(c.manifest.provenance.retrievedAt)) / 86400000);
