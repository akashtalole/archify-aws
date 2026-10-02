# draw.io exporter

`src/drawio/` produces an uncompressed `.drawio` (mxfile) that uses **draw.io's own AWS shape library**. The reference for styles is the draw.io style reference (<https://www.drawio.com/docs/reference/diagram-generation/style-reference/>) and draw.io's own AWS palette entries.

| File | Role |
|---|---|
| `map.mjs` | Maps catalog entries to draw.io shapes; colours per category |
| `export.mjs` | `toDrawio(diagram)`; architecture/dataflow and sequence builders; the `Doc` cell writer |
| `validate.mjs` | `validateDrawio(xml)` structural checks |
| `data/drawio/aws4.json` | 892 shapes (329 `resourceIcon`) with title, palette and fill, extracted from `Sidebar-AWS4.js` |

## Shape table

`scripts/build-drawio-map.mjs` downloads (or reads) draw.io's `Sidebar-AWS4.js` and, per palette function, reads the style variable (`n`, `n2`…) to learn the **fill colour** and each `createVertexTemplateEntry` to learn the shape name and title:

* `n2 + 'resourceIcon;resIcon=' + gn + '.athena;'` → `{ kind: "resourceIcon", fill: "#8C4FFF", title: "Athena" }`
* `n + 'users;'` → `{ kind: "shape", fill: "#232F3D", pointer: true }`

It refuses to write if fewer than 500 shapes parse (a format change upstream). The table contains **names and colours only**; draw.io renders the shapes.

## Mapping (`map.mjs`)

`drawioShapeFor(icon)` returns `{ name, kind, fill, pointer }` or `null`.

* Services: override table (`SERVICE_OVERRIDES`, for names that differ: `opensearch-service → elasticsearch_service`, `cloudwatch → cloudwatch_2`, `data-firehose → kinesis_data_firehose`…), then normalised title/name matching (`norm` drops "Amazon/AWS", punctuation and parentheses).
* Resources and general icons: `SHAPE_OVERRIDES` (`database → generic_database` …), then title/name matching against `shape`-kind entries.
* `categoryColor(category)` is learnt from the matched services: the most common palette fill per catalog category (used for custom groups).
* `null` means the exporter embeds the official SVG as `shape=image;image=data:image/svg+xml,<base64>` (the `;base64` marker is omitted because `;` separates style keys).

## Document structure (`export.mjs`)

* **Parents.** Each group becomes a container cell (`id="g-<id>"`); nodes are children with **relative** coordinates. `stack` groups are layout-only and are skipped; a node's parent is its nearest drawn ancestor.
* **Group styles** are draw.io's: `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_region;…`. AZ, security group and generic groups are plain containers, as in draw.io's palette.
* **Icons** use the AWS palette style (`resourceIcon` + `resIcon` + `points=[…]` for connection constraints, `aspect=fixed`, label below). Labels are the pre-wrapped lines joined with `<br>`; sublabels are small grey `<font>` text.
* **Edges** parent to the lowest common ancestor of their endpoints; waypoints are converted to that parent's coordinates. `exitX/exitY/exitDx/exitDy` (and `entry*`) reproduce the router's port exactly: the fraction is clamped to [0,1] and the remainder goes into the dx/dy offset, with `exitPerimeter=0`. `labelOffset()` converts the label's anchor point into draw.io's relative position along the edge (−1…1).
* **Callouts** are `<object label="N" tooltip="N. description">` wrapping an ellipse cell.
* **Sequence** diagrams use floating edges (`sourcePoint`/`targetPoint`) for lifelines and messages, `umlFrame` for fragments, `note` for notes; an async message gets `startArrow=oval`.
* Output is deterministic: ids derive from spec ids (`n-`, `g-`, `e-`, `b-`…), and the diagram id from a hash of title and size.

## Validation

`validateDrawio(xml)` checks it is an `<mxfile>`; ids are unique; every `parent`, `source`, `target` resolves (`<object>` wrappers included); every `shape=`/`resIcon=`/`grIcon=` that names `mxgraph.aws4.*` exists in the table (group and container shapes are allowed); tags balance. `export`, `render --drawio` and `finalize` all refuse to write an invalid file.

## Testing against draw.io itself

The tests check structure and the shape table. To **see** the result, load the file in draw.io's viewer:

```html
<div class="mxgraph" data-mxgraph='{"xml": "…escaped file…", "nav": false}'></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
```

(Download `viewer-static.min.js` and `stencils/aws4.xml` and serve them locally when you need an offline check; set `window.STENCIL_PATH`.) Compare against the PNG; icons, containers and routing should look the same.

## Adding something

* **A new group kind**: add it to `GROUP_KINDS` (`groups.mjs`), a draw.io style in `GROUP_STYLE`, and use draw.io's palette entry for its `grIcon`/colours (see the Groups palette in `Sidebar-AWS4.js`).
* **A better mapping**: add to `SERVICE_OVERRIDES`; the test requires at most five unmapped services, all `elemental-*`.
* **Another format** (for example Mermaid or Excalidraw): read the same `diagram` object; see how `export.mjs` uses `model.nodes[*].iconRect`, `model.routes[*].pts`, `badgePos` and `labelPos`.
