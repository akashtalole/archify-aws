# Contributing

## Workflow

1. Open an issue for anything non-trivial, or comment on an existing one.
2. Branch from `main`: `feature/<short-name>`.
3. Make the change **with tests** and, if behaviour is visible, an example or docs update.
4. `npm test` must pass; if you changed rendering, regenerate the examples and view the PNGs.
5. Open a pull request using the repository template (if present) and describe what changed and how you checked it.

## Commit and PR style

* Short imperative subject ("Add draw.io export using draw.io's AWS shapes"), body explains *why*.
* One logical change per commit; keep generated example output in the same PR as the change that caused it.
* Do not commit icons (`assets/aws-icons/`), `site/` or `docs/live/`.

## Code guidelines

* No new npm dependencies. If you think one is justified, explain why a ~100-line implementation is worse.
* Match the surrounding code: comment density, naming and idiom. Comments say why.
* Fail loudly with a message that names the field and, where possible, a fix.
* Anything that produces numbers or statuses must be deterministic and testable without network access.
* Escape every dynamic string that reaches HTML or XML.
* Keep functions reachable from tests: the CLI file only parses arguments and dispatches.

## Things that need extra care

| Area | Why |
|---|---|
| Cost pricers | A wrong price looks authoritative. Verify one number by hand; read rates from the price book; prefer *not estimated* to a guess. |
| Review rules | Only canonical BP ids; evidence or `Cannot Determine`; do not manufacture findings. |
| Router changes | They move every diagram. Re-render all examples. |
| Viewer | Must stay free of network calls and work from `file://`. |
| draw.io exporter | Keep styles identical to draw.io's palette entries; validate; look at it in draw.io. |
| Icons | Never alter. Licensing notes live in `THIRD_PARTY_NOTICES.md`. |

## Documentation

Docs live in `docs/` and are built with MkDocs Material (`mkdocs.yml`). Edit pages, then:

```bash
pip install -r requirements-docs.txt
node scripts/stage-docs.mjs      # example pages for the "live" links
mkdocs serve                     # live preview
mkdocs build --strict            # what CI runs: broken links fail the build
```

* User-facing behaviour belongs in the **User guide**; internals in the **Developer guide**.
* Keep `SKILL.md` and `references/` in step when agent-facing rules change.
* Screenshots in `docs/assets/` are regenerated from the examples; keep them small (PNG, 1440 px wide).

### Publishing

`.github/workflows/docs.yml` builds the site on every push to `main` that touches the docs (and on pull requests, without deploying) and publishes it to GitHub Pages. In the repository settings choose **Pages → Build and deployment → Source: GitHub Actions** once.

## Licence

MIT. AWS icons, the AWS Well-Architected content and draw.io shape names belong to their owners; see `THIRD_PARTY_NOTICES.md`.
