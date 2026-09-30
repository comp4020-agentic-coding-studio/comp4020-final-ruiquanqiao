// Road coordinates to world coordinates. The simulation lives in (z along the
// road, x across it); the 3D scene needs where that is on the ground. This is
// pure arithmetic over the baked track, so it is tested in Node
// (spec/world.test.ts) and the browser only turns it into meshes.
//
// World axes follow three.js: y up. The road starts at the origin heading +z.
// A rider looking along +z has -x on their right, so a right-hand bend turns
// the heading towards -x.

import { SEGMENT, type Track } from "./track.ts";

export type Frame = {
  /** centre line position */
  px: number;
  py: number;
  pz: number;
  /** unit forward (along the road) */
  fx: number;
  fz: number;
  /** unit right (across the road, towards +x in road coordinates) */
  rx: number;
  rz: number;
  heading: number;
};

export type Centreline = { track: Track; x: Float64Array; z: Float64Array; y: Float64Array; heading: Float64Array };

const lines = new WeakMap<Track, Centreline>();

/** The centre line at every segment boundary, integrated from the curvature. */
export function centreline(track: Track): Centreline {
  let c = lines.get(track);
  if (c) return c;
  const n = track.segments + 1;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const heading = new Float64Array(n);
  for (let i = 0; i < track.segments; i++) {
    const k = track.curve[i];
    // advance along the chord at the mid-segment heading, which keeps a
    // constant bend on its circle rather than spiralling out
    const mid = heading[i] - (k * SEGMENT) / 2;
    x[i + 1] = x[i] + Math.sin(mid) * SEGMENT;
    z[i + 1] = z[i] + Math.cos(mid) * SEGMENT;
    heading[i + 1] = heading[i] - k * SEGMENT;
  }
  c = { track, x, z, y: track.height, heading };
  lines.set(track, c);
  return c;
}

/** Where road coordinate (z, x) is in the world, with the road's frame there. */
export function frameAt(track: Track, z: number, x = 0): Frame {
  const c = centreline(track);
  const zc = Math.min(track.length, Math.max(-50, z));
  // before the start the road runs straight back
  if (zc < 0) {
    const h = c.heading[0];
    return build(Math.sin(h) * zc, c.y[0], Math.cos(h) * zc, h, x);
  }
  const i = Math.min(track.segments - 1, Math.floor(zc / SEGMENT));
  const t = zc / SEGMENT - i;
  const h = c.heading[i] + (c.heading[i + 1] - c.heading[i]) * t;
  return build(
    c.x[i] + (c.x[i + 1] - c.x[i]) * t,
    c.y[i] + (c.y[i + 1] - c.y[i]) * t,
    c.z[i] + (c.z[i + 1] - c.z[i]) * t,
    h,
    x,
  );
}

function build(cx: number, cy: number, cz: number, h: number, x: number): Frame {
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // right = forward × up = (-cos h, 0, sin h)
  const rx = -fz;
  const rz = fx;
  return { px: cx + rx * x, py: cy, pz: cz + rz * x, fx, fz, rx, rz, heading: h };
}
