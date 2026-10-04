import { describe, expect, it } from "vitest";
import { sfx } from "../client/audio.ts";
import { react, wobble } from "../client/feel.ts";
import { CAR, LANES, NO_INPUT, type Race, type RaceEvent, type Rider, TUNE, beginAttack, startRace, step } from "../game/sim.ts";
import { makeTrack, wallAt } from "../game/track.ts";

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
  for (const c of r.riders.filter((x) => x.cop)) c.z = 1e6;
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
    // and says where the shove came from: the rider's left (+x is left)
    expect(bumps(r)[0].from).toBeLessThan(rider(r, 1).x);
  });

  it("a shunt from behind, on the rider in front", () => {
    const r = race();
    Object.assign(rider(r, 0), { z: 500, x: 0, speed: 45 });
    Object.assign(rider(r, 1), { z: 501.8, x: 0, speed: 30 });
    steps(r, 1);
    expect(bumps(r)[0]).toMatchObject({ rider: 1, other: 0, with: "rider" });
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
    // the victim is on the striker's left (+x), so goes over to its own left
    expect(tilt(1)).toBeLessThan(-0.3);
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
    // the car is on the left (+x): over to the right
    expect(felt.tilt[0].amp).toBeGreaterThan(0.3);
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
