---
name: archify-aws
description: Create polished AWS architecture diagrams (standalone HTML + SVG/PNG) from a typed JSON spec using the official AWS Architecture Icons, AWS group/arrow/label conventions, and an advisory AWS Well-Architected (six pillars) and Generative AI Lens review. Use when the user asks to diagram, visualize, document or review an AWS architecture, VPC/network topology, serverless or container design, data pipeline, or a generative AI / RAG / agent workload on Amazon Bedrock or SageMaker AI.
license: MIT
metadata:
  version: "0.1"
  companion_to: tt-a1i/archify
---

# archify-aws

Turns a description of an AWS workload into a checked, explorable diagram. Same philosophy as Archify: write typed JSON,
let the tool lay out, route and validate, and report only what was actually verified.

## Setup (once)
```bash
npm run icons:fetch          # downloads the official AWS icon package into assets/aws-icons/ (not committed)
node bin/archify-aws.mjs doctor
```
No npm dependencies. PNG export additionally needs Chrome/Chromium (`CHROME_PATH`, or Playwright's browser).

## Workflow
1. **Understand the workload.** Identify entry point, main request path, data stores, async paths, identity, and
   observability. For generative AI also: model access, guardrails, retrieval/grounding data, logging, agent tools.
   If the user pastes an architecture description, a CloudFormation/CDK/Terraform repo, or a Mermaid flowchart,
   read it for topology and re-author as a spec (do not mechanically convert styling).
2. **Pick icons.** `node bin/archify-aws.mjs icons search "<term>" --json`. Use service ids/aliases (`lambda`, `s3`,
   `alb`); never invent ids. Use exact official names in `label` (full name first, short form after).
3. **Read** [references/spec.md](references/spec.md) once, and the closest example in `examples/`
   (`three-tier` VPC/AZ, `serverless-api`, `genai-rag`). Start from `node bin/archify-aws.mjs init <template>`.
4. **Author the spec** (see *Authoring rules*). Put it in `.archify-aws/<slug>-<timestamp>/spec.json`, with `meta.output` beside it.
5. **Render:** `node bin/archify-aws.mjs render <spec.json> --png --strict --json`.
   Exit 1 = invalid spec (fix every listed error); exit 2 = routing/layout warning — reorder `children`, change
   `layout`, widen `gap`, or move a node next to its main neighbour, then rerun. Max ~4 repair rounds; then report what remains.
6. **Look at the PNG** (open it) — the checks cannot see aesthetics. Fix collisions, tangled routes, unclear labels.
7. **Review.** Read `review` in the receipt (or `archify-aws review spec.json`). Do not paper over gaps by adding
   decorative icons: either the architecture really has the control (add it, with its connection) or say it's out of scope.
8. **Report:** absolute paths to `.html` (and `.svg`/`.png`), node/edge counts, warnings, the gaps/considerations, and
   explicitly: "review is advisory — inferred from the drawing, not from deployed configuration".

## Authoring rules (AWS deck + Well-Architected)
* Structure first: `aws-cloud › region › vpc › az › subnet`. Show ≥ 2 AZs when the design claims high availability.
  Regional/global services (S3, DynamoDB, CloudFront, Route 53, IAM, Cognito, KMS, CloudWatch) sit outside the VPC.
* One main flow, left → right, in a single `row` so icons share a centre line; branches above/below via `column`
  or `stack`. 6–15 nodes is the readable range; split bigger systems into several diagrams.
* Number only the primary request path (`step`); dashed edges for async, replication, control and telemetry.
* Label every non-obvious edge with protocol/action. Don't label edges that a label would not clarify.
* Use `custom` groups for service-scoped boundaries (e.g. a "Generative AI" group), `stack` only for alignment.
* Never alter icons; never invent services or icons; do not draw controls the user didn't ask for just to please the review.
* Generative AI: draw clients → authenticated API layer → orchestrator → (guardrails, retrieval, model) → logging.
  Name the guardrail node "… Guardrails" so the review recognises it; show the vector store / knowledge source and where
  invocation logs go. See [references/well-architected.md](references/well-architected.md).
* Diagram conventions from the AWS deck are summarised in [references/aws-diagram-guidelines.md](references/aws-diagram-guidelines.md).

## Commands
`render`, `validate`, `review`, `icons search|info|categories|groups`, `init`, `fetch-icons`, `doctor` — run
`node bin/archify-aws.mjs --help`. Always pass `--json` when parsing results.

## Don't
* Don't claim visual quality you didn't inspect, or that the review certifies compliance.
* Don't commit the downloaded icon package; don't install this skill into a live agent setup unless asked.
