# Compliance review assistant — AgentCore variant

| File | Question it answers |
|---|---|
| `architecture.json` → `out/architecture.html` | What are the components, and where do humans and policy sit? |
| `review-run.sequence.json` → `out/review-run.html` | What happens, in order, for one document (parallel checks, human decision, policy-gated final decision)? |

Regenerate: `node bin/archify-aws.mjs finalize examples/compliance-agentcore/architecture.json` (icons must be fetched first).

## How it differs from the Step Functions design (`../compliance/`)

| Concern | Step Functions + Lambda (`../compliance`) | AgentCore (this folder) |
|---|---|---|
| Control flow | Deterministic state machine; Distributed Map fans out the checks | A supervisor agent plans and delegates check families to specialist agents (A2A) |
| Best when | Checks are fixed, ordered and fully specified; you want the most predictable cost and audit path | Checks need tool use, retrieval-then-reasoning loops, or the set of checks / steps changes per document type |
| Tool access | Lambda code calls services directly | Every tool call goes through AgentCore Gateway (MCP) and is evaluated by AgentCore Policy outside agent code |
| Human-in-the-loop | Step Functions task token + Amazon Augmented AI | The run checkpoints and ends; the reviewer's decision resumes it. A temporal Policy rule forbids `record_final_decision` unless a reviewer approval exists for the run |
| Quality loop | CloudWatch metrics + golden-set evaluation in the pipeline | AgentCore Evaluations on traces; Observability (OTEL) to CloudWatch; Registry for the approved check library |
| Main risk | Rigid when checks need open-ended reasoning | Non-determinism: needs Guardrails, Policy, evaluations and a golden set before trusting verdicts |

A pragmatic hybrid: keep Step Functions as the outer, auditable workflow (intake, retries, SLA timers) and let AgentCore host the
agents that judge each check family.

## Design notes (verify against current AWS docs before building)
* **Session limits:** AgentCore Runtime microVM sessions run up to 8 hours (Instances up to 14 days). A reviewer may take longer, so the
  design checkpoints state (Memory / DynamoDB) and resumes with a new invocation instead of holding a session open.
* **Policy:** AgentCore Policy intercepts Gateway tool calls and supports Cedar (and natural-language authoring that is translated and
  validated), including session-aware *temporal* rules such as "an approval must exist before this action".
* **Memory:** reviewer feedback is stored for *evaluation*; it is deliberately not auto-applied to the check library — changes go through
  the approval gate in `../compliance/lifecycle.json`.
* AgentCore services reuse the single AgentCore icon (AWS ships no per-component icons); the label identifies each service.
