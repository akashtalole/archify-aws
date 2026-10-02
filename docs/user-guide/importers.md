# Mermaid and infrastructure as code

Both importers produce an ordinary spec that you can edit and render with `finalize`. They **report what they could not map** instead of guessing silently.

## Mermaid → spec

```bash
archify-aws import mermaid flow.mmd -o spec.json --title "Orders" [--number] [--render]
cat flow.mmd | archify-aws import mermaid - -o spec.json
```

* **`flowchart` / `graph`**: node shapes, `A --> B --> C` chains, `A & B`, labelled (`-->|x|`, `-- x -->`) and dashed edges, nested `subgraph`s. Subgraph titles that name AWS boundaries (AWS Cloud, Region, VPC, AZ, public/private subnet, security group, Auto Scaling, account, on-prem/data center) become those group kinds; others become generic groups. Nodes are layered left → right (`LR`) or top → down (`TD`) from the edges.
* **`sequenceDiagram`**: participants and actors (`as` aliases), `->>` sync, `-->>` return, `-)` async, self messages, `Note over`, and `loop`/`alt`/`opt`/`par … else/and … end`.
* **Icons** are guessed conservatively: exact service name or alias → AWS keyword table → strict catalog search → a generic application icon. The command lists everything that was not an *exact* match; review those. Mermaid colours and `classDef` styling are ignored; `stateDiagram` is not supported.
* `--number` numbers the edges as steps; `--render` renders immediately.

## Terraform / CloudFormation / SAM → spec

```bash
archify-aws import iac ./infra -o spec.json [--include logs,iam] [--title "…"] [--render]
```

* Reads `*.tf`, CloudFormation/SAM YAML or JSON (also `.template`). The scanners are **zero-dependency and not full parsers**: no modules, `for_each` or `Fn::If` expansion, and no CDK — run `cdk synth` and import the template instead.
* A resource that **references** another becomes an edge ("uses"). **Glue** resources (API integrations and routes, `aws_lambda_permission`, SNS subscriptions, event-source mappings, listeners, bucket notifications, queue policies) are resolved into one edge from the most upstream resource to the others: `API → Lambda`, `SNS → SQS` "subscribes", `SQS → Lambda` "triggers". SAM function `Events` (Api, HttpApi, SQS, SNS, S3, Schedule…) become directed edges with path/method or schedule labels.
* Resources with VPC wiring (`vpc_config`, `subnet_id(s)`, `db_subnet_group_name`, `VpcConfig`…) are grouped inside a VPC.
* IAM roles and policies, security groups, log groups and unknown types are skipped and counted; `--include logs,iam` shows some of them.

!!! tip "Treat the result as a draft"
    A reference shows dependency, not necessarily runtime traffic. Add `step` numbers, labels and `usage` after importing, then run `finalize`.

Examples: `examples/mermaid/` and `examples/iac/` (a Terraform stack and a SAM template with their generated specs and pages).
