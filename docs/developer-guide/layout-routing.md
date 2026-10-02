# Layout and routing

## Layout (`src/layout.mjs`)

Two passes over the spec tree:

1. **`measure(item)`** computes each item's box bottom-up. A node is its icon (`K.ICON` = 64) plus wrapped label lines; a group adds `K.PAD` (24) and a header (`K.HEADER` = 40, containing the 32 px group icon and label). Children are laid out `row`, `column` or `grid` with `gap`, aligned by **icon centre line** (the item's `_anchor`) so connected icons in a row get straight arrows.
2. **`place(item, x, y, out, depth, parent)`** assigns absolute rectangles and fills `out.nodes[id]` (`cell`, `iconRect`, `lines`, `parent`) and `out.groups` (`rect`, `kind`, `depth`, `parent`).

`stack` groups take part in layout but are not drawn and cannot be edge endpoints. `label wrapping` (`wrapLabel`) breaks at word boundaries at 18 characters and records a warning past two lines.

Constants live in `K` (`ICON 64`, `GAP 72`, `PAD 24`, `HEADER 40`, `MARGIN 40`, `TITLE_H 76`).

## Routing (`src/route.mjs`)

For every edge the router enumerates **orthogonal elbow routes** between ports on the two endpoints (left, right, top, bottom, with a short stub) and **scores** each candidate; the lowest score wins. Edges are routed in order, so later edges see earlier ones.

| Term | Effect |
|---|---|
| Length and bends | Prefer short, straight routes |
| Hard obstacles (other nodes) | very large penalty (a route through an icon is rejected) |
| Soft obstacles (group headers) | moderate penalty |
| Crossings with earlier edges | per crossing |
| Overlap with earlier edges | per overlapping pixel beyond a tolerance |
| Port direction mismatch | very large penalty (the stub must leave in the port's direction) |
| Bottom ports | small penalty (labels sit under icons) |
| Foreign group crossings | penalty for crossing a group that contains neither endpoint |
| Leaving the canvas | penalty |
| Crossing the endpoints' own cells | very large penalty |

If the best route still collides with something the edge gets a warning (*no clean route found*); `finalize` treats that as a failure and `render --strict` exits 2.

**Why heuristic?** An exact minimum-crossing orthogonal router is overkill here: authors control the tree (and therefore the neighbourhood), and warnings tell them what to reorder. Keep new scoring terms cheap and explainable.

### Changing the router

* Add a test with a spec that reproduces the problem; assert on warnings and, if relevant, route points.
* Re-render **all** examples and look at the PNGs: a change that fixes one diagram often harms another. The committed `examples/**/out/*.receipt.json` hashes will change; that is expected, but review the pictures.

## Labels and callouts (`render.mjs`)

After routing, the renderer places **badges** first (they claim space: candidate points near the start, then end, of each route, avoiding other lines and badges) and then **edge labels** on the longest free segment. The positions are stored on the model (`badgePos`, `labelPos`) for other exporters.

## Sequence layout

`sequence.mjs` computes column width from the widest label, row heights from wrapped message labels, extra padding for rows that start a fragment, then draws groups, lifelines, fragments, messages and finally the participants on top. Its `layout` result (`ps`, `x`, `top`, `bottom`, `colW`, `rows`, `badges`) is what the draw.io exporter reads.
