# Data refresh

Three committed snapshots feed the tool. All have scripts; none is fetched at runtime (except explicit `--refresh`).

| Data | Command | Source | Notes |
|---|---|---|---|
| **Icons** | `npm run icons:fetch` | AWS Architecture Icons package | Not committed. Update the URL for a new release. |
| **Prices** | `npm run prices:fetch` | Public AWS Price List bulk files | `data/prices/<region>.json`, on-demand only, filtered per service |
| **Well-Architected corpus** | `npm run wa:corpus` or `archify-aws wa corpus --refresh` | Live documentation TOC index | `data/wa/*.json`; validation gate before saving |
| **draw.io shapes** | `npm run drawio:map` | `jgraph/drawio` `Sidebar-AWS4.js` | `data/drawio/aws4.json` |
| **Schemas** | `npm run schemas` | the code's own enums | no network; a test fails when stale |

## Prices

```bash
node scripts/fetch-prices.mjs                         # us-east-1, all configured services
node scripts/fetch-prices.mjs --services AWSLambda,AmazonS3
node scripts/fetch-prices.mjs --region eu-west-1      # new region
node scripts/fetch-prices.mjs --skip-large            # skip EC2 (459 MB)
```

Files are `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<code>/current/<region>/index.json`. Small files are parsed normally; EC2 goes through `scanLarge`, a streaming byte-level scanner. The `SERVICES` map in the script holds one **narrow predicate per service** (for example EC2: Linux, shared tenancy, NAT and gp3 only) to keep the snapshot near 2.7 MB. A new dimension means widening that predicate and re-running.

After a refresh:

1. `npm test` — cost tests read rates from the book, so they follow the new numbers.
2. Re-render the examples and compare the totals; large jumps deserve a look at the line items.
3. Commit the data file together with regenerated examples.

Remember the provenance shown in the Cost tab: each service's publication date and the retrieval date.

## Well-Architected corpus

```bash
archify-aws wa corpus --refresh                       # Framework
archify-aws wa corpus --lens generative-ai --refresh
```

A refresh fails (and saves nothing) if `validateCorpus` reports errors. If the AWS documentation changes shape, fix `parseToc` generally (no hard-coded pillars), not by patching data. Then run the tests: the rule-id test reports any evidence rule whose BP id disappeared.

## draw.io shapes

```bash
npm run drawio:map                                    # download Sidebar-AWS4.js
node scripts/build-drawio-map.mjs ./Sidebar-AWS4.js   # or use a local copy
```

Check the count printed (about 890 shapes, 329 `resourceIcon`) and run the draw.io tests.

## Release checklist

1. `npm run icons:fetch && npm test`
2. Refresh data if needed (above), re-render examples, look at the PNGs.
3. Update `package.json` version and `THIRD_PARTY_NOTICES.md` (icon release, new sources).
4. Merge to `main`; the docs workflow publishes the site.
