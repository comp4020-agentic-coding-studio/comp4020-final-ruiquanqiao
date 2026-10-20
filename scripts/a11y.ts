// axe-core in the installed Chrome, against each screen as a visitor sees it:
// the board, Live, the leaderboard, the README, then a race's loading screen,
// the race itself with its touch controls, and the result. spec/a11y.test.ts
// runs axe on the HTML the server sends, in jsdom, which cannot see colour;
// this is where contrast is checked, at both marking viewports.
//
//   node scripts/a11y.ts [url]
//
// Chrome's profile and temp files go in .cache/, inside this repo.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { type Page, chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
process.env.TMP = process.env.TEMP = resolve(".cache");

const context = await chromium.launchPersistentContext(resolve(".cache/chrome-a11y"), {
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});

let failures = 0;
async function check(page: Page, what: string): Promise<void> {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: Document) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document);
    return r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join("; ")})`);
  });
  failures += violations.length;
  console.log(violations.length ? `✗ ${what}\n  ${violations.join("\n  ")}` : `✓ ${what}`);
}

for (const [w, h] of [
  [1920, 1080],
  [390, 844],
]) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  for (const path of ["/live", "/leaderboard", "/readme/", "/?probe=1"]) {
    await page.goto(url + path);
    await page.waitForTimeout(600);
    await check(page, `${path} at ${w}x${h}`);
  }
  // the screens a race passes through, from the board
  await page.click("#queue-ai");
  await page.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 20000 });
  // the card pops in from transparent over 0.28 s; contrast is judged once it is there
  await page.waitForTimeout(400);
  await check(page, `match found at ${w}x${h}`);
  await page.click("#found-yes");
  await page.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "loading", null, { timeout: 10000 });
  await check(page, `loading at ${w}x${h}`);
  await page.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  await check(page, `race at ${w}x${h}`);
  await page.keyboard.press("Escape");
  await check(page, `leave race? at ${w}x${h}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await check(page, `after leaving at ${w}x${h}`);
  await page.close();
}
await context.close();
console.log(failures ? `${failures} violation(s)` : "no violations");
process.exitCode = failures ? 1 : 0;
