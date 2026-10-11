import { describe, expect, it } from "vitest";
import { BIKES, DT, type Input, KMH, NO_INPUT, type Race, cap, startRace, step, topSpeed } from "../game/sim.ts";
import { ROADS, SHOULDER, bake, makeTrack } from "../game/track.ts";

// The handling, written down as numbers once ridden, so a later change that
// loses it goes red (CLAUDE.md, "Feel is tuned by riding"). The targets are
// read off a recorded PC race at 25 fps (docs/road-rash-feel.md).

const straight = bake("straight", [{ length: 30000, curve: 0, climb: 0 }], 30000, 1);

/** One rider alone on the road: no traffic, no cops, nothing on the verge. */
function rider(level: number, track = straight): Race {
  const race = startRace({ ...track, scenery: [] }, level, [{ id: 0, name: "me", human: true }], 1);
  race.cars = [];
  race.riders = race.riders.filter((r) => !r.cop);
  return race;
}

/** Hold keys for some seconds; return the rider afterwards. */
function hold(race: Race, keys: Partial<Input>, seconds: number): Race["riders"][number] {
  const input = { ...NO_INPUT, ...keys };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(race, new Map([[0, input]]));
  }
  return race.riders.find((r) => r.id === 0)!;
}

const timeTo = (level: number, kmh: number): number => {
  const race = rider(level);
  const me = race.riders.find((r) => r.id === 0)!;
  while (me.speed < kmh * KMH && race.t < 60) step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
  return race.t;
};

describe("speed, against the original's dial", () => {
  it("pulls from the grid to 250 km/h in about five and a half seconds", () => {
    // the original: 0 to 250 in 5.5 s (t 4.0-9.4 of the recording)
    const t = timeTo(3, 250);
    expect(t).toBeGreaterThan(4.5);
    expect(t).toBeLessThan(7);
  });

  it("cruises at 280-290 km/h once the speed has built up", () => {
    const me = hold(rider(3), { throttle: true }, 25);
    expect(me.speed / KMH).toBeGreaterThan(280);
    expect(me.speed / KMH).toBeLessThan(300);
  });

  it("never goes past the bike's top speed on the throttle alone", () => {
    // there is no nitro (R8): a rider who had just been passed used to come
    // back past on a burst 35 km/h over the bike's top, which nobody could see
    for (let level = 1; level <= 5; level++) {
      const race = rider(level);
      let fastest = 0;
      for (let i = 0; i < 40 / DT; i++) {
        step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
        fastest = Math.max(fastest, race.riders[0].speed);
      }
      expect(fastest).toBeLessThanOrEqual(topSpeed(race.riders[0]) + 1e-9);
      expect(fastest / KMH).toBeGreaterThan(BIKES[level - 1].topKmh - 1);
    }
  });

  it("puts everyone in a race on an equally good bike, people and AI alike", () => {
    for (let level = 1; level <= 5; level++) {
      ROADS.forEach((_, road) => {
        const field = Array.from({ length: 15 }, (_, id) => ({ id, name: `r${id}`, human: id < 4 }));
        const race = startRace(makeTrack(level, road), level, field, 7 + road);
        const racers = race.riders.filter((r) => !r.cop);
        expect(racers).toHaveLength(15);
        for (const r of racers) {
          expect(r.bike).toBe(racers[0].bike);
          expect(r.lbs).toBe(racers[0].lbs);
          expect(topSpeed(r)).toBe(topSpeed(racers[0]));
          expect(cap(r)).toBe(cap(racers[0]));
        }
      });
    }
  });

  it("is ridden at about 190 km/h on the dirt shoulder", () => {
    const race = rider(3);
    hold(race, { throttle: true }, 12);
    const me = race.riders.find((r) => r.id === 0)!;
    me.x = SHOULDER - 1;
    hold(race, { throttle: true }, 4);
    expect(me.speed / KMH).toBeGreaterThan(180);
    expect(me.speed / KMH).toBeLessThan(200);
  });
});

describe("walls", () => {
  it("scrapes a bike glancing along the coast's cliff, and crashes one ridden into it square", () => {
    const coast = makeTrack(1, 1); // Seawall Highway: cliff on the left from the start
    const glance = rider(3, coast);
    hold(glance, { throttle: true }, 6);
    const me = glance.riders.find((x) => x.id === 0)!;
    me.x = -SHOULDER - 0.8;
    me.vx = -2.5;
    const before = me.speed;
    hold(glance, { throttle: true }, 0.5);
    expect(me.phase).toBe("riding");
    expect(me.x).toBeGreaterThanOrEqual(-(SHOULDER + 1.5));
    expect(me.speed).toBeLessThan(before);
    // square on: full steer into it at speed is a crash
    const square = rider(3, coast);
    hold(square, { throttle: true }, 6);
    const r = square.riders.find((x) => x.id === 0)!;
    r.x = -SHOULDER;
    r.vx = -8.5;
    hold(square, { throttle: true, left: true }, 0.5);
    expect(square.events.some((e) => e.kind === "crash" && e.cause === "wall")).toBe(true);
  });
});
