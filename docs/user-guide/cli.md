# CLI reference

```text
archify-aws <command> [options]
```

Add `--json` to any command for machine-readable output. Exit codes: `0` ok · `1` invalid spec, usage or failed gate · `2` `--strict` with layout warnings · `3` icons missing.

## Build

| Command | Purpose |
|---|---|
| `finalize <spec> [-o out.html] [--theme t] [--no-png] [--no-cost] [--no-review] [--require-browser]` | Validate → analyze → render → checks → browser check → PNG → receipt. See [Quality gates](finalize.md). |
| `render <spec> [-o out.html] [--svg] [--png] [--drawio] [--theme light\|dark] [--no-review] [--no-cost] [--strict] [--usage usage.json] [--region r]` | Write the page (and optional extras). `--strict` makes layout warnings exit 2. |
| `validate <spec>` | Check a spec without rendering. |
| `export <spec> [--format drawio] [-o out.drawio]` | Write a draw.io file using draw.io's built-in AWS shapes. |
| `init [three-tier\|serverless-api\|genai-rag] [-o spec.json]` | Write a starter spec. |
| `guide "<scenario>"` | Suggest a diagram type, a template and companion diagrams. |
| `schema [architecture\|sequence\|dataflow]` | Path to (or, with `--json`, the contents of) a JSON Schema. |

## Analyze

| Command | Purpose |
|---|---|
| `cost <spec> [--region r] [--scale 1,3,10] [--usage usage.json]` | Monthly estimate from the AWS Price List. See [Cost estimate](cost.md). |
| `wa review <spec> [--mode full\|quick\|pillar\|score] [--pillars p,q] [--filter critical\|critical-high\|all] [--lens generative-ai] [--criticality c] [--no-cost]` | Well-Architected review. See [Well-Architected review](well-architected.md). |
| `wa corpus [--lens generative-ai] [--refresh]` | Show or refresh the Well-Architected questions and best practices. |
| `review <spec>` | The original heuristic findings (kept for compatibility); use `wa review` for the full assessment. |

## Icons

| Command | Purpose |
|---|---|
| `icons search <term> [--limit n]` | Find service, resource and general icon ids. |
| `icons info <id>` | Resolve an id or alias, with category and file. |
| `icons categories` | List icon categories. |
| `icons groups` | List group kinds. |
| `fetch-icons [icons.zip\|url]` | Download the official icon package into `assets/aws-icons/`. |

## Import

| Command | Purpose |
|---|---|
| `import mermaid <file.mmd\|-> [-o spec.json] [--title T] [--number] [--render]` | Mermaid flowchart or sequence → spec. |
| `import iac <dir\|file> [-o spec.json] [--include logs,iam] [--title T] [--render]` | Terraform, CloudFormation or SAM → spec. |

## Environment

| Command | Purpose |
|---|---|
| `doctor` | Node version, icons found, catalog size. |

| Variable | Effect |
|---|---|
| `ARCHIFY_AWS_ICONS` | Directory holding the extracted icon package (default `assets/aws-icons/`). |
| `CHROME_PATH` | Chrome/Chromium used for PNG export and the browser check (a Playwright browser under `PLAYWRIGHT_BROWSERS_PATH` is also found). |

## npm scripts

| Script | Purpose |
|---|---|
| `npm run icons:fetch` | Download the official icons. |
| `npm run examples` | Re-render every `examples/*.json`. |
| `npm run schemas` | Regenerate `schemas/*.schema.json` from the code. |
| `npm run prices:fetch` | Rebuild the price snapshot (network). |
| `npm run wa:corpus` | Refresh the Well-Architected corpus snapshots (network). |
| `npm run drawio:map` | Rebuild the draw.io AWS shape table (network). |
| `npm test` | Run the test suite. |
