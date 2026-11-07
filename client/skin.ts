// The rider's body as a modelled human, skinned onto the puppet's joints.
//
// The original's riders were a modelled human posed per frame and rendered
// to sprites. The puppet here had been built from tapered capsules blended
// into one surface (client/body.ts): every limb a tube, no shoulder, chest,
// biceps or calf, and beside the recording it read as a doll. This takes the
// CC0 base character already in the repo (client/public/assets/ASSETS.md),
// whose surface was modelled as a person's, and drives its skeleton from the
// joints the puppet already solves: each bone is carried from where it is in
// the model's rest pose to the segment between two puppet joints, turned so
// its bend plane matches the limb's, and stretched along its length to fit.
// The poses, the measurements against the recording and every frame rule
// stay as they were; only the surface is new.

import * as THREE from "three";

type V3 = THREE.Vector3;

/** Where the puppet has put each joint, in the body's own space. */
export type BodyJoints = {
  pelvis: V3;
  /** up the back, and forward, unit */
  spine: V3;
  fwd: V3;
  neckBase: V3;
  neckTop: V3;
  head: V3;
  shoulderR: V3;
  shoulderL: V3;
  elbowR: V3;
  elbowL: V3;
  wristR: V3;
  wristL: V3;
  fistR: V3;
  fistL: V3;
  hipR: V3;
  hipL: V3;
  kneeR: V3;
  kneeL: V3;
  ankleR: V3;
  ankleL: V3;
  toeR: V3;
  toeL: V3;
};

/** One bone carried from a rest segment to a posed one. */
function carry(h0: V3, t0: V3, ref0: V3, h1: V3, t1: V3, ref1: V3, thick?: number): THREE.Matrix4 {
  const frame = (h: V3, t: V3, ref: V3): [THREE.Matrix4, number] => {
    const x = t.clone().sub(h);
    const len = x.length();
    x.divideScalar(len);
    let y = ref.clone().addScaledVector(x, -ref.dot(x));
    if (y.lengthSq() < 1e-8) y = Math.abs(x.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return [new THREE.Matrix4().makeBasis(x, y, z), len];
  };
  const [r0, l0] = frame(h0, t0, ref0);
  const [r1, l1] = frame(h1, t1, ref1);
  thick ??= 1;
  return new THREE.Matrix4()
    .makeTranslation(h1.x, h1.y, h1.z)
    .multiply(r1)
    .multiply(new THREE.Matrix4().makeScale(l1 / l0, thick, thick))
    .multiply(r0.clone().transpose())
    .multiply(new THREE.Matrix4().makeTranslation(-h0.x, -h0.y, -h0.z));
}

/** A turn by `angle` about `axis` through `at`. */
const turnAbout = (at: V3, axis: V3, angle: number): THREE.Matrix4 =>
  new THREE.Matrix4()
    .makeTranslation(at.x, at.y, at.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), angle))
    .multiply(new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z));

/**
 * How thick each limb is, measured off the recording from straight behind, in
 * helmet widths (0.29 m), edge to edge across both colours of the leathers:
 * the sleeves and trouser legs are two-tone, the main colour over the top
 * and the second (grey on the blue rider) underneath. An arm held straight
 * out at 413.82 is 0.65 across at the upper arm and 0.38 at the forearm; the
 * leg out at 57.32, 0.68 at the thigh and 0.5 at the shin, square to the
 * leg. Measured over the main colour alone, the first figures (0.4 and 0.28,
 * thigh 0.6, shin 0.42) came out thin. The model is a bodybuilder, and
 * stretched to the puppet's longer limbs its arms came out at 0.71 and 0.42.
 */
export const GIRTH: Record<string, number> = {
  upperarm: 0.65 * 0.29,
  lowerarm: 0.38 * 0.29,
  thigh: 0.68 * 0.29,
  calf: 0.5 * 0.29,
};
/** shoulder to shoulder across the back from behind, the same way: 2.2 helmet widths */
export const SHOULDERS = 2.2 * 0.29;

/** A limb's diameter round the line from `a` to `b`, over the middle third of it. */
export function girth(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: V3, b: V3, near = 0.2): number {
  const d = b.clone().sub(a);
  const L = d.length();
  d.normalize();
  const r: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(a);
    const t = v.dot(d) / L;
    if (t < 0.35 || t > 0.65) continue;
    const perp = v.addScaledVector(d, -t * L).length();
    if (perp < near) r.push(perp);
  }
  r.sort((x, y) => x - y);
  return 2 * (r[Math.floor(r.length * 0.9)] ?? 0);
}

