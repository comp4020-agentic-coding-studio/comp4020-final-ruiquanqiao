// A road is a list of sections, baked into fixed-length segments. Everything
// about a road is in road coordinates: z is metres along it, x is metres
// sideways from the centre line (positive to the right), y is height.

export const SEGMENT = 4; // metres per segment
export const ROAD_HALF = 7; // asphalt from -7 m to +7 m: two lanes each way (ledger V9)
export const SHOULDER = 9.5; // dirt out to here, then meadow and trees (V10)
export const MILE = 1609.344;

export type Section = {
  /** metres */
  length: number;
  /** curvature in 1/m at the middle of the section; positive bends right */
  curve: number;
  /** metres of climb over the section; negative descends */
  climb: number;
};

export type Scenery = { z: number; x: number; kind: "tree" | "pole" | "sign" };

export type Track = {
  name: string;
  length: number; // metres
  segments: number;
  curve: Float64Array; // per segment, 1/m
  height: Float64Array; // per segment boundary, m
  scenery: Scenery[];
};

// Sections ease in and out of their curve and their climb, so a bend never
// starts at full curvature. A curve that jumps to its value in one segment is
// a kink the rider feels as a jolt.
const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

export function bake(name: string, sections: Section[], length: number, seed: number): Track {
  const segments = Math.ceil(length / SEGMENT);
  const curve = new Float64Array(segments);
  const height = new Float64Array(segments + 1);

  let seg = 0;
  let y = 0;
  let pattern = 0;
  while (seg < segments) {
    const s = sections[pattern % sections.length];
    const n = Math.max(1, Math.round(s.length / SEGMENT));
    for (let i = 0; i < n && seg < segments; i++, seg++) {
      const t = (i + 0.5) / n;
      // curvature rises to its value over the first quarter and falls over the last
      const envelope = t < 0.25 ? ease(t / 0.25) : t > 0.75 ? ease((1 - t) / 0.25) : 1;
      curve[seg] = s.curve * envelope;
      height[seg] = y;
      // climb follows the same ease, so a crest is rounded rather than a corner
      y += s.climb * (ease((i + 1) / n) - ease(i / n));
    }
    pattern++;
  }
  height[segments] = y;

  const scenery: Scenery[] = [];
  let r = seed >>> 0;
  const rand = (): number => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 2 ** 32;
  };
  // pines in clumps on both sides (V12)
  for (let z = 40; z < length; z += 25 + rand() * 45) {
    const side = rand() < 0.5 ? -1 : 1;
    const base = SHOULDER + 3 + rand() * 22;
    const n = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) scenery.push({ z: z + (rand() - 0.5) * 14, x: side * (base + rand() * 8), kind: "tree" });
  }
  // a telephone line down the left side
  for (let z = 20; z < length; z += 60) scenery.push({ z, x: -(SHOULDER + 1.8), kind: "pole" });
  // chevron signs on the outside of every real bend
  for (let z = 0; z < length; z += 36) {
    const k = curve[Math.min(segments - 1, Math.floor(z / SEGMENT))];
    if (Math.abs(k) > 1 / 300) scenery.push({ z, x: -Math.sign(k) * (SHOULDER + 0.9), kind: "sign" });
  }
  scenery.sort((a, b) => a.z - b.z);

  return { name, length, segments, curve, height, scenery };
}

export const segmentAt = (track: Track, z: number): number =>
  Math.min(track.segments - 1, Math.max(0, Math.floor(z / SEGMENT)));

export function heightAt(track: Track, z: number): number {
  const zc = Math.min(track.length, Math.max(0, z));
  const i = Math.min(track.segments - 1, Math.floor(zc / SEGMENT));
  const t = zc / SEGMENT - i;
  return track.height[i] + (track.height[i + 1] - track.height[i]) * t;
}

export const curveAt = (track: Track, z: number): number => track.curve[segmentAt(track, z)];

// The first road. Fictional (ledger T1): a ridge road out of a river town,
// climbing through pine, with two long sweepers and one tightening bend. Level
// 1 course length follows the original's ~5.3 miles (ledger T2).
export const ridgeRoad: Section[] = [
  { length: 300, curve: 0, climb: 0 },
  { length: 400, curve: 1 / 350, climb: 6 },
  { length: 250, curve: 0, climb: 12 },
  { length: 500, curve: -1 / 260, climb: -8 },
  { length: 200, curve: 0, climb: 20 },
  { length: 180, curve: 0, climb: -20 },
  { length: 350, curve: 1 / 110, climb: 0 }, // the tightening bend: held at speed only by leaning
  { length: 300, curve: 0, climb: 4 },
  { length: 600, curve: -1 / 500, climb: -10 },
  { length: 220, curve: 1 / 150, climb: 14 },
  { length: 220, curve: -1 / 150, climb: -14 },
];

export const LEVEL_LENGTH_MILES = [5.3, 7.9, 11.0, 12.9, 16.8] as const;

export const makeTrack = (level: number): Track =>
  bake("Ridge Road", ridgeRoad, LEVEL_LENGTH_MILES[level - 1] * MILE, 20261006);
