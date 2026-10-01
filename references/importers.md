# Importers

Both importers produce an ordinary spec you can edit, then render with `finalize`. They report what they could not
map instead of guessing silently.

## Mermaid → spec
```bash
archify-aws import mermaid flow.mmd -o spec.json --title "Orders" [--number] [--render]
cat flow.mmd | archify-aws import mermaid - -o spec.json
```
* `flowchart`/`graph`: node shapes, `A --> B --> C` chains, `A & B`, labelled (`-->|x|`, `-- x -->`) and dashed edges,
  nested `subgraph`s. Subgraph titles that name AWS boundaries (AWS Cloud, Region, VPC, AZ, public/private subnet,
  security group, Auto Scaling, account, on-prem/data center) become those group kinds; others become generic groups.
  Nodes are layered left→right (`LR`) or top→down (`TD`) from the edges.
* `sequenceDiagram`: participants/actors (`as` aliases), `->>` sync, `-->>` return, `-)` async, self messages,
  `Note over`, `loop/alt/opt/par … else/and … end`.
* **Icons** come from `src/iconguess.mjs`: exact service name/alias → AWS keyword table → strict catalog search →
  generic application icon. The command lists everything that was not an *exact* match; review those. Mermaid colours and
  `classDef` styling are ignored. `stateDiagram` is not supported.

## Terraform / CloudFormation / SAM → spec
```bash
archify-aws import iac ./infra -o spec.json [--include logs,iam] [--title "…"] [--render]
```
* Reads `*.tf`, CloudFormation/SAM YAML or JSON (also `.template`). Zero-dependency scanners: not full parsers, no
  module/`for_each`/`Fn::If` expansion, no CDK (synthesize with `cdk synth` and import the template instead).
* A resource that **references** another becomes an edge ("uses"). **Glue** resources (API integrations/routes,
  `aws_lambda_permission`, SNS subscriptions, event-source mappings, listeners, bucket notifications, queue policies)
  are resolved into one edge from the most upstream referenced resource to the others (`API → Lambda`,
  `SNS → SQS` "subscribes", `SQS → Lambda` "triggers"). SAM function `Events` (Api/HttpApi/SQS/SNS/S3/Schedule/…)
  become directed edges with path/method or schedule labels.
* Resources with VPC wiring (`vpc_config`, `subnet_id(s)`, `db_subnet_group_name`, `VpcConfig`…) are grouped in a VPC.
* IAM roles/policies, security groups, log groups and unknown types are skipped and counted; `--include logs,iam` shows some.
* Treat the result as a draft: references show dependency, not necessarily runtime traffic.
