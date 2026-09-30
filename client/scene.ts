// The race in 3D, the way the original drew it (ledger V1–V17): a textured
// road through real geometry, a low chase camera behind the rider, a flat
// periwinkle sky with hard-edged clouds and a painted mountain panorama.
// Every texture is generated here in code; none comes from the game.

import * as THREE from "three";
import { type Rider } from "../game/sim.ts";
import { ROAD_HALF, SEGMENT, SHOULDER, type Track } from "../game/track.ts";
import { centreline, frameAt } from "../game/world.ts";

// ---- colours measured off the PC version (docs/road-rash-visuals.md) ----

const C = {
  sky: "#94aefa",
  skyLow: "#c5d0f2",
  asphalt: [86, 80, 94] as const, // #56505e
  yellow: "#c0b04c",
  white: "#d8d8d8",
  dirt: [99, 69, 44] as const, // #63452c
  meadow: [73, 101, 66] as const, // #496542
  rock: "#86839f",
  pine: "#3f5a45",
};

// ---- generated textures ----

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** A small seeded noise so a texture comes out the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, base: readonly [number, number, number], spread: number, seed: number, cell = 1): void {
  const rand = rng(seed);
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const d = (rand() - 0.5) * spread;
      ctx.fillStyle = `rgb(${base[0] + d},${base[1] + d},${base[2] + d * 1.1})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

function texture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // small textures magnified without smoothing: big square texels near the
  // camera, as the original's were (V4)
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One 12 m tile of the road, across its full width (V9). */
function roadTexture(): THREE.CanvasTexture {
  const w = 128; // across 2 × ROAD_HALF
  const h = 96; // along 12 m
  const [c, ctx] = canvas(w, h);
  speckle(ctx, w, h, C.asphalt, 7, 11, 2);
  const px = (m: number): number => ((m + ROAD_HALF) / (2 * ROAD_HALF)) * w;
  const stripe = (m: number, width: number, colour: string, from = 0, to = h): void => {
    ctx.fillStyle = colour;
    ctx.fillRect(Math.round(px(m) - (width / (2 * ROAD_HALF)) * w * 0.5), from, Math.max(1, Math.round((width / (2 * ROAD_HALF)) * w)), to - from);
  };
  stripe(-0.16, 0.13, C.yellow);
  stripe(0.16, 0.13, C.yellow);
  stripe(-ROAD_HALF + 0.25, 0.15, C.white);
  stripe(ROAD_HALF - 0.25, 0.15, C.white);
  // lane dashes: 3 m of paint in every 12
  stripe(-ROAD_HALF / 2, 0.16, "#ececec", 0, (h * 5) / 12);
  stripe(ROAD_HALF / 2, 0.16, "#ececec", 0, (h * 5) / 12);
  return texture(c);
}

function groundTexture(base: readonly [number, number, number], seed: number, streaks = false): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  speckle(ctx, 64, 64, base, 22, seed, 2);
  if (streaks) {
    const rand = rng(seed + 1);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(30,40,20,${0.15 + rand() * 0.2})`;
      ctx.fillRect(Math.floor(rand() * 64), Math.floor(rand() * 64), 2, 4 + rand() * 6);
    }
  }
  return texture(c);
}

