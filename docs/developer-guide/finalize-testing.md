# Finalize, receipts and tests

## `finalize` (`src/finalize.mjs`)

`finalize(specPath, { outHtml, theme, png, requireBrowser, review, cost })` runs named **stages**; each is wrapped so a failure is recorded as `{ name, status: "fail", detail: { errors } }` and later stages are skipped. The result is the receipt object.

```text
validate → analyze → render → check → browser-check → export-png
```

* `validate` builds the diagram (`buildDiagram`), so spec errors surface here.
* `analyze` runs `analyze()`; render and the receipt use its results.
* `render` writes `.html`, `.svg`, `.drawio` and records sha-256 hashes in `outputs`.
* `check` re-reads the written files and enforces the artifact rules (see the user guide's [Quality gates](../user-guide/finalize.md)). Add new invariants here: they are cheap, and a failed gate stops bad output from shipping.
* `browser-check` calls `dumpDom(html, { search: "?check=1" })` and compares the viewer's self-check JSON with the model.
* `export-png` rasterises the SVG with Chrome.

The receipt contains **no timestamps or timings** and records `visualReview: "not-performed"`. Do not add either.

## Tests (`test/archify-aws.test.mjs`)

```bash
npm test          # node --test test/*.test.mjs
```

The suite uses Node's built-in runner. Groups of tests:

| Area | What is covered |
|---|---|
| Catalog and validation | resolve/search/did-you-mean, spec errors, schema sync with code enums |
| Layout and routing | label wrapping, ports approached along their normal, edges kept out of unrelated groups, sequence fragment and note spacing |
| Diagram types | architecture, sequence (fragments, badges), dataflow |
| Importers | Mermaid and IaC (fixtures under `examples/`) |
| `finalize` | stage order, determinism of receipts, failure stops at the first failing gate |
| Viewer | deep links drive reach and route over authored edges only |
| Review heuristics | the classic gaps and their remedies, Generative AI Lens rules, AgentCore icon rule |
| Well-Architected | corpus parser and validation, snapshots, rule ids exist in the corpus, risk matrix, ledger completeness and determinism, modes |
| Cost | tiered pricing, formulas read from the price book itself, defaults and assumptions, scaling, honest statuses, overrides, Bedrock and Multi-AZ what-ifs, provenance |
| draw.io | shape table vs the reference sample, catalog coverage, structure, validator, page download |
| Callouts | tooltip text equals the Flow list text |

Conventions:

* Tests that need icons or Chrome call `t.skip(...)` when they are missing, so a bare checkout still runs most of the suite.
* **Never hard-code prices.** Read the rate from the price book and assert the formula.
* Pass fixed dates (`asOf`, `now`) to get reproducible output.
* A fixture from outside the project goes under `test/fixtures/` (for example the draw.io reference sample).
* If you change rendering or routing, also **regenerate the examples and look at them**: tests cannot judge aesthetics.

## Regenerating committed output

Committed example output (`examples/**/out/`) is part of the repository and appears in the docs.

```bash
for f in examples/*.json examples/compliance*/*.json; do node bin/archify-aws.mjs finalize "$f"; done
for f in examples/iac/*.diagram.json examples/mermaid/*.json; do node bin/archify-aws.mjs render "$f" --png --drawio; done
```

Receipts embed hashes, so any renderer change shows up as a receipt diff. Review the PNGs in the same pull request.
