// The road, drawn the way the original era drew it: each segment ahead of the
// camera is projected to a screen row and the rows between are filled, near to
// far, so a crest hides what is behind it. Everything draws into a plain
// Uint32Array, so the same code renders in the browser and in Node
// (scripts/frame.ts) — CLAUDE.md: if a frame cannot be looked at without a
// browser, it cannot be looked at.

import { type Rider } from "./sim.ts";
import { ROAD_HALF, SEGMENT, SHOULDER, type Track, heightAt } from "./track.ts";

export type View = { w: number; h: number; px: Uint32Array };

export const makeView = (w: number, h: number): View => ({ w, h, px: new Uint32Array(w * h) });

// little-endian RGBA packed into one word, the byte order ImageData uses
export const rgb = (r: number, g: number, b: number): number => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

const shade = (c: number, f: number): number =>
  rgb(Math.min(255, (c & 255) * f) | 0, Math.min(255, ((c >> 8) & 255) * f) | 0, Math.min(255, ((c >> 16) & 255) * f) | 0);

const mix = (a: number, b: number, t: number): number =>
  rgb(
    ((a & 255) * (1 - t) + (b & 255) * t) | 0,
    (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) | 0,
    (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) | 0,
  );

const PAL = {
  skyTop: rgb(58, 76, 140),
  skyLow: rgb(236, 170, 120),
  ridgeFar: rgb(96, 88, 128),
  ridgeNear: rgb(58, 70, 84),
  grassA: rgb(70, 118, 52),
  grassB: rgb(62, 108, 46),
  gravelA: rgb(150, 132, 100),
  gravelB: rgb(138, 120, 92),
  roadA: rgb(92, 92, 98),
  roadB: rgb(86, 86, 92),
  rumbleA: rgb(210, 60, 50),
  rumbleB: rgb(235, 235, 225),
  line: rgb(236, 200, 70),
  fog: rgb(170, 150, 150),
};

const DRAW = 260; // segments ahead: a little over a kilometre
const CAM_BACK = 5.5; // metres behind the rider
const CAM_UP = 2.2; // metres above the road

// ---- sprites: pixel art in strings, coloured per rider ----

type Image = { w: number; h: number; px: Uint32Array };

const RIDER = [
  "..........hhhh..........",
  "........hhhhhhhh........",
  ".......hhhwwhhhhh.......",
  ".......hhhhhhhhhh.......",
  ".......hhhhhhhhhh.......",
  "........hhhhhhhh........",
  "....jjjjjjjjjjjjjjjj....",
  "...jjjjjjjjjjjjjjjjjj...",
  "..gjjjjjjjjjjjjjjjjjjg..",
  "ggggjjjjjjjjjjjjjjjjgggg",
  ".kk.jjjjjjjjjjjjjjjj.kk.",
  "....jjjjjjjjjjjjjjjj....",
  ".....jjjjjjjjjjjjjj.....",
  ".....pppppppppppppp.....",
  "....pppbbbbbbbbbbppp....",
  "....ppbbbbbbbbbbbbpp....",
  "....ppbbbbrrrrbbbbpp....",
  "....oo.bbbbbbbbbb.oo....",
  "....oo..gggggggg..oo....",
  ".........kkkkkk.........",
  ".........kkkkkk.........",
  ".........kkkkkk.........",
  ".........kkkkkk.........",
  "..........kkkk..........",
];

const RUNNER = [
  "...hhhh...",
  "..hhhhhh..",
  "..hhhhhh..",
  "...hhhh...",
  ".jjjjjjjj.",
  "jjjjjjjjjj",
  "jjjjjjjjjj",
  "s.jjjjjj.s",
  "..jjjjjj..",
  "..pppppp..",
  "..pp..pp..",
  "..pp..pp..",
  "..pp..pp..",
  ".ooo..ooo.",
];

