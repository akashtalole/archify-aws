# Icon catalog

The official icon package is **not committed**. `scripts/fetch-icons.mjs` downloads it, extracts only the SVGs we use (services at 64 px, resources at 48 px, category icons, group icons) into `assets/aws-icons/` (git-ignored; override with `ARCHIFY_AWS_ICONS`) and rebuilds `data/catalog.json` through `src/catalog-build.mjs`. A small zero-dependency ZIP reader (`src/zip.mjs`) does the extraction.

## Catalog (`data/catalog.json`)

```json
{ "generatedFrom": "AWS Architecture Icons release 24-2026.07.31",
  "categories": […], "services": [ { "key": "AWS-Lambda", "id": "lambda", "name": "AWS Lambda", "category": "Compute", "file": "service/Compute/Arch_AWS-Lambda_64.svg" } ],
  "resources": [ { "id": "vpc:nat-gateway", "service": "…", "name": "…", "category": "…", "file": "resource/…" } ],
  "groups": [ { "key": "Region", "dark": false, "file": "group/_/Region_32.svg" } ],
  "general": [ { "id": "users", "name": "Users", "file": "resource/General-Icons/…" } ] }
```

`data/aliases.json` maps friendly names (`s3`, `alb`, `ecs`, `sqs`) to service ids; separate maps exist for resources and general icons.

## Resolution (`src/catalog.mjs`)

* `resolveIcon(ref)` accepts a service id or alias, a full key, `res:<id>`, or `gen:<id>`; it returns `{ kind: "service" | "resource" | "general", entry }` or `null`.
* `searchIcons(query, limit)` ranks whole-word and word-prefix matches (so "ses" does not hit "databases"); aliases always qualify.
* `didYouMean(ref)` powers the suggestions in validation errors (Levenshtein).
* `iconFile(entry)` and `groupIconFile(key, dark)` return absolute paths.

## Adding or changing icons

1. Update the package URL in `scripts/fetch-icons.mjs` (and `THIRD_PARTY_NOTICES.md` release number).
2. `npm run icons:fetch`, then `npm test`.
3. Add aliases for new popular services in `data/aliases.json`.
4. Re-run `npm run drawio:map` if draw.io has new AWS shapes, and check `every catalog service maps to a draw.io AWS shape` in the tests.
5. Re-render examples; icons are embedded in every page.

!!! warning "Never alter icons"
    AWS forbids cropping, flipping, rotating or recolouring. The renderer embeds files unmodified; only gradient ids are prefixed to avoid collisions.
