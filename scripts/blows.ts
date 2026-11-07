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
import { frameFor } from "../client/sprites.ts";
import { attackAfter, startRace, windupOf } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

const url = process.argv[2] ?? "http://localhost:8080";
const CHROME = process.env.CHROME ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");
process.env.TMP = process.env.TEMP = resolve(".cache");
mkdirSync(".frames", { recursive: true });

const BLOWS: Record<string, string[]> = {
  punch: ["ride.R", "punch~return.R", "punchOut.R"],
  chain: ["rideChain.R", "chain~raise.R", "chainUp.R", "chain~sweep1.R", "chain~sweep2.R", "chainOut.R", "chain~return.R"],
  club: ["rideClub.R", "club~raise.R", "clubUp.R", "club~sweep1.R", "club~sweep2.R", "clubOut.R", "club~return.R"],
  kick: ["ride.R", "kick~strike.R", "kick.R", "kick~return.R"],
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(url + "/?probe=1");
await page.waitForFunction(() => (window as unknown as { __rash: { scene(): { atlas?: unknown } | null } }).__rash?.scene()?.atlas, null, { timeout: 120000 });
// how long the race holds each frame, stepped through frameFor as a race
// does: the spacing in time an animator reads off a timing chart
const held = (blow: string, frames: string[]): string[] => {
  const r = startRace(makeTrack(1), 1, [{ id: 0, name: "me", human: true }], 1).riders[0];
  r.weapon = blow === "chain" ? "chain" : blow === "club" ? "club" : null;
  r.attack = { kind: blow === "kick" ? "kick" : "punch", side: 1, t: 0, target: -1, landed: false };
  const ms = new Map<string, number>();
  for (let t = 0; t < windupOf(r, r.attack) + attackAfter(r, r.attack); t += 1 / 1000) {
    r.attack.t = t;
    const f = frameFor(r);
    ms.set(f, (ms.get(f) ?? 0) + 1);
  }
  return frames.map((f) => (ms.has(f) ? `${f}  ${ms.get(f)} ms` : f));
};
for (const [name, frames] of Object.entries(BLOWS)) {
  const labels = held(name, frames);
  const data = await page.evaluate(([f, l]) => (window as unknown as { __rash: { frames(n: string[], l: string[]): string } }).__rash.frames(f, l), [frames, labels] as const);
  writeFileSync(`.frames/blow-${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  console.log(`.frames/blow-${name}.png: ${frames.length} frames`);
}
await browser.close();
