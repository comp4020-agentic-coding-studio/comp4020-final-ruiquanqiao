// Ride the real game in the installed Chrome, with real keys, and read back
// what the page saw of the network (ledger N14): its reports, the ping in the
// corner, and how far one's own bike was drawn from a smooth line. Point it
// at scripts/badnet.ts to ride a bad connection on purpose.
//
//   node scripts/feel.ts [--url http://localhost:8090] [--ride 30]
//
// Chrome's profile and temp files go in .cache/, inside this repo.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = flag("url", "http://localhost:8090");
const ride = Number(flag("ride", "30"));
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");

const profile = resolve(".cache/chrome-profile");
mkdirSync(profile, { recursive: true });
process.env.TMP = process.env.TEMP = resolve(".cache");

const context = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  // the real GPU, as a player has: on software rendering (SOFTWARE=1) the
  // scene builds so slowly that loading runs into its 20 s limit (N10), and
  // the frame times measured are the renderer's, not the network's
  args: process.env.SOFTWARE ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url + (url.includes("?") ? "&" : "?") + "probe=1");
await page.waitForTimeout(800);
// an NPC race with a few riders to pass and be hit by
await page.evaluate(() => {
  const s = document.querySelector<HTMLInputElement>("#ai-count");
  if (s) {
    s.value = "6";
    s.dispatchEvent(new Event("input"));
  }
});
await page.click("#queue-ai");
await page.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 20000 });
await page.click("#found-yes");
// polled on a timer: by default this waits on frames, and a page drawing slowly gets few
await page.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 30000, polling: 250 });
await page.waitForTimeout(3500); // the countdown

// one's own bike, sampled every frame: how far each frame's move strays from
// the moves either side of it, which is what a jump looks like
await page.evaluate(() => {
  const w = window as unknown as { __rash: { self(): { z: number; x: number } }; __trace: { z: number; x: number; t: number }[] };
  w.__trace = [];
  const grab = (): void => {
    const s = w.__rash.self();
    w.__trace.push({ z: s.z, x: s.x, t: performance.now() });
    requestAnimationFrame(grab);
  };
  requestAnimationFrame(grab);
});
await page.keyboard.down("KeyW");
const pings: string[] = [];
const end = Date.now() + ride * 1000;
let i = 0;
while (Date.now() < end) {
  // steer one way and the other, and swing now and then, as a person rides
  const k = i % 6 === 0 ? "KeyA" : i % 6 === 3 ? "KeyD" : null;
  if (k) await page.keyboard.down(k);
  if (i % 4 === 1) await page.keyboard.press("KeyJ");
  await page.waitForTimeout(500);
  if (k) await page.keyboard.up(k);
  pings.push((await page.textContent("#ping")) ?? "");
  i++;
}
const out = await page.evaluate(() => {
  const w = window as unknown as { __rash: { net(): unknown[] }; __trace: { z: number; x: number; t: number }[] };
  const tr = w.__trace;
  // a frame's move against the mean of its neighbours', in metres
  const jumps: number[] = [];
  for (let k = 1; k < tr.length - 1; k++) {
    const d = (a: { z: number; x: number }, b: { z: number; x: number }): number => Math.hypot(b.z - a.z, b.x - a.x);
    const here = d(tr[k - 1], tr[k]);
    const around = (d(tr[k - 2] ?? tr[k - 1], tr[k - 1]) + d(tr[k], tr[k + 1])) / 2;
    jumps.push(Math.abs(here - around));
  }
  jumps.sort((a, b) => a - b);
  return { reports: w.__rash.net(), frames: tr.length, jumpP99: jumps[Math.floor(jumps.length * 0.99)], jumpMax: jumps.at(-1), over1m: jumps.filter((j) => j > 1).length };
});
console.log(JSON.stringify({ url, ride, pings: [...new Set(pings)].slice(0, 12), ...out, errors }, null, 1));
await context.close();
