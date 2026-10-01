# AWS diagram guidelines applied by archify-aws

Distilled from the *AWS Architecture Icons* deck (release 24-2026.07.31, light-background edition). The renderer
enforces what it can; the rest is for whoever authors the spec.

| Deck guidance | What archify-aws does |
|---|---|
| Use icons at their predefined size and colour; never crop, flip, rotate or recolour | Service icons embedded unmodified at 64px, group icons at 32px |
| Groups = icon + label; 1.25pt borders; nested groups keep a buffer | Corner icon tile + label; 1.25px borders; 24px padding |
| Group styles (AWS Cloud, Region, AZ, VPC, subnets, security group, Auto Scaling, account, corporate DC…) | `kind` presets in `src/groups.mjs` with the deck's colours/dashes |
| Custom group for a service: category-colour border + service icon | `kind: "custom"` |
| Labels: 12pt Arial, ≤ 2 lines, never break mid-word; AWS/Amazon prefix with service name | 12px Arial, auto-wrap at word boundaries, warning past 2 lines |
| Use a short form only after the full name appears once; don't reuse a short form for two services | Author's responsibility (documented in SKILL.md) |
| Arrows: straight lines and right angles; open arrowhead; 2pt lines | Orthogonal router, open chevron arrowhead, 2px lines |
| Numbered callouts: black circle, bold white number | `step` badges |
| Light BG for web, dark BG for presentations | `theme: light|dark` (and a toggle in the HTML page) |
| Training/certification diagrams: white background, 16pt black type | Use `light`; type size is fixed at 12px — scale the export |
| Portrait use (Word, blogs): 6.5in × 8.75in | Prefer `column` layouts at the root for portrait output |
| Region-specific logo rule (e.g. China): use the cloud-icon group instead of the AWS-logo group | Presets use the cloud-icon `AWS Cloud` group; `AWS-Cloud-logo` icons exist in the package if you need them |

Icon categories and their colours (from the package): Compute/Containers `#ED7100`, Storage `#7AA116`,
Databases `#C925D1`, Networking `#8C4FFF`, Security `#DD344C`, Analytics `#8C4FFF`, App Integration `#E7157B`,
AI/ML `#01A88D`, Management `#E7157B`. Run `archify-aws icons categories` for the full map.