/** A jagged snow range right round the horizon (V12). */
function panoramaTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  const rand = rng(1994);
  // the skyline is the upper envelope of many sharp peaks, each a steep
  // triangle with ragged flanks; that is what reads as the Sierra's teeth
  // rather than a mesa
  type Peak = { x: number; top: number; slope: number };
  const peaks: Peak[] = [];
  // a few big massifs and many lesser summits between them
  for (let i = 0; i < 9; i++) peaks.push({ x: rand() * w, top: 8 + rand() * 45, slope: 0.55 + rand() * 0.5 });
  for (let i = 0; i < 30; i++) peaks.push({ x: rand() * w, top: 60 + rand() * 110, slope: 0.7 + rand() * 1.2 });
  const sky = new Float64Array(w);
  const owner = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    let best = h;
    let who = -1;
    peaks.forEach((p, i) => {
      // distance round the seam too, so the panorama tiles
      const d = Math.min(Math.abs(x - p.x), w - Math.abs(x - p.x));
      const y = p.top + d * p.slope;
      if (y < best) {
        best = y;
        who = i;
      }
    });
    sky[x] = Math.min(h, best + (rand() - 0.5) * 3);
    owner[x] = who;
  }
  for (let x = 0; x < w; x++) {
    const top = Math.floor(sky[x]);
    const p = peaks[owner[x]];
    // rock, a little darker on the flank facing away from the light
    const d = x - p.x;
    ctx.fillStyle = d > 0 ? "#7c7998" : C.rock;
    ctx.fillRect(x, top, 1, h - top);
    // snow from the summit down, streaked down the fall line; higher peaks
    // carry more of it
    const reach = Math.max(0, (175 - p.top) * 0.55) * (0.6 + rand() * 0.5);
    if (reach > 2) {
      ctx.fillStyle = "#f2f2f8";
      ctx.fillRect(x, top, 1, reach * (0.5 + 0.5 * Math.abs(Math.sin(x * 0.35 + p.x))));
    }
  }
  // lower, bluer foothills and a green skirt in front
  const hills = (base: number, amp: number, colour: string, seed: number): void => {
    const r = rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6];
    ctx.fillStyle = colour;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * Math.PI * 2;
      const y = base - amp * (0.5 + 0.3 * Math.sin(u * 3 + ph[0]) + 0.15 * Math.sin(u * 11 + ph[1]) + 0.05 * Math.sin(u * 37 + ph[2]));
      ctx.fillRect(x, y, 1, h - y);
    }
  };
  hills(236, 50, "#6c6d8c", 21);
  hills(250, 22, "#55704f", 33);
  (window as unknown as { __pano: HTMLCanvasElement }).__pano = c; // for a look at it without a race
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Flat white cumulus with hard edges (V11). */
function cloudTexture(seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  const rand = rng(seed);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 7; i++) {
    const r = 12 + rand() * 16;
    ctx.beginPath();
    ctx.arc(24 + rand() * 80, 40 - rand() * 14, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(200,210,240,0.9)";
  ctx.fillRect(0, 50, 128, 14);
  ctx.clearRect(0, 52, 128, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- the road and the land ----

/** A strip along the road between two offsets, textured every `tile` metres. */
function strip(track: Track, from: number, to: number, tile: number, lift: (z: number, x: number) => number, uAcross = 1): THREE.BufferGeometry {
  const c = centreline(track);
  const n = track.segments + 1;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    const h = c.heading[i];
    const rx = -Math.cos(h);
    const rz = Math.sin(h);
    const z = i * SEGMENT;
    for (let s = 0; s < 2; s++) {
      const off = s === 0 ? from : to;
      const k = (i * 2 + s) * 3;
      pos[k] = c.x[i] + rx * off;
      pos[k + 1] = c.y[Math.min(i, c.y.length - 1)] + lift(z, off);
      pos[k + 2] = c.z[i] + rz * off;
      uv[(i * 2 + s) * 2] = s * uAcross;
      uv[(i * 2 + s) * 2 + 1] = z / tile;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    // counter-clockwise seen from above, so the faces point up
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---- riders (V5): low-poly bike and rider, lit, in two-colour leathers ----

const LEATHERS: [string, string, string][] = [
  ["#e040a0", "#c8d040", "#f0d020"], // the PC default: magenta with yellow-green, yellow helmet
  ["#d02828", "#f0f0f0", "#f0f0f0"],
  ["#30a040", "#101010", "#30a040"],
  ["#2850d0", "#d02828", "#f0f0f0"],
  ["#f0d020", "#101010", "#f0d020"],
  ["#8030b0", "#e0e0e0", "#202020"],
  ["#f07820", "#202020", "#f07820"],
  ["#20a0b0", "#f0f0f0", "#20a0b0"],
  ["#202020", "#d02828", "#d02828"],
  ["#e0e0e0", "#2850d0", "#2850d0"],
  ["#a02050", "#f0d020", "#a02050"],
  ["#607020", "#e0c080", "#e0c080"],
  ["#f060a0", "#202020", "#f0f0f0"],
  ["#4040a0", "#f0a020", "#f0a020"],
  ["#b06030", "#f0f0f0", "#202020"],
];

type RiderModel = {
  root: THREE.Group; // placed on the road
  lean: THREE.Group; // rolls about the contact line
  bike: THREE.Group;
  body: THREE.Group; // the rider, separable when thrown
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  fallen: THREE.Group; // the bike on its side while its rider is off it
};

const lambert = (colour: string): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color: colour });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function bikeModel(m: { frame: THREE.Material; black: THREE.Material; chrome: THREE.Material; light: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16);
  wheel.rotateZ(Math.PI / 2);
  const front = new THREE.Mesh(wheel, m.black);
  front.position.set(0, 0.32, 0.72);
  const rear = new THREE.Mesh(wheel, m.black);
  rear.position.set(0, 0.32, -0.7);
  g.add(front, rear);
  g.add(box(0.34, 0.34, 1.0, m.frame, 0, 0.62, 0.05)); // tank and body
  g.add(box(0.3, 0.18, 0.55, m.black, 0, 0.82, -0.35)); // seat
  g.add(box(0.36, 0.36, 0.3, m.frame, 0, 0.8, 0.62)); // fairing
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.4, 4, 10), m.frame);
  tail.rotation.x = Math.PI / 2 - 0.15;
  tail.scale.set(1.3, 1, 1);
  tail.position.set(0, 0.7, -0.72);
  g.add(tail);
  g.add(box(0.2, 0.06, 0.04, m.light, 0, 0.72, -1.04)); // tail light
  g.add(box(0.1, 0.1, 0.5, m.chrome, 0.17, 0.36, -0.55)); // exhaust
  g.add(box(0.7, 0.04, 0.04, m.chrome, 0, 1.0, 0.6)); // bars
  return g;
}

function riderModel(index: number): RiderModel {
  const [main, trim, helmet] = LEATHERS[index % LEATHERS.length];
  const mats = {
    main: lambert(main),
    trim: lambert(trim),
    helmet: new THREE.MeshPhongMaterial({ color: helmet, shininess: 60 }),
    visor: new THREE.MeshPhongMaterial({ color: "#101018", shininess: 90 }),
    black: lambert("#1a1a1e"),
    frame: new THREE.MeshPhongMaterial({ color: main, shininess: 40 }),
    chrome: new THREE.MeshPhongMaterial({ color: "#b8b8c0", shininess: 90 }),
    light: new THREE.MeshBasicMaterial({ color: "#ff3020" }),
    boot: lambert("#141414"),
    glove: lambert("#202020"),
  };
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const bike = bikeModel(mats);
  const body = new THREE.Group();
  const capsule = (r: number, len: number, m: THREE.Material): THREE.Mesh => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  // a broad back hunched over the tank, trim across the shoulders
  const torso = capsule(0.2, 0.34, mats.main);
  torso.scale.set(1.3, 1, 1);
  torso.rotation.x = 1.15;
  torso.position.set(0, 0.16, 0.02);
  const panel = capsule(0.16, 0.2, mats.trim);
  panel.scale.set(1.45, 1, 0.9);
  panel.rotation.x = 1.15;
  panel.position.set(0, 0.28, -0.04);
  body.add(torso, panel);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mats.helmet);
  head.position.set(0, 0.42, 0.3);
  body.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, 0.9), mats.visor);
  visor.rotation.x = 1.6;
  visor.position.set(0, 0.41, 0.36);
  body.add(visor);
  const arm = (side: number): THREE.Group => {
    const a = new THREE.Group();
    // facing +z, the rider's right is -x
    a.position.set(-side * 0.26, 0.26, 0.14);
    const upper = capsule(0.07, 0.36, mats.main);
    upper.rotation.x = 1.2;
    upper.position.set(0, -0.08, 0.2);
    a.add(upper, box(0.13, 0.11, 0.13, mats.glove, 0, -0.16, 0.44));
    return a;
  };
  const leg = (side: number): THREE.Group => {
    const l = new THREE.Group();
    l.position.set(-side * 0.21, -0.02, -0.12);
    const thigh = capsule(0.09, 0.32, mats.trim);
    thigh.rotation.x = 1.3;
    thigh.position.set(0, -0.06, 0.14);
    const shin = capsule(0.075, 0.3, mats.main);
    shin.rotation.x = -0.5;
    shin.position.set(0, -0.3, 0.24);
    l.add(thigh, shin, box(0.13, 0.12, 0.26, mats.boot, 0, -0.5, 0.2));
    return l;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const legL = leg(-1);
  const legR = leg(1);
  body.add(armL, armR, legL, legR);
  body.position.set(0, 0.95, -0.25);
  lean.add(bike, body);
  root.add(lean);
  const fallen = bikeModel(mats);
  fallen.rotation.z = Math.PI / 2;
  fallen.position.y = 0.18;
  fallen.visible = false;
  return { root, lean, bike, body, armL, armR, legL, legR, fallen };
}

