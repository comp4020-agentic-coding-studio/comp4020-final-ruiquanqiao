import { describe, expect, it } from "vitest";
import { BIKE, NO_INPUT, ride, separate, startRace, step } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

// Bikes are solid. Before this, contact was checked over 1.8 m against a bike
// 2.1 m long and only ever pushed sideways, so bodies overlapped in 7.5% of
// the steps of a full race, by up to 0.26 m; and a browser's predicted rider
// ignored every other bike and rode straight through them.

describe("contact between bikes", () => {
  it("never leaves two bikes overlapping, at any step of a full-field race", () => {
    const track = makeTrack(1);
    const entrants = [{ id: 0, name: "me", human: true }];
    for (let i = 1; i < 15; i++) entrants.push({ id: i, name: `ai${i}`, human: false });
    const race = startRace(track, 1, entrants, 7);
    let overlaps = 0;
    for (let i = 0; i < 60 * 90; i++) {
      step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
      const riding = race.riders.filter((r) => r.phase === "riding");
      for (let a = 0; a < riding.length; a++) {
        for (let b = a + 1; b < riding.length; b++) {
          const dz = Math.abs(riding[a].z - riding[b].z);
          const dx = Math.abs(riding[a].x - riding[b].x);
          if (dz < BIKE.length - 0.01 && dx < BIKE.width - 0.01) overlaps++;
        }
      }
    }
    expect(overlaps).toBe(0);
  });

  it("stops a predicted rider at the back of a slower bike instead of passing through it", () => {
    const track = makeTrack(1);
    const race = startRace(track, 1, [{ id: 0, name: "me", human: true }, { id: 1, name: "them", human: true }], 1);
    const [me, them] = race.riders;
    me.x = them.x = 0;
    me.z = 100;
    them.z = 104;
    me.speed = 40;
    them.speed = 20;
    // what the browser does each step: its own physics, then the other bikes
    for (let i = 0; i < 60; i++) {
      ride(me, { ...NO_INPUT, throttle: true }, track);
      them.z += them.speed / 60;
      separate(me, them, 1);
      expect(me.z).toBeLessThanOrEqual(them.z - BIKE.length + 1e-9);
    }
  });

  it("pushes bikes that rub side by side apart sideways, not lengthways", () => {
    const track = makeTrack(1);
    const race = startRace(track, 1, [{ id: 0, name: "a", human: true }, { id: 1, name: "b", human: true }], 1);
    const [a, b] = race.riders;
    a.z = b.z = 200;
    a.x = 0;
    b.x = 0.5;
    expect(separate(a, b)).toBe("side");
    expect(b.x - a.x).toBeCloseTo(BIKE.width, 6);
    expect(a.z).toBe(200);
  });
});
