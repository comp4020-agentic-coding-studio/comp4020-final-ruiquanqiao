import { describe, expect, it } from "vitest";
import { sfx } from "../client/audio.ts";
import { HOP, hopLift, react, wobble } from "../client/feel.ts";
import { CAR, LANES, NO_INPUT, type Race, type RaceEvent, type Rider, TUNE, beginAttack, startRace, step } from "../game/sim.ts";
import { bake, makeTrack, wallAt } from "../game/track.ts";

// Every touch is felt (ledger K13). The recording shows a struck bike over on
// the next frame and its striker's bike rocking for about four; the first
// remake pushed bikes apart and showed and played nothing, so contact felt
// like touching air. These hold that each kind of touch is reported, and what
// the screen and the speakers make of it.

const FRAME = 1 / 25; // one frame of the recording

function race(humans = 2, road = 0): Race {
  const entrants = Array.from({ length: humans }, (_, i) => ({ id: i, name: `h${i}`, human: true }));
  const r = startRace(makeTrack(1, road), 1, entrants, 5);
  r.cars = [];
  for (const c of r.riders.filter((x) => x.cop)) Object.assign(c, { z: 1e6 });
  r.track = { ...r.track, scenery: [] };
  return r;
}
const rider = (r: Race, id: number): Rider => r.riders.find((x) => x.id === id)!;
const steps = (r: Race, n: number): void => {
  for (let i = 0; i < n; i++) step(r, new Map(r.riders.filter((x) => x.human).map((x) => [x.id, NO_INPUT])));
};
const bumps = (r: Race): Extract<RaceEvent, { kind: "bump" }>[] => r.events.filter((e) => e.kind === "bump");

describe("each kind of touch is reported", () => {
  it("a side rub, on the rider shoved", () => {
    const r = race();
    Object.assign(rider(r, 0), { z: 500, x: 0, speed: 40, vx: 3 });
    Object.assign(rider(r, 1), { z: 500, x: 0.7, speed: 40, vx: 0 });
    steps(r, 1);
    expect(bumps(r)).toMatchObject([{ rider: 1, other: 0, with: "rider" }]);
    // and says where the shove came from: the rider's left (+x is right)
    expect(bumps(r)[0].from).toBeLessThan(rider(r, 1).x);
    expect(react(bumps(r)[0], r.riders, 0).tilt.find((t) => t.id === 1)!.amp).toBeGreaterThan(0);
  });

  it("a shunt from behind, on the rider in front", () => {
    const r = race();
    Object.assign(rider(r, 0), { z: 500, x: 0, speed: 45 });
    Object.assign(rider(r, 1), { z: 501.8, x: 0, speed: 35 });
    steps(r, 1);
    expect(bumps(r)[0]).toMatchObject({ rider: 1, other: 0, with: "rider" });
  });

  it("run into from behind, however much faster, nobody comes off: momentum is kept, the two part to either side and the faster goes by (K14)", () => {
    const r = race();
    const [a, b] = [rider(r, 0), rider(r, 1)];
    Object.assign(a, { z: 500, x: 0.1, speed: 50 });
    Object.assign(b, { z: 501.9, x: 0, speed: 22 });
    const mass = (x: Rider): number => x.bike.lbs + x.lbs;
    const before = mass(a) * a.speed + mass(b) * b.speed;
    steps(r, 1);
    expect(a.phase).toBe("riding");
    expect(b.phase).toBe("riding");
    // momentum along the road, less one step of riding, is what it was
    expect(Math.abs(mass(a) * a.speed + mass(b) * b.speed - before) / before).toBeLessThan(0.01);
    // the one in front knocked on, the rammer checked, and no longer closing
    expect(b.speed).toBeGreaterThan(35);
    expect(a.speed).toBeLessThan(b.speed + 1);
    // struck a little off its line, each goes its own way: the rammer on the
    // side it was already on, the other the other way
    expect(a.shove).toBeGreaterThan(1);
    expect(b.shove).toBeLessThan(-1);
    expect(bumps(r).map((e) => e.rider).sort()).toEqual([0, 1]);
    // and held flat out, the rammer is past within three seconds
    for (let i = 0; i < 180; i++) step(r, new Map([[0, { ...NO_INPUT, throttle: true }], [1, NO_INPUT]]));
    expect(a.z).toBeGreaterThan(b.z);
    expect(r.events.some((e) => e.kind === "crash")).toBe(false);
  });

  it("a car's flank brushed", () => {
    const r = race(1);
    Object.assign(rider(r, 0), { z: 500, x: LANES.with[0] + (CAR.width + 0.8) / 2 - 0.1, speed: 20 });
    r.cars = [{ id: 7, kind: "sedan", z: 500, x: LANES.with[0], lane: LANES.with[0], dir: 1, speed: 20, changeT: 99 }];
    steps(r, 3);
    expect(bumps(r)[0]).toMatchObject({ rider: 0, other: 7, with: "car" });
  });

  it("a wall glanced", () => {
    const r = race(1, 1); // the coast road: a cliff on the left
    const me = rider(r, 0);
    let z = 100;
    while (wallAt(r.track, z, 1) > 50) z += 10;
    Object.assign(me, { z, x: wallAt(r.track, z, 1) - 0.42, speed: 40, vx: 3 });
    steps(r, 3);
    expect(me.phase).toBe("riding");
    expect(bumps(r)[0]).toMatchObject({ rider: 0, with: "wall" });
  });

  it("a rub held for seconds about four times a second, not every step", () => {
    const r = race();
    const [a, b] = [rider(r, 0), rider(r, 1)];
    Object.assign(a, { z: 500, x: 0, speed: 40 });
    Object.assign(b, { z: 500, x: 0.7, speed: 40 });
    for (let i = 0; i < 120; i++) {
      a.vx = 2;
      b.vx = -2;
      steps(r, 1);
      b.x = a.x + 0.7;
    }
    expect(bumps(r).length).toBeGreaterThan(3);
    expect(bumps(r).length).toBeLessThanOrEqual(9);
  });
});

