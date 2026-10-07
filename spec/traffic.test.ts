import { describe, expect, it } from "vitest";
import { CAR, KMH, LANES, NO_INPUT, OFF_ROAD, type Race, type Rider, TUNE, beginAttack, humansDone, standings, startRace, step } from "../game/sim.ts";
import { SHOULDER, makeTrack } from "../game/track.ts";

// Contact, traffic and police, each against its ledger row. Every test builds
// a race and then clears what would get in the way, so one rule is tested at
// a time: cars and cops are added by startRace and moved or removed here.

function race(humans = 2): Race {
  const entrants = Array.from({ length: humans }, (_, i) => ({ id: i, name: `h${i}`, human: true }));
  const r = startRace(makeTrack(1), 1, entrants, 5);
  r.cars = [];
  for (const c of r.riders.filter((x) => x.cop)) Object.assign(c, { z: 1e6, post: -1 }); // out of the way
  return r;
}

const rider = (r: Race, id: number): Rider => r.riders.find((x) => x.id === id)!;
const steps = (r: Race, n: number, input = NO_INPUT): void => {
  for (let i = 0; i < n; i++) step(r, new Map(r.riders.filter((x) => x.human).map((x) => [x.id, input])));
};

describe("contact between riders", () => {
  it("a gentle side rub shoves the other bike over without a crash (K1)", () => {
    const r = race();
    const [a, b] = [rider(r, 0), rider(r, 1)];
    Object.assign(a, { z: 500, x: 0, speed: 40, vx: 3 });
    Object.assign(b, { z: 500, x: 0.7, speed: 40, vx: 0 });
    steps(r, 1);
    expect(b.phase).toBe("riding");
    expect(b.shove).toBeGreaterThan(0);
  });

  it("a hard rub at speed costs the other rider stamina, and puts them down only once it is gone, at no cost to the bike (K2, K6)", () => {
    const rubbed = (stamina: number): Rider => {
      const r = race();
      const [a, b] = [rider(r, 0), rider(r, 1)];
      Object.assign(a, { z: 500, x: 0, speed: 40, vx: 8 });
      Object.assign(b, { z: 500, x: 0.75, speed: 40, vx: 0, stamina });
      steps(r, 1);
      if (b.phase === "thrown") expect(r.events.some((e) => e.kind === "crash" && e.rider === 1 && e.cause === "rub")).toBe(true);
      return b;
    };
    // fresh, it takes it and rides on, shoved over
    const fresh = rubbed(100);
    expect(fresh.phase).toBe("riding");
    expect(fresh.stamina).toBeLessThan(100);
    expect(fresh.stamina).toBeGreaterThan(80);
    // worn down by a fight, the same rub is the end of it
    const spent = rubbed(5);
    expect(spent.phase).toBe("thrown");
    expect(spent.damage).toBe(100);
  });

  it("getting back on the bike, a rider's stamina is full again (C8)", () => {
    const r = race(1);
    const me = rider(r, 0);
    Object.assign(me, { z: 500, x: 0, speed: 0, stamina: 0, phase: "running", phaseT: 0, bikeZ: 502, bikeX: 0 });
    steps(r, 60);
    expect(me.phase).toBe("riding");
    expect(me.stamina).toBe(100);
  });

  it("knocked off by another rider, the bike coasts on further than one its rider dropped (K5)", () => {
    const run = (cause: "knockdown" | "tree"): number => {
      const r = race(1);
      const me = rider(r, 0);
      Object.assign(me, { z: 500, x: 0, speed: 40 });
      if (cause === "knockdown") me.stamina = 1;
      if (cause === "knockdown") {
        // a blow that takes the last of the stamina
        const other: Rider = { ...me, id: 9, human: false, z: 500, x: -1, attack: null };
        r.riders.push(other);
        other.attack = { kind: "punch", side: 1, t: TUNE.windup, target: 0, landed: false };
      } else {
        // off the road, where trees are: a crash of the rider's own doing
        const x = SHOULDER + 3;
        r.track.scenery.unshift({ z: 500.5, x, kind: "tree" });
        r.track.scenery.sort((p, q) => p.z - q.z);
        me.x = x;
      }
      const start = me.z;
      // one second on, while the rider is still down
      steps(r, 60);
      expect(me.phase, cause).toBe("thrown");
      return me.bikeZ - start;
    };
    expect(run("knockdown")).toBeGreaterThan(run("tree") + 20);
  });
});

