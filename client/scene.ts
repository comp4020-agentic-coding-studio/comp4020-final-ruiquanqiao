// The race in 3D (ledger V1–V17): a textured road through real geometry, a low
// chase camera behind the rider, sky and mountains on the horizon. The rider
// and bike come from client/models.ts; the ground, rock and sky are CC0
// photographs (client/public/assets/ASSETS.md); the road markings, the
// mountain skyline and the pines are drawn here in code. Nothing comes from
// the game itself.

import * as THREE from "three";
import { type Car, type Rider, TUNE, type Weapon, windupOf } from "../game/sim.ts";
import { BIOMES, type Biome, OPEN, ROAD_HALF, SEGMENT, SHOULDER, type Track, biomeAt, segmentAt } from "../game/track.ts";
import { groundAt } from "../game/terrain.ts";
import { centreline, frameAt } from "../game/world.ts";
import { Terrain, ribbons, sea, terrainMaterial, town } from "./land.ts";
import { buildCar } from "./models.ts";
import { type Atlas, type Look, RiderSprite, buildAtlas, frameFor } from "./sprites.ts";

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
type Skyline = { snow: boolean; veil: string; peaks: number; low: number; flat: number };

/** Each road's distant range (V12): snow peaks over the pines, green hills
 * over the coast and valley, dry brown ranges, red mesas over the canyon. */
const SKYLINES: Skyline[] = [
  { snow: true, veil: "rgba(140,140,175,0.55)", peaks: 10, low: 150, flat: 1 },
  { snow: false, veil: "rgba(120,150,120,0.6)", peaks: 4, low: 230, flat: 2.2 },
  { snow: false, veil: "rgba(140,160,120,0.6)", peaks: 3, low: 250, flat: 2.6 },
  { snow: false, veil: "rgba(170,140,110,0.55)", peaks: 6, low: 200, flat: 1.6 },
  { snow: false, veil: "rgba(190,110,80,0.5)", peaks: 8, low: 210, flat: 3.2 },
];

