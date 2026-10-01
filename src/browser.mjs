// Headless-Chrome helpers (no npm dependency): dump the DOM after scripts ran and collect console errors.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { findChrome } from "./png.mjs";

export function chromeAvailable() { return !!findChrome(); }

/** Loads file#hash in headless Chrome; returns {dom, errors[], consoleLines[]}. */
export function dumpDom(file, { hash = "", search = "", width = 1440, height = 900, budget = 4000 } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error("Chrome/Chromium not found (set CHROME_PATH)");
  const url = pathToFileURL(file).href + search + hash;
  const r = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${width},${height}`,
    `--virtual-time-budget=${budget}`, "--enable-logging=stderr", "--v=0", "--dump-dom", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lines = (r.stderr || "").split("\n").filter((l) => /CONSOLE/.test(l));
  const errors = lines.filter((l) => /(Uncaught|Error|error)/.test(l) && !/favicon/.test(l));
  return { dom: r.stdout || "", errors, consoleLines: lines, status: r.status };
}
