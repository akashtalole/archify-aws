# Viewer runtime

Every generated page embeds the same reader features (no external requests, no dependencies). They follow
[Archify's Viewer Runtime](https://github.com/tt-a1i/archify) in spirit and operate **only on the authored relationships**
(edges / messages) — never on geometry — so results are "authored reachability", not runtime causality or blast radius.

| Feature | How |
|---|---|
| **Numbered callouts** | Hover a number on the diagram: a popup shows the same description as the Flow list (the edge `desc`, or "From → To (label)"), the edge is highlighted and the matching Flow row lights up. Also a native `<title>` tooltip in the standalone SVG |
| Focus + **Passport** | Click a node: its upstream/downstream relationships (with step numbers and labels), service, category, id |
| **Reach** | Passport → Reach ↓ / ↑ / Both, or `#focus=<id>&reach=downstream\|upstream\|both` |
| **Route probe** | Passport → Route to…, or `#route=<from>~<to>` — shortest *directed* path; says "no directed route" otherwise |
| **Finder** | `/` or Ctrl/⌘+K — search label, service name or id |
| **Presentation** | `p` or `?present=1` — chrome hidden, diagram fills the viewport; Esc leaves |
| **Theme** | `t`, header button, or `?theme=dark` |
| **Guide** | `?` lists every action and shortcut |
| **Export** | Export ▾ → copy/download PNG, JPEG, WebP, or a dual-theme SVG (light + `prefers-color-scheme: dark`). Viewer state (focus, dimming, route, passport) is stripped from every export |
| Hover previews | Hover a node, a Flow step, or a review finding to preview its connections |

Deep links are plain URL fragments, e.g. `diagram.html#route=users~fm`, so they can be pasted into tickets and docs.

Not implemented (vs. Archify): motion/trace animation, Share Cards, semantic lens, WebM recording, locale packs.

## Machine check
`?check=1` makes the page emit a hidden `<pre id="archify-check">` (node/edge counts, horizontal overflow, smallest rendered
text, unresolved `<use>` references, viewer self-test). `finalize` reads it via headless Chrome; readers never see it.