function panoramaTexture(line: Skyline): THREE.CanvasTexture {
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
  for (let i = 0; i < line.peaks; i++) peaks.push({ x: rand() * w, top: (line.snow ? 15 : 120) + rand() * 80, slope: (1.0 + rand() * 0.8) / line.flat });
  for (let i = 0; i < 46; i++) peaks.push({ x: rand() * w, top: line.low + rand() * 200, slope: (0.9 + rand() * 1.4) / line.flat });
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
      ctx.fillStyle = line.veil;
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
    for (let x = 0; x < (line.snow ? w : 0); x++) {
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

/** Other trees and shrubs as silhouettes for crossed cards: a broad
 * field tree, a wind-flattened coast tree, a scrubby canyon tree, a bush. */
function crownTexture(kind: "broad" | "coast" | "scrub" | "bush"): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  const rand = rng(kind.length * 97);
  const blob = (x: number, y: number, rx: number, ry: number, n: number, dark: number): void => {
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand());
      const shade = dark + rand() * 40;
      ctx.fillStyle = kind === "scrub" ? `rgb(${shade * 0.9},${shade + 10},${shade * 0.5})` : `rgb(${shade * 0.6},${shade + 25},${shade * 0.45})`;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d * rx, y + Math.sin(a) * d * ry, 6 + rand() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ctx.fillStyle = "#4a3828";
  if (kind === "broad") {
    ctx.fillRect(w / 2 - 8, h * 0.55, 16, h * 0.45);
    blob(w / 2, h * 0.38, 100, 85, 700, 35);
  } else if (kind === "coast") {
    // a leaning trunk under a flat, layered canopy
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, h);
    ctx.lineTo(w / 2 + 14, h * 0.4);
    ctx.lineTo(w / 2 + 22, h * 0.4);
    ctx.lineTo(w / 2 + 6, h);
    ctx.fill();
    blob(w / 2 + 10, h * 0.32, 115, 30, 500, 30);
    blob(w / 2 - 30, h * 0.45, 60, 18, 160, 25);
  } else if (kind === "scrub") {
    ctx.fillRect(w / 2 - 5, h * 0.6, 10, h * 0.4);
    blob(w / 2, h * 0.5, 90, 70, 450, 45);
  } else {
    blob(w / 2, h * 0.62, 115, 90, 650, 30);
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

/** Shoulder colours: dirt in the country, grey pavement in town (V10). */
function tint(track: Track, g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  const dirt = new THREE.Color("#a88a70");
  const pave = new THREE.Color("#8c8890");
  const sand = new THREE.Color("#c0a080");
  for (let v = 0; v < n; v++) {
    const b = biomeAt(track, Math.floor(v / 2) * SEGMENT);
    const c = b === "town" ? pave : b === "coast" || b === "canyon" ? sand : dirt;
    col.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

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

/** A rider on the road: the sprite, the bike's own sprite for when they part
 * company (M2), and a shadow under each. */
type Actor = { rider: RiderSprite; bike: RiderSprite; shadow: THREE.Mesh; bikeShadow: THREE.Mesh };

/** A soft dark ellipse for under a bike, as the original casts one. */
const shadowMaterial = (() => {
  let m: THREE.MeshBasicMaterial | null = null;
  return (): THREE.MeshBasicMaterial => {
    if (m) return m;
    const [c, ctx] = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return (m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  };
})();

// ---- the scene ----

export class RaceScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.3, 6000);
  private track: Track | null = null;
  private world = new THREE.Group();
  private riders = new Map<number, Actor>();
  private atlas: Atlas | null = null;
  private cars = new Map<number, THREE.Group>();
  private backdrop: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private terrain: Terrain | null = null;
  private sea: THREE.Mesh | null = null;
  private grass: THREE.Texture;
  private rock: THREE.Texture;
  private landMat: THREE.MeshStandardMaterial;
  private camX = 0;
  private lastDraw = 0;

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
    this.scene.fog = new THREE.Fog("#bec8e1", 500, 1750);

    // bright fill from the sky: cliff and canyon faces turned from the sun
    // are lit in the original, not black
    this.scene.add(new THREE.HemisphereLight("#e8eeff", "#8a7a60", 1.5));
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
    this.backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(4200, 4200, 760, 96, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.backdrop.renderOrder = -2;
    this.scene.add(this.backdrop);
    this.scene.add(this.world);

    this.grass = photo("textures/grass_color.jpg", [1, 1]);
    this.rock = photo("textures/rock_color.jpg", [1, 1]);
    this.landMat = terrainMaterial(this.grass, this.rock);

  }

  setTrack(track: Track): void {
    if (this.track === track) return;
    this.track = track;
    this.world.clear();
    const flat = (): number => 0;
    const panoTex = panoramaTexture(SKYLINES[track.id % SKYLINES.length]);
    panoTex.repeat.set(2, 1);
    const back = this.backdrop.material as THREE.MeshBasicMaterial;
    back.map?.dispose();
    back.map = panoTex;
    back.needsUpdate = true;

    const road = new THREE.Mesh(strip(track, -ROAD_HALF, ROAD_HALF, 12, flat), roadMaterial());
    road.receiveShadow = true;
    // dirt shoulders in the country, grey pavement in town (V10)
    const dirt = ground("dirt", [1, 1], "#ffffff");
    dirt.vertexColors = true;
    const left = new THREE.Mesh(tint(track, strip(track, -SHOULDER, -ROAD_HALF, 3, () => -0.02, 1)), dirt);
    const right = new THREE.Mesh(tint(track, strip(track, ROAD_HALF, SHOULDER, 3, () => -0.02, 1)), dirt);
    left.receiveShadow = right.receiveShadow = true;
    this.world.add(road, left, right, ...ribbons(track, this.landMat), town(track));

    this.terrain = new Terrain(track, this.landMat);
    this.world.add(this.terrain.group);
    const origin = frameAt(track, 0);
    this.terrain.fill(origin.px, origin.pz);
    this.sea = sea(track);
    if (this.sea) this.world.add(this.sea);

    const groundY = (z: number, x: number): number => frameAt(track, z, x).py + groundAt(track, z, x);
    const m4 = new THREE.Matrix4();
    const rand = rng(77);
    // trees as three crossed cards each, instanced, the kind the country
    // grows (V12)
    const cards = (w: number, h: number): THREE.PlaneGeometry[] => {
      const card = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
      return [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => card.clone().rotateY(a));
    };
    const forest = (items: { z: number; x: number }[], tex: THREE.Texture, w: number, h: number): void => {
      if (!items.length) return;
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
      const placements = items.map((s) => {
        const f = frameAt(track, s.z, s.x);
        const scale = 0.75 + rand() * 0.7;
        return m4
          .compose(new THREE.Vector3(f.px, groundY(s.z, s.x) - 0.1, f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)), new THREE.Vector3(scale, scale * (0.85 + rand() * 0.4), scale))
          .clone();
      });
      for (const g of cards(w, h)) {
        const inst = new THREE.InstancedMesh(g, mat, placements.length);
        placements.forEach((p, i) => inst.setMatrixAt(i, p));
        inst.castShadow = true;
        this.world.add(inst);
      }
    };
    const trees = track.scenery.filter((s) => s.kind === "tree");
    const by = (b: Biome): { z: number; x: number }[] => trees.filter((s) => biomeAt(track, s.z) === b);
    forest(by("alpine"), pineTexture(), 5, 10);
    forest([...by("valley"), ...by("town")], crownTexture("broad"), 9, 9);
    forest(by("coast"), crownTexture("coast"), 11, 8);
    forest(by("canyon"), crownTexture("scrub"), 6, 5);
    forest(
      track.scenery.filter((s) => s.kind === "bush"),
      crownTexture("bush"),
      2.6,
      1.8,
    );
    // boulders fallen to the foot of the walls
    const rocks = track.scenery.filter((s) => s.kind === "rock");
    if (rocks.length) {
      const boulder = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#a07860", roughness: 1, flatShading: true }), rocks.length);
      rocks.forEach((s, i) => {
        const f = frameAt(track, s.z, s.x);
        m4.compose(new THREE.Vector3(f.px, f.py + 0.4, f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand() * 6, rand())), new THREE.Vector3(1.3, 0.9 + rand() * 0.5, 1.1));
        boulder.setMatrixAt(i, m4);
      });
      boulder.castShadow = true;
      this.world.add(boulder);
    }

    const poles = track.scenery.filter((s) => s.kind === "pole" || s.kind === "lamp");
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
      const open = i < track.segments && track.wallL[i] >= OPEN && track.wallR[i] >= OPEN;
      const bend = open && Math.abs(k[i]) > 1 / 330 ? Math.sign(k[i]) : 0;
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

    // the sea rail, all along the coast's open side
    let from = -1;
    for (let i = 0; i <= track.segments; i++) {
      const coast = i < track.segments && BIOMES[track.biome[i]] === "coast";
      if (coast && from < 0) from = i;
      if ((!coast || i === track.segments) && from >= 0) {
        const off = track.wallR[from] - 0.1;
        const g = strip(track, off, off + 0.02, 4, flat, 1);
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) pos.setY(v, pos.getY(v) + (v % 2 === 1 ? 0.8 : 0.4));
        g.computeVertexNormals();
        g.setDrawRange(from * 6, (i - from) * 6);
        this.world.add(new THREE.Mesh(g, railMat));
        from = -1;
      }
    }

    // start and finish: white line and chequered band across the road (V16)
    this.world.add(this.lineAcross(track, 30, false), this.lineAcross(track, track.length, true));

    for (const a of this.riders.values()) this.scene.remove(a.rider.mesh, a.bike.mesh, a.shadow, a.bikeShadow);
    this.riders.clear();
    // every rider's frames, drawn once, the first time a road is shown
    this.atlas ??= buildAtlas(this.renderer);
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
    for (const [id, a] of this.riders) {
      if (!riders.some((r) => r.id === id)) {
        this.scene.remove(a.rider.mesh, a.bike.mesh, a.shadow, a.bikeShadow);
        this.riders.delete(id);
      }
    }

    // the chase camera (V2): low, behind, never rolling
    const off = mine.phase === "thrown" || mine.phase === "running";
    const z = off ? Math.min(mine.z, mine.bikeZ) - 3 : mine.z;
    // the camera trails the bike sideways and catches up over about half a
    // second, as the original's does (docs/road-rash-feel.md §4)
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastDraw));
    this.lastDraw = now;
    const target = off ? (mine.x + mine.bikeX) / 2 : mine.x;
    // ... but never far: the rider stays within about a fifth of the width
    // of centre (0.16-0.21 W measured), not out at the edge
    const lagged = this.camX + (target - this.camX) * (1 - Math.exp(-dt / 0.2));
    this.camX = Math.abs(target - this.camX) > 12 ? target : Math.min(target + 1.5, Math.max(target - 1.5, lagged));
    const x = this.camX;
    const eye = frameAt(track, z - 6.0, x);
    const look = frameAt(track, z + 14, x);
    this.camera.position.set(eye.px, eye.py + 1.95, eye.pz);
    // aim below the horizon so the rider sits above the dashboard (V2, V7)
    this.camera.lookAt(look.px, look.py + 0.55 - dashTop * 1.2, look.pz);
    this.backdrop.position.set(this.camera.position.x, this.camera.position.y + 380 - 40, this.camera.position.z);
    this.terrain?.update(this.camera.position.x, this.camera.position.z);
    this.sea?.position.set(this.camera.position.x, track.water ?? 0, this.camera.position.z);
    this.camera.updateMatrixWorld();
    riders.forEach((r) => this.place(track, r));
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

  private actor(r: Rider): Actor {
    let a = this.riders.get(r.id);
    if (a) return a;
    // a cop: navy uniform, white helmet, a white bike with black panels
    const [main, trim, helmet] = r.cop ? ["#1c2640", "#1c2640", "#f4f4f4"] : LEATHERS[r.id % LEATHERS.length];
    const look: Look = r.cop ? { main, trim, helmet, paint: "#f2f2f2", paintTrim: "#141418" } : { main, trim, helmet, paint: main, paintTrim: trim };
    const shadow = (): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMaterial());
      m.renderOrder = 1;
      return m;
    };
    a = { rider: new RiderSprite(this.atlas!, look), bike: new RiderSprite(this.atlas!, look), shadow: shadow(), bikeShadow: shadow() };
    this.scene.add(a.rider.mesh, a.bike.mesh, a.shadow, a.bikeShadow);
    this.riders.set(r.id, a);
    return a;
  }

  /**
   * Stand a sprite at road coordinate (z, x), turned to the camera, showing
   * `frame` as seen from wherever the camera is relative to `heading`.
   */
  private stand(track: Track, s: RiderSprite, frame: string, z: number, x: number, lift: number, lean: number, heading?: number): number {
    const f = frameAt(track, z, x);
    const cam = this.camera.position;
    const cx = cam.x - f.px;
    const cz = cam.z - f.pz;
    const h = heading ?? f.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // positive when the camera is off the rider's right
    const view = Math.atan2(cx * -fz + cz * fx, -(cx * fx + cz * fz));
    s.show(frame, view);
    s.mesh.position.set(f.px, f.py + lift, f.pz);
    // turned to face the camera, and leaned about the tyre's contact patch;
    // a lean to the right tips the sprite clockwise from behind (V5)
    s.mesh.rotation.set(0, Math.atan2(cx, cz), -lean * 0.62 * Math.cos(view), "YXZ");
    return f.heading;
  }

  private place(track: Track, r: Rider): void {
    if (!this.atlas) return;
    const a = this.actor(r);
    const off = r.phase === "thrown" || r.phase === "running";
    const shadowAt = (m: THREE.Mesh, z: number, x: number, w: number, l: number): void => {
      const f = frameAt(track, z, x);
      m.position.set(f.px, f.py + 0.03, f.pz);
      m.rotation.set(0, f.heading, 0);
      m.scale.set(w, 1, l);
    };
    a.bike.mesh.visible = a.bikeShadow.visible = off;
    if (off) {
      // the bike down on its side where it fell, sliding on (V13)
      this.stand(track, a.bike, "bikeDown", r.bikeZ, r.bikeX, 0, 0);
      shadowAt(a.bikeShadow, r.bikeZ, r.bikeX, 1.4, 2.2);
    }
    if (r.phase === "thrown") {
      // thrown clear, spread-eagled and turning over, then down on the road
      const u = r.phaseT / (TUNE.thrownTime * 0.75);
      if (u < 1) {
        const frame = `tumble${Math.floor(r.phaseT * 9) % 3}`;
        this.stand(track, a.rider, frame, r.z, r.x, -0.75 + Math.sin(u * Math.PI) * 1.3, 0);
      } else this.stand(track, a.rider, "lying", r.z, r.x, 0, 0);
      shadowAt(a.shadow, r.z, r.x, 1.0, 1.6);
      return;
    }
    if (r.phase === "running") {
      // on foot, back to the bike: facing it
      const from = frameAt(track, r.z, r.x);
      const to = frameAt(track, r.bikeZ, r.bikeX);
      const heading = Math.atan2(to.px - from.px, to.pz - from.pz);
      this.stand(track, a.rider, `run${Math.floor(r.phaseT * 8) % 4}`, r.z, r.x, 0, 0, heading);
      shadowAt(a.shadow, r.z, r.x, 0.6, 0.6);
      return;
    }
    this.stand(track, a.rider, frameFor(r), r.z, r.x, 0, r.lean);
    shadowAt(a.shadow, r.z, r.x, 0.9, 2.3);
  }



}