const TREE = [
  ".......dd.......",
  "......dddd......",
  ".....dddddd.....",
  "......dDDd......",
  ".....ddddddd....",
  "....dddDDdddd...",
  "......dddd......",
  ".....dddddd.....",
  "....dddDDdddd...",
  "...dddddddddddd.",
  ".....dddddddd...",
  "....ddddDDddddd.",
  "...ddddddddddddd",
  "..dddddDDddddddd",
  "....ddddddddddd.",
  "...dddddDDdddddd",
  "..ddddddddddddd.",
  ".ddddddDDDdddddd",
  "dddddddddddddddd",
  "......tttt......",
  "......tttt......",
  "......tttt......",
];

const POLE = ["gggggggg", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt...", "...tt..."];

const SIGN = ["...yy...", "..yyyy..", ".yykkyy.", "yykkkkyy", ".yykkyy.", "..yyyy..", "...yy...", "...tt...", "...tt...", "...tt...", "...tt..."];

export const JACKETS = [
  rgb(200, 40, 40), rgb(40, 90, 200), rgb(230, 190, 40), rgb(40, 150, 80), rgb(150, 60, 170),
  rgb(230, 120, 30), rgb(30, 160, 170), rgb(120, 120, 120), rgb(220, 220, 220), rgb(110, 60, 30),
  rgb(240, 110, 160), rgb(20, 20, 20), rgb(100, 180, 60), rgb(80, 40, 120), rgb(170, 30, 70),
];

function paint(art: string[], colours: Record<string, number>): Image {
  const h = art.length;
  const w = art[0].length;
  const px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colours[art[y][x]];
      px[y * w + x] = c ?? 0;
    }
  }
  return { w, h, px };
}

const cache = new Map<string, Image>();

function riderImage(jacket: number, pose: "ride" | "run"): Image {
  const key = `${jacket}:${pose}`;
  let img = cache.get(key);
  if (!img) {
    const colours: Record<string, number> = {
      h: shade(jacket, 1.15),
      w: rgb(250, 250, 250),
      j: jacket,
      g: rgb(150, 150, 160),
      k: rgb(24, 24, 28),
      p: rgb(40, 44, 70),
      b: shade(jacket, 0.55),
      r: rgb(255, 60, 40),
      o: rgb(30, 26, 22),
      s: rgb(225, 180, 140),
    };
    img = paint(pose === "ride" ? RIDER : RUNNER, colours);
    cache.set(key, img);
  }
  return img;
}

const sceneryImages = {
  tree: paint(TREE, { d: rgb(34, 84, 46), D: rgb(24, 64, 36), t: rgb(90, 60, 36) }),
  pole: paint(POLE, { g: rgb(90, 70, 50), t: rgb(110, 84, 58) }),
  sign: paint(SIGN, { y: rgb(240, 200, 40), k: rgb(30, 30, 30), t: rgb(120, 120, 120) }),
};
const sceneryMetres = { tree: { w: 4, h: 7 }, pole: { w: 1.4, h: 7.5 }, sign: { w: 1.2, h: 2.4 } };

/**
 * Draw an image scaled and rotated about its bottom centre, which sits at
 * (bx, by) on screen. Rows at or below `clip` are hidden (a crest in front).
 */
function blit(v: View, img: Image, bx: number, by: number, wPx: number, hPx: number, angle: number, clip: number, fog = 0): void {
  if (wPx < 1 || hPx < 1) return;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const r = Math.hypot(wPx / 2, hPx);
  const x0 = Math.max(0, Math.floor(bx - r));
  const x1 = Math.min(v.w - 1, Math.ceil(bx + r));
  const y0 = Math.max(0, Math.floor(by - r));
  const y1 = Math.min(v.h - 1, Math.ceil(by + r), Math.floor(clip));
  const sx = img.w / wPx;
  const sy = img.h / hPx;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // back into the image's own frame: origin at its bottom centre
      const dx = x + 0.5 - bx;
      const dy = y + 0.5 - by;
      const ux = dx * cos + dy * sin;
      const uy = -dx * sin + dy * cos;
      const ix = Math.floor(ux * sx + img.w / 2);
      const iy = Math.floor(uy * sy + img.h);
      if (ix < 0 || iy < 0 || ix >= img.w || iy >= img.h) continue;
      const c = img.px[iy * img.w + ix];
      if (c === 0) continue;
      v.px[y * v.w + x] = fog > 0 ? mix(c, PAL.fog, fog) : c;
    }
  }
}

