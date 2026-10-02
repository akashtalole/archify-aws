# Well-Architected engine

Implements the structure of the AWS `aws-well-architected-review` skill for **diagram evidence**: a frozen, validated corpus → one of five statuses per best practice (BP) → impact × likelihood risk → Eisenhower prioritisation → report data. Everything is deterministic code.

| File | Role |
|---|---|
| `wa/corpus.mjs` | Acquire, validate, save and load the corpus (`SOURCES`, `parseToc`, `validateCorpus`, `acquireCorpus`, `loadCorpus`, `corpusAgeDays`) |
| `wa/rules.mjs` | Evidence rules: which BPs a diagram can speak to (`LEGACY_RULES`, `LEGACY_LENS_RULES`, `PROCEDURAL_RULES`, `STATUS`, `OWNER`) |
| `wa/evaluate.mjs` | `reviewWorkload(diagram, options)` → report object; `riskLevel`, `RISK_ORDER`, `MODES` |
| `review.mjs` | The original heuristic findings; the *legacy rules* map these ids to BPs |
| `report.mjs` | Renders the report as the HTML tab |

## Corpus (`data/wa/framework.json`, `data/wa/generative-ai-lens.json`)

The corpus comes from the **live documentation table-of-contents index** (`toc-contents.json`), not from scraping pages and not from a hard-coded pillar list. The parser:

* finds BP entries by their canonical id pattern (`^[A-Z]{2,8}\d{2}-BP\d{2}$`);
* finds the pillar level generally: the Framework lists all BPs under one "Appendix" branch, so the parser descends through single-branch levels until a level has several BP-bearing siblings;
* attaches each BP to its question and pillar, with URLs.

`validateCorpus` is the skill's gate and runs on acquisition **and on every snapshot load**: non-empty, canonical unique ids, every BP has a known question and pillar, every question and pillar has a BP, and no pillar holds more than 80 % of all BPs. Current counts: Framework 6 pillars / 57 questions / 307 BPs (OPS 68, SEC 63, REL 65, PERF 32, COST 50, SUS 29); Generative AI Lens 6 / 29 / 51.

## Evidence rules

A rule turns diagram facts into BP outcomes. Two shapes exist.

**Legacy rule** — derived from a finding in `review.mjs`:

```js
{ legacy: "SEC-EDGE", fw: { "SEC05-BP03": {} },
  impact: "Moderate", likelihood: "Medium", effort: "Low", weeks: 2,
  rec: "Put AWS WAF in front of every internet-facing entry point…", measure: "100 % of public endpoints behind a web ACL" }
```

The legacy finding's status (`ok`, `gap`, `consider`) maps to BP statuses (`Implemented`, `Not Implemented`, `Cannot Determine`); `okAs` / `considerAs` or per-status overrides inside the BP object change that.

**Procedural rule** — free-form, reads the diagram context:

```js
{ id: "TRACING", pillar: "operational-excellence", evaluate(ctx) {
    if (!ctx.of("x-ray").length) return null;           // rule does not apply
    return { title: "Distributed tracing",
             fw: { "OPS04-BP05": { status: "Implemented", evidence: "Tracing/telemetry is drawn (xray)." } },
             nodes: ["xray"] };
} }
```

`ctx` provides `nodes`, `groups`, `edges`, `cost`, `isGenAI`, `spec`, `has(...ids)`, `of(...ids)` (nodes of those services) and `labelHas(regex)`. A rule may also return `impact`, `likelihood`, `effort`, `weeks`, `rec`, `measure` for gaps.

### The invariants

1. **Only canonical BP ids.** A test checks that every id used in a rule exists in the corpus; never type one from memory.
2. **Evidence or nothing.** A rule returns a BP outcome only if the diagram shows something. Absence of a drawn control is *To confirm*, not a gap, unless a drawn element shows the opposite (a public database).
3. **Everything else is `Cannot Determine`** with a hint (`needsFor(title)`: process, IaC/configuration, or runtime evidence). Do not mark BPs Implemented to improve scores.

## `reviewWorkload` steps

1. Run rules → `outcomes` (one per rule, keyed by BP).
2. **Merge per BP** with precedence *Not Implemented > Partially > Implemented* (Implemented plus Cannot Determine → Partially) *> Cannot Determine > Not Applicable*; BPs with no outcome become Cannot Determine.
3. **Findings**: gaps with risk metadata → `riskLevel(impact, likelihood)`; `criticality` adjusts impact (critical: +1 for Security and Reliability; low: −1 for Reliability); `consider`-derived gaps lower likelihood. Sorted by risk then pillar; ids `F-001…`.
4. **Quadrants**: importance high for Critical/High (or Medium Security/Reliability at high/critical criticality); `Do First` = important + low effort, `Plan` = important + larger effort, `Delegate` = less important + not high effort, `Defer` otherwise. SMART goal: target date (`now` + weeks), owner (`OWNER[pillar]`), measure.
5. **Questions and scores**: per question status/risk; per pillar `1 + 4 × (I + ½P) / (I + P + N)`, `null` below three determinable BPs; coverage percentage.
6. **Trade-offs** from the cost estimate: RDS Multi-AZ cost, Guardrails share of AI spend, CloudWatch volume, continuous evaluation.
7. **Report**: coverage audit (sources, counts, snapshot age, limits), executive summary data, strengths, next steps, banner and legend.

The risk matrix, statuses and calibration (no manufactured Criticals, acknowledge strengths) follow the skill; do not change them without reading the skill again.

## Adding a rule

1. Decide which BP the diagram can *really* evidence (read the BP in the AWS documentation).
2. Look up the canonical id: `archify-aws wa corpus --json` or search `data/wa/*.json`.
3. Add a legacy rule (if `review.mjs` already detects it) or a procedural rule.
4. Run `npm test` (the corpus-id test) and `archify-aws wa review examples/<x>.json`; check the new row in the ledger and the evidence text.
5. Add a test with a minimal spec that triggers the rule and one that does not.
6. Describe the new evidence in `docs/user-guide/well-architected.md` if users need to know how to trigger it (for example "name the node … Guardrails").

## Refreshing the corpus

See [Data refresh](data-refresh.md). After a refresh, run the tests: a renamed or removed BP id breaks the rule-id test, which is the point.
