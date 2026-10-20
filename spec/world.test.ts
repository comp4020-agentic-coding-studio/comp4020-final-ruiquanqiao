import { describe, expect, it } from "vitest";
import { NO_INPUT, type Input, TUNE, startRace, step } from "../game/sim.ts";
import { centreline, frameAt } from "../game/world.ts";
import { LEVEL_LENGTH, ROADS, ROAD_HALF, SEGMENT, bake, curveAt, makeTrack } from "../game/track.ts";

// The 3D scene is built on these numbers, so they are checked in metres here
// rather than by looking at a picture.

describe("the road in the world", () => {
  it("turns right in a right-hand bend: the rider's right is where the road goes", () => {
    const track = bake("test", [{ length: 400, curve: 1 / 100, climb: 0 }], 400, 1);
    const a = frameAt(track, 50);
    const b = frameAt(track, 150);
    const dx = b.px - a.px;
    const dz = b.pz - a.pz;
    // the displacement has a positive component along the rider's right
    expect(dx * a.rx + dz * a.rz).toBeGreaterThan(0);
  });

  it("keeps a constant bend on its circle", () => {
    const r = 120;
    const track = bake("circle", [{ length: 2 * Math.PI * r, curve: 1 / r, climb: 0 }], 2 * Math.PI * r, 1);
    // the easing leaves the ends straighter; measure the middle half, where
    // the curvature is at its full value: every point is r from one centre
    const pts = [];
    for (let z = track.length * 0.3; z < track.length * 0.7; z += 20) pts.push(frameAt(track, z));
    const p = pts[0];
    const cx = p.px + p.rx * r;
    const cz = p.pz + p.rz * r;
    for (const q of pts) expect(Math.hypot(q.px - cx, q.pz - cz)).toBeCloseTo(r, 0);
  });

  it("is continuous: one metre along the road is one metre in the world", () => {
    const track = makeTrack(1);
    for (let z = 0; z < track.length - 1; z += 37) {
      const a = frameAt(track, z);
      const b = frameAt(track, z + 1);
      expect(Math.hypot(b.px - a.px, b.pz - a.pz)).toBeGreaterThan(0.99);
      expect(Math.hypot(b.px - a.px, b.pz - a.pz)).toBeLessThan(1.01);
    }
  });

  it("puts x metres across the road x metres from the centre line", () => {
    const track = makeTrack(1);
    const c = frameAt(track, 1000, 0);
    const side = frameAt(track, 1000, 6);
    expect(Math.hypot(side.px - c.px, side.pz - c.pz)).toBeCloseTo(6, 6);
    expect(centreline(track).x.length).toBe(track.segments + 1);
    void SEGMENT;
  });
});

// The length of a race (T2). Every road was 3.7-5 km of bends repeated out to
// the level's length: twice round at level 1, four times at level 5, and the
// level 5 race was six minutes. Now each road is written out for its longest
// race, and every race is about two minutes.
describe("the roads", () => {
  it("never comes round the same bends twice in a race, at any level", () => {
    for (const road of ROADS) {
      const written = road.sections.reduce((n, s) => n + s.length, 0);
      expect(written, road.name).toBeGreaterThanOrEqual(Math.max(...LEVEL_LENGTH));
    }
  });

  it("never comes back within 300 m of itself", () => {
    // measured: 356-373 m at the closest, every road at level 5, between
    // points 400 m apart along it, so a bend is all that ever comes close
    ROADS.forEach((road, i) => {
      const c = centreline(makeTrack(5, i));
      for (let a = 0; a < c.x.length; a += 10) {
        for (let b = a + 100; b < c.x.length; b += 10) expect(Math.hypot(c.x[a] - c.x[b], c.z[a] - c.z[b]), road.name).toBeGreaterThan(300);
      }
    });
  });

  it("is ridden clean, flat out, inside two minutes on every road at every level", () => {
    // measured: 114-115 s on all 25, alone on the road, keeping right
    for (let level = 1; level <= 5; level++) {
      ROADS.forEach((_, i) => {
        const track = makeTrack(level, i);
        const race = startRace(track, level, [{ id: 0, name: "me", human: true }], 7);
        race.cars = [];
        race.riders = race.riders.filter((r) => !r.cop);
        const me = race.riders[0];
        while (me.phase !== "finished" && race.t < 300) {
          const input: Input = { ...NO_INPUT, throttle: true };
          // from level 4 the right lane meets a roadblock (P5): take its sand mound
          const block = track.roadblocks.find((k) => k.z - me.z > -5 && k.z - me.z < 200);
          const aim = block ? ROAD_HALF - block.mound / 2 : 3.5;
          const want = aim - me.x + TUNE.centrifugal * me.speed * me.speed * curveAt(track, me.z + me.speed * 0.8) * 0.35;
          input.right = want > 0.3;
          input.left = want < -0.3;
          step(race, new Map([[0, input]]));
        }
        expect(me.phase, `level ${level} road ${i}`).toBe("finished");
        expect(race.t).toBeGreaterThan(100);
        expect(race.t).toBeLessThan(120);
      });
    }
  });
});
