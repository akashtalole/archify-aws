# Cost engine

All cost arithmetic lives in `src/cost/`. It follows the AWS billing-and-cost-management skill: **never reason about money, run code; public on-demand rates only; 730 hours per month; never invent a price.**

| File | Role |
|---|---|
| `pricefile.mjs` | Ingests Price List bulk files into compact rate rows; `scanLarge` is a byte-level scanner for files too big for `JSON.parse` (EC2 is ~460 MB). |
| `pricebook.mjs` | `loadPriceBook(region)`; `dim()`, `tryDim()`, `tiered()`, `round4()`, `money()`, `HOURS_PER_MONTH`, `PricingError`. |
| `pricers.mjs` | One pricer per service; `SERVICE_PRICER` (catalog id → pricer), `NO_CHARGE`, Bedrock model matching, AgentCore component detection. |
| `estimate.mjs` | `estimateCost(diagram, options)`: runs pricers, totals, sensitivity, what-ifs, provenance. |

## Price book (`data/prices/<region>.json`)

```json
{ "region": "us-east-1", "retrievedAt": "…",
  "services": { "AWSLambda": { "publicationDate": "…", "rows": [ { "sku": "…", "u": "Request", "unit": "Requests", "usd": "0.0000002", "b": 0, "e": null, "fam": "…", "d": "…", "a": { /* attributes */ } } ] } } }
```

`u` is the usage type with the region prefix stripped; `b`/`e` are tier begin/end. `dim(code, predicate, what)` returns the tier rows for **one** dimension and throws if the predicate matches SKUs with *different* rates (several SKUs with identical rates — a "legacy" and a "current" listing — are fine). A silently wrong SKU is worse than "not estimated".

## A pricer

```js
lambda: {
  label: "AWS Lambda",
  run({ pb, u, vol }) {
    const req = vol("requestsPerMonth", 1e6), ms = u("avgDurationMs", 200), mem = u("memoryMb", 512);
    const rate = pb.dim("AWSLambda", (x) => x.u === "Request", "Lambda requests");
    return { lines: [ line("Requests", rate, req) ] };
  },
}
```

* `u(key, default)` reads `node.usage[key]`, records it as **spec** or **default**, and returns it.
* `vol(key, default)` is the same for volumes that **scale with traffic** (sensitivity multiplies these; fixed capacity such as instance counts uses `u`).
* `line(label, rows, qty, opts)` prices through tiers and records `qty`, `unit`, `rate`, `sku`, `usagetype`.
* Return `{ lines, notes?, notItemized? }`; throw `PricingError` for anything that cannot be priced without guessing. `estimate.mjs` turns that into `status: "error"` or `needs-input`.
* Optional `whatIf({ pb, usage, base })` returns an alternative with a delta (see Lambda arm64, RDS Multi-AZ, Bedrock batch, S3-IA).

### Adding a service

1. Fetch its rates: add the service code and a **narrow filter** to `SERVICES` in `scripts/fetch-prices.mjs` (keep the snapshot small), then `node scripts/fetch-prices.mjs --services <Code>`.
2. Write the pricer in `pricers.mjs` and map the catalog id in `SERVICE_PRICER`; add a `CATEGORY` entry in `estimate.mjs`.
3. Add its usage keys to the user guide table (`docs/user-guide/cost.md`) and to the `usage` description in `schemas.mjs` if keys are validated.
4. Add a test that reads the rate **from the price book itself** (never hard-codes a price) and checks the formula — see the Lambda test.
5. Verify one number by hand against the AWS pricing page.

### Bedrock model matching

`findBedrockModel(pb, text)` normalises names (case, punctuation, "(Amazon Bedrock Edition)", `embeddings` → `embedding`) and requires every query token to be present. An exact match wins; several partial matches are an error that lists candidates. Titan rows have no `model` attribute, so `bedrockModelName(row)` derives one from the usage type (`TitanEmbeddingV2-Text-input-tokens` → `Titan Embedding V2 Text`). Embedding models have no output rate, so the output line is omitted.

## `estimateCost` result

```text
{ schema_version, asOf, region, currency, scale, basis,
  totals: { monthlyUsd, annualUsd, byCategory },
  coverage: { nodes, estimated, override, noCharge, notBillable, notItemized, needsInput, notEstimated, error },
  confidence: "indicative" | "stated", defaultedAssumptions: [ { node, key, value } ],
  nodes: [ { id, label, service, status, pricer, category, monthlyUsd, lines, assumptions, notes } ],
  sensitivity: [ { scale, monthlyUsd } ], whatIfs: [ … ], priceBook: { region, retrievedAt, publications } }
```

Totals include only `estimated` and `override` nodes. Pass `asOf: new Date(…)` in tests for reproducibility.

## Gotchas learnt the hard way

* Service codes differ from marketing names (`AmazonES` = OpenSearch, `AmazonStates` = Step Functions, `AWSQueueService` = SQS).
* Guardrails usage types need the `…UnitsConsumed` suffix; PII uses `PaidUnitsConsumed`.
* A `Set.add(...codes)` only adds the first argument — loop.
* The "scaled by traffic" flag must be set on the assumption entry even when the key already exists.