describe("traffic", () => {
  it("running into the back of a slower car is a crash, and costs about a head-on's damage (K7)", () => {
    const r = race(1);
    const me = rider(r, 0);
    Object.assign(me, { z: 500, x: LANES.with[0], speed: 40 });
    r.cars = [{ id: 0, kind: "sedan", z: 505, x: LANES.with[0], lane: LANES.with[0], dir: 1, speed: 18, changeT: 99 }];
    steps(r, 30);
    expect(me.phase).toBe("thrown");
    expect(100 - me.damage).toBe(TUNE.crashDamage.rearEnd);
    expect(TUNE.crashDamage.rearEnd / TUNE.crashDamage.headOn).toBeGreaterThan(0.7);
  });

  it("meeting an oncoming car is a head-on crash (K3)", () => {
    const r = race(1);
    const me = rider(r, 0);
    Object.assign(me, { z: 500, x: LANES.against[0], speed: 40 });
    r.cars = [{ id: 0, kind: "taxi", z: 520, x: LANES.against[0], lane: LANES.against[0], dir: -1, speed: 22, changeT: 99 }];
    steps(r, 30);
    expect(r.events.some((e) => e.kind === "crash" && e.cause === "headOn")).toBe(true);
  });

  it("brushing along a car's side pushes the bike off without a crash", () => {
    const r = race(1);
    const me = rider(r, 0);
    Object.assign(me, { z: 500, x: LANES.with[0] + (CAR.width + 0.8) / 2 - 0.1, speed: 20 });
    r.cars = [{ id: 0, kind: "sedan", z: 500, x: LANES.with[0], lane: LANES.with[0], dir: 1, speed: 20, changeT: 99 }];
    steps(r, 5);
    expect(me.phase).toBe("riding");
    expect(me.x).toBeGreaterThan(LANES.with[0] + (CAR.width + 0.8) / 2 - 0.05);
  });

  it("drives cars at 100-150 km/h, and puts no police cars on the road (T4, P2)", () => {
    // at 58-86 km/h, as first set, a car ahead closed at 200 km/h and looked parked
    for (const level of [1, 3, 5]) {
      const r = startRace(makeTrack(level), level, [{ id: 0, name: "h", human: true }], level);
      for (const c of r.cars) {
        expect(c.speed / KMH).toBeGreaterThanOrEqual(100);
        expect(c.speed / KMH).toBeLessThanOrEqual(150);
        expect(c.kind).not.toBe("police");
      }
    }
  });

  it("keeps every car in a lane of its own direction for a whole race (T4)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 3);
    // traffic is as sparse as the original's, a car every 30-60 s at cruise,
    // so a level 1 road carries only a handful
    expect(r.cars.length).toBeGreaterThan(5);
    for (let i = 0; i < 60 * 60; i++) step(r, new Map());
    for (const c of r.cars) {
      if (c.dir > 0) expect(c.x).toBeGreaterThan(0);
      else expect(c.x).toBeLessThan(0);
      expect(c.z).toBeGreaterThan(-60);
      expect(c.z).toBeLessThan(r.track.length + 60);
    }
  });
});

