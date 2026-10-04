// How hard the AI comes at a player, measured: a race on every road with one
// human who rides like a player minding their own business (the AI's own
// driving, never swinging), and a tally of what the field does to them.
//   node scripts/fights.ts [seconds=90] [level=1]
// The recording to compare with: a rival rides up beside the player and stays
// there trading blows for six seconds and more (351.5-357.5), swinging about
// once a second (docs/road-rash-feel.md, section 2).
import { DT, type Race, aiInput, startRace, step } from "../game/sim.ts";
import { ROADS, makeTrack } from "../game/track.ts";

const seconds = Number(process.argv[2] ?? 90);
const level = Number(process.argv[3] ?? 1);
/** how hard the player rides, as a share of the bike's top: 1 is flat out, the hardest to catch */
const pace = Number(process.argv[4] ?? 1);

export type Tally = { road: string; hunted: number; longest: number; abreast: number; engaged: number; first: number | null; swingsAtMe: number; hitsOnMe: number; aiCrashes: number; meDown: number };

export function tally(road: number, seed = 11, secs = seconds, lvl = level, skill = pace): Tally {
  const entrants = [{ id: 0, name: "me", human: true }];
  for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
  const race: Race = startRace(makeTrack(lvl, road), lvl, entrants, seed);
  const me = race.riders.find((r) => r.id === 0)!;
  me.skill = skill;
  const t: Tally = { road: race.track.name, hunted: 0, longest: 0, abreast: 0, engaged: 0, first: null, swingsAtMe: 0, hitsOnMe: 0, aiCrashes: 0, meDown: 0 };
  const near = new Set<number>();
  const swung = new Set<string>();
  let run = 0;
  for (let i = 0; i < secs / DT; i++) {
    const input = { ...aiInput(race, me), hand: false, foot: false };
    step(race, new Map([[0, input]]));
    if (me.phase !== "riding") continue;
    let beside = false;
    for (const o of race.riders) {
      if (o === me || o.cop || o.phase !== "riding") continue;
      if (Math.abs(o.z - me.z) < 1.8 && Math.abs(o.x - me.x) < 2) {
        beside = true;
        near.add(o.id);
      }
      // a swing begun with me as its target
      if (o.attack && o.attack.target === 0 && !swung.has(`${o.id}:${o.attack.t === 0 ? i : ""}`) && o.attack.t <= DT) {
        swung.add(`${o.id}:${i}`);
        t.swingsAtMe++;
        t.first ??= race.t;
      }
    }
    if (beside) t.abreast += DT;
    run = beside ? run + DT : 0;
    t.longest = Math.max(t.longest, run);
    if (race.riders.some((o) => o.foe === 0)) t.hunted += DT;
  }
  for (const e of race.events) {
    if (e.kind === "hit" && e.on === 0) t.hitsOnMe++;
    if (e.kind === "crash" && e.rider === 0) t.meDown++;
    if (e.kind === "crash" && e.rider !== 0 && (e.cause === "rub" || e.cause === "lowside" || e.cause === "rearEnd" || e.cause === "headOn" || e.cause === "tree" || e.cause === "wall")) t.aiCrashes++;
  }
  t.engaged = near.size;
  t.abreast = Math.round(t.abreast * 10) / 10;
  t.hunted = Math.round(t.hunted * 10) / 10;
  t.longest = Math.round(t.longest * 10) / 10;
  return t;
}

if (import.meta.main) {
  for (let road = 0; road < ROADS.length; road++) console.log(JSON.stringify(tally(road)));
}
