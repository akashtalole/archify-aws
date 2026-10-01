#!/usr/bin/env node
// Re-renders every examples/*.json to examples/out/ (html + svg + png when Chrome is available).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const f of fs.readdirSync(path.join(root, "examples")).filter((n) => n.endsWith(".json"))) {
  const r = spawnSync(process.execPath, [path.join(root, "bin", "archify-aws.mjs"), "render", path.join("examples", f), "--png"], { cwd: root, stdio: "inherit" });
  if (r.status) process.exit(r.status);
}