function rect(v: View, x0: number, y0: number, x1: number, y1: number, c: number, clip: number): void {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xb = Math.min(v.w - 1, Math.ceil(Math.max(x0, x1)));
  const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
  const yb = Math.min(v.h - 1, Math.ceil(Math.max(y0, y1)), Math.floor(clip));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) v.px[y * v.w + x] = c;
}

// ---- the frame ----

type Projected = { x: number; y: number; scale: number; clip: number };

const headings = new WeakMap<Track, Float64Array>();

/** The road's heading at each segment, for the parallax of the far ridges. */
function headingOf(track: Track): Float64Array {
  let h = headings.get(track);
  if (!h) {
    h = new Float64Array(track.segments + 1);
    for (let i = 0; i < track.segments; i++) h[i + 1] = h[i] + track.curve[i] * SEGMENT;
    headings.set(track, h);
  }
  return h;
}

export type Scene = { track: Track; riders: readonly Rider[]; me: number; t: number };

/** Where the camera sits: behind whichever of rider or bike the player is watching. */
export function cameraFor(me: Rider): { z: number; x: number } {
  if (me.phase === "thrown" || me.phase === "running") return { z: Math.min(me.z, me.bikeZ) - CAM_BACK - 2, x: me.bikeX * 0.8 };
  return { z: me.z - CAM_BACK, x: me.x * 0.8 };
}

