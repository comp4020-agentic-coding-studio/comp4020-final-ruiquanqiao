import { describe, expect, it } from "vitest";
import { DT, NO_INPUT, TUNE, startRace, step } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";
import { startShade } from "../client/feel.ts";

// The start (O1, V16). People were put on the back row behind every AI
// rider, up to 24 m from the front, and the race went at the instant it was
// made: the field launched on step one while a person was still hearing
// "go", and a key pressed 0.5 s late left all 14 AI riders ahead of them 12 s
// in. Now the grid is drawn from the seed, and a countdown runs first during
// which a held throttle launches on the same step as everyone's.

const field = (humans: number) => Array.from({ length: 15 }, (_, i) => ({ id: i, name: `r${i}`, human: i < humans }));

describe("the start", () => {
  it("counts down before anyone moves, then launches a held throttle with the field", () => {
    const race = startRace(makeTrack(1), 1, field(1), 7, TUNE.countdown);
    const me = race.riders.find((r) => r.id === 0)!;
    const ai = race.riders.find((r) => r.id === 1)!;
    const at = race.riders.map((r) => r.z);
    let steps = 0;
    while (race.t < -DT / 2) {
      step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
      steps++;
    }
    expect(steps).toBe(Math.round(TUNE.countdown / DT));
    expect(race.riders.map((r) => r.z)).toEqual(at);
    step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
    expect(me.speed).toBeGreaterThan(0);
    expect(me.speed).toBe(ai.speed);
  });

  it("darkens the picture to about 60% through the count and lifts it within half a second of the go", () => {
    for (const left of [3, 2, 0.5, 0.01]) expect(1 - startShade(left)).toBeCloseTo(0.6, 2);
    expect(startShade(-0.2)).toBeGreaterThan(0);
    expect(startShade(-0.2)).toBeLessThan(0.4);
    expect(startShade(-0.5)).toBe(0);
  });

  it("puts people anywhere on the grid, not always behind the AI riders", () => {
    // over 40 races with one person in a field of fifteen, the person's
    // grid slot (0 the front) covers the whole grid
    const slots = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const race = startRace(makeTrack(1), 1, field(1), seed);
      const order = race.riders.filter((r) => !r.cop).sort((p, q) => q.z - p.z || p.x - q.x);
      slots.add(order.findIndex((r) => r.human));
    }
    expect(Math.min(...slots)).toBeLessThan(3);
    expect(Math.max(...slots)).toBeGreaterThan(11);
    expect(slots.size).toBeGreaterThan(10);
  });
});
