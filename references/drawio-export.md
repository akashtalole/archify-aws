# draw.io export

`archify-aws export spec.json [-o out.drawio]` writes an uncompressed mxfile. `finalize` writes it next to the HTML and validates it; `render --drawio` is the quick form. The HTML page embeds the same file (Export > Download draw.io).

How it maps:

| archify-aws | draw.io |
|---|---|
| Service icon | `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.<name>` with the palette fill colour, 64x64, label below |
| Resource / general icon | `shape=mxgraph.aws4.<name>` (pointerEvents=1) |
| AWS Cloud, Region, VPC, subnets, account, Auto Scaling group... | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_*` containers; AZ, security group and generic groups use draw.io's plain dashed/solid containers |
| Nested groups, nodes | Real parent/child cells with relative coordinates |
| Edges | `edgeStyle=orthogonalEdgeStyle`, attached to source/target, original waypoints, exit/entry points; open arrowheads; dashed style |
| Step numbers | Black ellipses at the callout position with the step description as the cell tooltip |
| Sequence diagrams | Participant icons, dashed lifelines, message edges, `umlFrame` fragments, notes |

The shape names and colours come from draw.io's own AWS library: `scripts/build-drawio-map.mjs` extracts them from jgraph/drawio's `Sidebar-AWS4.js` into `data/drawio/aws4.json` (committed), and `src/drawio/map.mjs` matches catalog entries to them by name plus a short override table. The export is validated (unique ids, resolvable references, every `mxgraph.aws4.*` name exists). Layout is the archify-aws layout; draw.io may re-route an edge slightly when you move things.
