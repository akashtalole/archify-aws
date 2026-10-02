# Using it from an AI agent

`SKILL.md` in the repository root is an agent skill (the same shape as Archify's). Point your agent at the repository and ask, for example:

> *Use archify-aws to diagram a multi-AZ web app on ECS Fargate with Aurora, estimate the monthly cost, and review it against the Well-Architected pillars.*

## What the agent should do

1. **Choose the diagram type** with `archify-aws guide "<scenario>"`.
2. **Find icons** with `archify-aws icons search <term>`; never invent ids.
3. **Write the spec** following the AWS authoring rules (structure first, two AZs for HA, full service name once).
4. **Add usage** to nodes if the user gave volumes; otherwise leave defaults and say the estimate is indicative.
5. **Run `finalize --json`** and repair until it passes (about four rounds at most), then report what remains.
6. **Look at the PNG.** The receipt says `visualReview: "not-performed"`.
7. **Report** the absolute paths of the outputs, node and edge counts, warnings, the monthly cost with its confidence and key assumptions, the findings by risk, how many best practices were actually evidenced, and the sentence *"cost is an indicative list-price estimate and the review is advisory — inferred from the drawing, not from deployed configuration"*.

## Rules the skill enforces on the agent

**Cost** (from the AWS billing-and-cost-management skill)

* Check today's date before quoting prices; the price book records its retrieval date.
* **Never do cost arithmetic by reasoning.** Run `archify-aws cost` and quote its numbers.
* Public on-demand rates only. Never invent a price; unpriced components stay *not-itemized* or *not-estimated*.
* Point to the AWS Pricing Calculator for a quote.

**Well-Architected** (from the AWS well-architected-review skill)

* The corpus is the frozen documentation index; use canonical best-practice ids only.
* Five statuses; say *Cannot Determine* rather than guess.
* Do not manufacture Critical findings; acknowledge strengths.
* The report is confidential: do not post it in broadly visible channels without approval.

## Machine-readable output

Pass `--json` whenever the agent parses a result. `schema <type>` returns the JSON Schema for the spec, and `validate --json` returns `{ ok, errors, warnings }`.

```bash
archify-aws validate spec.json --json
archify-aws finalize spec.json --json
archify-aws cost spec.json --json
archify-aws wa review spec.json --json
```
