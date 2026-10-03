// The race in 3D (ledger V1–V17): a textured road through real geometry, a low
// chase camera behind the rider, sky and mountains on the horizon. The rider
// and bike come from client/models.ts; the ground, rock and sky are CC0
// photographs (client/public/assets/ASSETS.md); the road markings, the
// mountain skyline and the pines are drawn here in code. Nothing comes from
// the game itself.

import * as THREE from "three";
import { type Car, type Rider, TUNE } from "../game/sim.ts";
import { ROAD_HALF, SEGMENT, SHOULDER, type Track } from "../game/track.ts";
import { centreline, frameAt } from "../game/world.ts";
import { type RiderRig, bend, buildBike, buildCar, buildClub, buildRider, crouch, loadRider, unbend } from "./models.ts";

// ---- colours measured off the PC version (docs/road-rash-visuals.md) ----

const C = {
  yellow: "#c0b04c",
  white: "#e0e0e0",
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** A small seeded noise so anything generated comes out the same every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const loader = new THREE.TextureLoader();
const asset = (name: string): string => `/assets/${name}`;

function photo(name: string, repeat: [number, number], colour = true): THREE.Texture {
  const t = loader.load(asset(name));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ground(name: string, repeat: [number, number], tint = "#ffffff"): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: photo(`textures/${name}_color.jpg`, repeat),
    normalMap: photo(`textures/${name}_normal.jpg`, repeat, false),
    roughnessMap: photo(`textures/${name}_roughness.jpg`, repeat, false),
    color: tint,
  });
}

/**
 * The road: the asphalt photograph, with the original's markings painted over
 * it (V9) — double solid yellow centre, white dashed lanes, solid white edges,
 * no kerbs. One tile is 12 m long across the road's full width.
 */
function roadMaterial(): THREE.MeshStandardMaterial {
  const w = 512;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  const paint = (): void => {
    const px = (m: number): number => ((m + ROAD_HALF) / (2 * ROAD_HALF)) * w;
    const stripe = (m: number, width: number, colour: string, from = 0, to = h): void => {
      ctx.fillStyle = colour;
      const pw = Math.max(2, (width / (2 * ROAD_HALF)) * w);
      ctx.fillRect(px(m) - pw / 2, from, pw, to - from);
    };
    ctx.globalAlpha = 0.92;
    stripe(-0.16, 0.12, C.yellow);
    stripe(0.16, 0.12, C.yellow);
    stripe(-ROAD_HALF + 0.3, 0.15, C.white);
    stripe(ROAD_HALF - 0.3, 0.15, C.white);
    stripe(-ROAD_HALF / 2, 0.14, C.white, 0, (h * 3) / 12);
    stripe(ROAD_HALF / 2, 0.14, C.white, 0, (h * 3) / 12);
    ctx.globalAlpha = 1;
    t.needsUpdate = true;
  };
  // the measured purple-grey cast of the original's asphalt (#56505e)
  ctx.fillStyle = "#56505e";
  ctx.fillRect(0, 0, w, h);
  paint();
  const img = new Image();
  img.onload = (): void => {
    // the photograph four times across, tinted towards the measured colour
    for (let y = 0; y < h; y += h / 2) for (let x = 0; x < w; x += w / 4) ctx.drawImage(img, x, y, w / 4, h / 2);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "#9a90a8";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    paint();
  };
  img.src = asset("textures/asphalt_color.jpg");
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, normalMap: photo("textures/asphalt_normal.jpg", [4, 2], false), normalScale: new THREE.Vector2(0.4, 0.4) });
}

/**
 * The mountain range right round the horizon (V12): a skyline of sharp peaks,
 * filled with the rock photograph and snow on the summits.
 */
