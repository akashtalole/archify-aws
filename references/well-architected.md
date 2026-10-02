# Well-Architected guidance in archify-aws

Sources: [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
and the [Generative AI Lens](https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html)
(published 2025-11-19; scope: foundation models on Amazon Bedrock or customer-managed models on Amazon SageMaker AI,
plus Amazon Q; classic ML → Machine Learning Lens).

## What the review is — and isn't
`archify-aws review` / the page panel inspects **which services, boundaries and connections are drawn**. It cannot
see configuration (encryption flags, Multi-AZ toggles, IAM policies). Results are therefore:
`ok` (evidence of the practice is drawn), `consider` (not drawn — confirm or add), `gap` (strong signal of a gap).
Treat it as a prompt for a real Well-Architected review (AWS WA Tool), never as a score.

## Pillars and the rules mapped to them
| Pillar | Rule ids |
|---|---|
| Operational excellence | `OPS-OBSERVE`, `OPS-IAC`, `GENAI-OBSERVE` |
| Security | `SEC-EDGE`, `SEC-DB-PUBLIC`/`SEC-DB-PRIVATE`, `SEC-ENCRYPT`, `SEC-IDENTITY`, `SEC-DETECT`, `SEC-SECRETS`, `GENAI-GUARDRAILS`, `GENAI-ENDPOINT`, `GENAI-PRIVATE`, `GENAI-AGENCY` |
| Reliability | `REL-MULTIAZ`, `REL-SCALE`, `REL-BACKUP`, `REL-DECOUPLE`, `GENAI-RESILIENCE` |
| Performance efficiency | `PERF-EDGE`, `PERF-CACHE`, `GENAI-RETRIEVAL` |
| Cost optimization | `COST-ENDPOINT`, `COST-VISIBILITY`, `GENAI-COST` |
| Sustainability | `SUS-MANAGED`, `GENAI-SUS` |

## Generative AI Lens design principles (drive the `GENAI-*` rules)
1. **Design for controlled autonomy** — guardrails and boundaries on how AI systems operate, scale and interact (`GENAI-GUARDRAILS`, `GENAI-AGENCY`).
2. **Implement comprehensive observability** — security, performance, cost and environmental signals at every layer, incl. user feedback and model behaviour (`GENAI-OBSERVE`).
3. **Optimize resource efficiency** — right-size models and data operations from empirical requirements (`GENAI-COST`, `GENAI-SUS`).
4. **Establish distributed resilience** — redundancy, automated recovery, geographic distribution (`GENAI-RESILIENCE`).
5. **Standardize resource management** — central catalogs/controls for prompts, models, permissions; version control (`GENAI-RETRIEVAL` asks for versioned prompts/models/data sources).
6. **Secure interaction boundaries** — least privilege, secure comms, input/output sanitization (`GENAI-ENDPOINT`, `GENAI-PRIVATE`).

Lifecycle phases the lens covers: scoping, model selection, customization, development, deployment, continuous improvement.

## Making a diagram "review-friendly"
Draw what a reviewer would ask about: WAF/Shield at the edge, an identity service, KMS, Multi-AZ boundaries (two `az`
groups), Auto Scaling groups, backup, queues between tiers, CloudWatch/X-Ray/CloudTrail, and for GenAI a node labelled
*Guardrails*, the retrieval store, the logging destination, and an API layer between clients and the model. If a
practice is deliberately out of scope, say so in `meta.subtitle` rather than adding decorative icons.

## Review report (Well-Architected tab)
`archify-aws wa review spec.json [--mode full|quick|pillar|score] [--pillars security,reliability] [--filter critical|critical-high|all] [--lens generative-ai] [--criticality low|standard|high|critical]`
Every best practice in the frozen corpus (`data/wa/*.json`, 307 framework + 51 Generative AI Lens) gets one of five statuses. Only practices the
diagram can evidence are judged; the rest are `Cannot Determine` with a hint about the evidence needed. The HTML tab follows the review skill's
template: classification banner, coverage audit, executive summary, scorecards, per-question table, full best-practice ledger (filterable),
findings by risk, trade-offs (computed from the cost estimate), Eisenhower matrix, SMART remediation plan and next steps.
