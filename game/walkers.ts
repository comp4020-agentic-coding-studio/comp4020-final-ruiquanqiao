// People on foot (ledger T6, H3): a flagger in front of the grid, people
// crossing at the side roads and in town, and people strolling along the
// pavement. Each keeps a timetable fixed by the road and the race clock, so
// the server and every browser put them in the same place without a word on
// the wire; only being knocked flying is news, and that comes as an event.
// Pure, so the spec holds it without a page.

import { SHOULDER, type Track, biomeAt } from "./track.ts";

/** a bike and a person on foot meet when they are this close, m, as a rider on foot is (C9) */
const REACH = { z: (2.1 + 0.6) / 2, x: (0.8 + 0.6) / 2 };

/**
 * A bike at (z, x) going `speed` meets whoever is standing there at race time
 * `t`: they go flying, up and on ahead of it, and the one it meets is
 * returned. The bike's own jump is the caller's (R11: a pedestrian is a ramp).
 */
export function knockWalker(walkers: Walker[], t: number, z: number, x: number, speed: number): Walker | null {
  if (speed < 3) return null;
  for (const w of walkers) {
    if (Math.abs(w.z - z) > 80) continue;
    if (w.down >= 0 && t - w.down < DOWN_FOR) continue;
    const p = walkerAt(w, t);
    if (Math.abs(p.z - z) > REACH.z || Math.abs(p.x - x) > REACH.x) continue;
    w.down = t;
    w.hitSpeed = Math.min(speed * 1.1, speed + 6);
    w.side = p.x >= x ? 1 : -1;
    // thrown from where they stood when hit
    w.hit = { z: p.z, x: p.x };
    return w;
  }
  return null;
}

export type Walker = {
  /** 9000 and up, never a rider's id */
  id: number;
  kind: "flagger" | "crosser" | "stroller";
  /** where it stands to begin with */
  z: number;
  x: number;
  /** metres it walks: across the road for a crosser, along it for a stroller */
  span: number;
  /** seconds it stands at each end */
  wait: number;
  /** seconds into its timetable at race time 0 */
  phase: number;
  /** which clothes, an index the scene picks colours by */
  look: number;
  /** race time it was knocked flying, or -1 */
  down: number;
  /** the speed and side (+1 right) it was thrown at */
  hitSpeed: number;
  side: number;
  /** where it stood when it was hit */
  hit?: { z: number; x: number };
};

export const WALK = 1.4; // m/s, a walking pace
/** seconds a pedestrian knocked flying stays down before it is back on its feet */
export const DOWN_FOR = 10;
export const WALKER_ID = 9000;

export type WalkerPose = { z: number; x: number; air: number; state: "stand" | "walk" | "flag" | "thrown" | "lying"; heading: number };

/**
 * Everyone on foot for a race on `track` with `entrants` on the grid. The
 * flagger stands on the centre line 7 m in front of the front row, where
 * "every start" the bike behind him runs him over (CJH). The rest are fixed by
 * the road, the same every race on it.
 */
export function placeWalkers(track: Track, entrants: number): Walker[] {
  const out: Walker[] = [];
  let id = WALKER_ID;
  let s = (track.id * 7919 + 17) >>> 0;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const add = (w: Omit<Walker, "id" | "look" | "down" | "hitSpeed" | "side">): void => {
    out.push({ ...w, id: id++, look: Math.floor(rand() * 6), down: -1, hitSpeed: 0, side: 1 });
  };
  const front = 10 + Math.ceil(entrants / 3) * 6;
  add({ kind: "flagger", z: front + 7, x: 0, span: SHOULDER + 1.5, wait: 0, phase: 0 });
  const kerb = SHOULDER + 1.2;
  // two at each side road, on the zebra each side of it (T5)
  for (const c of track.crossings) {
    for (const dz of [-5, 5]) add({ kind: "crosser", z: c + dz, x: (rand() < 0.5 ? -1 : 1) * kerb, span: 2 * kerb, wait: 6 + rand() * 10, phase: rand() * 60 });
  }
  // in town: someone strolling the pavement every 120-200 m, and someone
  // crossing the street every 500-800 m, never in the first 300
  for (let z = 300; z < track.length - 100; z += 120 + rand() * 80) {
    if (biomeAt(track, z) !== "town") continue;
    add({ kind: "stroller", z, x: (rand() < 0.5 ? -1 : 1) * (kerb + rand() * 1.5), span: 20 + rand() * 30, wait: 2 + rand() * 6, phase: rand() * 60 });
  }
  for (let z = 300; z < track.length - 100; z += 500 + rand() * 300) {
    if (biomeAt(track, z) !== "town" || track.crossings.some((c) => Math.abs(c - z) < 30)) continue;
    add({ kind: "crosser", z, x: (rand() < 0.5 ? -1 : 1) * kerb, span: 2 * kerb, wait: 8 + rand() * 12, phase: rand() * 60 });
  }
  return out;
}

/** Where a walker is at race time `t`, and what it is doing. */
export function walkerAt(w: Walker, t: number): WalkerPose {
  const dt = t - w.down;
  if (w.down >= 0 && dt >= 0 && dt < DOWN_FOR) {
    // flung up and on ahead of the bike, as a rider run over is (C9), then lying where they came down
    const at = w.hit ?? onFoot(w, w.down);
    const k = 1.4;
    const air = Math.max(0, 0.5 + 4 * dt - 4.9 * dt * dt);
    return { z: at.z + (w.hitSpeed * (1 - Math.exp(-k * dt))) / k, x: at.x + w.side * 3 * Math.min(dt, 0.9), air, state: air > 0 ? "thrown" : "lying", heading: 0 };
  }
  return onFoot(w, t);
}

function onFoot(w: Walker, t: number): WalkerPose {
  if (w.kind === "flagger") {
    // the flag over the count, then off to the left verge at the go (H3)
    if (t < 0) return { z: w.z, x: w.x, air: 0, state: "flag", heading: Math.PI };
    // the flag comes down with the go and he stands a second longer, so a
    // bike off the front row at full throttle reaches him (CJH: "every start")
    if (t < 1.2) return { z: w.z, x: w.x, air: 0, state: "stand", heading: Math.PI };
    const d = Math.min(w.span, (t - 1.2) * WALK);
    return { z: w.z, x: w.x - d, air: 0, state: d < w.span ? "walk" : "stand", heading: -Math.PI / 2 };
  }
  // there and back: stand, walk the span, stand, walk back
  const go = w.span / WALK;
  const period = 2 * (w.wait + go);
  const u = (((t + w.phase) % period) + period) % period;
  const way = w.kind === "crosser" ? -Math.sign(w.x) : 1;
  let d: number;
  let state: WalkerPose["state"] = "stand";
  let dir = way;
  if (u < w.wait) d = 0;
  else if (u < w.wait + go) {
    d = (u - w.wait) * WALK;
    state = "walk";
  } else if (u < 2 * w.wait + go) {
    d = w.span;
    dir = -way;
  } else {
    d = w.span - (u - 2 * w.wait - go) * WALK;
    state = "walk";
    dir = -way;
  }
  if (w.kind === "crosser") return { z: w.z, x: w.x + way * d, air: 0, state, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  return { z: w.z + d, x: w.x, air: 0, state, heading: dir > 0 ? 0 : Math.PI };
}
