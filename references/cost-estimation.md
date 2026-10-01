# Cost estimation

`archify-aws cost spec.json [--region r] [--scale 1,3,10] [--usage usage.json] [--json]` prices each node from `data/prices/<region>.json`,
built from the public AWS Price List bulk files (`npm run prices:fetch`). Monthly = 730 hours; on-demand list prices only.

Statuses per node: `estimated`, `override` (`usage.monthlyUsd`), `no-charge`, `not-billable`, `not-itemized` (AWS lists no separate charge),
`needs-input`, `not-estimated` (no cost model yet), `error`. Give a node a `usage` object (for example Lambda `requestsPerMonth`,
`avgDurationMs`, `memoryMb`; Bedrock `inputTokensPerMonth`, `outputTokensPerMonth`, `model`) to replace defaults; every assumption is shown as
"from spec" or "assumed". Excludes free tier, taxes, support, Savings Plans/RIs/Spot, discounts and data transfer unless `egressGbPerMonth` is set.
Confirm any number in the AWS Pricing Calculator.