describe("police", () => {
  const withCop = (): { r: Race; me: Rider; cop: Rider } => {
    const r = race(1);
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(cop, { z: 600, x: 8, speed: 0, chase: -1, post: -1 });
    return { r, me, cop };
  };

  it("a cop is never seen waiting: off the road until a human nears his post, then in from behind and flat out (P2)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 5);
    r.cars = [];
    const me = rider(r, 0);
    const cop = r.riders.filter((x) => x.cop).sort((p, q) => p.post - q.post)[0];
    const post = cop.post;
    Object.assign(me, { z: post - 400, x: 1.75, speed: 70, build: 1 });
    steps(r, 60, { ...NO_INPUT, throttle: true });
    // still away: nowhere on the road
    expect(cop.z).toBeLessThan(OFF_ROAD / 2);
    while (me.z < post && r.t < 60) steps(r, 1, { ...NO_INPUT, throttle: true });
    // sent out, behind the rider, already going faster than them
    expect(cop.post).toBe(-1);
    expect(cop.chase).toBe(0);
    expect(cop.z).toBeLessThan(me.z);
    expect(cop.z).toBeGreaterThan(me.z - 80);
    expect(cop.speed).toBeGreaterThan(me.speed);
    // and catches them: alongside within ten seconds at full speed
    let caught = false;
    for (let i = 0; i < 600 && !caught; i++) {
      steps(r, 1, { ...NO_INPUT, throttle: true });
      caught = Math.abs(cop.z - me.z) < 3;
    }
    expect(caught).toBe(true);
  });

  it("never gives up or pulls over: a cop who loses his rider goes after the next human", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "a", human: true }, { id: 1, name: "b", human: true }], 5);
    r.cars = [];
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(rider(r, 0), { z: 1000, phase: "busted" });
    Object.assign(rider(r, 1), { z: 1100, x: 1.75, speed: 50 });
    Object.assign(cop, { z: 1050, x: 0, speed: 40, chase: 0, post: -1 });
    steps(r, 60 * 3, { ...NO_INPUT, throttle: true });
    expect(cop.chase).toBe(1);
    expect(cop.speed).toBeGreaterThan(40);
  });

  it("stopping beside a cop is Busted, and the race is over for that rider (P1)", () => {
    const { r, me, cop } = withCop();
    Object.assign(me, { z: 605, x: 6, speed: 0 });
    Object.assign(cop, { z: 600, x: 7 });
    r.t = 10;
    steps(r, 2);
    expect(me.phase).toBe("busted");
    expect(humansDone(r)).toBe(true);
  });

  it("never busts an AI rider (P4)", () => {
    const { r, cop } = withCop();
    const ai = { ...rider(r, 0), id: 7, human: false, z: 605, x: 6, speed: 0 };
    r.riders.push(ai);
    Object.assign(cop, { z: 600, x: 7 });
    r.t = 10;
    steps(r, 2);
    expect(ai.phase).not.toBe("busted");
  });

  it("leaves cops out of the standings", () => {
    const r = startRace(makeTrack(1), 3, [{ id: 0, name: "h", human: true }], 1);
    expect(r.riders.some((x) => x.cop)).toBe(true);
    expect(standings(r).some((x) => x.cop)).toBe(false);
  });
});

