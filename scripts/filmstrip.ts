// A stretch of a race as a grid of frames, drawn by the real renderer: the
// scripted rider from scripts/lap.ts rides to --from metres, then a frame is
// taken every --every seconds. A screenshot is one pose; motion needs a strip.
//
//   node scripts/filmstrip.ts --from 2750 --frames 12 --every 0.25 --name tight-bend [--ai]

import { mkdirSync, writeFileSync } from "node:fs";
import { drawFrame, makeView } from "../game/render.ts";
import { DT, MPH, NO_INPUT, type Input, TUNE, startRace, step } from "../game/sim.ts";
import { curveAt, makeTrack } from "../game/track.ts";
import { encodePng } from "./png.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const from = Number(flag("from", "2750"));
const frames = Number(flag("frames", "12"));
const every = Number(flag("every", "0.25"));
const name = flag("name", "strip");
const cols = Number(flag("cols", "4"));
const [w, h] = flag("size", "320x180").split("x").map(Number);
const margin = Number(flag("margin", "0.3"));

const track = makeTrack(1);
const entrants = [{ id: 0, name: "me", human: true }];
if (args.includes("--ai")) for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
const race = startRace(track, 1, entrants, 7);
const me = race.riders.find((r) => r.id === 0)!;

const bot = (): Input => {
  const input: Input = { ...NO_INPUT, throttle: true };
  const ahead = curveAt(track, me.z + me.speed * 0.8);
  const want = 2.5 - me.x + TUNE.centrifugal * me.speed * me.speed * ahead * 0.35;
  if (want > margin) input.right = true;
  if (want < -margin) input.left = true;
  return input;
};

while (me.z < from && race.t < 600) step(race, new Map([[0, bot()]]));

const rows = Math.ceil(frames / cols);
const sheet = new Uint8ClampedArray(w * cols * h * rows * 4);
const view = makeView(w, h);
const notes: string[] = [];
for (let f = 0; f < frames; f++) {
  drawFrame(view, { track, riders: race.riders, me: 0, t: race.t });
  const src = new Uint8ClampedArray(view.px.buffer);
  const ox = (f % cols) * w;
  const oy = Math.floor(f / cols) * h;
  for (let y = 0; y < h; y++) {
    sheet.set(src.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * w * cols + ox) * 4);
  }
  notes.push(`${f}: t=${race.t.toFixed(2)} z=${me.z.toFixed(0)} x=${me.x.toFixed(2)} ${(me.speed / MPH).toFixed(0)}mph lean=${me.lean.toFixed(2)} ${me.phase}`);
  const n = Math.round(every / DT);
  for (let i = 0; i < n; i++) step(race, new Map([[0, bot()]]));
}
mkdirSync(".frames", { recursive: true });
writeFileSync(`.frames/${name}.png`, encodePng(w * cols, h * rows, sheet));
console.log(`.frames/${name}.png`);
console.log(notes.join("\n"));
