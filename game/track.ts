// A road is a list of sections, baked into fixed-length segments. Everything
// about a road is in road coordinates: z is metres along it, x is metres
// sideways from the centre line (positive to the right), y is height.

export const SEGMENT = 4; // metres per segment
export const ROAD_HALF = 7; // asphalt from -7 m to +7 m: two lanes each way (ledger V9)
export const SHOULDER = 9.5; // dirt out to here, then whatever the country is (V10)
export const MILE = 1609.344;

/**
 * The country a stretch of road runs through (V12, T1). One race passes
 * through several, the way the recorded PC race goes coast, valley, town,
 * farmland, coast, canyon (docs/road-rash-feel.md §7).
 */
export const BIOMES = ["alpine", "coast", "valley", "town", "canyon"] as const;
export type Biome = (typeof BIOMES)[number];

export type Section = {
  /** metres */
  length: number;
  /** curvature in 1/m at the middle of the section; positive bends right */
  curve: number;
  /** metres of climb over the section; negative descends */
  climb: number;
  /** alpine if not given */
  biome?: Biome;
};

export type Scenery = { z: number; x: number; kind: "tree" | "pole" | "sign" | "bush" | "rock" | "lamp" };

/** No wall on that side: open country, ridden into until a tree stops you. */
export const OPEN = 1e9;

export type Track = {
  id: number;
  name: string;
  length: number; // metres
  segments: number;
  curve: Float64Array; // per segment, 1/m
  height: Float64Array; // per segment boundary, m
  biome: Uint8Array; // per segment, an index into BIOMES
  /** per segment: how far from the centre line a solid edge stands on the
   * left (-x) and the right (+x) - a cliff, a canyon wall, a shopfront, a
   * guardrail over the sea - or OPEN */
  wallL: Float64Array;
  wallR: Float64Array;
  /** sea level, for roads that run along a coast; null inland */
  water: number | null;
  scenery: Scenery[];
};

// Sections ease in and out of their curve and their climb, so a bend never
// starts at full curvature. A curve that jumps to its value in one segment is
// a kink the rider feels as a jolt.
const ease = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * Where the edges stand in each country. On the coast the cliff is on the
 * left and the sea, behind a guardrail, on the right, as in the recording.
 */
const WALLS: Record<Biome, [number, number]> = {
  alpine: [OPEN, OPEN],
  valley: [OPEN, OPEN],
  coast: [SHOULDER + 1.5, SHOULDER + 0.4],
  town: [SHOULDER + 3.5, SHOULDER + 3.5],
  canyon: [SHOULDER + 2.5, SHOULDER + 2.5],
};

export function bake(name: string, sections: Section[], length: number, seed: number, id = 0): Track {
  const segments = Math.ceil(length / SEGMENT);
  const curve = new Float64Array(segments);
  const height = new Float64Array(segments + 1);
  const biome = new Uint8Array(segments);

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
      biome[seg] = BIOMES.indexOf(s.biome ?? "alpine");
      // climb follows the same ease, so a crest is rounded rather than a corner
      y += s.climb * (ease((i + 1) / n) - ease(i / n));
    }
    pattern++;
  }
  height[segments] = y;

  const wallL = new Float64Array(segments);
  const wallR = new Float64Array(segments);
  for (let i = 0; i < segments; i++) [wallL[i], wallR[i]] = WALLS[BIOMES[biome[i]]];

  let water: number | null = null;
  for (let i = 0; i < segments; i++) if (BIOMES[biome[i]] === "coast") water = Math.min(water ?? Infinity, height[i] - 7);

  const scenery: Scenery[] = [];
  let r = seed >>> 0;
  const rand = (): number => {
    r = (r * 1664525 + 1013904223) >>> 0;
    return r / 2 ** 32;
  };
  const at = (z: number): Biome => BIOMES[biome[Math.min(segments - 1, Math.max(0, Math.floor(z / SEGMENT)))]];
  const put = (z: number, x: number, kind: Scenery["kind"]): void => {
    // nothing stands inside a wall, or across a biome boundary from where it was meant
    const i = Math.min(segments - 1, Math.max(0, Math.floor(z / SEGMENT)));
    if (x < 0 ? -x > wallL[i] - 0.4 && wallL[i] < OPEN : x > wallR[i] - 0.4 && wallR[i] < OPEN) {
      if (kind !== "tree") return;
    }
    scenery.push({ z, x, kind });
  };
  for (let z = 40; z < length; ) {
    const b = at(z);
    const side = rand() < 0.5 ? -1 : 1;
    if (b === "alpine") {
      // pines in clumps on both sides (V12)
      const base = SHOULDER + 3 + rand() * 22;
      const n = 1 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) put(z + (rand() - 0.5) * 14, side * (base + rand() * 8), "tree");
      z += 25 + rand() * 45;
    } else if (b === "valley") {
      // single broad trees standing in the fields, bushes along the verge
      put(z, side * (SHOULDER + 4 + rand() * 50), "tree");
      if (rand() < 0.35) put(z + 8, side * (SHOULDER + 1.2 + rand() * 2), "bush");
      z += 35 + rand() * 60;
    } else if (b === "coast") {
      // scrub at the foot of the cliff, solid as anything else on the verge;
      // wind-flattened trees up on the cliff top
      if (rand() < 0.5) put(z, -(SHOULDER + 0.6 + rand() * 0.6), "bush");
      if (rand() < 0.5) put(z + 10, -(SHOULDER + 30 + rand() * 40), "tree");
      z += 40 + rand() * 70;
    } else if (b === "town") {
      // street lamps on both kerbs
      put(z, -(SHOULDER + 1.5), "lamp");
      put(z, SHOULDER + 1.5, "lamp");
      z += 40;
    } else {
      // canyon: boulders and scrub fallen to the foot of the walls
      put(z, side * (SHOULDER + 0.8 + rand() * 1.2), rand() < 0.5 ? "rock" : "bush");
      z += 45 + rand() * 80;
    }
  }
  // a telephone line down the left side of open country
  for (let z = 20; z < length; z += 60) {
    const b = at(z);
    if (b === "alpine" || b === "valley") put(z, -(SHOULDER + 1.8), "pole");
  }
  // chevron signs on the outside of every real bend
  for (let z = 0; z < length; z += 36) {
    const k = curve[Math.min(segments - 1, Math.floor(z / SEGMENT))];
    if (Math.abs(k) > 1 / 450) put(z, -Math.sign(k) * (SHOULDER + 0.9), "sign");
  }
  scenery.sort((a, b) => a.z - b.z);

  return { id, name, length, segments, curve, height, biome, wallL, wallR, water, scenery };
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

