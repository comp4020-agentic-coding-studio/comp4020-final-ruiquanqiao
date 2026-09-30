import { describe, expect, it } from "vitest";
import { drawFrame, makeView } from "../game/render.ts";
import { NO_INPUT, startRace, step } from "../game/sim.ts";
import { SEGMENT, makeTrack } from "../game/track.ts";

// The renderer is a pure function into a pixel array, so what the road does on
// screen can be measured in pixels, the unit a player would complain in.

const asphalt = (p: number): boolean => {
  const r = p & 255;
  const g = (p >> 8) & 255;
  return Math.abs(r - g) < 8 && r > 80 && r < 100;
};

/** Centre of the asphalt on one row of the frame. */
function roadCentre(px: Uint32Array, w: number, row: number): number {
  let first = -1;
  let last = -1;
  for (let x = 0; x < w; x++) {
    if (asphalt(px[row * w + x])) {
      if (first < 0) first = x;
      last = x;
    }
  }
  return (first + last) / 2;
}

describe("the road on screen", () => {
  it("does not jump sideways when the camera crosses a segment in a bend", () => {
    // Without the part-segment correction this sawtoothed by 10px at every
    // segment boundary, 60 times a second at speed.
    const track = makeTrack(1);
    const race = startRace(track, 1, [{ id: 0, name: "me", human: true }], 1);
    const me = race.riders[0];
    let bend = 0;
    for (let i = 0; i < track.segments; i++) {
      if (Math.abs(track.curve[i]) > 0.008) {
        bend = i * SEGMENT;
        break;
      }
    }
    me.z = bend + 40;
    me.speed = 45;
    const v = makeView(480, 270);
    const centres: number[] = [];
    for (let i = 0; i < 40; i++) {
      step(race, new Map([[0, { ...NO_INPUT, throttle: true }]]));
      me.x = 0;
      drawFrame(v, { track, riders: race.riders, me: 0, t: race.t });
      centres.push(roadCentre(v.px, v.w, 130));
    }
    const jumps = centres.slice(1).map((c, i) => Math.abs(c - centres[i]));
    expect(Math.max(...jumps)).toBeLessThanOrEqual(1);
  });

  it("fills every row below the horizon, with no seam between segments", () => {
    const track = makeTrack(1);
    const race = startRace(track, 1, [{ id: 0, name: "me", human: true }], 1);
    // on the flat straight at the start, with no rider in the way: every row
    // of the road's own centre is asphalt or centre line. A seam is a row the
    // road never painted, which shows the far ridge through it; rounding one
    // segment edge down and the next up left one every few rows.
    const me = race.riders[0];
    me.z = 120;
    me.x = 0;
    const v = makeView(480, 270);
    drawFrame(v, { track, riders: [{ ...me, phase: "thrown", z: -50, bikeZ: -50 }], me: 0, t: 0 });
    const line = (p: number): boolean => (p & 255) > 150 && ((p >> 8) & 255) > 120 && ((p >> 16) & 255) < 120;
    const bad: number[] = [];
    for (let y = Math.round(v.h * 0.5); y < v.h; y++) {
      const p = v.px[y * v.w + v.w / 2 + 3];
      if (!asphalt(p) && !line(p)) bad.push(y);
    }
    expect(bad).toEqual([]);
  });

  it("draws at a phone's shape as well as a desktop's", () => {
    const track = makeTrack(1);
    const race = startRace(track, 1, [{ id: 0, name: "me", human: true }], 1);
    for (const [w, h] of [[480, 270], [180, 270], [620, 270]]) {
      const v = makeView(w, h);
      drawFrame(v, { track, riders: race.riders, me: 0, t: 0 });
      expect(v.px.every((p) => p !== 0), `${w}x${h} left a pixel unpainted`).toBe(true);
    }
  });
});
