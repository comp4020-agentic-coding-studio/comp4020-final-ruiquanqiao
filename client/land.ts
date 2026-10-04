// The land the road runs through, as meshes: game/terrain.ts says how high
// the ground is; this file lays it out. Close to the road the ground is a set
// of ribbons that follow the road's own cross-section, so a cliff face or a
// bank meets the shoulder exactly. Beyond them it is a heightfield built in
// square chunks around the camera, each vertex placed relative to the nearest
// point of road. The heightfield is held under the ribbons near the road, so
// a coarse grid triangle can never poke up through the asphalt.

import * as THREE from "three";
import { BIOMES, type Biome, OPEN, SEGMENT, SHOULDER, type Track, segmentAt } from "../game/track.ts";
import { biomeMix, groundAt, noise, rockAt } from "../game/terrain.ts";
import { centreline, frameAt } from "../game/world.ts";

/** Offsets beyond the shoulder that the ribbons are sampled at, metres. Fine
 * where cliffs rise straight off the verge, coarser further out. */
export const RIBBON = [SHOULDER, SHOULDER + 0.6, SHOULDER + 1.4, SHOULDER + 2.4, SHOULDER + 3.6, SHOULDER + 5, SHOULDER + 7, SHOULDER + 9.5, SHOULDER + 13, 28, 36, 46, 58, 72];
const RIBBON_END = RIBBON[RIBBON.length - 1];

// ground colours per country, multiplied over the photographs
const TINT: Record<Biome, [THREE.Color, THREE.Color]> = {
  // [grass tint, rock tint]
  alpine: [new THREE.Color("#c4d6a8"), new THREE.Color("#b4b0b8")],
  valley: [new THREE.Color("#d8d890"), new THREE.Color("#c0a888")],
  coast: [new THREE.Color("#c8bc8c"), new THREE.Color("#f0d8b0")],
  town: [new THREE.Color("#c8c09c"), new THREE.Color("#b8a890")],
  canyon: [new THREE.Color("#d8b080"), new THREE.Color("#f4a070")],
};

const tmp = new THREE.Color();
const tmpRock = new THREE.Color();

/** The blended ground colours at z, for vertex colours. */
function tintAt(track: Track, z: number, rock: number, out: THREE.Color): THREE.Color {
  const m = biomeMix(track);
  const i = segmentAt(track, z);
  const k = BIOMES.length;
  out.setRGB(0, 0, 0);
  for (let b = 0; b < k; b++) {
    const w = m[i * k + b];
    if (w < 0.001) continue;
    const [g, r] = TINT[BIOMES[b]];
    tmpRock.copy(g).lerp(r, rock);
    out.r += tmpRock.r * w;
    out.g += tmpRock.g * w;
    out.b += tmpRock.b * w;
  }
  return out;
}

/**
 * Grass and rock photographs blended per vertex, the rock projected from the
 * side so a cliff face is not one long smear. One material for ribbons and
 * heightfield alike, so they meet without a seam in colour.
 */
export function terrainMaterial(grass: THREE.Texture, rock: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: rock };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float rocky;\nvarying float vRocky;\nvarying vec3 vWorldP;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvRocky = rocky;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D rockMap;\nvarying float vRocky;\nvarying vec3 vWorldP;")
      .replace(
        "#include <map_fragment>",
        `vec4 grassTex = texture2D(map, vWorldP.xz / 7.0);
        vec3 n = abs(normalize(cross(dFdx(vWorldP), dFdy(vWorldP))));
        vec4 rockTex = (texture2D(rockMap, vWorldP.zy / 9.0) * n.x + texture2D(rockMap, vWorldP.xy / 9.0) * n.z + texture2D(rockMap, vWorldP.xz / 9.0) * n.y) / (n.x + n.y + n.z);
        // the rock photograph is a dark granite; the original's cliffs are
        // sunlit sandstone, so it is lifted before the country's tint
        diffuseColor *= mix(grassTex, min(rockTex * 1.9, vec4(1.0)), vRocky);`,
      );
  };
  return m;
}

