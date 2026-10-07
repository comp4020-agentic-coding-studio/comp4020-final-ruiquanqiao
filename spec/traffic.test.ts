import { describe, expect, it } from "vitest";
import { CAR, KMH, LANES, NO_INPUT, type Race, type Rider, TUNE, beginAttack, humansDone, standings, startRace, step } from "../game/sim.ts";
import { SHOULDER, makeTrack } from "../game/track.ts";

// Contact, traffic and police, each against its ledger row. Every test builds
// a race and then clears what would get in the way, so one rule is tested at
// a time: cars and cops are added by startRace and moved or removed here.

function race(humans = 2): Race {
  const entrants = Array.from({ length: humans }, (_, i) => ({ id: i, name: `h${i}`, human: true }));
  const r = startRace(makeTrack(1), 1, entrants, 5);
  r.cars = [];
  for (const c of r.riders.filter((x) => x.cop)) Object.assign(c, { z: 1e6 }); // out of the way
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

  it("stamina comes back fast once the blows stop: a second clear, then empty to full in five (M1)", () => {
    const r = race(1);
    const me = rider(r, 0);
    Object.assign(me, { z: 500, x: 0, speed: 30, stamina: 1, sinceHit: 0 });
    steps(r, Math.round(60 * (TUNE.staminaRest - 0.2)));
    expect(me.stamina).toBe(1);
    steps(r, 60 * 5.3);
    expect(me.stamina).toBe(100);
  });

  it("seven club blows close together take a full rider to empty (C2, M1)", () => {
    const r = race();
    const [a, b] = [rider(r, 0), rider(r, 1)];
    Object.assign(a, { z: 500, x: 0, speed: 30, weapon: "club", lbs: 180 });
    Object.assign(b, { z: 500, x: 1.2, speed: 30, lbs: 180 });
    let blows = 0;
    while (b.phase === "riding" && blows < 10) {
      Object.assign(a, { z: b.z, x: b.x - 1.2, attack: null, cooldown: 0 });
      beginAttack(r, a, "hand");
      steps(r, 50);
      if (r.events.some((e) => e.kind === "hit" && e.on === 1)) blows = r.events.filter((e) => e.kind === "hit" && e.on === 1).length;
    }
    expect(blows).toBe(7);
    expect(b.phase).toBe("thrown");
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
    Object.assign(cop, { z: 600, x: 8, speed: 0, chase: -1 });
    return { r, me, cop };
  };

  it("a cop patrols slowly down the right-hand edge of the road, and goes after no one who leaves him be (P2)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 5);
    r.cars = [];
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    // on the road from the start, at the race's own bike
    expect(cop.z).toBeGreaterThan(0);
    expect(cop.bike).toBe(me.bike);
    Object.assign(me, { z: cop.z - 300, x: 1.75, speed: 70, build: 1 });
    // I go flat out past him
    steps(r, 60 * 8, { ...NO_INPUT, throttle: true });
    expect(me.z).toBeGreaterThan(cop.z + 100);
    expect(cop.chase).toBe(-1);
    expect(Math.abs(cop.speed - TUNE.copPatrol)).toBeLessThan(4);
    expect(cop.x).toBeGreaterThan(LANES.with[1] + (CAR.width + 0.8) / 2);
  });

  it("hit him and he comes after you on the race's own bike; hit by someone else, he goes after them (P7)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "a", human: true }, { id: 1, name: "b", human: true }], 5);
    r.cars = [];
    const [a, b] = [rider(r, 0), rider(r, 1)];
    const cop = r.riders.find((x) => x.cop)!;
    // slowed to his pace, alongside him at the edge of the road
    Object.assign(cop, { z: 1000, x: 7, speed: TUNE.copPatrol });
    Object.assign(a, { z: 1000, x: 5.9, speed: TUNE.copPatrol });
    Object.assign(b, { z: 990, x: 3.8, speed: TUNE.copPatrol });
    beginAttack(r, a, "hand");
    expect(a.attack?.target).toBe(cop.id);
    for (let i = 0; i < 30 && cop.chase < 0; i++) steps(r, 1, { ...NO_INPUT, throttle: true });
    expect(cop.chase).toBe(0);
    // and gives chase: faster than he patrols
    steps(r, 60 * 2, { ...NO_INPUT, throttle: true });
    expect(cop.speed).toBeGreaterThan(TUNE.copPatrol + 5);
    // the other rider lands one on him: now it is them he is after
    Object.assign(b, { z: cop.z, x: cop.x - 1.0, speed: cop.speed, attack: null, cooldown: 0 });
    beginAttack(r, b, "hand");
    for (let i = 0; i < 30 && cop.chase !== 1; i++) steps(r, 1, { ...NO_INPUT, throttle: true });
    expect(cop.chase).toBe(1);
  });

  it("an AI rider picks a fight with a patrolling cop: brakes down to him from racing speed and lands blows (P7)", () => {
    // every unarmed AI rider in a race, one at a time, coming up on the cop at racing speed
    let fought = 0;
    let tries = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }, { id: 1, name: "ai", human: false }], seed);
      r.cars = [];
      const ai = rider(r, 1);
      const cop = r.riders.find((x) => x.cop)!;
      Object.assign(ai, { z: cop.z - 400, x: 1.75, speed: 70, build: 1, weapon: null, aggression: 0.5 });
      Object.assign(rider(r, 0), { z: 100, speed: 0 });
      r.t = 30;
      tries++;
      for (let i = 0; i < 60 * 25 && cop.chase !== 1; i++) steps(r, 1);
      if (cop.chase === 1) fought++;
      // never thrown off doing it
      expect(ai.phase).toBe("riding");
    }
    expect(fought / tries).toBeGreaterThanOrEqual(0.5);
  });

  it("from in front of the one he is after, a cop drops back to them rather than ride ahead mirroring them", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 5);
    r.cars = [];
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(me, { z: 1000, x: 1.75, speed: 50, build: 1 });
    Object.assign(cop, { z: 1008, x: 0, speed: 50, chase: 0 });
    let back = false;
    for (let i = 0; i < 60 * 3 && !back; i++) {
      steps(r, 1, { ...NO_INPUT, throttle: true, left: i % 40 < 20, right: i % 40 >= 20 });
      back = cop.z - me.z < 1.5;
    }
    expect(back).toBe(true);
  });

  it("got 150 m away from, he goes back to patrolling, and a crash after that is not a bust by him (P1, P7)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 5);
    r.cars = [];
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    // knocked off his bike in a fight, he is left behind
    Object.assign(me, { z: 2000, x: 1.75, speed: 70, build: 1 });
    Object.assign(cop, { z: 1990, x: 0, speed: 0, chase: 0, phase: "running", phaseT: 0, bikeZ: 1985, bikeX: 0 });
    steps(r, 60 * 4, { ...NO_INPUT, throttle: true });
    expect(me.z - cop.z).toBeGreaterThan(TUNE.copLost);
    expect(cop.chase).toBe(-1);
    // I come off, and lie in the road as long as I like
    Object.assign(me, { speed: 0, phase: "running", phaseT: 0, bikeZ: me.z + 30, bikeX: me.x });
    steps(r, 60 * 3);
    expect(me.phase).not.toBe("busted");
    expect(cop.chase).toBe(-1);
  });

  it("not shaken off, a crash with him close behind is still a bust (P1)", () => {
    const r = startRace(makeTrack(1), 1, [{ id: 0, name: "h", human: true }], 5);
    r.cars = [];
    const me = rider(r, 0);
    const cop = r.riders.find((x) => x.cop)!;
    Object.assign(me, { z: 2000, x: 1.75, speed: 0, phase: "running", phaseT: 0, bikeZ: 2060, bikeX: 1.75 });
    Object.assign(cop, { z: 1900, x: 0, speed: 60, chase: 0, build: 1 });
    steps(r, 60 * 4);
    expect(me.phase).toBe("busted");
  });

  it("puts one cop on a level 1 road, two on levels 2 and 3, three on 4 and 5", () => {
    const cops = (level: number): number => startRace(makeTrack(level), level, [{ id: 0, name: "h", human: true }], 5).riders.filter((x) => x.cop).length;
    expect([1, 2, 3, 4, 5].map(cops)).toEqual([1, 2, 2, 3, 3]);
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
    Object.assign(cop, { z: 600, x: 1.5, speed: 30, chase: 0 });
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
    Object.assign(cop, { z: 600, x: 0.7, speed: 30, vx: 0, chase: 0 });
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
