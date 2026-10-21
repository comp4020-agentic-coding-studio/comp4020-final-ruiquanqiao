// The rough use the top band names, run against a deployed app in the
// installed Chrome: a race reached and ridden with the keyboard alone, and a
// race resized in the middle of riding, between the two marking viewports and
// a window that is neither. A slow connection is scripts/badnet.ts.
//
//   node scripts/rough.ts [url]
//
// Exits 1 if anything below fails. Chrome's profile and temp files go in
// .cache/, inside this repo; a frame of each resize goes in .frames/.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
process.env.TMP = process.env.TEMP = resolve(".cache");
mkdirSync(".frames", { recursive: true });

type State = { you?: number; kmh?: number; x?: number; phase?: string; screen?: string };
type Rash = { state(): State; riders(): { id: number; attack: string | null }[] | undefined };
const rash = (p: Page) => p.evaluate(() => (window as unknown as { __rash: Rash }).__rash.state());
const attack = (p: Page) =>
  p.evaluate(() => {
    const r = (window as unknown as { __rash: Rash }).__rash;
    return r.riders()?.find((x) => x.id === r.state().you)?.attack ?? null;
  });
const screen = (p: Page) => p.evaluate(() => document.querySelector("#app")?.getAttribute("data-screen"));
const focused = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return { id: "", ring: false };
    const cs = getComputedStyle(a);
    return { id: a.id || a.tagName.toLowerCase(), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 };
  });

