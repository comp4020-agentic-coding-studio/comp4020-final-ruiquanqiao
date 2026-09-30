// Ride a whole race with a scripted rider who uses only W, A and D, steering by
// what a player can see — where the bike sits on the road and the bend ahead —
// against the level's AI field. Prints the finishing time, the places, and
// every crash, so pacing and the AI can be judged as numbers.
//
//   node scripts/lap.ts [--level 1] [--seed 7] [--margin 0.3]

import { DT, MPH, NO_INPUT, type Input, TUNE, standings, startRace, step, humansDone } from "../game/sim.ts";
import { MILE, curveAt, makeTrack } from "../game/track.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const level = Number(flag("level", "1"));
const seed = Number(flag("seed", "7"));
const margin = Number(flag("margin", "0.3")); // how far off the line before the rider steers, m

const track = makeTrack(level);
const entrants = [{ id: 0, name: "me", human: true }];
for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
const race = startRace(track, level, entrants, seed);
const me = race.riders.find((r) => r.id === 0)!;

let maxLean = 0;
let steerSteps = 0;
while (!humansDone(race) && race.t < 900) {
  const input: Input = { ...NO_INPUT, throttle: true };
  // aim for the centre of the right lane, leaning into what the bend will do
  const ahead = curveAt(track, me.z + me.speed * 0.8);
  const want = 2.5 - me.x + TUNE.centrifugal * me.speed * me.speed * ahead * 0.35;
  if (want > margin) input.right = true;
  if (want < -margin) input.left = true;
  if (input.left || input.right) steerSteps++;
  step(race, new Map([[0, input]]));
  maxLean = Math.max(maxLean, Math.abs(me.lean));
}

const order = standings(race);
console.log(`level ${level}: ${(track.length / MILE).toFixed(1)} mi, ${race.t.toFixed(0)}s, I finished ${me.place ? `#${me.place}` : me.phase} in ${me.finishT.toFixed(1)}s, avg ${(track.length / me.finishT / MPH).toFixed(0)} mph, steering ${((steerSteps * DT) / race.t * 100).toFixed(0)}% of the time, max lean ${maxLean.toFixed(2)}`);
const crashes = race.events.filter((e) => e.kind === "crash");
const byCause = new Map<string, number>();
for (const e of crashes) if (e.kind === "crash") byCause.set(`${e.rider === 0 ? "me" : "ai"} ${e.cause}`, (byCause.get(`${e.rider === 0 ? "me" : "ai"} ${e.cause}`) ?? 0) + 1);
console.log("crashes:", Object.fromEntries(byCause));
console.log("hits:", race.events.filter((e) => e.kind === "hit").length, " wrecked:", race.events.filter((e) => e.kind === "wrecked").length);
console.log(order.map((r) => `${r.place || "-"} ${r.name} ${r.phase} ${(r.z / MILE).toFixed(2)}mi`).join("\n"));
void DT;
