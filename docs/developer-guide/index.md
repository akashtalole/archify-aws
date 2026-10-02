# Developer guide

For people who want to change archify-aws: add a service, a cost model, a review rule, a group kind or an exporter.

## Design constraints

* **No npm dependencies.** Node ≥ 20 built-ins only (ZIP reading, price-file scanning, XML generation, even the headless-Chrome helpers are hand-written). Python is used only to build this documentation.
* **Deterministic.** Same input and data → byte-identical output. No timestamps in receipts, stable ordering everywhere.
* **Fail loudly.** Ambiguity (two price SKUs, an unknown icon, an unroutable edge) is an error or a flagged status, never a silent guess.
* **Data is committed, tools are not data-dependent at runtime.** Icons are fetched; the price book, Well-Architected corpus and draw.io shape table are committed snapshots with scripts to refresh them.

## Repository map

```text
bin/archify-aws.mjs        CLI entry (arg parsing and command dispatch only)
src/
  pipeline.mjs             buildDiagram(): one entry point for all diagram types
  spec.mjs, schemas.mjs    validation and generated JSON Schemas
  build.mjs, layout.mjs, route.mjs, groups.mjs   architecture layout and orthogonal routing
  render.mjs               SVG renderer (architecture/dataflow)   sequence.mjs  sequence renderer
  dataflow.mjs             compiles dataflow specs to the architecture model
  catalog.mjs              icon catalog, aliases, search, did-you-mean
  page.mjs, report.mjs, viewer.mjs   the HTML page, Cost/WA tab renderers, embedded viewer runtime
  finalize.mjs, browser.mjs, png.mjs  quality gates, headless Chrome, PNG
  analysis.mjs             cost + review for one diagram (shared by render and finalize)
  cost/                    price book, per-service pricers, estimate
  wa/                      corpus, evidence rules, evaluation engine
  drawio/                  draw.io exporter, shape mapping, validator
  mermaid.mjs, iac.mjs, iconguess.mjs, layers.mjs   importers
  review.mjs               original heuristic findings (input to wa/)
data/                      catalog.json, aliases.json, prices/, wa/, drawio/
schemas/                   generated JSON Schemas
scripts/                   fetch-icons, fetch-prices, build-wa-corpus, build-drawio-map, build-schemas, build-examples, stage-docs
test/                      node:test suite and fixtures
examples/                  specs and committed generated output
references/, SKILL.md      the agent skill and its reference notes
docs/, mkdocs.yml          this site
```

## Setup for development

```bash
git clone https://github.com/akashtalole/archify-aws && cd archify-aws
npm run icons:fetch
npm test
```

Documentation:

```bash
pip install -r requirements-docs.txt
node scripts/stage-docs.mjs     # copies example pages into docs/live/
mkdocs serve                    # http://127.0.0.1:8000
```

## Read next

1. [Architecture](architecture.md) — the pipeline end to end.
2. The part you want to change: [layout and routing](layout-routing.md), [rendering and viewer](rendering-viewer.md), [icons](icons.md), [cost](cost-engine.md), [review](wa-engine.md), [draw.io](drawio-exporter.md).
3. [Finalize, receipts and tests](finalize-testing.md) and [Contributing](contributing.md).
