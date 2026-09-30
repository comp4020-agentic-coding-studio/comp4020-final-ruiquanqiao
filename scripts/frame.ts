// Ride scripted keys, then draw the last frame with the real renderer and write
// it to .frames/<name>.png. Same step syntax as scripts/ride.ts:
//
//   node scripts/frame.ts "W:12" "W+J:0.1" --ai --size 480x270 --scale 3 --name punch

import { mkdirSync, writeFileSync } from "node:fs";
import { drawFrame, makeView } from "../game/render.ts";
import { DT, NO_INPUT, type Input, startRace, step } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";
import { encodePng } from "./png.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [w, h] = flag("size", "480x270").split("x").map(Number);
const scale = Number(flag("scale", "2"));
const name = flag("name", "frame");
const level = Number(flag("level", "1"));
const steps = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const keysOf = (spec: string): Input => {
  const i: Input = { ...NO_INPUT };
  for (const k of spec.toUpperCase().split("+")) {
    if (k === "W") i.throttle = true;
    if (k === "S") i.brake = true;
    if (k === "A") i.left = true;
    if (k === "D") i.right = true;
    if (k === "J") i.hand = true;
    if (k === "K") i.foot = true;
  }
  return i;
};

const track = makeTrack(level);
const entrants = [{ id: 0, name: "me", human: true }];
if (args.includes("--ai")) for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
const race = startRace(track, level, entrants, 7);

for (const s of steps) {
  const [keys, secs] = s.split(":");
  const input = keys === "-" ? NO_INPUT : keysOf(keys);
  const n = Math.round(Number(secs) / DT);
  for (let i = 0; i < n; i++) step(race, new Map([[0, input]]));
}

const view = makeView(w, h);
const t0 = performance.now();
drawFrame(view, { track, riders: race.riders, me: 0, t: race.t });
const ms = performance.now() - t0;

// nearest-neighbour upscale, the way the browser shows it
const out = new Uint8ClampedArray(w * scale * h * scale * 4);
const src = new Uint8ClampedArray(view.px.buffer);
for (let y = 0; y < h * scale; y++) {
  for (let x = 0; x < w * scale; x++) {
    const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
    const d = (y * w * scale + x) * 4;
    out[d] = src[s];
    out[d + 1] = src[s + 1];
    out[d + 2] = src[s + 2];
    out[d + 3] = 255;
  }
}
mkdirSync(".frames", { recursive: true });
writeFileSync(`.frames/${name}.png`, encodePng(w * scale, h * scale, out));
const me = race.riders.find((r) => r.id === 0)!;
console.log(`.frames/${name}.png  t=${race.t.toFixed(1)}s z=${me.z.toFixed(0)}m x=${me.x.toFixed(2)} phase=${me.phase}  draw ${ms.toFixed(1)}ms`);
