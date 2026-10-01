# Spec reference

A diagram is one JSON file. Nodes and groups live in a **tree** (nesting = AWS grouping);
connections live in a flat `edges` list. Layout and routing are automatic.

```jsonc
{
  "meta": {
    "title": "Required",
    "subtitle": "optional one-liner",
    "theme": "light | dark",            // default light (the deck's light-background style)
    "lens": ["framework", "generative-ai"], // generative-ai is also auto-enabled when Bedrock/SageMaker AI/Q is drawn
    "review": true,                      // false hides the Well-Architected panel
    "output": "out/diagram.html"         // default: <spec>.html
  },
  "root": { "layout": "row", "gap": 80, "children": [ /* nodes and groups */ ] },
  "edges": [ { "from": "a", "to": "b", "step": 1, "label": "HTTPS", "style": "solid", "arrow": "end" } ]
}
```

## Nodes
`{ "id": "api", "icon": "api-gateway", "label": "Amazon API Gateway", "sublabel": "REST" }`

* `id` — letters, digits, `-`, `_`; unique across nodes and groups.
* `icon` — a service id or alias (`lambda`, `s3`, `alb`), a resource icon `res:<id>` (e.g. `res:vpc:nat-gateway`),
  or a general icon `gen:<id>` / bare alias (`users`, `mobile`, `internet`). Find ids with
  `archify-aws icons search <term>`. Unknown icons fail validation with suggestions.
* `label` — official service name, ≤ 2 lines (the tool wraps at 18 chars and warns beyond two lines).
  Use the full name once, short forms (`Amazon EC2`) thereafter. `sublabel` is a muted third line (role, size, AZ…).

## Groups
`{ "id": "vpc", "kind": "vpc", "label": "VPC", "layout": "row", "children": [...] }`

| kind | AWS deck style |
|---|---|
| `aws-cloud` | dark-navy corner tile, solid border |
| `region` | teal, dotted |
| `az` | teal, dashed, no icon |
| `vpc` | purple, solid |
| `public-subnet` / `private-subnet` | green / teal, tinted fill |
| `security-group` | red |
| `asg` | orange, dashed |
| `account` | pink |
| `corporate-dc`, `server-contents` | grey |
| `ec2-contents`, `spot-fleet` | orange |
| `generic`, `generic-dashed` | grey (give a `label`) |
| `custom` + `"icon": "<service>"` | category-coloured group with the service icon (deck slide 26) |
| `stack` | **invisible** layout container; cannot be an edge endpoint |

`label` defaults to the kind's name (`""` hides it). `color` overrides the border colour (use sparingly — AWS
says group colours are accessibility-tested). Edges may end on a group (e.g. `region`) — the line meets its border.

## Layout
`layout` is `row` (default), `column` or `grid` (+ `columns`). `gap` is px between children (default 72; keep ≥ 56 so
labelled edges have room). `align` (`center` default | `start` | `end`).
Rows align children by **icon centre line**, so connected icons in one row get straight arrows; a column centres on
its middle child. Think "main flow left→right in one row; branches above/below in columns". `{"spacer": 60}` adds space.

Typical nesting: `aws-cloud › region › vpc › az › (public|private)-subnet › nodes`. Put a regional service that spans
AZs (ALB, API Gateway) beside the AZ column, not inside one AZ.

## Edges
`from`/`to` node or group ids · `step` 1-99 (black numbered callout, also listed under *Flow*; parallel flows may
share a number) · `label` protocol/action · `desc` longer text for the Flow list · `style` solid|dashed
(dashed = async/control/replication/observability) · `arrow` end|both|none.
Routing is orthogonal, avoids other nodes and group headers, and prefers straight lines; `render` warns when it can't.