describe("what a touch looks and sounds like", () => {
  it("a struck bike is over on the next frame and settled within about four", () => {
    const amp = 0.5;
    expect(wobble(FRAME, amp)).toBeGreaterThan(amp * 0.5);
    expect(Math.abs(wobble(5 * FRAME, amp))).toBeLessThan(amp * 0.15);
    expect(wobble(1, amp)).toBe(0);
  });

  it("a blow tilts the victim away from the striker, and rocks the striker", () => {
    const r = race();
    const [a, b] = [rider(r, 0), rider(r, 1)];
    Object.assign(a, { z: 500, x: 0, speed: 30 });
    Object.assign(b, { z: 500, x: 1.0, speed: 30 });
    beginAttack(r, a, "hand");
    for (let i = 0; i < 30 && !r.events.some((e) => e.kind === "hit"); i++) steps(r, 1);
    const hit = r.events.find((e) => e.kind === "hit")!;
    expect(hit).toBeTruthy();
    const felt = react(hit, r.riders, 0);
    const tilt = (id: number): number => felt.tilt.find((t) => t.id === id)!.amp;
    // the victim is on the striker's right (+x is right on the road, as
    // steering right makes it), so goes over to its own right
    expect(tilt(1)).toBeGreaterThan(0.3);
    expect(Math.abs(tilt(0))).toBeGreaterThan(0.1);
    expect(Math.abs(tilt(0))).toBeLessThan(Math.abs(tilt(1)));
  });

  it("every touch is heard by the rider in it, softer from further off", () => {
    const r = race();
    Object.assign(rider(r, 0), { z: 500, x: 0, speed: 40, vx: 3 });
    Object.assign(rider(r, 1), { z: 500, x: 0.7, speed: 40, vx: 0 });
    steps(r, 1);
    const e = bumps(r)[0];
    const near = react(e, r.riders, 0).sound!;
    expect(near.kind).toBe("bump");
    expect(near.gain).toBeGreaterThan(0.3);
    // a third rider 40 m back hears it, quieter; one 100 m back does not
    r.riders.push({ ...rider(r, 0), id: 5, z: 460 }, { ...rider(r, 0), id: 6, z: 400 });
    expect(react(e, r.riders, 5).sound!.gain).toBeLessThan(near.gain);
    expect(react(e, r.riders, 6).sound).toBeNull();
    expect(() => sfx("bump", 0.5)).not.toThrow();
  });

  it("a car glanced is knocked, and the bike tilts off it", () => {
    const e: RaceEvent = { t: 1, kind: "bump", rider: 0, other: 7, with: "car", hard: 0.5, from: 2 };
    const r = race(1);
    Object.assign(rider(r, 0), { x: 1 });
    const felt = react(e, r.riders, 0);
    expect(felt.car?.id).toBe(7);
    // the car is on the right (+x): over to the left
    expect(felt.tilt[0].amp).toBeLessThan(-0.3);
    expect(felt.sound?.kind).toBe("carBump");
  });

  it("thrown over a car or off a tree flies high, while a rub or a wall is a slide", () => {
    const r = race();
    const crash = (cause: Extract<RaceEvent, { kind: "crash" }>["cause"]): number | null => react({ t: 1, kind: "crash", rider: 1, cause }, r.riders, 0).launched;
    expect(crash("headOn")).toBe(1);
    expect(crash("rearEnd")).toBe(1);
    expect(crash("tree")).toBe(1);
    expect(crash("rub")).toBeNull();
    expect(crash("wall")).toBeNull();
    expect(TUNE.thrownTime).toBeGreaterThan(1);
  });
});

