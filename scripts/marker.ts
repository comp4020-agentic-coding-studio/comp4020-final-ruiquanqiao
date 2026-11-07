// What a marker does, on the deployed app: two people in two browser contexts
// that share no cookies or storage, one at each marking viewport, each
// following the README's instructions (Humans only, then Accept). Checks they
// land in the same race, see each other move, and are both on the leaderboard
// once it ends, however it ended.
//
//   node scripts/marker.ts [url]
//
// These two are people as far as the app can tell (no ?probe=1), so they stay
// on the leaderboard as "Marker A" and "Marker B". Chrome's profile and temp
// files go in .cache/; a frame of each window goes in .frames/.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, chromium } from "playwright-core";

const url = process.argv[2] ?? "https://comp4020-final-ruiquanqiao.fly.dev";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
process.env.TMP = process.env.TEMP = resolve(".cache");
mkdirSync(".frames", { recursive: true });

type State = { race?: number; you?: number; z?: number; x?: number; kmh?: number; screen?: string };
const state = (p: Page) => p.evaluate(() => (window as unknown as { __rash: { state(): State } }).__rash.state());
const screen = (p: Page) => p.evaluate(() => document.querySelector("#app")?.getAttribute("data-screen"));

let failures = 0;
function expect(ok: boolean, what: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${what}`);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
async function person(name: string, w: number, h: number): Promise<Page> {
  // a new context each: no shared cookies or storage, as two Chrome profiles
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage();
  await p.goto(url + "/");
  await p.waitForSelector("#queue-human");
  await p.fill("#name", name);
  await p.dispatchEvent("#name", "change");
  return p;
}

const a = await person("Marker A", 1920, 1080);
const b = await person("Marker B", 390, 844);

// Humans only must be the first queue button and the one that stands out
const look = await b.evaluate(() => {
  const [first] = document.querySelectorAll(".queue button");
  return { first: first.id, bg: getComputedStyle(document.querySelector("#queue-human")!).backgroundColor };
});
expect(look.first === "queue-human" && look.bg === "rgb(236, 200, 70)", `Humans only comes first, in gold (${look.first}, ${look.bg})`);

// A presses, then B some seconds later, as a person moving to the second window
await a.click("#queue-human");
await a.waitForTimeout(6000);
await b.tap("#queue-human");
for (const p of [a, b]) {
  await p.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 30000 });
  await p.click("#found-yes");
}
await Promise.all([a, b].map((p) => p.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 60000 })));
await a.waitForTimeout(5000); // the count
const [sa, sb] = [await state(a), await state(b)];
expect(sa.race !== undefined && sa.race === sb.race && sa.you !== sb.you, `pressed 6 s apart, both in race ${sa.race} as bikes ${sa.you} and ${sb.you}`);

// A rides; B, in its own browser, must see A's bike move within about a second
const seenBy = (p: Page, id: number) =>
  p.evaluate((id) => (window as unknown as { __rash: { riders(): { id: number; z: number }[] | undefined } }).__rash.riders()?.find((r) => r.id === id)?.z ?? null, id);
const before = await seenBy(b, sa.you!);
await a.keyboard.down("KeyW");
await a.waitForTimeout(1200);
const after = await seenBy(b, sa.you!);
expect(before !== null && after !== null && after - before > 5, `B's window saw A's bike move ${after !== null && before !== null ? (after - before).toFixed(1) : "?"} m within 1.2 s of A pressing W`);
await a.keyboard.up("KeyW");
await a.screenshot({ path: ".frames/marker-a.png" });
await b.screenshot({ path: ".frames/marker-b.png" });

// both leave; the race ends for them, and both are on the board
await a.keyboard.press("Escape");
await a.keyboard.press("Escape");
// B closes the tab mid-race, as a person might; the race ends with nobody left
await b.context().close();
const c = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await c.goto(url + "/leaderboard");
await c.waitForTimeout(8000);
await c.reload();
await c.waitForSelector("#leaderboard tbody tr", { timeout: 20000 });
const names = await c.evaluate(() => [...document.querySelectorAll("#leaderboard tbody tr")].map((r) => r.children[1]?.textContent));
expect(names.includes("Marker A") && names.includes("Marker B"), `both on /leaderboard after leaving mid-race (${names.filter((n) => n?.startsWith("Marker")).join(", ")})`);
expect((await screen(a)) !== "race", "A is off the road after Esc twice");

await browser.close();
console.log(failures === 0 ? "every check passed" : `${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