/** Ribbons of ground beside the road, from the shoulder out to RIBBON_END. */
export function ribbons(track: Track, material: THREE.Material): THREE.Mesh[] {
  const c = centreline(track);
  const n = track.segments + 1;
  const cols = RIBBON.length;
  const out: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pos = new Float32Array(n * cols * 3);
    const col = new Float32Array(n * cols * 3);
    const rocky = new Float32Array(n * cols);
    for (let i = 0; i < n; i++) {
      const z = i * SEGMENT;
      const h = c.heading[i];
      const rx = -Math.cos(h);
      const rz = Math.sin(h);
      for (let j = 0; j < cols; j++) {
        const x = side * RIBBON[j];
        const v = i * cols + j;
        pos[v * 3] = c.x[i] + rx * x;
        pos[v * 3 + 1] = c.y[i] + groundAt(track, z, x);
        pos[v * 3 + 2] = c.z[i] + rz * x;
        rocky[v] = rockAt(track, z, x);
        tintAt(track, z, rocky[v], tmp);
        col[v * 3] = tmp.r;
        col[v * 3 + 1] = tmp.g;
        col[v * 3 + 2] = tmp.b;
      }
    }
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        // counter-clockwise seen from above on either side
        if (side > 0) index.push(a, b, d, b, e, d);
        else index.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("rocky", new THREE.BufferAttribute(rocky, 1));
    g.setIndex(index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}

// ---- the heightfield beyond the ribbons ----

const CHUNK = 320; // m
const CELLS = 32; // per chunk side, so 10 m cells
const VIEW = 1700; // chunks within this of the camera are kept
const HASH = 80; // m, the spatial hash cell for road points

/**
 * The far ground in chunks, built as the camera comes near them and dropped
 * once it is far. Each vertex finds the nearest point of road and takes the
 * ground height from there.
 */
export class Terrain {
  private chunks = new Map<string, THREE.Mesh>();
  private grid = new Map<string, number[]>();
  private queue: string[] = [];
  readonly group = new THREE.Group();
  private track: Track;
  private material: THREE.Material;

  constructor(track: Track, material: THREE.Material) {
    this.track = track;
    this.material = material;
    const c = centreline(track);
    for (let i = 0; i < c.x.length; i += 2) {
      const key = `${Math.floor(c.x[i] / HASH)},${Math.floor(c.z[i] / HASH)}`;
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, (list = []));
      list.push(i);
    }
  }

  /** Keep the chunks round the camera; build at most `budget` new ones now. */
  update(x: number, z: number, budget = 2): void {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const r = Math.ceil(VIEW / CHUNK);
    const want = new Set<string>();
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const dx = (cx + i + 0.5) * CHUNK - x;
        const dz = (cz + j + 0.5) * CHUNK - z;
        if (Math.hypot(dx, dz) > VIEW + CHUNK * 0.7) continue;
        want.add(`${cx + i},${cz + j}`);
      }
    }
    for (const [k, m] of this.chunks) {
      if (!want.has(k)) {
        this.group.remove(m);
        m.geometry.dispose();
        this.chunks.delete(k);
      }
    }
    // nearest first
    this.queue = [...want].filter((k) => !this.chunks.has(k));
    this.queue.sort((a, b) => dist(a) - dist(b));
    function dist(k: string): number {
      const [i, j] = k.split(",").map(Number);
      return Math.hypot((i + 0.5) * CHUNK - x, (j + 0.5) * CHUNK - z);
    }
    for (let n = 0; n < budget && this.queue.length; n++) this.build(this.queue.shift()!);
  }

  /** Build everything near a point at once, for a race's first frame. */
  fill(x: number, z: number): void {
    this.update(x, z, 0);
    while (this.queue.length) this.build(this.queue.shift()!);
  }

  /**
   * The ground's height at a world point exactly as the GPU draws it: the
   * chunk is built if it is not already, and the point interpolated across
   * the triangle it falls in. For spec/terrain.test.ts.
   */
  surfaceAt(wx: number, wz: number): number {
    const key = `${Math.floor(wx / CHUNK)},${Math.floor(wz / CHUNK)}`;
    if (!this.chunks.has(key)) this.build(key);
    const pos = this.chunks.get(key)!.geometry.getAttribute("position") as THREE.BufferAttribute;
    const n = CELLS + 1;
    const cell = CHUNK / CELLS;
    const fa = (wx - Math.floor(wx / CHUNK) * CHUNK) / cell;
    const fb = (wz - Math.floor(wz / CHUNK) * CHUNK) / cell;
    const a = Math.min(CELLS - 1, Math.floor(fa));
    const b = Math.min(CELLS - 1, Math.floor(fb));
    const u = fa - a;
    const v = fb - b;
    const y = (i: number, j: number): number => pos.getY((a + i) * n + (b + j));
    // the two triangles of a cell, split as the index list splits them
    return u + v <= 1 ? y(0, 0) + (y(0, 1) - y(0, 0)) * v + (y(1, 0) - y(0, 0)) * u : y(1, 1) + (y(1, 0) - y(1, 1)) * (1 - v) + (y(0, 1) - y(1, 1)) * (1 - u);
  }

  private build(key: string): void {
    const [ci, cj] = key.split(",").map(Number);
    const x0 = ci * CHUNK;
    const z0 = cj * CHUNK;
    const c = centreline(this.track);
    // road points that could be nearest to anything in this chunk
    const reach = 900;
    const cand: number[] = [];
    for (let hx = Math.floor((x0 - reach) / HASH); hx <= Math.floor((x0 + CHUNK + reach) / HASH); hx++) {
      for (let hz = Math.floor((z0 - reach) / HASH); hz <= Math.floor((z0 + CHUNK + reach) / HASH); hz++) {
        const l = this.grid.get(`${hx},${hz}`);
        if (l) cand.push(...l);
      }
    }
    const n = CELLS + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const rocky = new Float32Array(n * n);
    const fallback = this.track.height[0];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const wx = x0 + (a * CHUNK) / CELLS;
        const wz = z0 + (b * CHUNK) / CELLS;
        const v = a * n + b;
        let best = -1;
        let bestD = Infinity;
        for (const i of cand) {
          const d = (c.x[i] - wx) ** 2 + (c.z[i] - wz) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        let y: number;
        let rock = 0;
        if (best < 0) {
          // nowhere near the road: rolling country at the start's height
          y = fallback + 20 + noise(wx / 300, wz / 300) * 60;
          tintAt(this.track, 0, 0, tmp);
        } else {
          // refine to the segment, then into road coordinates
          let i = best;
          for (let k = Math.max(0, best - 3); k <= Math.min(c.x.length - 1, best + 3); k++) {
            const d = (c.x[k] - wx) ** 2 + (c.z[k] - wz) ** 2;
            if (d < bestD) {
              bestD = d;
              i = k;
            }
          }
          const h = c.heading[i];
          const fx = Math.sin(h);
          const fz = Math.cos(h);
          const ox = wx - c.x[i];
          const oz = wz - c.z[i];
          const along = ox * fx + oz * fz;
          const across = ox * -fz + oz * fx;
          const z = Math.min(this.track.length, Math.max(0, i * SEGMENT + along));
          const f = frameAt(this.track, z);
          const d = Math.abs(across);
          let g = groundAt(this.track, z, across);
          if (d < RIBBON_END + 12) {
            // under the ribbons: held below them, and well below the road
            // anywhere a grid triangle could reach across the asphalt
            const inner = groundAt(this.track, z, Math.sign(across || 1) * Math.max(SHOULDER + 0.6, d - 14));
            g = Math.min(g, inner) - 2.5;
            if (d < SHOULDER + 16) g = Math.min(g, -4);
          }
          y = f.py + g;
          rock = d < RIBBON_END + 12 ? 0 : rockAt(this.track, z, across);
          tintAt(this.track, z, rock, tmp);
        }
        pos[v * 3] = wx;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = wz;
        rocky[v] = rock;
        col[v * 3] = tmp.r;
        col[v * 3 + 1] = tmp.g;
        col[v * 3 + 2] = tmp.b;
      }
    }
    const index: number[] = [];
    for (let a = 0; a < CELLS; a++) {
      for (let b = 0; b < CELLS; b++) {
        const p = a * n + b;
        index.push(p, p + 1, p + n, p + 1, p + n + 1, p + n);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("rocky", new THREE.BufferAttribute(rocky, 1));
    g.setIndex(index);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.material);
    this.chunks.set(key, mesh);
    this.group.add(mesh);
  }
}

