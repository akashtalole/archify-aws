# Architecture diagrams

A diagram is one JSON file. **Nodes and groups live in a tree** (nesting is AWS grouping); **connections live in a flat `edges` list**. Layout and routing are automatic.

```json
{
  "meta": { "title": "Required", "subtitle": "optional one-liner" },
  "root": { "layout": "row", "gap": 80, "children": [ /* nodes and groups */ ] },
  "edges": [ { "from": "a", "to": "b", "step": 1, "label": "HTTPS" } ]
}
```

Editor completion: `archify-aws schema architecture` → `schemas/architecture.schema.json`.

## `meta`

| Field | Meaning |
|---|---|
| `title` (required), `subtitle` | Shown above the diagram and in the page header. |
| `theme` | `light` (default, the deck's light-background style) or `dark`. |
| `lens` | `["framework", "generative-ai"]`. The Generative AI Lens is switched on automatically when Bedrock, SageMaker AI or Amazon Q is drawn. |
| `review` | `false` removes the Well-Architected tab. |
| `guardrails` | `true` declares that guardrails exist outside the drawing (silences the "no guardrails drawn" finding). |
| `boundary` | Dataflow only: `false` removes the AWS Cloud boundary. |
| `output` | Output `.html` path (default: next to the spec). |
| `cost` | `{ "region": "us-east-1", "note": "Illustrative: 2M searches/month" }` — pricing region and a note shown as *Usage basis*. Use `--no-cost` to omit the Cost tab. See [Cost estimate](cost.md). |
| `workload` | `{ "name", "criticality": "critical|high|standard|low", "description" }` — context for the [review](well-architected.md). |

## Nodes

```json
{ "id": "api", "icon": "api-gateway", "label": "Amazon API Gateway", "sublabel": "REST", "usage": { "requestsPerMonth": 3000000 } }
```

* **`id`** — letters, digits, `-`, `_`; unique across nodes *and* groups.
* **`icon`** — a service id or alias (`lambda`, `s3`, `alb`), a resource icon `res:<id>` (for example `res:vpc:nat-gateway`), or a general icon `gen:<id>` / bare alias (`users`, `mobile`, `internet`). Find ids with:

    ```bash
    archify-aws icons search "load balancer"
    archify-aws icons info alb
    ```

    An unknown icon fails validation and suggests close matches ("did you mean …").
* **`label`** — the official service name, at most two lines (wrapped at 18 characters; a warning appears beyond two lines). Use the full name once and short forms (`Amazon EC2`) after that. **`sublabel`** is a muted third line (role, size, AZ).
* **`usage`** — monthly usage for the [cost estimate](cost.md). Optional.

## Groups

```json
{ "id": "vpc", "kind": "vpc", "label": "VPC", "layout": "row", "children": [ … ] }
```

| `kind` | Style (from the AWS deck) |
|---|---|
| `aws-cloud` | dark-navy corner tile, solid border |
| `region` | teal, dotted |
| `az` | teal, dashed, no icon |
| `vpc` | purple, solid |
| `public-subnet`, `private-subnet` | green / teal, tinted fill |
| `security-group` | red |
| `asg` | orange, dashed |
| `account` | pink |
| `corporate-dc`, `server-contents` | grey |
| `ec2-contents`, `spot-fleet` | orange |
| `generic`, `generic-dashed` | grey (give it a `label`) |
| `custom` + `"icon": "<service>"` | category-coloured group showing the service icon |
| `stack` | **invisible** layout container; cannot be an edge endpoint |

`label` defaults to the kind's name (`""` hides it). `color` overrides the border colour — use sparingly; AWS group colours are accessibility-tested. Edges may end on a group (for example a region): the line meets its border.

Typical nesting: `aws-cloud › region › vpc › az › (public|private)-subnet › nodes`. Put a regional service that spans AZs (ALB, API Gateway) beside the AZ column rather than inside one AZ.

## Layout

| Field | Values |
|---|---|
| `layout` | `row` (default), `column`, `grid` (+ `columns`) |
| `gap` | pixels between children (default 72; keep ≥ 56 so labelled edges have room) |
| `align` | `center` (default), `start`, `end` |
| `{ "spacer": 60 }` | extra space between children |

Rows align children by **icon centre line**, so connected icons in one row get straight arrows; a column centres on its middle child. Think "main flow left → right in one row; branches above and below in columns".

!!! tip "When the router complains"
    A warning such as *edge a → b: no clean route found (it crosses another node)* means the layout puts something in the way. Reorder `children`, change a `layout`, widen `gap`, or move a node next to its main neighbour, then re-run. Typical fixes:

    * put the two ends of a busy edge in the same row or column;
    * move a group-level service (like a monitoring node) to the end of a row;
    * give a long edge its own band with a `stack` row.

## Edges

```json
{ "from": "apigw", "to": "fn", "step": 3, "label": "invoke", "desc": "Longer text for the Flow list", "style": "dashed", "arrow": "end" }
```

| Field | Meaning |
|---|---|
| `from`, `to` | node or group ids |
| `step` | 1–99. Draws a black numbered callout and lists the edge under **Flow**. Parallel flows may share a number. Hover the number in the page to see its description. |
| `label` | protocol or action |
| `desc` | longer description used in the Flow list and the callout popup (otherwise "From → To (label)") |
| `style` | `solid`, or `dashed` for async / control / replication / observability |
| `arrow` | `end` (default), `both`, `none` |

Routing is orthogonal, avoids other nodes and group headers, and prefers straight lines. Dashed + labelled edges read best when they are few; if everything is dashed nothing is.

## A complete small example

```json
{
  "meta": { "title": "Serverless API", "cost": { "note": "Illustrative: 3M requests/month" } },
  "root": { "layout": "row", "gap": 80, "children": [
    { "id": "client", "icon": "mobile", "label": "Mobile app" },
    { "id": "cloud", "kind": "aws-cloud", "layout": "row", "gap": 80, "children": [
      { "id": "apigw", "icon": "api-gateway", "label": "Amazon API Gateway", "usage": { "type": "http", "requestsPerMonth": 3000000 } },
      { "id": "fn", "icon": "lambda", "label": "AWS Lambda", "usage": { "requestsPerMonth": 3000000, "avgDurationMs": 120, "memoryMb": 512 } },
      { "id": "ddb", "icon": "dynamodb", "label": "Amazon DynamoDB" }
    ] }
  ] },
  "edges": [
    { "from": "client", "to": "apigw", "step": 1, "label": "HTTPS" },
    { "from": "apigw", "to": "fn", "step": 2 },
    { "from": "fn", "to": "ddb", "step": 3, "label": "read/write" }
  ]
}
```

## Style guidance applied for you

Icons are embedded unmodified (64 px; group icons 32 px), labels are 12 px Arial, borders 1.25 px, arrows 2 px with open heads, numbered callouts black with white bold numbers. The mapping from the AWS deck is in the repository's `references/aws-diagram-guidelines.md`.

!!! info "Authoring rules worth keeping"
    * Show at least two AZs when the design claims high availability.
    * Do not draw controls just to please the review. Either the architecture has the control (add it with its connection) or say it is out of scope.
    * Name the guardrail node "… Guardrails" so the review recognises it; show the vector store or knowledge source and where prompts and responses are logged.
