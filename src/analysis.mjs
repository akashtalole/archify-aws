// Cost estimate + Well-Architected review for a built diagram, shared by render and finalize.
import { estimateCost } from "./cost/estimate.mjs";
import { reviewWorkload } from "./wa/evaluate.mjs";

/** Either part can be turned off; the review reads the estimate when both are on. */
export function analyze(diagram, { cost = true, review = true, region, usage, mode, pillars, filter, lens, criticality, asOf } = {}) {
  const spec = diagram.spec.meta || {};
  const est = cost && spec.cost !== false ? estimateCost(diagram, { region: region || spec.cost?.region, usage, ...(asOf ? { asOf } : {}) }) : null;
  const wa = review && spec.review !== false ? reviewWorkload(diagram, { cost: est, mode, pillars, filter, lens, criticality, ...(asOf ? { now: asOf } : {}) }) : null;
  return { cost: est, wa };
}
