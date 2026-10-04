// Ride a scripted set of keys through the real simulation and print what the
// bike did, so handling can be read as numbers (CLAUDE.md, "Feel is tuned by
// riding"). Usage:
//
//   node scripts/ride.ts "W:20" "W+D:1.5" "W:3" [--level 1] [--every 0.5] [--ai]
//
// Each step is keys:seconds, keys being any of W A S D J K joined by "+", or
// "-" for none. --ai puts the level's AI field on the road as well.

import { DT, KMH, NO_INPUT, type Input, TUNE, cap, positionOf, startRace, step, topSpeed } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const level = Number(flag("level", "1"));
const every = Number(flag("every", "0.5"));
const withAi = args.includes("--ai");
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
    if (k === "N") i.nitro = true;
  }
  return i;
};

const track = makeTrack(level);
const entrants = [{ id: 0, name: "me", human: true }];
if (withAi) for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
const race = startRace(track, level, entrants, 7);
const me = race.riders.find((r) => r.id === 0)!;

console.log(`level ${level}, ${track.name}, ${(track.length / 1609.344).toFixed(1)} mi, bike ${me.bike.name}, top ${(topSpeed(me) / KMH).toFixed(0)} km/h`);
console.log("   t   keys     km/h   cap   build   x      lean  stam  dmg  phase     pos");

let nextPrint = 0;
const print = (keys: string): void => {
  console.log(
    [
      race.t.toFixed(1).padStart(5),
      keys.padEnd(8),
      (me.speed / KMH).toFixed(0).padStart(5),
      (cap(me) / KMH).toFixed(0).padStart(5),
      me.build.toFixed(2).padStart(6),
      me.x.toFixed(2).padStart(6),
      me.lean.toFixed(2).padStart(6),
      me.stamina.toFixed(0).padStart(5),
      me.damage.toFixed(0).padStart(4),
      me.phase.padEnd(9),
      String(positionOf(race, 0)).padStart(3),
    ].join(" "),
  );
};

for (const s of steps) {
  const [keys, secs] = s.split(":");
  const input = keys === "-" ? NO_INPUT : keysOf(keys);
  const n = Math.round(Number(secs) / DT);
  for (let i = 0; i < n; i++) {
    // a held attack key is one press, the way a player taps it
    const held = i === 0 ? input : { ...input, hand: false, foot: false, nitro: false };
    step(race, new Map([[0, held]]));
    if (race.t + 1e-9 >= nextPrint) {
      print(keys);
      nextPrint += every;
    }
  }
}
print("end");
const crashes = race.events.filter((e) => e.kind === "crash" && e.rider === 0);
if (crashes.length) console.log("crashes:", crashes.map((e) => `${e.t.toFixed(1)}s ${"cause" in e ? e.cause : ""}`).join(", "));
console.log(`tune: baseCap ${TUNE.baseCap}, buildTime ${TUNE.buildTime}s, steer ${TUNE.steerSlow}-${TUNE.steerFast} m/s`);
