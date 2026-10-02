# Third-party notices

## Archify (MIT)
archify-aws is a companion to [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT, © tt-a1i) and follows its
conventions: typed JSON in, validated standalone HTML/SVG out, an agent skill (`SKILL.md`), `finalize`-style
receipts, dark/light themes. No Archify source is copied; the AWS-specific renderer, router and review engine here
are original. Archify itself, which covers general (non-AWS) diagrams, is based on Cocoon-AI/architecture-diagram-generator (MIT).

## AWS Architecture Icons
Not redistributed in this repository. `npm run icons:fetch` downloads the official package from AWS
(<https://aws.amazon.com/architecture/icons/>) into `assets/aws-icons/` (git-ignored). The icons are © Amazon Web
Services, Inc. or its affiliates and subject to AWS's icon terms: use them to depict AWS architecture, do not alter
them, and do not imply AWS endorsement. Rendered diagrams embed the icons they use — check the current AWS terms before publishing diagrams widely.

## AWS Well-Architected Framework and Generative AI Lens
Referenced and paraphrased with links to the AWS documentation; the review rules are heuristics written for this
project, not AWS content.

## AWS Agent Toolkit skills
The cost-estimation and Well-Architected review features follow the workflows described in the `billing-and-cost-management` and
`aws-well-architected-review` skills of <https://github.com/aws/agent-toolkit-for-aws> (core-skills), which is licensed by AWS under its own
terms. Their rules are paraphrased; no skill text or data is redistributed. Pricing data comes from the public AWS Price List and framework
structure from the public AWS Well-Architected documentation.

## draw.io AWS shape library
`data/drawio/aws4.json` lists shape names, titles and palette colours extracted from `Sidebar-AWS4.js` in <https://github.com/jgraph/drawio> (Apache-2.0, JGraph Ltd). It contains names and colours only; the shapes themselves are rendered by draw.io.
