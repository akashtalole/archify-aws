// JSON Schemas for editor support and agent authoring, generated from the code's own enums so they cannot drift.
import { GROUP_KINDS } from "./groups.mjs";
import { PILLARS } from "./groups.mjs";

const id = { type: "string", pattern: "^[A-Za-z][\\w-]*$" };
const icon = { type: "string", minLength: 1, description: "Service id or alias (e.g. lambda, s3, alb), res:<id> resource icon, or gen:<id> general icon. Find with `archify-aws icons search <term>`." };
const common = {
  groupKind: { enum: Object.keys(GROUP_KINDS) },
  edgeStyle: { enum: ["solid", "dashed"] },
  meta: {
    type: "object", required: ["title"], additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1 }, subtitle: { type: "string" }, theme: { enum: ["light", "dark"] },
      lens: { type: "array", items: { enum: ["framework", "generative-ai"] } },
      review: { type: "boolean" }, guardrails: { type: "boolean", description: "Declare that guardrails exist outside the drawing (silences GENAI-GUARDRAILS)." },
      boundary: { type: "boolean", description: "Dataflow only: false disables the AWS Cloud boundary." },
      output: { type: "string", description: "Output .html path, resolved from the working directory." },
      cost: { type: "object", additionalProperties: false, properties: { region: { type: "string", description: "AWS region for pricing (default us-east-1; needs data/prices/<region>.json)." }, note: { type: "string" } } },
      workload: { type: "object", additionalProperties: false, description: "Context for the Well-Architected review.", properties: { name: { type: "string" }, criticality: { enum: ["critical", "high", "standard", "low"] }, description: { type: "string" } } },
    },
  },
  node: { type: "object", required: ["id", "icon"], additionalProperties: false, properties: { id, icon, label: { type: "string" }, sublabel: { type: "string" }, usage: { type: "object", description: "Monthly usage assumptions for the cost estimate (service-specific keys, e.g. requestsPerMonth, model, inputTokensPerMonth) or monthlyUsd to supply a cost directly. See references/cost-estimation.md." } } },
  group: {
    type: "object", required: ["kind", "children"], additionalProperties: false,
    properties: { id, kind: { $ref: "#/$defs/groupKind" }, label: { type: "string" }, icon, color: { type: "string" }, layout: { enum: ["row", "column", "grid"] }, columns: { type: "integer", minimum: 1 }, gap: { type: "number", minimum: 0 }, align: { enum: ["center", "start", "end"] }, children: { type: "array", minItems: 1, items: { $ref: "#/$defs/child" } } },
  },
  spacer: { type: "object", required: ["spacer"], additionalProperties: false, properties: { spacer: { oneOf: [{ type: "number" }, { type: "object", properties: { w: { type: "number" }, h: { type: "number" } } }] } } },
  child: { oneOf: [{ $ref: "#/$defs/node" }, { $ref: "#/$defs/group" }, { $ref: "#/$defs/spacer" }] },
  edge: { type: "object", required: ["from", "to"], additionalProperties: false, properties: { from: id, to: id, step: { type: "integer", minimum: 1, maximum: 99 }, label: { type: "string" }, desc: { type: "string" }, style: { $ref: "#/$defs/edgeStyle" }, arrow: { enum: ["end", "both", "none"] } } },
};
const base = (name, desc) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `https://github.com/akashtalole/archify-aws/schemas/${name}.schema.json`, title: desc, $defs: common });

export function buildSchemas() {
  return {
    architecture: { ...base("architecture", "archify-aws architecture diagram"), type: "object", required: ["meta", "root"], additionalProperties: false,
      properties: { $schema: { type: "string" }, diagram_type: { const: "architecture" }, meta: { $ref: "#/$defs/meta" }, root: { type: "object", required: ["children"], additionalProperties: false, properties: { layout: { enum: ["row", "column", "grid"] }, columns: { type: "integer" }, gap: { type: "number" }, align: { enum: ["center", "start", "end"] }, children: { type: "array", minItems: 1, items: { $ref: "#/$defs/child" } } } }, edges: { type: "array", items: { $ref: "#/$defs/edge" } } } },
    sequence: { ...base("sequence", "archify-aws sequence diagram"), type: "object", required: ["diagram_type", "meta", "participants", "messages"], additionalProperties: false,
      properties: { $schema: { type: "string" }, diagram_type: { const: "sequence" }, meta: { $ref: "#/$defs/meta" },
        participants: { type: "array", minItems: 2, items: { type: "object", required: ["id", "icon"], additionalProperties: false, properties: { id, icon, label: { type: "string" }, sublabel: { type: "string" } } } },
        groups: { type: "array", items: { type: "object", required: ["kind", "members"], additionalProperties: false, properties: { kind: { $ref: "#/$defs/groupKind" }, label: { type: "string" }, color: { type: "string" }, members: { type: "array", minItems: 1, items: id } } } },
        messages: { type: "array", minItems: 1, items: { oneOf: [
          { type: "object", required: ["from", "to"], additionalProperties: false, properties: { from: id, to: id, label: { type: "string" }, kind: { enum: ["sync", "async", "return", "self"] }, desc: { type: "string" }, step: { const: false } } },
          { type: "object", required: ["note"], additionalProperties: false, properties: { note: { type: "string" }, over: { type: "array", items: id } } } ] } },
        fragments: { type: "array", items: { type: "object", required: ["kind", "from", "to"], additionalProperties: false, properties: { kind: { enum: ["loop", "alt", "opt", "par"] }, label: { type: "string" }, from: { type: "integer", minimum: 0 }, to: { type: "integer", minimum: 0 }, elseAt: { type: "integer", minimum: 0 }, elseLabel: { type: "string" } } } } } },
    dataflow: { ...base("dataflow", "archify-aws dataflow diagram"), type: "object", required: ["diagram_type", "meta", "stages"], additionalProperties: false,
      properties: { $schema: { type: "string" }, diagram_type: { const: "dataflow" }, meta: { $ref: "#/$defs/meta" },
        stages: { type: "array", minItems: 2, items: { type: "object", required: ["id", "label", "items"], additionalProperties: false, properties: { id, label: { type: "string" }, external: { type: "boolean", description: "Draw outside the AWS Cloud boundary (sources, consumers)." }, gap: { type: "number" }, items: { type: "array", minItems: 1, items: { $ref: "#/$defs/child" } } } } },
        edges: { type: "array", items: { $ref: "#/$defs/edge" } } } },
  };
}
export { PILLARS };

