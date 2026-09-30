import { describe, expect, it } from "vitest";
import { centreline, frameAt } from "../game/world.ts";
import { SEGMENT, bake, makeTrack } from "../game/track.ts";

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