export class SkinnedBody {
  readonly mesh: THREE.SkinnedMesh;
  private bones: THREE.Bone[];
  private bind: THREE.Matrix4[];
  private rest: Record<string, V3> = {};
  private index = new Map<string, number>();
  /** each limb's scale across, to its measured thickness */
  private thick: Record<string, number> = {};
  private across = 1;

  /**
   * `source` is the loaded character; `part` says which atlas part a vertex
   * belongs to from the bone that moves it most and where it sits at rest.
   */
  constructor(source: THREE.Object3D, part: (bone: string, from: V3, along: number, at: V3) => number, colour: (part: number) => THREE.Color, id: (part: number) => THREE.Color) {
    let found: THREE.SkinnedMesh | null = null;
    source.updateMatrixWorld(true);
    source.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !found) found = o as THREE.SkinnedMesh;
    });
    if (!found) throw new Error("no skinned mesh in the rider model");
    const src = found as THREE.SkinnedMesh;
    const bones = src.skeleton.bones.map((b) => {
      const n = new THREE.Bone();
      n.name = b.name;
      // its world matrix is written here, never derived from a parent
      n.matrixAutoUpdate = false;
      n.matrixWorldAutoUpdate = false;
      return n;
    });
    this.bones = bones;
    bones.forEach((b, i) => this.index.set(b.name, i));
    // where each bone sits at rest, in the space the vertices are bound in
    this.bind = src.skeleton.boneInverses.map((m) => m.clone().invert());
    for (const [name, i] of this.index) this.rest[name] = new THREE.Vector3().setFromMatrixPosition(this.bind[i]);

    let geo = src.geometry.clone();
    // bound once, in the model's rest space; the mesh itself sits at the body's origin
    geo.applyMatrix4(src.bindMatrix);
    smooth(geo, 4, 0.5);
    // every triangle its own three vertices, so a triangle is all one part:
    // coloured per shared vertex, a triangle with corners in two parts was
    // blended across the edge. The smoothed normals are kept, so the surface
    // still shades round
    geo = geo.toNonIndexed();
    // the model's back is 0.70 m across at the shoulders (measured over its
    // vertices, arms left out): a bodybuilder's lats
    this.across = SHOULDERS / 0.7;
    const skeleton = new THREE.Skeleton(bones, src.skeleton.boneInverses.map((m) => m.clone()));
    // vertex colours by part: the leathers white where tinted, gloves and boots dark
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const col = new Float32Array(pos.count * 3);
    const ids = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      // the triangle's panel, decided once at its first corner from its middle
      if (v % 3) {
        col.copyWithin(v * 3, v * 3 - 3, v * 3);
        ids.copyWithin(v * 3, v * 3 - 3, v * 3);
        continue;
      }
      // the bone that moves the triangle most, over its three corners
      const weigh = new Map<number, number>();
      for (let c = v; c < v + 3; c++) for (let k = 0; k < 4; k++) weigh.set(si.getComponent(c, k), (weigh.get(si.getComponent(c, k)) ?? 0) + sw.getComponent(c, k));
      const top = [...weigh].sort((a, b) => b[1] - a[1])[0][0];
      const bone = bones[top].name;
      p.fromBufferAttribute(pos, v).add(new THREE.Vector3().fromBufferAttribute(pos, v + 1)).add(new THREE.Vector3().fromBufferAttribute(pos, v + 2)).divideScalar(3);
      // where it sits round its bone, with the bone's own line taken out: the
      // model stands with its arms angled down, so "below the bone" in the
      // world would take in the whole of an arm
      const from = p.clone().sub(this.rest[bone]);
      // and how far along the bone it is, 0 at its root and 1 at its child
      let along = 0;
      const child = src.skeleton.bones[top].children.find((c) => (c as THREE.Bone).isBone);
      if (child) {
        const d = this.rest[child.name].clone().sub(this.rest[bone]);
        const L = d.length();
        d.normalize();
        along = from.dot(d) / L;
        from.addScaledVector(d, -from.dot(d));
      }
      const n = part(bone, from, along, p);
      colour(n).toArray(col, v * 3);
      id(n).toArray(ids, v * 3);
    }
    // each limb's own thickness in the model, to scale to GIRTH, from the
    // vertices its own bone moves most: an arm at rest beside the chest
    // otherwise counts the chest as arm
    const own = (bone: string): THREE.BufferAttribute => {
      const b = this.index.get(bone)!;
      const keep: number[] = [];
      for (let v = 0; v < pos.count; v++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (sw.getComponent(v, k) > sw.getComponent(v, best)) best = k;
        if (si.getComponent(v, best) === b) keep.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      }
      return new THREE.BufferAttribute(new Float32Array(keep), 3);
    };
    for (const l of ["l", "r"])
      for (const [bone, next] of [
        ["upperarm", "lowerarm"],
        ["lowerarm", "hand"],
        ["thigh", "calf"],
        ["calf", "foot"],
      ])
        this.thick[`${bone}_${l}`] = GIRTH[bone] / girth(own(`${bone}_${l}`), this.rest[`${bone}_${l}`], this.rest[`${next}_${l}`], 0.2);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("idColour", new THREE.BufferAttribute(ids, 3));
    geo.userData.shaded = geo.attributes.color;
    // leather is shiny: highlights pick out the shapes the tint alone flattens
    this.mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }));
    this.mesh.bind(skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false;
  }

  private r(name: string): V3 {
    return this.rest[name].clone();
  }

  /** Pose the body: `space` is the body group's world matrix. */
  pose(j: BodyJoints, space: THREE.Matrix4): void {
    const A = new Map<string, THREE.Matrix4>();
    const r = (n: string): V3 => this.r(n);
    const mid = (a: V3, b: V3): V3 => a.clone().add(b).multiplyScalar(0.5);
    const X = new THREE.Vector3(1, 0, 0);
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3(0, 0, 1);

    // the trunk: the hips follow the line across the hips, the chest the
    // line across the shoulders, so a turned chest twists at the waist
    const restShoulders = mid(r("upperarm_l"), r("upperarm_r"));
    const shoulders = mid(j.shoulderL, j.shoulderR);
    const restHips = r("thigh_l").sub(r("thigh_r"));
    const hips = j.hipL.clone().sub(j.hipR);
    const restAcross = r("upperarm_l").sub(r("upperarm_r"));
    const across = j.shoulderL.clone().sub(j.shoulderR);
    // the waist and seat filled out to a rider's: 0.77 of the shoulders'
    // width from behind as modelled, against about 0.9 in the recording
    // (247.64), where the leathers hang straight from the back to the seat
    const lower = carry(r("pelvis"), restShoulders, restHips, j.pelvis, shoulders, hips, 1.15);
    const upper = carry(r("pelvis"), restShoulders, restAcross, j.pelvis, shoulders, across, this.across);
    for (const n of ["root", "Root", "pelvis", "spine_01"]) A.set(n, lower);
    for (const n of ["spine_02", "spine_03", "clavicle_l", "clavicle_r"]) A.set(n, upper);
    // the neck from the collar to the skull, and the head kept small enough
    // to stay inside the helmet, which is a shell of its own
    const HEAD = this.index.has("head") ? "head" : "Head";
    A.set("neck_01", carry(r("neck_01"), r(HEAD), Z, j.neckBase, j.neckTop, j.fwd));
    const skull = r(HEAD).add(new THREE.Vector3(0, 0.12, 0));
    A.set(HEAD, carry(r(HEAD), skull, Z, j.neckTop, j.neckTop.clone().addScaledVector(j.head.clone().sub(j.neckTop).normalize(), 0.12 * 0.7), Z, 0.7));

    for (const [s, l] of [
      ["R", "r"],
      ["L", "l"],
    ] as const) {
      const sh = s === "R" ? j.shoulderR : j.shoulderL;
      const el = s === "R" ? j.elbowR : j.elbowL;
      const wr = s === "R" ? j.wristR : j.wristL;
      const fi = s === "R" ? j.fistR : j.fistL;
      // the arm's bend plane: at rest (a T pose) the forearm folds forward,
      // so the plane's normal is up for the right arm and down for the left
      const restNormal = s === "R" ? Y.clone() : Y.clone().negate();
      const upperDir = el.clone().sub(sh).normalize();
      const foreDir = wr.clone().sub(el).normalize();
      let normal = new THREE.Vector3().crossVectors(upperDir, foreDir);
      if (normal.lengthSq() < 1e-6) normal = new THREE.Vector3().crossVectors(upperDir, Z);
      if (normal.lengthSq() < 1e-6) normal = restNormal.clone();
      normal.normalize();
      A.set(`upperarm_${l}`, carry(r(`upperarm_${l}`), r(`lowerarm_${l}`), restNormal, sh, el, normal, this.thick[`upperarm_${l}`]));
      A.set(`lowerarm_${l}`, carry(r(`lowerarm_${l}`), r(`hand_${l}`), restNormal, el, wr, normal, this.thick[`lowerarm_${l}`]));
      const hand = carry(r(`hand_${l}`), r(`middle_01_${l}`), restNormal, wr, fi, normal);
      A.set(`hand_${l}`, hand);
      // the fingers folded away into the palm: a gloved fist is drawn as a
      // block of its own (sprites.ts), squarer than any curl of these fingers
      // came out (curled, they splayed)
      const fold = (at: V3): THREE.Matrix4 => hand.clone().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeScale(0.05, 0.05, 0.05)).multiply(new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z)));
      for (const name of this.index.keys()) if (/^(index|middle|ring|pinky|thumb)_/.test(name) && name.endsWith(`_${l}`)) A.set(name, fold(r(`hand_${l}`)));
      // the leg: at rest the shin folds back, so the knee's plane faces out to the side
      const hip = s === "R" ? j.hipR : j.hipL;
      const knee = s === "R" ? j.kneeR : j.kneeL;
      const ankle = s === "R" ? j.ankleR : j.ankleL;
      const toe = s === "R" ? j.toeR : j.toeL;
      let kn = new THREE.Vector3().crossVectors(knee.clone().sub(hip), ankle.clone().sub(knee));
      if (kn.lengthSq() < 1e-8) kn = X.clone();
      kn.normalize();
      A.set(`thigh_${l}`, carry(r(`thigh_${l}`), r(`calf_${l}`), X, hip, knee, kn, this.thick[`thigh_${l}`]));
      A.set(`calf_${l}`, carry(r(`calf_${l}`), r(`foot_${l}`), X, knee, ankle, kn, this.thick[`calf_${l}`]));
      A.set(`foot_${l}`, carry(r(`foot_${l}`), r(`ball_${l}`), X, ankle, toe, kn));
    }

    // anything not named moves with the nearest bone above it that is
    const named = (b: THREE.Object3D | null, i: number): THREE.Matrix4 => {
      let at: THREE.Object3D | null = b;
      while (at) {
        const m = A.get(at.name);
        if (m) return m;
        at = at.parent;
      }
      return A.get(this.bones[i].name) ?? lower;
    };
    const src = this.srcBones;
    this.bones.forEach((b, i) => {
      b.matrixWorld.copy(space).multiply(named(src[i], i)).multiply(this.bind[i]);
    });
  }

  /** the model's own bones, for their parents */
  srcBones: (THREE.Object3D | null)[] = [];
}