let failures = 0;
function expect(ok: boolean, what: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${what}`);
}

const context = await chromium.launchPersistentContext(resolve(".cache/chrome-rough"), {
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const errors: string[] = [];
async function open(w: number, h: number): Promise<Page> {
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.setViewportSize({ width: w, height: h });
  // ?probe=1 keeps these riders off the leaderboard (N12)
  await p.goto(url + "/?probe=1");
  await p.waitForTimeout(1000);
  return p;
}
const raceOn = (p: Page) => p.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 60000 });

// ---- the keyboard alone, from the board to the end of a race ----
{
  const p = await open(1920, 1080);
  let tabs = 0;
  let ringless = 0;
  for (; tabs < 40; tabs++) {
    await p.keyboard.press("Tab");
    const f = await focused(p);
    if (!f.ring) ringless++;
    if (f.id === "queue-ai") break;
  }
  expect(tabs < 40, `Tab reaches "Race with NPCs" (${tabs + 1} presses), every stop with a visible focus ring (${ringless} without)`);
  await p.keyboard.press("Enter");
  await p.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 20000 });
  expect((await focused(p)).id === "found-yes", "the match found puts focus on Accept");
  await p.keyboard.press("Enter");
  await raceOn(p);
  await p.waitForTimeout(4500); // the count
  const a = await rash(p);
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(3000);
  const b = await rash(p);
  await p.keyboard.down("KeyA");
  await p.waitForTimeout(700);
  await p.keyboard.up("KeyA");
  const c = await rash(p);
  await p.keyboard.down("KeyD");
  await p.waitForTimeout(700);
  await p.keyboard.up("KeyD");
  const d = await rash(p);
  expect((b.kmh ?? 0) > (a.kmh ?? 0) + 50, `W rides: ${a.kmh?.toFixed(0)} to ${b.kmh?.toFixed(0)} km/h in 3 s`);
  expect((c.x ?? 0) < (b.x ?? 0) - 1 && (d.x ?? 0) > (c.x ?? 0) + 1, `A and D steer: x ${b.x?.toFixed(2)}, ${c.x?.toFixed(2)}, ${d.x?.toFixed(2)}`);
  await p.keyboard.press("KeyJ");
  await p.waitForTimeout(150);
  const punch = await attack(p);
  await p.waitForTimeout(600);
  await p.keyboard.press("KeyK");
  await p.waitForTimeout(150);
  const kick = await attack(p);
  expect(!!punch?.startsWith("punch") && !!kick?.startsWith("kick"), `J punches and K kicks (${punch}, ${kick})`);
  await p.keyboard.press("F10");
  await p.waitForTimeout(200);
  expect((await p.getAttribute("#dash-toggle", "aria-pressed")) === "true", "F10 puts the dashboard away");
  await p.keyboard.press("F10");
  await p.keyboard.press("F1");
  await p.waitForTimeout(300);
  expect((await p.locator("#chat li").count()) > 0, "F1 says a line in the race chat");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  expect(!(await p.locator("#quit-ask").isHidden()) && (await focused(p)).id === "quit-no", "Esc asks before leaving, with focus on Keep riding");
  await p.keyboard.press("Escape");
  await p.keyboard.up("KeyW");
  await p.waitForTimeout(1500);
  expect((await screen(p)) === "lobby", "Esc again leaves for the board");
  await p.close();
}

// ---- resized in the middle of riding, and back ----
type Geo = { stage: string; road: string; dash: string; touch: string; off: string[]; hscroll: boolean };
const geo = (p: Page): Promise<Geo> =>
  p.evaluate(() => {
    const s = document.querySelector("#stage")!.getBoundingClientRect();
    const road = document.querySelector<HTMLCanvasElement>("#road")!;
    const dash = document.querySelector<HTMLCanvasElement>("#dash")!;
    const dpr = Math.min(2, devicePixelRatio);
    const off = [...document.querySelectorAll<HTMLElement>("#race button, #people, #chat")]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        if (getComputedStyle(e).display === "none" || b.width === 0) return false;
        return b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1;
      })
      .map((e) => e.id || e.dataset.key || e.tagName);
    return {
      stage: `${Math.round(s.width)}x${Math.round(s.height)}`,
      road: `${road.width}x${road.height}`,
      dash: `${Math.round(dash.width / dpr)}x${Math.round(dash.height / dpr)}`,
      touch: getComputedStyle(document.querySelector("#touch")!).display,
      off,
      hscroll: document.documentElement.scrollWidth > innerWidth,
    };
  });
function fits(g: Geo, w: number, when: string): void {
  const phone = w <= 700;
  expect(
    g.road === g.stage && g.dash === g.stage && (g.touch !== "none") === phone && g.off.length === 0 && !g.hscroll,
    `${when}: road and dashboard redrawn at the stage's ${g.stage}, touch keys ${phone ? "shown" : "hidden"}, nothing off screen${g.off.length ? ` (off: ${g.off.join(", ")})` : ""}${g.hscroll ? ", but it scrolls sideways" : ""}`,
  );
}
for (const [from, to] of [
  [
    [1920, 1080],
    [390, 844],
  ],
  [
    [390, 844],
    [1920, 1080],
  ],
  [
    [1920, 1080],
    [900, 600],
  ],
] as [number, number][][]) {
  const p = await open(from[0], from[1]);
  await p.click("#queue-ai");
  await p.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 20000 });
  await p.click("#found-yes");
  await raceOn(p);
  await p.waitForTimeout(4500);
  await p.keyboard.down("KeyW");
  await p.waitForTimeout(2500);
  const name = `${from.join("x")} to ${to.join("x")}`;
  const s1 = await rash(p);
  await p.setViewportSize({ width: to[0], height: to[1] });
  await p.waitForTimeout(400);
  fits(await geo(p), to[0], `${name}, mid-race`);
  await p.waitForTimeout(1500);
  const s2 = await rash(p);
  await p.keyboard.down("KeyD");
  await p.waitForTimeout(600);
  await p.keyboard.up("KeyD");
  const s3 = await rash(p);
  expect(
    (s2.kmh ?? 0) > (s1.kmh ?? 0) && (s3.x ?? 0) > (s2.x ?? 0) + 1 && s3.phase === "riding",
    `${name}: still riding after the resize (${s1.kmh?.toFixed(0)} to ${s2.kmh?.toFixed(0)} km/h) and D still steers (x ${s2.x?.toFixed(2)} to ${s3.x?.toFixed(2)})`,
  );
  await p.screenshot({ path: `.frames/rough-${to[0]}x${to[1]}.png` });
  await p.setViewportSize({ width: from[0], height: from[1] });
  await p.waitForTimeout(400);
  fits(await geo(p), from[0], `${name}, and back`);
  await p.keyboard.up("KeyW");
  await p.keyboard.press("Escape");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  await p.close();
}

expect(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await context.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exitCode = failures ? 1 : 0;