export const biomeAt = (track: Track, z: number): Biome => BIOMES[track.biome[segmentAt(track, z)]];

/** The solid edge on one side (-1 left, +1 right) at z, metres from the centre. */
export const wallAt = (track: Track, z: number, side: -1 | 1): number => (side < 0 ? track.wallL : track.wallR)[segmentAt(track, z)];

// Five fictional roads (ledger T1), each with a character of its own and
// passing through more than one kind of country. Bends are sized for the
// 280-290 km/h the original cruises at: the tightest is 220 m, which at
// cruise needs the bars held over and leans the bike (R3). Each loop of
// sections turns back to roughly its starting heading, so a road repeated
// out to level 5 length wanders but never crosses itself
// (spec/world.test.ts).
const sec = (length: number, curve: number, climb: number, biome: Biome): Section => ({ length, curve, climb, biome });

export const ROADS: { name: string; sections: Section[] }[] = [
  {
    // a ridge road out of a river valley, climbing through pine
    name: "Ridge Road",
    sections: [
      sec(300, 0, 0, "valley"),
      sec(500, 1 / 400, 8, "valley"),
      sec(300, 0, 14, "alpine"),
      sec(600, -1 / 320, -10, "alpine"),
      sec(250, 0, 20, "alpine"),
      sec(250, 0, -20, "alpine"),
      sec(450, 1 / 240, 0, "alpine"), // the tightening bend: held at speed only by leaning
      sec(350, 0, 6, "alpine"),
      sec(700, -1 / 600, -12, "valley"),
      sec(350, 1 / 280, 12, "alpine"),
      sec(350, -1 / 280, -12, "alpine"),
    ],
  },
  {
    // along the sea under a cliff, through a harbour town and back to the shore
    name: "Seawall Highway",
    sections: [
      sec(400, 0, 0, "coast"),
      sec(600, 1 / 350, 2, "coast"),
      sec(500, -1 / 450, -2, "coast"),
      sec(450, 0, 0, "town"),
      sec(300, 1 / 500, 0, "town"),
      sec(500, -1 / 300, 4, "valley"),
      sec(400, 1 / 600, -4, "valley"),
      sec(600, 1 / 400, 0, "coast"),
      sec(500, -1 / 250, 0, "coast"), // a headland taken hard against the rail
      sec(400, 0, 0, "coast"),
      sec(300, 1 / 1000, 0, "coast"),
    ],
  },
  {
    // farmland and orchards, rolling, with a crossroads town
    name: "Orchard Valley",
    sections: [
      sec(500, 0, 0, "valley"),
      sec(500, -1 / 500, 10, "valley"),
      sec(300, 0, -10, "valley"),
      sec(400, 1 / 300, 6, "valley"),
      sec(600, 0, 0, "town"),
      sec(400, -1 / 350, -6, "valley"),
      sec(300, 0, 15, "valley"),
      sec(300, 0, -15, "valley"),
      sec(500, 1 / 450, 0, "valley"),
      sec(400, -1 / 900, 0, "valley"),
    ],
  },
  {
    // a gold-rush main street, then out into dry rock and back
    name: "Gold Town",
    sections: [
      sec(700, 0, 0, "town"),
      sec(300, 1 / 600, 0, "town"),
      sec(500, -1 / 350, 8, "canyon"),
      sec(400, 1 / 260, 0, "canyon"),
      sec(300, 0, -8, "canyon"),
      sec(500, 0, 0, "valley"),
      sec(600, -1 / 500, 0, "town"),
      sec(400, 1 / 450, 5, "valley"),
      sec(300, 0, -5, "valley"),
    ],
  },
  {
    // red rock walls both sides, opening out to high pine at the top
    name: "Red Canyon",
    sections: [
      sec(400, 0, 0, "canyon"),
      sec(500, 1 / 300, 10, "canyon"),
      sec(400, -1 / 260, 10, "canyon"),
      sec(300, 0, -5, "canyon"),
      sec(500, 1 / 400, 15, "alpine"),
      sec(400, -1 / 350, -15, "alpine"),
      sec(500, -1 / 280, -10, "canyon"),
      sec(400, 1 / 320, -5, "canyon"),
      sec(300, 0, 0, "canyon"),
    ],
  },
];

export const LEVEL_LENGTH_MILES = [5.3, 7.9, 11.0, 12.9, 16.8] as const;

/** A road at a level's length (T2); higher levels run further down the same road (S7). */
export const makeTrack = (level: number, road = 0): Track => {
  const r = ROADS[Math.min(ROADS.length - 1, Math.max(0, road))];
  return bake(r.name, r.sections, LEVEL_LENGTH_MILES[Math.min(5, Math.max(1, level)) - 1] * MILE, 20261006 + road, road);
};
