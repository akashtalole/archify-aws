import { GROUP_KINDS } from "./groups.mjs";
import { resolveIcon, searchIcons } from "./catalog.mjs";

/** Walk the tree; yields {item, parent, kind:'node'|'group'|'spacer'}. */
export function* walk(container, parent = null) {
  for (const item of container.children || []) {
    const kind = item.spacer !== undefined ? "spacer" : item.children ? "group" : "node";
    yield { item, parent, kind };
    if (kind === "group") yield* walk(item, item);
  }
}

export function validateSpec(spec) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!spec || typeof spec !== "object") return { errors: ["spec must be a JSON object"], warnings };
  if (!spec.meta?.title) err("meta.title is required");
  if (!spec.root || !Array.isArray(spec.root.children) || !spec.root.children.length) err("root.children must be a non-empty array");
  if (errors.length) return { errors, warnings };
  const ids = new Set(), stacks = new Set();
  const addId = (id, what) => {
    if (!id) return;
    if (!/^[A-Za-z][\w-]*$/.test(id)) err(`${what} id "${id}" must match /^[A-Za-z][\\w-]*$/`);
    if (ids.has(id)) err(`duplicate id "${id}"`);
    ids.add(id);
  };
  for (const { item, kind } of walk(spec.root)) {
    if (kind === "spacer") continue;
    addId(item.id, kind);
    if (kind === "group" && item.kind === "stack" && item.id) stacks.add(item.id);
    if (kind === "node") {
      if (!item.id) err(`node "${item.label || "?"}" needs an id`);
      if (!item.icon) err(`node "${item.id}" needs an icon (service id, e.g. "lambda")`);
      else if (!resolveIcon(item.icon)) {
        const hint = searchIcons(item.icon, 4).map((h) => h.id).join(", ");
        err(`node "${item.id}": unknown icon "${item.icon}"${hint ? ` — did you mean: ${hint}?` : ""} (try \`archify-aws icons search <term>\`)`);
      }
      if (!item.label) warn(`node "${item.id}" has no label`);
      else {
        const longWord = item.label.split(/\s+/).some((w) => w.length > 20);
        if (longWord) warn(`node "${item.id}": a label word is longer than 20 chars and may not fit the cell`);
      }
    } else {
      if (!GROUP_KINDS[item.kind]) err(`group "${item.id || item.label}": unknown kind "${item.kind}" (one of ${Object.keys(GROUP_KINDS).join(", ")})`);
      if (item.kind === "custom" && !(item.icon && resolveIcon(item.icon))) err(`custom group "${item.id || item.label}" needs a valid service icon`);
      if (!["row", "column", "grid", undefined].includes(item.layout)) err(`group "${item.id}": layout must be row, column or grid`);
    }
  }
  if (!["row", "column", "grid", undefined].includes(spec.root.layout)) err("root.layout must be row, column or grid");
  const steps = new Set();
  (spec.edges || []).forEach((e, i) => {
    for (const end of ["from", "to"]) {
      if (!ids.has(e[end])) err(`edge #${i + 1}: unknown "${end}" id "${e[end]}"`);
      else if (stacks.has(e[end])) err(`edge #${i + 1}: "${e[end]}" is a layout-only stack and cannot be an edge endpoint`);
    }
    if (e.from === e.to) err(`edge #${i + 1}: from and to are the same`);
    if (e.step !== undefined) {
      if (!Number.isInteger(e.step) || e.step < 1 || e.step > 99) err(`edge #${i + 1}: step must be an integer 1-99`);
      if (steps.has(e.step)) warn(`step ${e.step} is used by more than one edge (fine for parallel flows)`);
      steps.add(e.step);
    }
    if (e.style && !["solid", "dashed"].includes(e.style)) err(`edge #${i + 1}: style must be solid or dashed`);
    if (e.arrow && !["end", "both", "none"].includes(e.arrow)) err(`edge #${i + 1}: arrow must be end, both or none`);
  });
  if (spec.meta.theme && !["light", "dark"].includes(spec.meta.theme)) err("meta.theme must be light or dark");
  return { errors, warnings };
}
