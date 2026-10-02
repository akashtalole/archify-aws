# Rendering and the viewer

## SVG (`src/render.mjs`)

`renderSvg(model, spec, theme)` returns a self-contained SVG:

* `<defs>` hold the arrow marker and one `<symbol>` per distinct icon (`symbol(id, file)` inlines the official SVG with its gradient ids prefixed so two icons never collide — `finalize` fails on duplicate ids).
* CSS variables (`THEMES.light|dark`) drive colours, so one SVG serves both themes. `baseCss()` is shared with the sequence renderer.
* Structure is semantic and stable, because the viewer and the exporters depend on it:

| Element | Attributes |
|---|---|
| `g.node` | `data-id`, `data-label`, `data-service`, `data-category`, plus a `<title>` |
| `g.group` | `data-id`, `data-label` |
| `g.edge` | `data-from`, `data-to`, `data-step`, `data-label`, `data-tip` (the step description) |
| `g.badge` | contains a `<title>` with "N. description" and an enlarged transparent `circle.hit` |

Never change these names without updating `viewer.mjs`, `finalize.mjs` and `drawio/export.mjs`.

### One description for a numbered step

`stepText(desc, fromLabel, toLabel, label)` (exported from `render.mjs`) is the **only** place that builds the text of a step: the Flow list in `page.mjs`, the badge `<title>`/`data-tip`, the viewer popup and the draw.io tooltip all call it. A test asserts the equality for architecture and sequence examples.

## The page (`src/page.mjs`, `src/report.mjs`)

`renderPage(diagram, wa, theme, cost)` returns the whole document. The tabs are plain `<div class="tab">` panes switched by `report.mjs`'s `REPORT_JS`; the active tab can be set by `?tab=`. `report.mjs` holds `costTab(cost, note)` and `waTab(report)` — pure string builders over the data structures from `estimateCost` and `reviewWorkload`, plus their CSS and JS (ledger filters, cost overlay, row → node jump, finding hover).

!!! tip "Escaping"
    Every dynamic string goes through `esc()`. If you add a field to a tab, escape it.

## The viewer (`src/viewer.mjs`)

`VIEWER_CSS` and `VIEWER_JS` are template-literal strings embedded in every page. The JS is one IIFE that:

1. indexes `.node`, `.edge`, `.group` into `info` (by id) and `E` (edges with `from`, `to`, `step`);
2. builds `out`/`inn` adjacency maps from `E` — **all reachability and routing use these authored edges only**;
3. implements `paint(nodeSet, edgeSet, cls)` / `clear()` for dimming and highlighting, `focusOn`, `reach`, `route` (BFS on directed edges), the Passport panel, the Finder, presentation mode and theme;
4. wires the numbered-callout popup (`#steptip`) to `.badge` hover events; it removes the native `<title>` while hovering to avoid a double tooltip and restores it afterwards;
5. exports (`exp` table): SVG (dual-theme), PNG/JPEG/WebP via canvas, clipboard, and `.drawio` from `#drawio-data`;
6. on `?check=1` writes `<pre id="archify-check">` with `{ ready, nodes, edges, overflowX, minFontPx, symbols, badUse, selftest }`.

Deep-link state lives in `location.hash` (`#focus=…&reach=…`, `#route=a~b`) and query (`?tab`, `?theme`, `?present`).

### Adding a viewer feature

* Prefer data attributes on the SVG over reaching into geometry.
* Keep the page free of external requests (`finalize` fails on `fetch(`, `XMLHttpRequest`, `@import`, remote `<img>`/`<link>`).
* Use `$`/`$$` helpers and avoid globals; everything is inside the IIFE.
* Add the feature to `references/viewer-runtime.md`, the user guide's viewer page, and the in-page Guide (`?`).
* Test in a browser: the existing tests drive headless Chrome via `src/browser.mjs`; for interaction, a short Playwright script is fine (see `test/` for examples of deep-link tests).

## Browser helpers (`src/browser.mjs`, `src/png.mjs`)

No Playwright dependency: Chrome is launched with `--headless --dump-dom` (and `--screenshot` for PNG). `dumpDom(file, { search })` returns the DOM after scripts ran plus console errors, which is how `finalize` runs the self-check. `CHROME_PATH`, then common install locations, then `PLAYWRIGHT_BROWSERS_PATH`, are searched.