describe("someone on foot ridden into (C9)", () => {
  it("is thrown, the bike rides on a little slower, and both are told", () => {
    const r = race();
    const [me, them] = [rider(r, 0), rider(r, 1)];
    Object.assign(me, { z: 500, x: 0, speed: 30 });
    Object.assign(them, { z: 501, x: 0.2, speed: 0, phase: "running", phaseT: 0, bikeZ: 530, bikeX: 0 });
    steps(r, 1);
    expect(them.phase).toBe("thrown");
    // flung on at the bike's speed or a little more, and off to the side of
    // it, so they fly up beside it where they can be seen (318.04-318.44)
    expect(them.flung).toBe(true);
    expect(them.speed).toBeGreaterThanOrEqual(me.speed);
    expect(Math.abs(them.vx)).toBeGreaterThan(3);
    // a second and a half later they have come down and fallen behind
    steps(r, 90);
    expect(them.z).toBeLessThan(me.z);
    expect(me.phase).toBe("riding");
    expect(me.speed).toBeLessThan(30);
    const e = r.events.find((x) => x.kind === "runOver")!;
    expect(e).toMatchObject({ by: 0, on: 1 });
    // the bike hops for four frames, then goes over hard; it is heard
    const felt = react(e, r.riders, 0);
    expect(felt.hop).toEqual({ id: 0, size: 1 });
    expect(felt.flung).toBe(1);
    expect(hopLift(HOP / 2)).toBeGreaterThan(0.5);
    expect(hopLift(HOP + 0.01)).toBe(0);
    expect(Math.abs(felt.tilt[0].amp)).toBeGreaterThan(0.4);
    expect(felt.tilt[0].after).toBe(HOP);
    expect(felt.sound?.kind).toBe("runOver");
  });

  it("is not thrown again while still in the air from the first time", () => {
    const r = race();
    const [me, them] = [rider(r, 0), rider(r, 1)];
    Object.assign(me, { z: 500, x: 0, speed: 30 });
    Object.assign(them, { z: 501, x: 0, speed: 0, phase: "running", phaseT: 0, bikeZ: 530, bikeX: 0 });
    steps(r, 20);
    expect(r.events.filter((x) => x.kind === "runOver").length).toBe(1);
  });
});

describe("thrown off, a rider flies over the road as it is (M2)", () => {
  /**
   * Run into the back of a slow car at 40 m/s at the top of a crest (hump
   * positive), the bottom of a dip (negative) or on the flat, the road
   * turning over in 100 m either side; how long in the air, how high above
   * the road at most.
   */
  const throw_ = (hump: number, grade = 0): { air: number; top: number } => {
    const road = bake("hump", [{ length: 1400, curve: 0, climb: grade * 1400 }, { length: 100, curve: 0, climb: hump }, { length: 100, curve: 0, climb: -hump }, { length: 1400, curve: 0, climb: grade * 1400 }], 3000, 1);
    const r = startRace({ ...road, scenery: [] }, 1, [{ id: 0, name: "h", human: true }], 5);
    r.riders = r.riders.filter((x) => !x.cop);
    const me = rider(r, 0);
    Object.assign(me, { z: 1494, x: LANES.with[0], speed: 40, build: 1 });
    r.cars = [{ id: 1, kind: "sedan", z: 1499, x: LANES.with[0], lane: LANES.with[0], dir: 1, speed: 10, changeT: 99 }];
    for (let i = 0; i < 20 && me.phase === "riding"; i++) steps(r, 1);
    expect(me.phase).toBe("thrown");
    let air = 0;
    let top = 0;
    while (me.phase === "thrown" && me.air > 0 && air < 5) {
      steps(r, 1);
      air += 1 / 60;
      top = Math.max(top, me.air);
    }
    expect(me.air).toBe(0);
    return { air, top };
  };

  it("thrown off over a crest a rider flies longer, and into a rise comes down sooner (M2)", () => {
    const flat = throw_(0);
    const crest = throw_(20);
    const dip = throw_(-20);
    // on the flat about the recording's 1.25 s (454.25-455.50), over a car.
    // Measured: 1.35 s and 2.67 m up on the flat, 1.40 s and 2.89 m over the
    // crest, 1.28 s and 2.47 m into the dip. Thrown over a car a rider keeps
    // half the closing speed, so covers about 15 m in the air, and the road
    // turns only so far under them in that
    expect(flat.air).toBeGreaterThan(0.9);
    expect(flat.air).toBeLessThan(1.6);
    expect(crest.air).toBeGreaterThan(flat.air);
    expect(crest.top).toBeGreaterThan(flat.top + 0.15);
    expect(dip.air).toBeLessThan(flat.air);
    expect(dip.top).toBeLessThan(flat.top - 0.15);
    // an even slope, up or down, flies as the flat does: the rider leaves
    // along it, and it stays the same distance under them
    expect(throw_(0, 0.1).air).toBeCloseTo(flat.air, 1);
    expect(throw_(0, -0.1).air).toBeCloseTo(flat.air, 1);
  });

  it("a slide is a short low tumble, and a car hit harder throws higher", () => {
    expect(TUNE.popSlide).toBeLessThan(TUNE.popMin);
    expect(TUNE.popPerSpeed * 40).toBeGreaterThan(TUNE.popMin);
  });
});
