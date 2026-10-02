# User guide

How to author, read, check and export diagrams with archify-aws.

| If you want to… | Read |
|---|---|
| Install and render something | [Getting started](getting-started.md) |
| Describe an architecture (groups, nodes, edges, layout) | [Architecture diagrams](spec-architecture.md) |
| Show a flow over time or a data pipeline | [Sequence and dataflow](spec-sequence-dataflow.md) |
| Explore a generated page | [Viewer and numbered callouts](viewer.md) |
| Know what it costs | [Cost estimate](cost.md) |
| Review it against the Well-Architected Framework | [Well-Architected review](well-architected.md) |
| Get PNG, SVG or an editable draw.io file | [Exporting](exporting.md) |
| Start from Mermaid, Terraform, CloudFormation or SAM | [Importers](importers.md) |
| Prove the output is sound | [Quality gates](finalize.md) |
| Let an AI agent do all of this | [Using it from an AI agent](agent-skill.md) |
| Look up a command | [CLI reference](cli.md) |
| Fix a problem | [Troubleshooting](troubleshooting.md) |

## The workflow in one picture

```text
spec.json ──validate──▶ layout + routing ──▶ SVG ──┬──▶ HTML page  (Diagram · Cost · Well-Architected)
                                                   ├──▶ PNG
                                                   ├──▶ draw.io
                                                   └──▶ receipt.json
              cost estimate (AWS Price List) ──────┘
              review (WA Framework + GenAI Lens) ──┘
```

`finalize` runs the whole chain and refuses to succeed if any gate fails. See [Quality gates](finalize.md).
