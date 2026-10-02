# Sequence and dataflow diagrams

Set `"diagram_type"` (omitted means *architecture*; a spec with `participants` is a sequence, with `stages` a dataflow). Schemas: `archify-aws schema sequence|dataflow`.

## Sequence

AWS icons are the participants; lifelines run down from them.

```json
{ "diagram_type": "sequence",
  "meta": { "title": "Upload and review" },
  "participants": [
    { "id": "user", "icon": "users", "label": "Document owner" },
    { "id": "api",  "icon": "api-gateway", "label": "Amazon API Gateway", "sublabel": "optional" },
    { "id": "fn",   "icon": "lambda", "label": "AWS Lambda" },
    { "id": "q",    "icon": "sqs", "label": "Amazon SQS" } ],
  "groups": [ { "kind": "aws-cloud", "label": "AWS Cloud", "members": ["api", "fn", "q"] } ],
  "messages": [
    { "from": "user", "to": "api", "label": "upload", "desc": "Shown in the Flow list" },
    { "from": "api",  "to": "fn",  "label": "invoke" },
    { "from": "fn",   "to": "q",   "kind": "async", "label": "enqueue" },
    { "from": "fn",   "to": "fn",  "kind": "self", "label": "validate" },
    { "from": "fn",   "to": "api", "kind": "return", "label": "202" },
    { "note": "Retries up to 3 times", "over": ["fn", "q"] }
  ],
  "fragments": [ { "kind": "loop", "label": "retry", "from": 1, "to": 3 } ] }
```

| Element | Notes |
|---|---|
| `participants` | `id`, `icon`, `label`, optional `sublabel`. |
| `groups` | Boundaries around participants; **members must be adjacent**. |
| `messages` | `kind`: `sync` (default), `return` (dashed), `async` (dot at the sender), `self`. A message with `note` instead of `from`/`to` draws a note over the listed participants. |
| numbering | Sync, async and self messages are numbered automatically; returns are not. `"step": false` suppresses a number. |
| `fragments` | `kind`: `loop`, `alt`, `opt`, `par`; `from`/`to` are **0-based message indexes**; `elseAt` and `elseLabel` add the else/and divider. |

The numbered callout sits on the sender's lifeline; hover it for the description (the message's `desc`, otherwise "From → To (label)").

## Dataflow

Stages become labelled columns, which suits ingestion pipelines and "where does the data go" views. Consecutive non-external stages share one AWS Cloud boundary.

```json
{ "diagram_type": "dataflow",
  "meta": { "title": "Clinical notes pipeline" },
  "stages": [
    { "id": "src",    "label": "Sources", "external": true, "items": [ { "id": "ehr", "icon": "gen:server", "label": "EHR" } ] },
    { "id": "ingest", "label": "Ingest",  "items": [ { "id": "s3", "icon": "s3", "label": "Amazon S3" } ] },
    { "id": "enrich", "label": "Enrich",  "items": [ { "id": "cmed", "icon": "comprehend-medical", "label": "Amazon Comprehend Medical" } ] }
  ],
  "edges": [ { "from": "ehr", "to": "s3", "step": 1, "label": "notes" }, { "from": "s3", "to": "cmed", "step": 2 } ] }
```

`items` hold the same nodes and groups as an architecture `root`. `external: true` marks stages outside AWS (they stay outside the boundary). `meta.boundary: false` removes the boundary altogether.

## Which type when?

| Question | Type |
|---|---|
| What are the parts and where do they live? | architecture |
| What happens, in order, for one request or run? | sequence |
| How does data move and change across stages? | dataflow |

A good architecture review pairs an architecture diagram with a sequence of its main flow. `archify-aws guide "<scenario>"` suggests companions.
