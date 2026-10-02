# Quality gates: `finalize` and receipts

`finalize` is the command to run when you are done. It chains every check and **exits non-zero if any gate fails**, so it is safe in scripts and CI.

```bash
archify-aws finalize spec.json -o out/diagram.html [--theme dark] [--no-png] [--no-cost] [--no-review] [--require-browser] [--json]
```

## Stages

| Stage | What it checks |
|---|---|
| `validate` | The spec is valid: known icons (with suggestions), unique ids, edges that resolve, group nesting. |
| `analyze` | Cost estimate and Well-Architected review compute without error. |
| `render` | Writes the HTML, SVG and draw.io file. |
| `check` | Strict artifact checks (below). |
| `browser-check` | Opens the page in headless Chrome at 1440 px and reads the viewer's self-check. Skipped (not failed) when Chrome is missing, unless `--require-browser`. |
| `export-png` | Renders the PNG through Chrome. |

The **`check`** stage fails on: layout warnings other than benign shared step numbers; duplicate SVG ids; `<use>` references to missing symbols; a missing SVG `<title>`; any external resource or network call in the page (output must be standalone); a node count that does not match the model; an invalid `.drawio` file; a missing Cost or Well-Architected tab; and a review ledger whose row count does not equal the number of best practices assessed.

The **browser check** fails on console errors, an unready viewer, wrong node or edge counts, horizontal overflow at 1440 px, text smaller than 9 px, unresolved icon references or a failed viewer self-test.

## The receipt

`finalize` writes `<output>.receipt.json`:

```json
{
  "ok": true, "tool": "archify-aws", "version": "0.1.0", "iconRelease": "AWS Architecture Icons release 24-2026.07.31",
  "input":   { "path": "examples/three-tier.json", "sha256": "…" },
  "stages":  [ { "name": "validate", "status": "pass" }, … ],
  "outputs": { "html": { "path": "…", "sha256": "…" }, "svg": {…}, "drawio": {…}, "png": {…} },
  "summary": { "type": "architecture", "nodes": 11, "groups": 6, "edges": 9 },
  "cost":    { "region": "us-east-1", "asOf": "2026-10-01", "monthlyUsd": 1074.61, "confidence": "indicative", "coverage": {…} },
  "review":  { "advisory": true, "mode": "full", "findings": { "Critical": 0, "High": 0, "Medium": 0, "Low": 1 }, "evidenced": 21, "bps": 307 },
  "visualReview": "not-performed"
}
```

It is **deterministic**: no timestamps or timings, only hashes, so the same spec and data give the same receipt (the cost `asOf` is a date, not a time). That makes receipts diffable in code review.

!!! warning "`visualReview: not-performed` is deliberate"
    `finalize` proves mechanics, not aesthetics. A person (or an agent that can look at images) must open the PNG or page and check it. Do not claim visual quality that nobody inspected.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | OK |
| 1 | Invalid spec or usage, or a failed gate |
| 2 | `render --strict` and layout warnings are present |
| 3 | Icons are missing (`npm run icons:fetch`) |

## In CI

```yaml
- run: npm run icons:fetch
- run: node bin/archify-aws.mjs finalize docs/architecture.json -o build/architecture.html --require-browser
- uses: actions/upload-artifact@v4
  with: { name: architecture, path: build/ }
```
