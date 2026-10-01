#!/usr/bin/env node
// Regenerates schemas/*.schema.json from src/schemas.mjs (run after changing group kinds or spec fields).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchemas } from "../src/schemas.mjs";
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "schemas");
fs.mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(buildSchemas())) fs.writeFileSync(path.join(dir, `${name}.schema.json`), JSON.stringify(schema, null, 2) + "\n");
console.log("schemas written to", dir);
