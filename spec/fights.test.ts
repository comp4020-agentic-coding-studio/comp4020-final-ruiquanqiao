import { describe, expect, it } from "vitest";
import { DT, KMH, NO_INPUT, type Race, type Rider, TUNE, aiInput, beginAttack, kickPays, startRace, step } from "../game/sim.ts";
import { ROADS, makeTrack } from "../game/track.ts";
import { tally } from "../scripts/fights.ts";

// The aggression detector (ledger C11). A player who rides flat out and never
// swings, on every road, against a full field. The recording's rival rides up
// beside the player and stays there six seconds and more, swinging about once
// a second (351.5-357.5). The first AI only swung at whoever happened to be
// within 1.6 m and held its line away from everyone else: 3-7 swings at the
// player in 90 s, and never more than a few seconds alongside.

describe("the field picks fights with a player", () => {
  // eight seeds, not four: one seed can swing a road from 9 swings at the
  // player to none on any change to how the field rides, and four were not
  // enough to tell a change in the field from luck
  const seeds = [11, 3, 7, 19, 1, 2, 5, 8];
  const runs = seeds.map((seed) => ROADS.map((_, road) => tally(road, seed, 90, 1, 1)));
  const all = runs.flat();

  it("swings at a player who never swings back, on every road", () => {
    // measured on seed 11: 7-19 a road in 90 s, 12 on average, once a cop
    // rode alongside the player and took a flank a rider would otherwise duel
    // from (7-28 and 20 before). Since a rub costs stamina instead of
    // knocking a rider off, over four seeds: 14.1 swings a race down to 12.1.
    // With cops patrolling: 14.9. Since riders fight over position and
    // grudges, blind to who is a person (O5): 12.3. And since the grid is
    // drawn, not every person on the back row (O1): 10.8, 0-20 a race. A
    // player who starts near the front and outrides the field can now meet
    // nobody, which is fair, so the floor is per road across the four seeds
    // and the bar is on the average. Since a fist lands 0.07 s after the key
    // instead of 0.22, the field hunts the player less: over these eight seeds
    // 8.8 swings a race down to 6.8 (on the first four, 9.3 to 4.9)
    ROADS.forEach((_, road) => expect(Math.max(...runs.map((r) => r[road].swingsAtMe)), `road ${road}`).toBeGreaterThanOrEqual(5));
    expect(all.reduce((n, t) => n + t.swingsAtMe, 0) / all.length).toBeGreaterThanOrEqual(6);
  });

  it("rides alongside for as long as the recording's rival does, somewhere on every road", () => {
    // measured: the longest stretch alongside 4.9-10.6 s, the best of four seeds on each road
    ROADS.forEach((_, road) => expect(Math.max(...runs.map((r) => r[road].longest)), `road ${road}`).toBeGreaterThan(4));
  });

  it("does not hound a player who never swings back off the bike every few seconds", () => {
    // measured: 16 in 450 s on one seed, while rubs could put a rider down
    // and stamina came back slowly; 12 in 1800 s over four seeds with rubs
    // only shoving. Since riders fight over position and grudges (O5), such a
    // player makes no enemies, and with the grid drawn (O1) is often clear of
    // the pack: 1 in 1800 s. No floor: being left alone for keeping the peace
    // is what the original's green riders do ("won't rumble unless you
    // strike first", SCDM)
    expect(all.reduce((n, t) => n + t.meDown, 0)).toBeLessThan(60);
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

// The kick (C4). It was a weak punch with a nudge: 5 stamina and a shove of
// 1.75 m in all, steered out of before it showed. In the original it throws
// the bike: the kicked rival is over on the next frame and off the side of
// the picture 0.16 s later (57.24-57.44), and RR2 says it "does no damage but
// pushes the bike". Its worth is what the bike is thrown into.

/** Two people abreast at 200 km/h on road `road` at `z`, nothing else about. */
function abreast(road: number, z: number, xKicker: number, xVictim: number): { race: Race; victim: Rider; kicker: Rider } {
  const race = startRace(makeTrack(1, road), 1, [
    { id: 0, name: "victim", human: true },
    { id: 1, name: "kicker", human: true },
  ], 3);
  race.riders = race.riders.filter((r) => !r.cop);
  race.cars = [];
  race.t = 20;
  const [victim, kicker] = [0, 1].map((id) => race.riders.find((r) => r.id === id)!);
  for (const [r, x] of [[victim, xVictim], [kicker, xKicker]] as const) Object.assign(r, { x, z, bikeX: x, bikeZ: z, line: x, speed: 200 * KMH, vx: 0 });
  return { race, victim, kicker };
}
const ride = (race: Race, secs: number): void => {
  for (let i = 0; i < secs / DT; i++) step(race, new Map([[0, { ...NO_INPUT, throttle: true }], [1, { ...NO_INPUT, throttle: true }]]));
};

describe("the kick", () => {
  it("costs no stamina and throws the bike metres across the road", () => {
    const calm = abreast(2, 1500, -1.6, 0);
    ride(calm.race, 1.2);
    const { race, victim, kicker } = abreast(2, 1500, -1.6, 0);
    beginAttack(race, kicker, "foot");
    ride(race, 1.2);
    expect(victim.stamina).toBe(100);
    // measured: 6.8 m further across than the same ride unkicked (1.75 m
    // in all before), most of it in the first half second
    expect(victim.x - calm.victim.x).toBeGreaterThan(6);
  });

  it("throws a rider in the outer lane into the sea rail, and they go down", () => {
    // Seawall Highway at 300 m: the rail is 9.9 m out, 4.65 m past the lane
    const { race, victim, kicker } = abreast(1, 300, 3.6, 5.25);
    beginAttack(race, kicker, "foot");
    ride(race, 1.2);
    expect(race.events.some((e) => e.kind === "crash" && e.rider === victim.id && e.cause === "wall")).toBe(true);
  });

  it("is chosen when there is something to throw the foe into, by anyone's reading of the road", () => {
    const wall = abreast(1, 300, 3.6, 5.25);
    expect(kickPays(wall.race, wall.kicker, wall.victim)).toBe(true);
    // from the other side, the throw is away from the rail
    expect(kickPays(wall.race, wall.victim, wall.kicker)).toBe(false);
    const open = abreast(2, 1500, -1.6, 0);
    expect(kickPays(open.race, open.kicker, open.victim)).toBe(false);
  });
});

// Cops (C7, P7). Riders slowing, and stopping if he stops, to take a
// patrolling cop's club is part of the game. When riders took to fighting
// over position and grudges (O5) the field was too busy with itself to get
// to a cop: set on one 27.7 rider-s a race down to 9.5. A cop now comes first.
describe("riders and the police", () => {
  it("breaks off a fight with a rider for a patrolling cop ahead, and slows to his pace to take him on", () => {
    const race = startRace(makeTrack(1, 2), 1, [
      { id: 0, name: "person", human: true },
      { id: 1, name: "picker", human: false },
    ], 9);
    const cop = race.riders.find((r) => r.cop)!;
    race.riders = [...race.riders.filter((r) => !r.cop), cop];
    race.cars = [];
    race.t = 20;
    const [person, picker] = [0, 1].map((id) => race.riders.find((r) => r.id === id)!);
    for (const [r, x, z] of [[person, 1.4, 800], [picker, 0, 800]] as const) Object.assign(r, { x, z, bikeX: x, bikeZ: z, line: x, speed: 200 * KMH });
    Object.assign(cop, { z: 960, bikeZ: 960, chase: -1 });
    picker.aggression = 0.5;
    picker.weapon = null;
    picker.foe = person.id;
    picker.foeUntil = race.t + 30;
    let slowest = picker.speed;
    let tookCop = false;
    for (let i = 0; i < 12 / DT && !(tookCop && picker.speed < 100 * KMH); i++) {
      step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
      if (picker.foe === cop.id) tookCop = true;
      slowest = Math.min(slowest, picker.speed);
    }
    expect(tookCop).toBe(true);
    // braked from 200 km/h to under 100, to ride alongside a cop patrolling
    // at 70 (measured: 81 km/h at its slowest in this run)
    expect(slowest).toBeLessThan(100 * KMH);
  });
});

// Levels (S6). A level was told apart by road length; every race is now about
// two minutes (T2), and a level is how ready the field is to fight. Measured
// over 5 roads and 3 seeds, a player who rides flat out and never swings,
// blows landed a second spent alongside an AI rider: 0.25 at level 1, 0.28
// at 3, 0.40 at 5; blows the AI riders swing at each other in 90 s: 147 at
// level 1, 262 at 3, 227 at 5. With only aggression scaled (x3.2 at level 5),
// the field was so busy with its own fights that a player alongside was hit
// less at level 5 (0.17) than at level 1.

/** Over 90 s on every road and two seeds: blows landed on a never-swinging player a second alongside, and blows among the AI. */
function temperOf(level: number): { perAlongside: number; amongAI: number } {
  let hits = 0;
  let alongside = 0;
  let amongAI = 0;
  for (const seed of [11, 3]) {
    ROADS.forEach((_, road) => {
      const race = startRace(makeTrack(level, road), level, Array.from({ length: 15 }, (_, id) => ({ id, name: `r${id}`, human: id === 0 })), seed);
      const me = race.riders.find((r) => r.id === 0)!;
      me.skill = 1;
      let seen = 0;
      for (let i = 0; i < 90 / DT; i++) {
        step(race, new Map([[0, { ...aiInput(race, me), hand: false, foot: false }]]));
        if (race.riders.some((o) => !o.cop && o !== me && Math.abs(o.z - me.z) < 4 && Math.abs(o.x - me.x) < 4)) alongside += DT;
        for (; seen < race.events.length; seen++) {
          const e = race.events[seen];
          if (e.kind !== "hit") continue;
          if (e.on === 0) hits++;
          else if (e.by !== 0 && race.riders.find((r) => r.id === e.on && !r.cop)) amongAI++;
        }
      }
    });
  }
  return { perAlongside: hits / alongside, amongAI };
}

describe("a level is a field more ready to fight", () => {
  it("hits harder at level 5 than at level 1, a person alongside and each other alike", () => {
    const [low, high] = [temperOf(1), temperOf(5)];
    expect(high.perAlongside).toBeGreaterThan(low.perAlongside * 1.25);
    expect(high.amongAI).toBeGreaterThan(low.amongAI * 1.25);
  });
});
