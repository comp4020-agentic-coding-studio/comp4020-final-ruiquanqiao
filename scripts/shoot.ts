// Screenshots of the real game in the installed Chrome, at the two marking
// viewports, taken while riding with real key presses. The preview pane
// renders at its own size and throttles when hidden; this does neither.
//
//   node scripts/shoot.ts [--url http://localhost:5189] [--ride 8] [--steer D:1.2] [--name race] [--road 0-4]
//
// Writes .frames/<name>-1920x1080.png and .frames/<name>-390x844.png. Chrome's
// profile and temp files go in .cache/, inside this repo, not the user's
// profile or the system temp folder.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = flag("url", "http://localhost:5189");
const ride = Number(flag("ride", "8"));
const steer = flag("steer", "");
const name = flag("name", "race");
const only = flag("only", "");
const road = flag("road", "0");
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");

const profile = resolve(".cache/chrome-profile");
mkdirSync(profile, { recursive: true });
mkdirSync(".frames", { recursive: true });
process.env.TMP = process.env.TEMP = resolve(".cache");

const sizes: [number, number][] = [
  [1920, 1080],
  [390, 844],
].filter(([w]) => !only || String(w) === only) as [number, number][];

const context = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

for (const [w, h] of sizes) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.waitForTimeout(800);
  await page.check(`input[name="road"][value="${road}"]`);
  await page.click("#queue-ai");
  await page.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 15000 });
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(ride * 1000);
  if (steer) {
    const [key, secs] = steer.split(":");
    await page.keyboard.down(`Key${key}`);
    await page.waitForTimeout(Number(secs) * 1000);
  }
  const state = await page.evaluate(() => (window as unknown as { __rash: { state(): unknown } }).__rash.state());
  await page.screenshot({ path: `.frames/${name}-${w}x${h}.png` });
  console.log(`.frames/${name}-${w}x${h}.png`, JSON.stringify(state), errors.length ? `errors: ${errors.join(" | ")}` : "");
  await page.close();
}
await context.close();
