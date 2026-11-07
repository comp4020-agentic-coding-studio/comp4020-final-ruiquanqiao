// The postcards on the sign-up board (ledger V18), photographed in the game
// itself: each road ridden in the installed Chrome with real keys, and the
// road canvas (no dashboard, no HUD) cut to 3:2 at a point picked for each
// road. They were drawn as flat SVG shapes from the road's country, which
// told a player nothing of what the road looks like.
//
//   node scripts/postcards.ts [url]
//
// Writes client/public/assets/postcards/road<N>.jpg. Chrome's profile and
// temp files go in .cache/, inside this repo.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { ROADS } from "../game/track.ts";

const url = process.argv[2] ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
process.env.TMP = process.env.TEMP = resolve(".cache");
const out = "client/public/assets/postcards";
mkdirSync(out, { recursive: true });

/** seconds to ride before the picture, per road: chosen where each is most itself */
const RIDE = [9, 7, 8, 10, 9];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
for (const [i, road] of ROADS.entries()) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(url + "/?probe=1");
  await page.waitForTimeout(800);
  await page.check(`input[name="road"][value="${i}"]`);
  // a few riders ahead, not a pack round you to knock you off before the picture
  await page.evaluate(() => localStorage.setItem("aiRiders", "5"));
  await page.reload();
  await page.waitForTimeout(800);
  await page.check(`input[name="road"][value="${i}"]`);
  await page.click("#queue-ai");
  await page.waitForSelector("#found-yes:not([disabled])", { state: "visible", timeout: 15000 });
  await page.click("#found-yes");
  await page.waitForFunction(() => document.querySelector("#app")?.getAttribute("data-screen") === "race", null, { timeout: 60000 });
  await page.keyboard.down("KeyW");
  // held in the right-hand lane, as a person would ride it for a
  // photograph: x is metres across the road, and the right key raises it
  await page.evaluate(() => {
    const rash = (window as unknown as { __rash: { state(): { x?: number }; press(k: string, d: boolean): void } }).__rash;
    setInterval(() => {
      const x = rash.state().x ?? 0;
      rash.press("right", x < 1.4);
      rash.press("left", x > 2.6);
    }, 40);
  });
  await page.waitForTimeout((3 + RIDE[i]) * 1000);
  // on the bike and up to speed, never lying in the road
  await page.waitForFunction(() => {
    const st = (window as unknown as { __rash: { state(): { phase?: string; kmh?: number } } }).__rash.state();
    return st.phase === "riding" && (st.kmh ?? 0) > 120;
  }, null, { timeout: 30000 });
  const data = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#road")!;
    // the drawing buffer is not always the shape the canvas is shown at:
    // cut in the shape it is shown, 3:2, from the top, above the dashboard
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    const h = Math.min(r.height * 0.74, (r.width * 2) / 3);
    const w = (h * 3) / 2;
    const o = document.createElement("canvas");
    o.width = 600;
    o.height = 400;
    o.getContext("2d")!.drawImage(c, ((r.width - w) / 2) * sx, r.height * 0.06 * sy, w * sx, h * sy, 0, 0, 600, 400);
    return o.toDataURL("image/jpeg", 0.82);
  });
  writeFileSync(`${out}/road${i}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log(`${out}/road${i}.jpg  ${road.name}`);
  await page.close();
}
await browser.close();