export function drawFrame(v: View, scene: Scene): void {
  const { track } = scene;
  const me = scene.riders.find((r) => r.id === scene.me) ?? scene.riders[0];
  const cam = cameraFor(me);
  const camZ = Math.max(0, cam.z);
  const camY = heightAt(track, camZ) + CAM_UP;
  const f = v.h * 1.05;
  const horizon = Math.round(v.h * 0.4);

  // sky and far ridges, sliding with the road's heading
  const heading = headingOf(track)[Math.min(track.segments, Math.floor(camZ / SEGMENT))];
  for (let y = 0; y < v.h; y++) {
    const c = mix(PAL.skyTop, PAL.skyLow, Math.min(1, y / horizon));
    v.px.fill(c, y * v.w, (y + 1) * v.w);
  }
  ridge(v, horizon, -heading * v.w * 0.35, PAL.ridgeFar, 0.16, 7);
  ridge(v, horizon, -heading * v.w * 0.6, PAL.ridgeNear, 0.09, 13);

  // project segment boundaries, accumulating the bend
  const first = Math.floor(camZ / SEGMENT);
  const frac = camZ / SEGMENT - first;
  const proj: Projected[] = [];
  // start the bend part-way through the camera's own segment, or the road
  // jumps sideways each time the camera crosses into the next one (the fix
  // Lou's Pseudo 3D Page credits to Code inComplete)
  let slope = -frac * track.curve[Math.min(first, track.segments - 1)] * SEGMENT;
  let off = 0;
  let maxY = v.h;
  for (let n = 0; n <= DRAW; n++) {
    const seg = first + n;
    if (seg > track.segments) break;
    const z = (n - frac) * SEGMENT;
    const dz = Math.max(0.1, z);
    const scale = f / dz;
    const y = heightAt(track, seg * SEGMENT);
    proj.push({
      x: v.w / 2 + (off - cam.x) * scale,
      y: horizon - (y - camY) * scale,
      scale,
      clip: maxY,
    });
    if (seg < track.segments) {
      const k = track.curve[seg];
      slope += k * SEGMENT;
      off += slope * SEGMENT;
    }
    if (n > 0) {
      const near = proj[n - 1];
      const far = proj[n];
      if (z > 0.5 && far.y < maxY) {
        segment(v, near, far, seg - 1, maxY, n / DRAW);
        // the next segment fills up to, not including, the first row this one
        // drew — rounding either edge the other way leaves a one-row seam
        maxY = Math.min(maxY, Math.max(Math.ceil(far.y), 0));
      }
      proj[n].clip = maxY;
    }
  }

  // sprites, far to near: scenery and every rider
  type Sprite = { z: number; draw: () => void };
  const sprites: Sprite[] = [];
  const at = (z: number, x: number): { sx: number; sy: number; scale: number; clip: number; fog: number } | null => {
    const n = (z - camZ) / SEGMENT + frac;
    const i = Math.floor(n);
    if (i < 1 || i >= proj.length - 1) return null;
    const t = n - i;
    const a = proj[i];
    const b = proj[i + 1];
    const scale = a.scale + (b.scale - a.scale) * t;
    // the projected centre line already carries the camera's offset; x is
    // measured from that line
    const cx = a.x + (b.x - a.x) * t;
    return { sx: cx + x * scale, sy: a.y + (b.y - a.y) * t, scale, clip: a.clip, fog: Math.min(0.7, (n / DRAW) ** 2 * 1.4) };
  };

  for (const s of track.scenery) {
    if (s.z < camZ + 2 || s.z > camZ + DRAW * SEGMENT) continue;
    sprites.push({
      z: s.z,
      draw: () => {
        const p = at(s.z, s.x);
        if (!p) return;
        const m = sceneryMetres[s.kind];
        blit(v, sceneryImages[s.kind], p.sx, p.sy, m.w * p.scale, m.h * p.scale, 0, p.clip, p.fog);
      },
    });
  }

  scene.riders.forEach((r, index) => {
    const jacket = JACKETS[index % JACKETS.length];
    const offBike = r.phase === "thrown" || r.phase === "running";
    if (offBike) {
      // the bike lies where it fell
      sprites.push({
        z: r.bikeZ,
        draw: () => {
          const p = at(r.bikeZ, r.bikeX);
          if (p) blit(v, riderImage(jacket, "ride"), p.sx, p.sy, 1.0 * p.scale, 1.0 * p.scale, Math.PI / 2, p.clip, p.fog);
        },
      });
    }
    sprites.push({
      z: r.z,
      draw: () => {
        const p = at(r.z, r.x);
        if (!p) return;
        if (r.phase === "thrown") {
          const lift = Math.sin(Math.min(1, r.phaseT / 1.1) * Math.PI) * 1.2 * p.scale;
          blit(v, riderImage(jacket, "run"), p.sx, p.sy - lift, 0.7 * p.scale, 1.1 * p.scale, r.phaseT * 9, p.clip, p.fog);
          return;
        }
        if (r.phase === "running") {
          const bob = Math.abs(Math.sin(r.phaseT * 12)) * 0.08 * p.scale;
          blit(v, riderImage(jacket, "run"), p.sx, p.sy - bob, 0.7 * p.scale, 1.5 * p.scale, 0, p.clip, p.fog);
          return;
        }
        const w = 0.95 * p.scale;
        const h = 1.45 * p.scale;
        const lean = r.lean * 0.45;
        drawLimb(v, r, p.sx, p.sy, w, h, lean, p.clip);
        blit(v, riderImage(jacket, "ride"), p.sx, p.sy, w, h, lean, p.clip, p.fog);
      },
    });
  });

  sprites.sort((a, b) => b.z - a.z);
  for (const s of sprites) s.draw();
}