// ---- the scene ----

export class RaceScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 4000);
  private track: Track | null = null;
  private world = new THREE.Group();
  private riders = new Map<number, RiderModel>();
  private backdrop: THREE.Mesh;
  private clouds = new THREE.Group();
  private sun: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(C.sky);
    this.scene.add(new THREE.HemisphereLight("#dfe6ff", "#5a6a4a", 1.6));
    this.sun = new THREE.DirectionalLight("#fff4e0", 1.8);
    this.sun.position.set(-40, 80, -30);
    this.scene.add(this.sun, this.sun.target);

    // the panorama rides with the camera, so it never gets closer (V12)
    // 420 m tall at 2.4 km is about 10° of sky: the range sits on the horizon
    // and rises to the height it has in the original, not above it
    const pano = new THREE.CylinderGeometry(2400, 2400, 420, 64, 1, true);
    const panoTex = panoramaTexture();
    // six times round, so a texel is about as wide as it is tall
    panoTex.repeat.set(6, 1);
    this.backdrop = new THREE.Mesh(pano, new THREE.MeshBasicMaterial({ map: panoTex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.backdrop.renderOrder = -2;
    this.scene.add(this.backdrop);
    // a paler strip at the horizon behind the mountains
    const haze = new THREE.Mesh(new THREE.CylinderGeometry(2450, 2450, 260, 32, 1, true), new THREE.MeshBasicMaterial({ color: C.skyLow, side: THREE.BackSide, depthWrite: false }));
    haze.renderOrder = -3;
    this.backdrop.add(haze);
    haze.position.y = -120;
    const rand = rng(5);
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(i + 1), depthWrite: false, fog: false }));
      const a = rand() * Math.PI * 2;
      s.position.set(Math.sin(a) * 1800, 150 + rand() * 480, Math.cos(a) * 1800);
      const size = 70 + rand() * 150;
      s.scale.set(size, size / 2, 1);
      s.renderOrder = -1;
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);
    this.scene.add(this.world);
  }

  setTrack(track: Track): void {
    if (this.track === track) return;
    this.track = track;
    this.world.clear();
    const flat = (): number => 0.0;
    const road = new THREE.Mesh(strip(track, -ROAD_HALF, ROAD_HALF, 12, flat), new THREE.MeshLambertMaterial({ map: roadTexture() }));
    const dirtTex = groundTexture(C.dirt, 3);
    const dirt = new THREE.MeshLambertMaterial({ map: dirtTex });
    const left = new THREE.Mesh(strip(track, -SHOULDER, -ROAD_HALF, 4, () => -0.02, 0.5), dirt);
    const right = new THREE.Mesh(strip(track, ROAD_HALF, SHOULDER, 4, () => -0.02, 0.5), dirt);
    // meadow rising gently away from the road on both sides
    const meadowTex = groundTexture(C.meadow, 9, true);
    const meadow = new THREE.MeshLambertMaterial({ map: meadowTex });
    const rise = (z: number, off: number): number => {
      const d = Math.abs(off) - SHOULDER;
      // gentle: the original's meadows are nearly flat, and the far range
      // has to show over them (V12)
      return d <= 0 ? -0.04 : Math.min(1, d / 120) * (2.5 + 2 * Math.sin(z / 170 + Math.sign(off)));
    };
    const far = 400;
    const bands = [SHOULDER, SHOULDER + 12, SHOULDER + 35, SHOULDER + 90, SHOULDER + 200, far];
    for (let b = 0; b < bands.length - 1; b++) {
      this.world.add(new THREE.Mesh(strip(track, -bands[b + 1], -bands[b], 6, rise, (bands[b + 1] - bands[b]) / 6), meadow));
      this.world.add(new THREE.Mesh(strip(track, bands[b], bands[b + 1], 6, rise, (bands[b + 1] - bands[b]) / 6), meadow));
    }
    this.world.add(road, left, right);

    // pines, poles and chevrons from the track's own scenery list
    const trees = track.scenery.filter((s) => s.kind === "tree");
    const cone = new THREE.ConeGeometry(1.7, 6.5, 7);
    cone.translate(0, 4.4, 0);
    const trunk = new THREE.CylinderGeometry(0.22, 0.28, 1.4, 6);
    trunk.translate(0, 0.7, 0);
    const pines = new THREE.InstancedMesh(cone, lambert(C.pine), trees.length);
    const trunks = new THREE.InstancedMesh(trunk, lambert("#5a3e2a"), trees.length);
    const m = new THREE.Matrix4();
    const rand = rng(77);
    trees.forEach((s, i) => {
      const f = frameAt(track, s.z, s.x);
      const scale = 0.8 + rand() * 0.6;
      m.compose(new THREE.Vector3(f.px, f.py + rise(s.z, s.x), f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(scale, scale * (0.9 + rand() * 0.4), scale));
      pines.setMatrixAt(i, m);
      trunks.setMatrixAt(i, m);
    });
    this.world.add(pines, trunks);

    const poles = track.scenery.filter((s) => s.kind === "pole");
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.14, 8, 6).translate(0, 4, 0), lambert("#6e5238"), poles.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 7.4, 0), lambert("#6e5238"), poles.length);
    poles.forEach((s, i) => {
      const f = frameAt(track, s.z, s.x);
      m.compose(new THREE.Vector3(f.px, f.py, f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.heading + Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(i, m);
      arms.setMatrixAt(i, m);
    });
    this.world.add(pole, arms);

    const signs = track.scenery.filter((s) => s.kind === "sign");
    const chevron = (() => {
      const [c, ctx] = canvas(32, 32);
      ctx.fillStyle = "#e8c020";
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = "#101010";
      ctx.beginPath();
      ctx.moveTo(22, 4);
      ctx.lineTo(10, 16);
      ctx.lineTo(22, 28);
      ctx.lineTo(16, 28);
      ctx.lineTo(4, 16);
      ctx.lineTo(16, 4);
      ctx.fill();
      return texture(c, false);
    })();
    for (const s of signs) {
      const f = frameAt(track, s.z, s.x);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0, 0.6, 0), lambert("#909090")));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshLambertMaterial({ map: chevron, side: THREE.DoubleSide }));
      face.position.y = 1.55;
      // the arrow points the way the road turns: flip it for a left-hander
      if (s.x < 0) face.scale.x = -1;
      g.add(face);
      g.position.set(f.px, f.py, f.pz);
      g.rotation.y = f.heading + Math.PI;
      this.world.add(g);
    }

    // a steel guardrail along the outside of the bends (V12)
    const rail = new THREE.MeshPhongMaterial({ color: "#a8a8b0", shininess: 50 });
    const k = track.curve;
    let startSeg = -1;
    for (let i = 0; i <= track.segments; i++) {
      const bend = i < track.segments && Math.abs(k[i]) > 1 / 260 ? Math.sign(k[i]) : 0;
      if (bend !== 0 && startSeg < 0) startSeg = i;
      if ((bend === 0 || i === track.segments) && startSeg >= 0) {
        const side = -Math.sign(k[startSeg]) * (SHOULDER + 0.3);
        const g = strip(track, side, side + 0.02, 4, (_z, _o) => 0, 1);
        // keep only this bend's stretch, and stand it up as a band 0.35 m tall
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) if (v % 2 === 1) pos.setY(v, pos.getY(v) + 0.75);
        for (let v = 0; v < pos.count; v++) if (v % 2 === 0) pos.setY(v, pos.getY(v) + 0.4);
        g.setDrawRange(startSeg * 6, (i - startSeg) * 6);
        this.world.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: "#b0b0b8", shininess: 50, side: THREE.DoubleSide })));
        startSeg = -1;
      }
    }
    void rail;

    // start and finish: white line and chequered band across the road (V16)
    this.world.add(this.lineAcross(track, 30, false), this.lineAcross(track, track.length, true));

    for (const r of this.riders.values()) this.scene.remove(r.root, r.fallen);
    this.riders.clear();
  }

  private lineAcross(track: Track, z: number, chequered: boolean): THREE.Mesh {
    const [c, ctx] = canvas(16, 2);
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = !chequered || (x + y) % 2 === 0 ? "#f0f0f0" : "#101010";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const t = texture(c, false);
    const f = frameAt(track, z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, chequered ? 1.6 : 0.6), new THREE.MeshLambertMaterial({ map: t }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = f.heading;
    mesh.position.set(f.px, f.py + 0.02, f.pz);
    return mesh;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the rider's size on screen whatever the shape: a tall phone
    // screen widens the vertical view instead of zooming in
    this.camera.fov = w / h < 1 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  /** Draw a frame from behind rider `me`. */
  draw(riders: readonly Rider[], me: number, dashTop = 0.23): void {
    const track = this.track;
    if (!track) return;
    const mine = riders.find((r) => r.id === me) ?? riders[0];
    riders.forEach((r) => this.place(track, r, r.id));
    for (const [id, model] of this.riders) {
      if (!riders.some((r) => r.id === id)) {
        this.scene.remove(model.root, model.fallen);
        this.riders.delete(id);
      }
    }

    // the chase camera (V2): low, behind, never rolling
    const off = mine.phase === "thrown" || mine.phase === "running";
    const z = off ? Math.min(mine.z, mine.bikeZ) - 3 : mine.z;
    const x = off ? (mine.x + mine.bikeX) / 2 : mine.x;
    const eye = frameAt(track, z - 7.4, x * 0.9);
    const look = frameAt(track, z + 14, x * 0.9);
    this.camera.position.set(eye.px, eye.py + 2.2, eye.pz);
    // aim below the horizon so the rider sits above the dashboard (V2, V7)
    this.camera.lookAt(look.px, look.py + 0.55 - dashTop * 1.2, look.pz);
    // its foot a little below eye level, so the ground's far edge never shows
    this.backdrop.position.set(this.camera.position.x, this.camera.position.y + 210 - 25, this.camera.position.z);
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sun.position.set(this.camera.position.x - 40, 80, this.camera.position.z - 30);
    this.sun.target.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  private place(track: Track, r: Rider, index: number): void {
    let model = this.riders.get(r.id);
    if (!model) {
      model = riderModel(index);
      this.riders.set(r.id, model);
      this.scene.add(model.root, model.fallen);
    }
    const thrown = r.phase === "thrown";
    const running = r.phase === "running";
    const f = frameAt(track, r.z, r.x);
    model.root.position.set(f.px, f.py, f.pz);
    model.root.rotation.set(0, f.heading, 0);
    // the whole bike and rider roll together, up to about 35° (V5)
    // positive roll about the forward axis tips the top towards -x, the right
    model.lean.rotation.set(0, 0, r.lean * 0.62);
    model.bike.visible = !thrown && !running;
    model.fallen.visible = thrown || running;
    if (model.fallen.visible) {
      const b = frameAt(track, r.bikeZ, r.bikeX);
      model.fallen.position.set(b.px, b.py + 0.18, b.pz);
      model.fallen.rotation.set(0, b.heading + 0.5, Math.PI / 2);
    }

    // the rider: tucked on the bike, tumbling when thrown, upright when running
    const body = model.body;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0.95, -0.25);
    model.armL.rotation.set(0, 0, 0);
    model.armR.rotation.set(0, 0, 0);
    model.legL.rotation.set(0, 0, 0);
    model.legR.rotation.set(0, 0, 0);
    if (thrown) {
      const t = Math.min(1, r.phaseT / 1.1);
      body.position.set(0, 0.4 + Math.sin(t * Math.PI) * 1.3, 0);
      body.rotation.set(r.phaseT * 7, r.phaseT * 3, 0);
    } else if (running) {
      body.position.set(0, 0.55, 0);
      body.rotation.set(-0.7, 0, 0);
      const swing = Math.sin(r.phaseT * 11) * 0.7;
      model.legL.rotation.x = swing;
      model.legR.rotation.x = -swing;
      model.armL.rotation.x = -swing;
      model.armR.rotation.x = swing;
    } else if (r.attack) {
      // a swing throws the arm straight out sideways; a kick the leg (V15)
      const out = Math.min(1, r.attack.t / 0.14);
      const side = r.attack.side;
      if (r.attack.kind === "kick") {
        const leg = side > 0 ? model.legR : model.legL;
        leg.rotation.z = -side * 1.2 * out;
      } else {
        const arm = side > 0 ? model.armR : model.armL;
        // rotating about y by -90° points a forward arm at -x, the right
        arm.rotation.y = -side * (r.attack.kind === "backhand" ? 2.3 : 1.35) * out;
        arm.rotation.x = -0.3 * out;
        arm.rotation.z = -side * 0.4 * out;
      }
    }
  }
}
