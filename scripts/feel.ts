// Ride the real game in the installed Chrome, with real keys, and read back
// what the page saw of the network (ledger N14): its reports, the ping in the
// corner, and how far one's own bike was drawn from a smooth line. Point it
// at scripts/badnet.ts to ride a bad connection on purpose.
//
//   node scripts/feel.ts [--url http://localhost:8090] [--ride 30] [--delay fixed]
//
// --delay fixed draws the others a fixed tenth of a second back, as before
// the delay adapted, to ride the two side by side.
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
const delayMode = flag("delay", "adaptive");
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
await page.goto(url + (url.includes("?") ? "&" : "?") + "probe=1" + (delayMode === "fixed" ? "&delay=fixed" : ""));
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

// every bike, sampled every frame: how far each frame's move strays from the
// moves either side of it, which is what a jump looks like. One's own is
// predicted here; the others are drawn from snapshots, through the delay
await page.evaluate(() => {
  type P = { z: number; x: number };
  const w = window as unknown as {
    __rash: { self(): P; drawn(): (P & { id: number; phase: string; cop: boolean })[] | undefined; delay(): { delay: number; starved: boolean } | null };
    __trace: P[];
    __others: Map<number, (P | null)[]>;
    __delay: { delay: number; starved: boolean }[];
    __at: number[];
  };
  w.__trace = [];
  w.__at = [];
  w.__others = new Map();
  w.__delay = [];
  let f = 0;
  const grab = (): void => {
    const s = w.__rash.self();
    w.__at[f] = performance.now() / 1000;
    w.__trace.push({ z: s.z, x: s.x });
    for (const r of w.__rash.drawn() ?? []) {
      if (r.cop) continue;
      const tr = w.__others.get(r.id) ?? [];
      tr[f] = r.phase === "riding" ? { z: r.z, x: r.x } : null;
      w.__others.set(r.id, tr);
    }
    const d = w.__rash.delay();
    if (d) w.__delay.push(d);
    f++;
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
  type P = { z: number; x: number };
  const w = window as unknown as { __rash: { net(): unknown[] }; __trace: P[]; __others: Map<number, (P | null)[]>; __delay: { delay: number; starved: boolean }[]; __at: number[] };
  const at = w.__at;
  // a frame's speed against the mean of its neighbours', times the frame's
  // length: the metres it was drawn off a smooth path. By speed, not distance,
  // since a headless page's frames come at uneven intervals and a long frame
  // honestly moves a bike further
  const v = (tr: (P | null | undefined)[], k: number): number | null => {
    const [a, b] = [tr[k - 1], tr[k]];
    const dt = at[k] - at[k - 1];
    return a && b && dt > 0.002 ? (b.z - a.z) / dt : null;
  };
  const jumpsOf = (tr: (P | null | undefined)[]): number[] => {
    const js: number[] = [];
    for (let k = 2; k < tr.length - 1; k++) {
      const [p, here, n] = [v(tr, k - 1), v(tr, k), v(tr, k + 1)];
      if (p === null || here === null || n === null) continue; // off the bike
      js.push(Math.abs(here - (p + n) / 2) * (at[k] - at[k - 1]));
    }
    return js;
  };
  const sum = (js: number[]) => {
    const s = [...js].sort((p, q) => p - q);
    return { n: s.length, p99: s[Math.floor(s.length * 0.99)] ?? 0, max: s.at(-1) ?? 0, over1m: s.filter((j) => j > 1).length, over03: s.filter((j) => j > 0.3).length };
  };
  const others = sum([...w.__others.values()].flatMap(jumpsOf));
  const ds = w.__delay.map((x) => x.delay).sort((p, q) => p - q);
  return {
    reports: w.__rash.net(),
    self: sum(jumpsOf(w.__trace)),
    others,
    delay: { min: ds[0], median: ds[Math.floor(ds.length / 2)], max: ds.at(-1) },
    starved: w.__delay.filter((x) => x.starved).length / Math.max(1, w.__delay.length),
  };
});
console.log(JSON.stringify({ url, ride, delayMode, pings: [...new Set(pings)].slice(0, 12), ...out, errors }, null, 1));
await context.close();