// ---- towns ----

/** A western main-street front, painted in code: boards, windows, a sign band. */
function facade(seed: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const palettes = [
    ["#8a5a38", "#5a3a24", "#e8d8b0"],
    ["#e8e2d0", "#a8a090", "#3a4a6a"],
    ["#a8483a", "#6a2a22", "#f0e0c0"],
    ["#d8c088", "#8a7048", "#2a3a2a"],
  ];
  const [wall, trim, sign] = palettes[seed % palettes.length];
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 256, 256);
  // clapboard lines
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  for (let y = 0; y < 256; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  // a false front with a sign band, upstairs windows, a shop window and door
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = sign;
  ctx.fillRect(28, 26, 200, 34);
  ctx.fillStyle = trim;
  for (const x of [36, 112, 188]) {
    ctx.fillRect(x - 4, 72, 40, 52);
    ctx.fillStyle = "#28303a";
    ctx.fillRect(x, 76, 32, 44);
    ctx.fillStyle = trim;
  }
  // a porch roof across the ground floor
  ctx.fillStyle = trim;
  ctx.fillRect(0, 138, 256, 12);
  ctx.fillStyle = "#1e2228";
  ctx.fillRect(20, 160, 130, 80);
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(176, 164, 50, 92);
  ctx.fillStyle = trim;
  for (let x = 6; x < 256; x += 62) ctx.fillRect(x, 150, 7, 106);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The buildings along every stretch of town, standing at the town's walls. */
export function town(track: Track): THREE.Group {
  const group = new THREE.Group();
  const types = 4;
  const fronts = Array.from({ length: types }, (_, i) => facade(i));
  const plain = new THREE.MeshStandardMaterial({ color: "#7a6450", roughness: 0.9 });
  const roof = new THREE.MeshStandardMaterial({ color: "#4a3e36", roughness: 0.9 });
  const placed: { type: number; m: THREE.Matrix4 }[] = [];
  let s = 7;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (const side of [-1, 1] as const) {
    let z = 0;
    while (z < track.length) {
      const i = segmentAt(track, z);
      const wall = side < 0 ? track.wallL[i] : track.wallR[i];
      if (BIOMES[track.biome[i]] !== "town" || wall >= OPEN) {
        z += SEGMENT;
        continue;
      }
      const width = 10 + rand() * 8;
      const height = 5 + rand() * 6;
      const depth = 12;
      const mid = z + width / 2;
      const end = segmentAt(track, z + width);
      if (BIOMES[track.biome[end]] !== "town") {
        z += width;
        continue;
      }
      const f = frameAt(track, mid, side * (wall + depth / 2));
      const ground = f.py + 0.2;
      // the front faces the road
      const face = Math.atan2(-side * f.rx, -side * f.rz);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(f.px, ground + height / 2, f.pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, face, 0)), new THREE.Vector3(width - 0.4, height, depth));
      placed.push({ type: Math.floor(rand() * types), m });
      // now and then a gap: an alley or a lot
      z += width + (rand() < 0.15 ? 8 + rand() * 10 : 0.3);
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let t = 0; t < types; t++) {
    const mine = placed.filter((p) => p.type === t);
    if (!mine.length) continue;
    // BoxGeometry's groups: +x, -x, +y, -y, +z (the front), -z
    const front = new THREE.MeshStandardMaterial({ map: fronts[t], roughness: 0.85 });
    const inst = new THREE.InstancedMesh(box, [plain, plain, roof, plain, front, plain], mine.length);
    mine.forEach((p, k) => inst.setMatrixAt(k, p.m));
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  }
  return group;
}

/** Sea level, as a sheet following the camera, on roads with a coast. */
export function sea(track: Track): THREE.Mesh | null {
  if (track.water === null) return null;
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(2400, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#2f6aa8", roughness: 0.25, metalness: 0.1 }),
  );
  m.position.y = track.water;
  return m;
}