function panoramaTexture(): THREE.CanvasTexture {
  const w = 4096;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const rand = rng(1994);
  type Peak = { x: number; top: number; slope: number };
  const peaks: Peak[] = [];
  // a few great summits, steep-sided, with lesser peaks crowding between
  for (let i = 0; i < 10; i++) peaks.push({ x: rand() * w, top: 15 + rand() * 80, slope: 1.0 + rand() * 0.8 });
  for (let i = 0; i < 46; i++) peaks.push({ x: rand() * w, top: 150 + rand() * 200, slope: 0.9 + rand() * 1.4 });
  const sky = new Float64Array(w);
  const owner = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    let best = h;
    peaks.forEach((p, i) => {
      const d = Math.min(Math.abs(x - p.x), w - Math.abs(x - p.x));
      // ragged ridgelines: the flank wanders as it falls
      const y = p.top + d * p.slope + Math.sin(d * 0.045 + p.x) * 9 + Math.sin(d * 0.17 + p.x * 3) * 3;
      if (y < best) {
        best = y;
        owner[x] = i;
      }
    });
    sky[x] = best;
  }
  const draw = (rock: HTMLImageElement | null): void => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x++) ctx.lineTo(x, sky[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.clip();
    if (rock) {
      ctx.fillStyle = ctx.createPattern(rock, "repeat")!;
      ctx.fillRect(0, 0, w, h);
      // towards the lavender-grey of distance
      ctx.fillStyle = "rgba(140,140,175,0.55)";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#86839f";
      ctx.fillRect(0, 0, w, h);
    }
    // shade the flanks that fall away to the right, by the skyline's own
    // slope: deciding by which peak owns a column left a hard vertical edge
    // wherever one peak handed over to the next
    for (let x = 0; x < w; x++) {
      const slope = sky[Math.min(w - 1, x + 3)] - sky[Math.max(0, x - 3)];
      if (slope > 0) {
        ctx.fillStyle = `rgba(40,40,70,${Math.min(0.3, slope * 0.03)})`;
        ctx.fillRect(x, sky[x], 1, h);
      }
    }
    // snow down from each summit, in streaks along the fall line
    const r = rng(7);
    for (let x = 0; x < w; x++) {
      const p = peaks[owner[x]];
      // snow lies in broad fields broken by rock ribs, not in single streaks
      const reach = Math.max(0, (320 - p.top) * 0.5);
      if (reach < 4) continue;
      // rock ribs break the snow up; on the lesser peaks only the tips hold it
      const field = 0.45 + 0.3 * Math.sin(x * 0.013 + p.x) + 0.25 * Math.sin(x * 0.047 + p.top);
      const rib = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.11 + p.x * 0.5));
      const len = reach * Math.max(0.04, field * field) * rib * (0.9 + r() * 0.1);
      const g = ctx.createLinearGradient(0, sky[x], 0, sky[x] + len);
      g.addColorStop(0, "rgba(250,250,255,0.98)");
      g.addColorStop(0.8, "rgba(235,238,250,0.85)");
      g.addColorStop(1, "rgba(235,238,250,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, sky[x], 1, len);
    }
    // haze at the foot of the range, where it meets the land
    const haze = ctx.createLinearGradient(0, h * 0.55, 0, h);
    haze.addColorStop(0, "rgba(190,200,225,0)");
    haze.addColorStop(1, "rgba(190,200,225,0.85)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    t.needsUpdate = true;
  };
  draw(null);
  const img = new Image();
  img.onload = (): void => draw(img);
  img.src = asset("textures/rock_color.jpg");
  return t;
}