/**
 * The same, with the model's bone hierarchy kept for working out which bone
 * an unnamed one hangs from.
 */
export function skinnedBody(source: THREE.Object3D, part: (bone: string, from: V3, along: number, at: V3) => number, colour: (part: number) => THREE.Color, id: (part: number) => THREE.Color): SkinnedBody {
  const body = new SkinnedBody(source, part, colour, id);
  let src: THREE.SkinnedMesh | null = null;
  source.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !src) src = o as THREE.SkinnedMesh;
  });
  body.srcBones = (src as unknown as THREE.SkinnedMesh).skeleton.bones;
  return body;
}

/**
 * Leathers over the body, not the body: the model is a bare muscled figure,
 * every muscle of the back and the cleft of the seat modelled, and drawn as a
 * rider it read as a naked man. A few rounds of Laplacian smoothing (each
 * vertex moved part of the way to the mean of its neighbours, welded across
 * the texture seams so the surface does not tear) round those off as a
 * leather suit would, and keep the shoulders, chest and limbs' shape.
 */
function smooth(geo: THREE.BufferGeometry, rounds: number, step: number): void {
  const pos = geo.attributes.position;
  const key = (i: number): string => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const weld = new Map<string, number>();
  const id = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let w = weld.get(k);
    if (w === undefined) weld.set(k, (w = weld.size));
    id[i] = w;
  }
  const n = weld.size;
  const nb: Set<number>[] = Array.from({ length: n }, () => new Set());
  const idx = geo.index!;
  for (let t = 0; t < idx.count; t += 3) {
    const a = id[idx.getX(t)];
    const b = id[idx.getX(t + 1)];
    const c = id[idx.getX(t + 2)];
    nb[a].add(b).add(c);
    nb[b].add(a).add(c);
    nb[c].add(a).add(b);
  }
  let p = new Float32Array(n * 3);
  for (let i = 0; i < pos.count; i++) {
    p[id[i] * 3] = pos.getX(i);
    p[id[i] * 3 + 1] = pos.getY(i);
    p[id[i] * 3 + 2] = pos.getZ(i);
  }
  for (let r = 0; r < rounds; r++) {
    const q = new Float32Array(p);
    for (let v = 0; v < n; v++) {
      if (!nb[v].size) continue;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const u of nb[v]) {
        x += p[u * 3];
        y += p[u * 3 + 1];
        z += p[u * 3 + 2];
      }
      const k = nb[v].size;
      q[v * 3] += step * (x / k - p[v * 3]);
      q[v * 3 + 1] += step * (y / k - p[v * 3 + 1]);
      q[v * 3 + 2] += step * (z / k - p[v * 3 + 2]);
    }
    p = q;
  }
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, p[id[i] * 3], p[id[i] * 3 + 1], p[id[i] * 3 + 2]);
  geo.computeVertexNormals();
}

