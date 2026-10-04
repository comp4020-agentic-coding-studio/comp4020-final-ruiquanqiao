// The lie of the land either side of the road, as pure arithmetic so it can
// be held to its rules in Node (spec/terrain.test.ts) and the browser only
// turns it into meshes.
//
// Height is given relative to the road at the same z: the land is shaped
// around the road rather than the road laid over the land. The first version
// had one flat plain following the camera at a fixed depth under the road,
// and from 389 of 853 camera positions on the level 1 road that plain stood
// above the road somewhere ahead - a hill rising across the road that the
// bike then rode straight through. Measured from the road, the land cannot
// do that: within the shoulder it is always below the asphalt.

import { BIOMES, type Biome, SEGMENT, SHOULDER, type Track, segmentAt } from "./track.ts";

/** Metres of road over which one country blends into the next. */
const BLEND = 160;

const mixes = new WeakMap<Track, Float32Array>();

/** Per segment, how much of each biome the land there is (sums to 1). */
export function biomeMix(track: Track): Float32Array {
  let m = mixes.get(track);
  if (m) return m;
  const n = track.segments;
  const k = BIOMES.length;
  const raw = new Float32Array(n * k);
  for (let i = 0; i < n; i++) raw[i * k + track.biome[i]] = 1;
  // a box blur along the road, a running sum per biome
  const half = Math.round(BLEND / SEGMENT / 2);
  m = new Float32Array(n * k);
  for (let b = 0; b < k; b++) {
    let sum = 0;
    let count = 0;
    for (let i = -half; i < n + half; i++) {
      const add = i + half;
      if (add >= 0 && add < n) {
        sum += raw[add * k + b];
        count++;
      }
      const drop = i - half - 1;
      if (drop >= 0 && drop < n) {
        sum -= raw[drop * k + b];
        count--;
      }
      if (i >= 0 && i < n) m[i * k + b] = sum / count;
    }
  }
  mixes.set(track, m);
  return m;
}

// a smooth value noise, seeded by position only, so every browser agrees
const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
export function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const ramp = (from: number, to: number, x: number): number => smooth(Math.min(1, Math.max(0, (x - from) / (to - from))));

/**
 * One country's ground at distance d beyond the centre line on `side`, z
 * metres along. Each matches where its walls stand in track.ts: a cliff or a
 * shopfront begins exactly where the bike is stopped.
 */
function shape(b: Biome, d: number, side: number, z: number): number {
  const far = noise(z / 260 + side * 17, d / 260);
  const rough = noise(z / 23 + side * 5, d / 23) - 0.5;
  switch (b) {
    case "alpine": {
      // a gentle bank off the shoulder, then the forest floor rising to hills
      const bank = Math.min(1, (d - SHOULDER) / 20) * (1.2 + 0.8 * Math.sin(z / 170 + side));
      return bank + ramp(40, 500, d) * (25 + 70 * far) + rough * ramp(15, 60, d) * 3;
    }
    case "valley":
      // flat fields running out to low rolling hills
      return Math.min(1, (d - SHOULDER) / 30) * 0.6 + ramp(60, 700, d) * (8 + 30 * far) + rough * ramp(30, 90, d) * 1.5;
    case "coast":
      if (side < 0) {
        // the cliff: straight up from the verge, then the headland above
        const foot = SHOULDER + 1.5;
        return ramp(foot - 0.5, foot + 9, d) * (24 + 10 * far) + ramp(foot + 9, 250, d) * (30 + 40 * far) + rough * ramp(foot, foot + 6, d) * 4;
      }
      // the sea side: a drop behind the rail into the water
      return -ramp(SHOULDER + 0.5, SHOULDER + 22, d) * 16 - ramp(40, 400, d) * 10;
    case "town":
      // level ground under the buildings and behind them
      return ramp(70, 500, d) * (6 + 20 * far);
    case "canyon": {
      const foot = SHOULDER + 2.5;
      return ramp(foot - 0.5, foot + 10, d) * (32 + 12 * far) + ramp(foot + 10, 220, d) * (25 + 45 * far) + rough * ramp(foot, foot + 8, d) * 5;
    }
  }
}

/** Ground height relative to the road at road coordinate (z, x). */
export function groundAt(track: Track, z: number, x: number): number {
  const d = Math.abs(x);
  if (d <= SHOULDER) return -0.05;
  const side = Math.sign(x);
  const m = biomeMix(track);
  const i = segmentAt(track, z);
  const k = BIOMES.length;
  let h = 0;
  for (let b = 0; b < k; b++) {
    const w = m[i * k + b];
    if (w > 0.001) h += w * shape(BIOMES[b], d, side, z);
  }
  // never above the shoulder's own level until clear of it: the land meets
  // the road at the road's height, not over it
  return Math.max(-60, d < SHOULDER + 0.5 ? Math.min(h, -0.05) : h);
}

/** How rocky the ground is there, 0 to 1, for the texture (cliffs and walls). */
export function rockAt(track: Track, z: number, x: number): number {
  const d = Math.abs(x);
  const step = 3;
  const slope = Math.abs(groundAt(track, z, x + Math.sign(x) * step) - groundAt(track, z, x)) / step;
  return Math.min(1, Math.max(0, (slope - 0.45) * 2.5)) * (d > SHOULDER ? 1 : 0);
}
