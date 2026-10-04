// Optional PNG export through a locally installed Chromium/Chrome (no npm dependency).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => n.startsWith("chromium")).sort().reverse()) {
      for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]) {
        const f = path.join(pw, d, rel);
        if (fs.existsSync(f)) return f;
      }
    }
  }
  for (const n of ["google-chrome", "chromium", "chromium-browser", "chrome"]) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

export function svgToPng(svgFile, pngFile, width, height, scale = 2) {
  const chrome = findChrome();
  if (!chrome) throw new Error("PNG export needs Chrome/Chromium (set CHROME_PATH)");
  const html = path.join(os.tmpdir(), `archify-aws-${process.pid}.html`);
  fs.writeFileSync(html, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${fs.readFileSync(svgFile, "utf8")}`);
  const r = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--force-device-scale-factor=${scale}`,
    `--window-size=${Math.ceil(width)},${Math.ceil(height) + 120}`, `--screenshot=${path.resolve(pngFile)}`, "file://" + html], { encoding: "utf8" });
  fs.rmSync(html, { force: true });
  if (!fs.existsSync(pngFile)) throw new Error("PNG export failed: " + (r.stderr || "").slice(-300));
}