/** A pine painted as a silhouette of drooping branch tiers, for crossed cards. */
function pineTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const rand = rng(31);
  ctx.fillStyle = "#4a3424";
  ctx.fillRect(w / 2 - 7, h * 0.8, 14, h * 0.2);
  const tiers = 15;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = h * 0.04 + t * h * 0.8;
    const half = (0.06 + t * 0.4) * w;
    for (let k = 0; k < 140; k++) {
      // needles along each drooping branch, darker inside the crown
      const side = rand() < 0.5 ? -1 : 1;
      const along = rand();
      const bx = w / 2 + side * along * half;
      const by = y + along * along * 26 + (rand() - 0.5) * 10;
      const shade = 30 + rand() * 40 + along * 25;
      ctx.fillStyle = `rgb(${shade * 0.55},${shade * 1.05 + 20},${shade * 0.6})`;
      ctx.beginPath();
      ctx.ellipse(bx, by, 6 + rand() * 7, 3 + rand() * 4, side * (0.3 + along * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

/**
 * Height of the meadow beside the road: a gentle bank, then falling away to
 * the plain. The strips stop at MEADOW, inside the tightest bend's radius
 * (110 m): an offset curve wider than the bend folds back over itself, and a
 * 2.6 km strip once laid a green sheet across half the sky.
 */
const MEADOW = 60;
const PLAIN = -5.5;
const rise = (z: number, off: number): number => {
  const d = Math.abs(off) - SHOULDER;
  if (d <= 0) return -0.04;
  const bank = Math.min(1, d / 20) * (1.2 + 0.8 * Math.sin(z / 170 + Math.sign(off)));
  return bank + Math.min(0, -(d - 25) * 0.25) * 1;
};

// ---- riders (V5) ----

// The PC default rider first: magenta leathers, yellow-green shoulders,
// yellow helmet. Then fourteen more, each with its own pair.
const LEATHERS: [string, string, string][] = [
  ["#d0308c", "#b8c838", "#f0d020"],
  ["#c02020", "#f0f0f0", "#f0f0f0"],
  ["#2a8c38", "#151515", "#2a8c38"],
  ["#2448c0", "#c02020", "#f0f0f0"],
  ["#e8c018", "#151515", "#e8c018"],
  ["#6e2aa0", "#e0e0e0", "#202020"],
  ["#e06c18", "#202020", "#e06c18"],
  ["#1c90a0", "#f0f0f0", "#1c90a0"],
  ["#1e1e22", "#c02020", "#c02020"],
  ["#d8d8d8", "#2448c0", "#2448c0"],
  ["#901c48", "#e8c018", "#901c48"],
  ["#56661c", "#d8b878", "#d8b878"],
  ["#e05c98", "#202020", "#f0f0f0"],
  ["#3a3a98", "#e89818", "#e89818"],
  ["#9c5428", "#f0f0f0", "#202020"],
];

type RiderModel = {
  root: THREE.Group; // on the road at the rider
  lean: THREE.Group; // rolls about the contact line
  seat: THREE.Group; // where the rider sits on the bike
  bike: THREE.Group;
  rig: RiderRig;
  seatOffset: THREE.Vector3;
};

const RIGHT = new THREE.Vector3(-1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

// ---- the scene ----

export class RaceScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 6000);
  private track: Track | null = null;
  private world = new THREE.Group();
  private riders = new Map<number, RiderModel>();
  private cars = new Map<number, THREE.Group>();
  private backdrop: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private plain: THREE.Mesh;
  private riderAsset: Awaited<ReturnType<typeof loadRider>> | null = null;

  constructor(canvasEl: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // the sky photograph, as background and as what the paint reflects
    const sky = loader.load(asset("sky/sky.jpg"), (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = t;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(t).texture;
      this.scene.environmentIntensity = 0.6;
    });
    void sky;
    this.scene.background = new THREE.Color("#94aefa");
    // aerial haze, the colour the range fades to at its foot
    this.scene.fog = new THREE.Fog("#bec8e1", 400, 2700);

    this.scene.add(new THREE.HemisphereLight("#dfe6ff", "#5a6a4a", 0.9));
    this.sun = new THREE.DirectionalLight("#fff2dc", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -30;
    s.right = 30;
    s.top = 30;
    s.bottom = -30;
    s.near = 1;
    s.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    // the range rides with the camera, so it never gets closer (V12)
    const panoTex = panoramaTexture();
    panoTex.repeat.set(2, 1);
    this.backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(4200, 4200, 760, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: panoTex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.backdrop.renderOrder = -2;
    this.scene.add(this.backdrop);
    this.scene.add(this.world);

    // beyond the strips, one plain to the horizon that follows the camera;
    // its texture is pinned to the world so it does not slide
    const plainTex = photo("textures/grass_color.jpg", [600, 600]);
    this.plain = new THREE.Mesh(new THREE.CircleGeometry(3000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: plainTex, color: "#b8c8a0", roughness: 1 }));
    this.plain.receiveShadow = false;
    this.scene.add(this.plain);

    loadRider().then((a) => {
      this.riderAsset = a;
    });
  }

  setTrack(track: Track): void {
    if (this.track === track) return;
    this.track = track;
    this.world.clear();
    const flat = (): number => 0;
    const road = new THREE.Mesh(strip(track, -ROAD_HALF, ROAD_HALF, 12, flat), roadMaterial());
    road.receiveShadow = true;
    const dirt = ground("dirt", [1, 1], "#a88a70");
    const left = new THREE.Mesh(strip(track, -SHOULDER, -ROAD_HALF, 3, () => -0.02, 1), dirt);
    const right = new THREE.Mesh(strip(track, ROAD_HALF, SHOULDER, 3, () => -0.02, 1), dirt);
    left.receiveShadow = right.receiveShadow = true;
    const meadow = ground("grass", [1, 1], "#c8d8b0");
    const bands = [SHOULDER, SHOULDER + 12, SHOULDER + 30, MEADOW];
    for (let b = 0; b < bands.length - 1; b++) {
      for (const side of [-1, 1]) {
        const [a, z] = side < 0 ? [-bands[b + 1], -bands[b]] : [bands[b], bands[b + 1]];
        const m = new THREE.Mesh(strip(track, a, z, 6, rise, (bands[b + 1] - bands[b]) / 6), meadow);
        m.receiveShadow = b === 0;
        this.world.add(m);
      }
    }
    this.world.add(road, left, right);

    // pines as three crossed cards each, instanced (V12)
    const trees = track.scenery.filter((s) => s.kind === "tree");
    const pineMat = new THREE.MeshStandardMaterial({ map: pineTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const card = new THREE.PlaneGeometry(5, 10).translate(0, 5, 0);
    const cards = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => card.clone().rotateY(a));
    const m4 = new THREE.Matrix4();
    const rand = rng(77);
    const placements = trees.map((s) => {
      const f = frameAt(track, s.z, s.x);
      const scale = 0.75 + rand() * 0.7;
      return m4
        .compose(new THREE.Vector3(f.px, f.py + rise(s.z, s.x), f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(scale, scale * (0.85 + rand() * 0.4), scale))
        .clone();
    });
    for (const g of cards) {
      const inst = new THREE.InstancedMesh(g, pineMat, placements.length);
      placements.forEach((p, i) => inst.setMatrixAt(i, p));
      inst.castShadow = true;
      this.world.add(inst);
    }

    const poles = track.scenery.filter((s) => s.kind === "pole");
    const wood = new THREE.MeshStandardMaterial({ color: "#6e5238", roughness: 0.9 });
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 8).translate(0, 4, 0), wood, poles.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 7.4, 0), wood, poles.length);
    poles.forEach((s, i) => {
      const f = frameAt(track, s.z, s.x);
      m4.compose(new THREE.Vector3(f.px, f.py, f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.heading + Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      pole.setMatrixAt(i, m4);
      arms.setMatrixAt(i, m4);
    });
    pole.castShadow = arms.castShadow = true;
    this.world.add(pole, arms);

    const chevron = (() => {
      const [c, ctx] = canvas(64, 64);
      ctx.fillStyle = "#e8c020";
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = "#101010";
      ctx.beginPath();
      ctx.moveTo(44, 8);
      ctx.lineTo(20, 32);
      ctx.lineTo(44, 56);
      ctx.lineTo(32, 56);
      ctx.lineTo(8, 32);
      ctx.lineTo(32, 8);
      ctx.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const post = new THREE.MeshStandardMaterial({ color: "#9a9aa0", metalness: 0.6, roughness: 0.4 });
    for (const s of track.scenery.filter((x) => x.kind === "sign")) {
      const f = frameAt(track, s.z, s.x);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6).translate(0, 0.65, 0), post));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: chevron, side: THREE.DoubleSide }));
      face.position.y = 1.6;
      if (s.x < 0) face.scale.x = -1;
      g.add(face);
      g.position.set(f.px, f.py, f.pz);
      g.rotation.y = f.heading + Math.PI;
      this.world.add(g);
    }

    // a steel guardrail on posts along the outside of the bends (V12)
    const railMat = new THREE.MeshStandardMaterial({ color: "#b4b4bc", metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
    const k = track.curve;
    let start = -1;
    for (let i = 0; i <= track.segments; i++) {
      const bend = i < track.segments && Math.abs(k[i]) > 1 / 260 ? Math.sign(k[i]) : 0;
      if (bend !== 0 && start < 0) start = i;
      if ((bend === 0 || i === track.segments) && start >= 0) {
        const side = -Math.sign(k[start]) * (SHOULDER + 0.3);
        const g = strip(track, side, side + 0.02, 4, flat, 1);
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) + (v % 2 === 1 ? 0.75 : 0.42));
        g.computeVertexNormals();
        g.setDrawRange(start * 6, (i - start) * 6);
        this.world.add(new THREE.Mesh(g, railMat));
        for (let z = start * SEGMENT; z < i * SEGMENT; z += 4) {
          const f = frameAt(track, z, side);
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(0, 0.35, 0), post);
          p.position.set(f.px, f.py, f.pz);
          this.world.add(p);
        }
        start = -1;
      }
    }

    // start and finish: white line and chequered band across the road (V16)
    this.world.add(this.lineAcross(track, 30, false), this.lineAcross(track, track.length, true));

    for (const r of this.riders.values()) this.scene.remove(r.root, r.bike);
    this.riders.clear();
    for (const c of this.cars.values()) this.scene.remove(c);
    this.cars.clear();
  }

  private lineAcross(track: Track, z: number, chequered: boolean): THREE.Mesh {
    const [c, ctx] = canvas(16, 2);
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 2; y++) {
        ctx.fillStyle = !chequered || (x + y) % 2 === 0 ? "#f0f0f0" : "#101010";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    const f = frameAt(track, z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, chequered ? 1.6 : 0.6), new THREE.MeshStandardMaterial({ map: t }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = f.heading;
    mesh.position.set(f.px, f.py + 0.02, f.pz);
    mesh.receiveShadow = true;
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
  draw(riders: readonly Rider[], me: number, dashTop = 0.23, cars: readonly Car[] = []): void {
    const track = this.track;
    if (!track) return;
    this.placeCars(track, cars);
    const mine = riders.find((r) => r.id === me) ?? riders[0];
    if (this.riderAsset) riders.forEach((r) => this.place(track, r));
    for (const [id, model] of this.riders) {
      if (!riders.some((r) => r.id === id)) {
        this.scene.remove(model.root, model.bike);
        this.riders.delete(id);
      }
    }

    // the chase camera (V2): low, behind, never rolling
    const off = mine.phase === "thrown" || mine.phase === "running";
    const z = off ? Math.min(mine.z, mine.bikeZ) - 3 : mine.z;
    const x = off ? (mine.x + mine.bikeX) / 2 : mine.x;
    const eye = frameAt(track, z - 6.0, x * 0.9);
    const look = frameAt(track, z + 14, x * 0.9);
    this.camera.position.set(eye.px, eye.py + 1.95, eye.pz);
    // aim below the horizon so the rider sits above the dashboard (V2, V7)
    this.camera.lookAt(look.px, look.py + 0.55 - dashTop * 1.2, look.pz);
    this.backdrop.position.set(this.camera.position.x, this.camera.position.y + 380 - 40, this.camera.position.z);
    // the plain sits a little below the road here, and its texture moves
    // against it so the grass stays put in the world
    const map = (this.plain.material as THREE.MeshStandardMaterial).map!;
    this.plain.position.set(this.camera.position.x, eye.py + PLAIN, this.camera.position.z);
    map.offset.set(this.camera.position.x / 10, -this.camera.position.z / 10);
    // the sun's shadow box follows the camera
    const at = frameAt(track, z + 10, x);
    this.sun.target.position.set(at.px, at.py, at.pz);
    this.sun.position.set(at.px - 30, at.py + 60, at.pz - 20);
    this.renderer.render(this.scene, this.camera);
  }

  /** Traffic: a model per car, made the first time it is near (V17). */
  private placeCars(track: Track, cars: readonly Car[]): void {
    const flash = Math.floor(performance.now() / 250) % 2;
    for (const c of cars) {
      let g = this.cars.get(c.id);
      if (!g) {
        g = buildCar(c.kind, c.id);
        this.cars.set(c.id, g);
        this.scene.add(g);
      }
      g.visible = c.z > -1e5;
      if (!g.visible) continue;
      const f = frameAt(track, c.z, c.x);
      g.position.set(f.px, f.py, f.pz);
      g.rotation.set(0, f.heading + (c.dir < 0 ? Math.PI : 0), 0);
      if (c.kind === "police") {
        // the light bar alternates red and blue
        const bar = g.children.find((o) => o.position.y > 1.5 && o.children.length === 2);
        bar?.children.forEach((o, i) => (((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = i === flash ? 2.5 : 0.2));
      }
    }
  }

  private model(r: Rider): RiderModel {
    let model = this.riders.get(r.id);
    if (model) return model;
    // a cop: navy uniform, white helmet, a white bike with black panels
    const [main, trim, helmet] = r.cop ? ["#1c2640", "#1c2640", "#f4f4f4"] : LEATHERS[r.id % LEATHERS.length];
    const root = new THREE.Group();
    const lean = new THREE.Group();
    const seat = new THREE.Group();
    const bike = r.cop ? buildBike("#f2f2f2", "#141418") : buildBike(main, trim);
    const rig = buildRider(this.riderAsset!, { main, trim, helmet });
    if (r.weapon === "club") rig.bones.hand_r?.add(buildClub());
    lean.add(seat);
    root.add(lean);
    seat.add(rig.root);
    // find where the clip's pelvis sits and put it on the saddle
    rig.actions.Driving_Loop.play();
    rig.mixer.setTime(0.4);
    rig.root.updateMatrixWorld(true);
    crouch(rig);
    rig.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    rig.bones.pelvis.getWorldPosition(p);
    const seatOffset = new THREE.Vector3(0, 0.9 - p.y, -0.28 - p.z);
    model = { root, lean, seat, bike, rig, seatOffset };
    this.scene.add(root, bike);
    this.riders.set(r.id, model);
    return model;
  }

  private place(track: Track, r: Rider): void {
    const model = this.model(r);
    const { rig } = model;
    const thrown = r.phase === "thrown";
    const running = r.phase === "running";
    const f = frameAt(track, r.z, r.x);
    model.root.position.set(f.px, f.py, f.pz);
    model.root.rotation.set(0, f.heading, 0);

    // the bike: under the rider, or on its side where it fell (M2)
    if (thrown || running) {
      const b = frameAt(track, r.bikeZ, r.bikeX);
      model.bike.position.set(b.px, b.py + 0.16, b.pz);
      model.bike.rotation.set(0, b.heading + 0.5, Math.PI / 2);
      model.lean.rotation.set(0, 0, 0);
    } else {
      model.bike.position.copy(model.root.position);
      // the whole bike and rider roll together, up to about 35° (V5)
      model.bike.rotation.set(0, f.heading, r.lean * 0.62, "YXZ");
      model.lean.rotation.set(0, 0, r.lean * 0.62);
    }

    // the rider's clip, driven by the simulation's own clock so every
    // browser shows the same moment
    unbend(rig);
    const play = (name: string, time: number, loop = true): void => {
      for (const [n, a] of Object.entries(rig.actions)) {
        if (n === name) {
          if (!a.isRunning()) a.play();
          a.setEffectiveWeight(1);
          const d = a.getClip().duration;
          a.time = loop ? time % d : Math.min(time, d - 0.001);
        } else a.stop();
      }
      rig.mixer.update(0);
    };
    if (thrown) {
      play("Death01", r.phaseT * 1.6, false);
      rig.root.position.set(0, Math.sin(Math.min(1, r.phaseT / TUNE.thrownTime) * Math.PI) * 0.8, 0);
      rig.root.rotation.set(0, Math.PI, 0);
    } else if (running) {
      play("Jog_Fwd_Loop", r.phaseT);
      rig.root.position.set(0, 0, 0);
      // face the bike
      const dz = r.bikeZ - r.z;
      const dx = r.bikeX - r.x;
      rig.root.rotation.set(0, Math.atan2(-dx, dz), 0);
    } else {
      play("Driving_Loop", 0.4 + (r.id % 7) * 0.05);
      rig.root.position.copy(model.seatOffset);
      rig.root.rotation.set(0, 0, 0);
      rig.root.updateMatrixWorld(true);
      crouch(rig);
      if (r.attack) this.swing(rig, r.weapon && r.attack.kind !== "kick" ? "club" : r.attack.kind, r.attack.side, Math.min(1, r.attack.t / TUNE.windup));
    }
  }

  /**
   * A swing throws an arm straight out sideways; a kick swings a leg out to
   * the same side; a backhand sweeps the arm out behind (V15, C3).
   */
  private swing(rig: RiderRig, kind: string, side: number, out: number): void {
    const s = side > 0 ? "r" : "l"; // +x in road terms is the rider's right
    const away = side > 0 ? -1 : 1; // which way "outward" turns about forward
    const b = rig.bones;
    if (kind === "kick") {
      bend(rig, b[`thigh_${s}`], FORWARD, away * 0.9 * out);
      bend(rig, b[`calf_${s}`], RIGHT, 1.0 * out);
      return;
    }
    // shoulder out to the side, elbow straight; a club is raised higher
    bend(rig, b[`upperarm_${s}`], FORWARD, away * (kind === "club" ? 1.9 : 1.3) * out);
    bend(rig, b[`lowerarm_${s}`], RIGHT, 0.6 * out);
    if (kind === "backhand") bend(rig, b[`upperarm_${s}`], new THREE.Vector3(0, 1, 0), -away * 0.9 * out);
  }
}
