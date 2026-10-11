import { describe, expect, it } from "vitest";
import { DT, KMH, NO_INPUT, type Race, type Rider, TUNE, aiInput, beginAttack, startRace, step } from "../game/sim.ts";
import { ROADS, makeTrack } from "../game/track.ts";
import { tally } from "../scripts/fights.ts";

// The aggression detector (ledger C11). A player who rides flat out and never
// swings, on every road, against a full field. The recording's rival rides up
// beside the player and stays there six seconds and more, swinging about once
// a second (351.5-357.5). The first AI only swung at whoever happened to be
// within 1.6 m and held its line away from everyone else: 3-7 swings at the
// player in 90 s, and never more than a few seconds alongside.

describe("the field picks fights with a player", () => {
  const all = ROADS.map((_, road) => tally(road, 11, 90, 1, 1));

  it("swings at a player who never swings back, on every road", () => {
    // measured: 7-19 a road in 90 s, 12 on average, now that a cop rides
    // alongside the player for much of a race and takes a flank a rider would
    // otherwise duel from (7-28 and 20 before). The race is chaotic, so
    // any change to the riding moves one road's count a lot: the floor is on
    // every road, and the bar on the average. Since a rub costs stamina
    // instead of knocking a rider off and a shunt never does, over four seeds
    // and every road: 14.1 swings a race down to 12.1, while blows landed went
    // up from 10.3 to 12.1 and the player was knocked off 1.75 times a race,
    // not 2.3. This seed gives 11.2, against the 12 it was set at. With cops
    // patrolling and no longer riding alongside the player: 14.9 a race
    for (const t of all) expect(t.swingsAtMe, t.road).toBeGreaterThanOrEqual(5);
    expect(all.reduce((n, t) => n + t.swingsAtMe, 0) / all.length).toBeGreaterThanOrEqual(10);
  });

  it("rides alongside for as long as the recording's rival does, somewhere on every road", () => {
    // measured: the longest stretch alongside 5.9-11.4 s
    for (const t of all) expect(t.longest, t.road).toBeGreaterThan(4);
  });

  it("knocks such a player off now and then, but does not hound them off every few seconds", () => {
    // measured: 16 in 450 s on one seed, while rubs could put a rider down
    // and stamina came back slowly. With rubs only shoving and stamina back
    // in a second, that seed gives none, so four seeds are counted: 12 in
    // 1800 s, once every two and a half minutes for a player who never
    // swings back. Since riders fight over position and grudges rather than
    // singling out the player (O5), such a player makes no enemies: 3 in
    // 1800 s, swings at them 20-64 a race down to 7-23
    const more = [3, 7, 19].flatMap((seed) => ROADS.map((_, road) => tally(road, seed, 90, 1, 1)));
    const down = [...all, ...more].reduce((n, t) => n + t.meDown, 0);
    expect(down).toBeGreaterThan(0);
    expect(down).toBeLessThan(60);
  });
});

// Fair fights (O5). The field used to pick a human 37 times as readily as an
// AI rider and spent 14.7 times as long set on the player as on any AI
// rider, slowing to stay level with one: it rode to make the player lose,
// not to win. The original's riders "start fights over position, and they
// take cheap shots if they hold a grudge" (FADE, PCM). These put a person
// and an AI rider in the same place and count whom a rider goes for.

/** One AI rider at 200 km/h with a person and another AI rider placed either side of it; nothing else on the road. */
function scene(dz: number): { race: Race; picker: Rider; person: Rider; machine: Rider } {
  const race = startRace(makeTrack(1), 1, [
    { id: 0, name: "person", human: true },
    { id: 1, name: "picker", human: false },
    { id: 2, name: "machine", human: false },
  ], 5);
  race.riders = race.riders.filter((r) => !r.cop);
  race.cars = [];
  race.t = 20;
  const [person, picker, machine] = [0, 1, 2].map((id) => race.riders.find((r) => r.id === id)!);
  for (const [r, x, z] of [[picker, 0, 800], [person, -1.6, 800 + dz], [machine, 1.6, 800 + dz]] as const) {
    Object.assign(r, { x, z, bikeX: x, bikeZ: z, line: x, speed: 200 * KMH, foe: -1, foeUntil: 0, weapon: null });
  }
  picker.aggression = 0.4;
  return { race, picker, person, machine };
}

/** How often the picker goes for each of the two, out of `picks` fights picked afresh. */
function whom(dz: number, setup: (s: ReturnType<typeof scene>) => void, picks = 600): { person: number; machine: number } {
  const s = scene(dz);
  setup(s);
  const n = { person: 0, machine: 0 };
  for (let i = 0; i < picks * 400 && n.person + n.machine < picks; i++) {
    s.picker.foe = -1;
    s.picker.foeUntil = 0;
    aiInput(s.race, s.picker);
    if (s.picker.foe === s.person.id) n.person++;
    if (s.picker.foe === s.machine.id) n.machine++;
  }
  return n;
}

describe("riders fight fair", () => {
  it("goes for a person no more readily than for an AI rider level with it", () => {
    const n = whom(1, () => {});
    expect(n.person + n.machine).toBe(600);
    expect(n.person / n.machine).toBeGreaterThan(0.8);
    expect(n.person / n.machine).toBeLessThan(1.25);
  });

  it("leaves riders out of reach alone unless they have hit it, and then holds the grudge alike", () => {
    // 20 m up the road, clear of any fight over position
    expect(whom(20, () => {}, 1)).toEqual({ person: 0, machine: 0 });
    const n = whom(20, ({ picker, person, machine }) => {
      picker.grudge[person.id] = 1;
      picker.grudge[machine.id] = 1;
    });
    expect(n.person / n.machine).toBeGreaterThan(0.8);
    expect(n.person / n.machine).toBeLessThan(1.25);
  });

  it("holds a grudge against whoever hits it, a person or not", () => {
    const { race, picker, person, machine } = scene(0.3);
    for (const by of [person, machine]) {
      by.cooldown = 0;
      by.attack = null;
      beginAttack(race, by, "hand");
      by.attack!.target = picker.id;
      by.attack!.side = picker.x >= by.x ? 1 : -1;
    }
    for (let i = 0; i < 30; i++) step(race, new Map());
    expect(picker.grudge[person.id]).toBe(1);
    expect(picker.grudge[machine.id]).toBe(1);
  });

  it("never brakes or lifts to wait for a foe that drops back, and lets it go", () => {
    const { race, picker, person } = scene(0);
    race.riders = race.riders.filter((r) => r !== race.riders.find((o) => o.id === 2));
    picker.foe = person.id;
    picker.foeUntil = race.t + 30;
    let slowest = picker.speed;
    for (let i = 0; i < 4 / DT; i++) {
      step(race, new Map([[person.id, { ...NO_INPUT, brake: true }]]));
      slowest = Math.min(slowest, picker.speed);
    }
    expect(person.z).toBeLessThan(picker.z - TUNE.foeDropped);
    expect(picker.foe).toBe(-1);
    // at most the bend's own easing, never the brake (TUNE.brake takes 10 m/s off in a fraction of a second)
    expect(slowest).toBeGreaterThan(190 * KMH);
  });
});