describe("weapons", () => {
  // me (0) and an armed rider (1) side by side at speed
  const armed = (weapon: "club" | "chain", by = 1): { r: Race; me: Rider; foe: Rider } => {
    const r = race();
    const [me, foe] = [rider(r, 0), rider(r, by)];
    Object.assign(me, { z: 500, x: 0, speed: 30 });
    Object.assign(foe, { z: 500, x: 1.5, speed: 30, weapon, human: false, aggression: 0, line: 1.5 });
    return { r, me, foe };
  };
  const press = (r: Race, id: number, n: number): void => {
    for (let i = 0; i < n; i++) step(r, new Map([[id, { ...NO_INPUT, throttle: true, hand: i === 0 }]]));
  };

  it("the chain reaches a rider a fist cannot, and a weapon hits harder than a fist (C5)", () => {
    const { r, me, foe } = armed("chain");
    foe.x = me.x + 2.4;
    foe.human = true;
    beginAttack(r, foe, "hand");
    expect(foe.attack?.side).toBe(-1);
    steps(r, Math.ceil(TUNE.weaponWindup / (1 / 60)) + 2, { ...NO_INPUT, throttle: true });
    expect(me.stamina).toBeLessThan(100 - TUNE.punchStamina);
    expect(TUNE.reach.chain.x).toBeGreaterThan(2.4);
    expect(TUNE.punchReach.x).toBeLessThan(2.4);
  });

  it("some AI riders start armed, and every human starts empty-handed (C5, C10)", () => {
    const entrants = Array.from({ length: 15 }, (_, i) => ({ id: i, name: `r${i}`, human: i < 3 }));
    const armedCount = [1, 2, 3, 4, 5, 6].map((seed) => {
      const r = startRace(makeTrack(1), 1, entrants, seed);
      expect(r.riders.filter((x) => x.human).every((x) => x.weapon === null)).toBe(true);
      return r.riders.filter((x) => !x.cop && x.weapon).length;
    });
    expect(Math.max(...armedCount)).toBeGreaterThan(0);
    expect(Math.min(...armedCount)).toBeLessThan(12);
  });

  it("punching at the moment an opponent has a weapon all the way back takes it off them (C6)", () => {
    const { r, me, foe } = armed("club");
    beginAttack(r, foe, "hand");
    // the last tenth of a second before the blow
    steps(r, Math.ceil((TUNE.weaponWindup - TUNE.snatchWindow / 2) * 60), { ...NO_INPUT, throttle: true });
    press(r, 0, 2);
    expect(me.weapon).toBe("club");
    expect(foe.weapon).toBeNull();
    expect(foe.attack).toBeNull();
    expect(me.stamina).toBe(100);
    expect(r.events.some((e) => e.kind === "snatch" && e.by === 0 && e.from === 1)).toBe(true);
  });

  it("too early, while the weapon is still coming back, the punch is only a punch and the blow still lands (C6)", () => {
    const { r, me, foe } = armed("club");
    beginAttack(r, foe, "hand");
    steps(r, 6, { ...NO_INPUT, throttle: true }); // a tenth of a second into the draw-back
    press(r, 0, 2);
    expect(me.weapon).toBeNull();
    expect(foe.weapon).toBe("club");
    steps(r, Math.ceil(TUNE.weaponWindup * 60), { ...NO_INPUT, throttle: true });
    expect(me.stamina).toBeLessThan(100);
    expect(TUNE.snatchWindow).toBeLessThan(TUNE.weaponWindup / 2);
  });

  it("too late, once the blow has landed, the punch is only a punch (C6)", () => {
    const { r, me, foe } = armed("club");
    beginAttack(r, foe, "hand");
    steps(r, Math.ceil(TUNE.weaponWindup * 60) + 1, { ...NO_INPUT, throttle: true });
    expect(me.stamina).toBeLessThan(100);
    press(r, 0, 2);
    expect(me.weapon).toBeNull();
    expect(foe.weapon).toBe("club");
  });

  it("a cop's club can be snatched the same way, and the cop rides on without it (C7)", () => {
    const r = race(1);
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(me, { z: 600, x: 0, speed: 30 });
    Object.assign(cop, { z: 600, x: 1.5, speed: 30, chase: 0, post: -1 });
    expect(cop.weapon).toBe("club");
    beginAttack(r, cop, "hand");
    steps(r, Math.ceil((TUNE.weaponWindup - TUNE.snatchWindow / 2) * 60), { ...NO_INPUT, throttle: true });
    press(r, 0, 2);
    expect(me.weapon).toBe("club");
    expect(cop.weapon).toBeNull();
    expect(cop.phase).toBe("riding");
  });
});

describe("contact with a cop (K10)", () => {
  it("rubbing a cop is not a bust; coming off beside one is", () => {
    const r = race(1);
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(me, { z: 600, x: 0, speed: 30, vx: 3 });
    Object.assign(cop, { z: 600, x: 0.7, speed: 30, vx: 0, chase: 0, post: -1 });
    r.t = 10;
    steps(r, 1, { ...NO_INPUT, throttle: true });
    expect(me.phase).toBe("riding");
    // now the cop rubs me off the bike, worn down
    Object.assign(me, { z: 620, x: 0, speed: 30, vx: 0, stamina: 5 });
    Object.assign(cop, { z: 620, x: -0.7, speed: 30, vx: 12 });
    steps(r, 2);
    expect(me.phase).toBe("busted");
  });
});