/** An arm or a leg thrown out to one side, drawn under the rider. */
function drawLimb(v: View, r: Rider, bx: number, by: number, w: number, h: number, lean: number, clip: number): void {
  const a = r.attack;
  if (!a) return;
  const reach = Math.min(1, a.t / 0.14); // out over the windup, then held
  const side = a.side;
  const kick = a.kind === "kick";
  const back = a.kind === "backhand";
  // shoulder or hip, in the rider's own frame, rotated with the lean
  const ox = side * w * 0.38;
  const oy = kick ? -h * 0.35 : -h * 0.72;
  const len = w * (kick ? 0.75 : 0.7) * reach;
  const dy = kick ? h * 0.12 : back ? h * 0.1 : -h * 0.02;
  const rot = (x: number, y: number): [number, number] => [bx + x * Math.cos(lean) - y * Math.sin(lean), by + x * Math.sin(lean) + y * Math.cos(lean)];
  const [sx, sy] = rot(ox, oy);
  const [ex, ey] = rot(ox + side * len, oy + dy);
  const thick = Math.max(1, w * (kick ? 0.13 : 0.11));
  const steps = Math.max(2, Math.ceil(Math.hypot(ex - sx, ey - sy)));
  const colour = kick ? rgb(40, 44, 70) : rgb(60, 50, 44);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = sx + (ex - sx) * t;
    const y = sy + (ey - sy) * t;
    rect(v, x - thick / 2, y - thick / 2, x + thick / 2, y + thick / 2, colour, clip);
  }
  const end = kick ? rgb(30, 26, 22) : rgb(225, 180, 140);
  rect(v, ex - thick, ey - thick, ex + thick, ey + thick, end, clip);
}

function ridge(v: View, horizon: number, shift: number, colour: number, amp: number, seed: number): void {
  for (let x = 0; x < v.w; x++) {
    const u = (x + shift) / v.w;
    const hgt =
      (Math.sin(u * 6.3 + seed) * 0.5 + Math.sin(u * 17.1 + seed * 2) * 0.3 + Math.sin(u * 41 + seed) * 0.12 + 1) * amp * v.h * 0.5;
    const top = Math.max(0, Math.floor(horizon - hgt));
    for (let y = top; y < v.h; y++) v.px[y * v.w + x] = colour;
  }
}

function segment(v: View, near: Projected, far: Projected, seg: number, maxY: number, depth: number): void {
  const alt = Math.floor(seg / 3) % 2 === 0;
  const fog = Math.min(0.75, depth * depth * 1.3);
  const c = {
    grass: mix(alt ? PAL.grassA : PAL.grassB, PAL.fog, fog),
    gravel: mix(alt ? PAL.gravelA : PAL.gravelB, PAL.fog, fog),
    road: mix(alt ? PAL.roadA : PAL.roadB, PAL.fog, fog),
    rumble: mix(alt ? PAL.rumbleA : PAL.rumbleB, PAL.fog, fog),
    line: mix(PAL.line, PAL.fog, fog),
  };
  const dashed = Math.floor(seg / 2) % 3 === 0;
  const y0 = Math.max(0, Math.ceil(far.y));
  const y1 = Math.min(v.h - 1, Math.floor(Math.min(near.y, maxY - 1)));
  for (let y = y0; y <= y1; y++) {
    const t = near.y === far.y ? 0 : (y - near.y) / (far.y - near.y);
    const cx = near.x + (far.x - near.x) * t;
    const s = near.scale + (far.scale - near.scale) * t;
    const road = ROAD_HALF * s;
    const rumble = road + 0.45 * s;
    const shoulder = SHOULDER * s;
    const line = 0.12 * s;
    const row = y * v.w;
    const put = (a: number, b: number, colour: number): void => {
      const xa = Math.max(0, Math.round(a));
      const xb = Math.min(v.w, Math.round(b));
      if (xb > xa) v.px.fill(colour, row + xa, row + xb);
    };
    put(0, v.w, c.grass);
    put(cx - shoulder, cx + shoulder, c.gravel);
    put(cx - rumble, cx + rumble, c.rumble);
    put(cx - road, cx + road, c.road);
    if (dashed) put(cx - line, cx + line, c.line);
  }
}
