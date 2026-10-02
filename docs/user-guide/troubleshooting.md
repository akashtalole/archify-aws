# Troubleshooting

## Setup

| Symptom | Fix |
|---|---|
| `icons missing` / exit code 3 | Run `npm run icons:fetch`. `doctor` shows whether icons were found. |
| `png: Chrome/Chromium not found` | Install Chrome or Chromium, or set `CHROME_PATH`. HTML, SVG, draw.io and receipts do not need it. |
| `browser-check` shows *skipped* | Same cause. Use `--require-browser` in CI to turn a missing browser into a failure. |
| `Node` too old | Node ≥ 20 is required. |

## Spec errors

| Message | Fix |
|---|---|
| `unknown icon "bedrok" (did you mean bedrock?)` | Use the suggestion, or `icons search <term>`. |
| `edge #3: unknown "to" id "x"` | The id must match a node or group id exactly. |
| `"x" is a layout-only stack and cannot be an edge endpoint` | Point the edge at a node or a real group, not a `stack`. |
| `duplicate id "x"` | Ids are unique across nodes **and** groups. |
| `group #1: members must be adjacent participants` (sequence) | Reorder `participants` so grouped ones sit next to each other. |

## Layout warnings

`edge a → b: no clean route found (it crosses another node)` — the router will not draw a line through an icon or label. Reorder `children`, change a `layout`, widen `gap`, or put the ends of that edge in the same row or column. Re-run `render --strict` until clean. A busy diagram often reads better split into an architecture plus a sequence.

`label … lines` — a label wraps beyond two lines. Shorten it, or move detail to `sublabel`.

`step N is used by more than one edge` — informational; parallel flows may share a number.

## Cost tab

| Symptom | Meaning |
|---|---|
| A node is `needs-input` | Required usage is missing, for Bedrock the `model` (for example `"Claude Sonnet 5.5"`). |
| A node is `not-estimated` | No cost model yet. Add `usage.monthlyUsd` with a number you can source. |
| A node is `not-itemized` | AWS lists no separate price (some AgentCore components). |
| `no Bedrock model matches "…"` | Use the full model name as AWS lists it; the error lists close candidates. |
| `matches several Bedrock models` | Be more specific in `usage.model`. |
| `needs data/prices/<region>.json` | Build it with `node scripts/fetch-prices.mjs --region <region>` (network). |
| Everything is "indicative" | Some inputs are defaulted. Replace them in `usage`; the Assumptions table shows which. |

## Review tab

* *Almost everything is Cannot Determine* — expected. A diagram is weak evidence; see [Reading the result sensibly](well-architected.md#reading-the-result-sensibly).
* *A finding about guardrails but they exist* — draw a node named "… Guardrails", or set `meta.guardrails: true`.
* *No Generative AI Lens* — it turns on automatically when Bedrock, SageMaker AI or Amazon Q is drawn; force it with `meta.lens` or `--lens generative-ai`.

## draw.io

* *An icon is a plain picture instead of an AWS shape* — it has no draw.io equivalent; `export` reports how many.
* *Edges moved when I dragged an icon* — draw.io re-routes attached edges; that is expected.
* *draw.io says the file is damaged* — it should not happen (the export is validated); please open an issue with the spec.

## Still stuck

Run `archify-aws validate spec.json --json` and `archify-aws finalize spec.json --json`; the errors name the field. Open an issue at <https://github.com/akashtalole/archify-aws/issues> with the spec attached.
