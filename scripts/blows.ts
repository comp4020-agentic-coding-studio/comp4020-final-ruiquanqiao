// Contact sheets of the blows, for a person to judge: every frame of each
// blow in order, as the atlas draws it, from behind (the chase camera), from
// the side and from above, in one image per blow in .frames/. The rules that
// can be measured are in spec/motion.test.ts; this is for what cannot be.
//
//   node scripts/blows.ts [url]
//
// Chrome's profile and temp files go in .cache/, inside this repo.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
process.env.TMP = process.env.TEMP = resolve(".cache");
mkdirSync(".frames", { recursive: true });

const BLOWS: Record<string, string[]> = {
  punch: ["ride.R", "punch~strike.R", "punchOut.R", "punch~return.R"],
  backhand: ["ride.R", "backhand~strike.R", "backhand.R", "backhand~return.R"],
  chain: ["rideChain.R", "chain~raise.R", "chainUp.R", "chain~sweep1.R", "chain~sweep2.R", "chainOut.R", "chain~return.R"],
  club: ["rideClub.R", "club~raise.R", "clubUp.R", "club~sweep1.R", "club~sweep2.R", "clubOut.R", "club~return.R"],
  kick: ["ride.R", "kick~strike.R", "kick.R", "kick~return.R"],
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(url + "/?probe=1");
await page.waitForFunction(() => (window as unknown as { __rash: { scene(): { atlas?: unknown } | null } }).__rash?.scene()?.atlas, null, { timeout: 120000 });
for (const [name, frames] of Object.entries(BLOWS)) {
  const data = await page.evaluate((f) => (window as unknown as { __rash: { frames(n: string[]): string } }).__rash.frames(f), frames);
  writeFileSync(`.frames/blow-${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  console.log(`.frames/blow-${name}.png: ${frames.length} frames`);
}
await browser.close();