/** Keyword router: which diagram type fits the scenario, with a starting template and authoring hints. */
export function guideScenario(text) {
  const t = text.toLowerCase();
  const score = {
    sequence: (t.match(/\b(sequence|call flow|request lifecycle|handshake|who calls|api calls?|trace|step by step|interaction|round.?trip|retry|handoff)\b/g) || []).length * 2 + (/\b(then|returns?|responds?)\b/.test(t) ? 1 : 0),
    dataflow: (t.match(/\b(pipeline|etl|elt|ingest\w*|data flow|lineage|stream\w*|analytics|batch|data lake|warehouse|transform\w*)\b/g) || []).length * 2,
    architecture: (t.match(/\b(architecture|vpc|subnet|multi.?az|region|account|deployment|topology|network|infrastructure|platform|landing zone|components?)\b/g) || []).length * 2 + 1,
  };
  const type = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
  const template = { architecture: /\b(genai|bedrock|agent\w*|llm|rag)\b/.test(t) ? "genai-rag" : /\b(serverless|lambda)\b/.test(t) ? "serverless-api" : "three-tier", sequence: "sequence", dataflow: "dataflow" }[type];
  const hitl = /\b(human.?in.?the.?loop|hitl|approv\w*|reviewers?|review queue|sign.?off|escalat\w*|manual review)\b/.test(t);
  const deploy = /\b(deploy\w*|release|promot\w*|ci ?\/? ?cd|rollout|pipeline)\b/.test(t) && /\b(approv\w*|human|gate|promot\w*|governance)\b/.test(t);
  const diagrams = [{ type: "architecture", focus: "components, boundaries and the main request path" }];
  if (hitl || /\b(review|process|lifecycle|workflow|steps?)\b/.test(t)) diagrams.push({ type: "sequence", focus: "one end-to-end run, including each human decision point" });
  if (deploy) diagrams.push({ type: "dataflow", focus: "how changes (rules, prompts, models) move from authoring through evaluation and approval to production" });
  else if (/\b(documents?|ingest\w*|checks?|rules?|corpus)\b/.test(t) && type === "architecture") diagrams.push({ type: "dataflow", focus: "how inputs move through ingestion, processing, storage and serving" });
  const genai = /\b(genai|generative|bedrock|agentcore|agents?|llm|rag|sagemaker|foundation model)\b/.test(t);
  return {
    type, template, scores: score, diagrams,
    hints: [
      type === "architecture" ? "Nest aws-cloud › region › vpc › az › subnet; one left-to-right main flow; number only the primary request path." : type === "sequence" ? "Participants left→right in call order; use return/async kinds; wrap an AWS boundary around contiguous participants." : "One stage per column (Sources → Ingest → Store → Process → Serve); mark external stages; number the main data path.",
      ...(hitl ? ["Human-in-the-loop detected: draw the review queue / approval step as its own node (e.g. Step Functions task token, Amazon Augmented AI, a reviewer app) and show what happens on reject and on timeout."] : []),
      ...(diagrams.length > 1 ? [`Suggested diagrams: ${diagrams.map((d) => d.type).join(" + ")} — one diagram per question keeps each readable (6-20 nodes).`] : []),
      ...(genai ? ["Generative AI detected: draw guardrails, retrieval/grounding data, invocation logging and an API layer in front of the model (set meta.lens to include generative-ai)."] : []),
      "Run `archify-aws icons search <term>` for every service; never invent icon ids.",
      "Render with `archify-aws finalize <spec> --json`, then open the PNG and look at it.",
    ],
  };
}
