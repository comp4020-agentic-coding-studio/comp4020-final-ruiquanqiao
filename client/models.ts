// The rider and the bike (ledger V5). The rider is Quaternius's CC0 base
// character with CC0 animations, dressed here in two-colour leathers, gloves,
// boots and a full-face helmet; the bike is modelled here from side profiles
// extruded with rounded edges, the way a sport bike's panels are shaped.
// Units are metres; the bike faces +z and its right is -x (game/world.ts).

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export type Leathers = { main: string; trim: string; helmet: string };

// ---- the bike ----

/** A side profile (z forward, y up) extruded to a width with soft edges. */
function panel(points: [number, number][], width: number, bevel: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  // the shape is drawn in (x=z, y=y); turn it so its x runs along the bike
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** A smooth side profile from a few control points, for curved panels. */
function curve(points: [number, number][], n = 40): [number, number][] {
  const c = new THREE.SplineCurve(points.map(([z, y]) => new THREE.Vector2(z, y)));
  return c.getPoints(n).map((p) => [p.x, p.y]);
}

function wheel(radius: number, m: Record<string, THREE.Material>, disc: boolean): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.055, 0.06, 14, 40), m.tyre);
  tyre.scale.set(1, 1, 1.15);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.115, 0.014, 8, 40), m.rim);
  g.add(tyre, rim);
  // five split spokes
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.022, radius - 0.13, 0.03), m.rim);
    spoke.position.y = (radius - 0.13) / 2;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 5) * Math.PI * 2;
    arm.add(spoke);
    g.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16).rotateX(Math.PI / 2), m.metal);
  g.add(hub);
  if (disc) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 32).rotateX(Math.PI / 2), m.disc);
    d.position.z = 0.05;
    g.add(d);
  }
  // wheels spin about x: turn so the torus lies in the bike's plane
  g.rotation.y = Math.PI / 2;
  return g;
}

export function buildBike(paint: string, trim: string): THREE.Group {
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 }),
    trim: new THREE.MeshPhysicalMaterial({ color: trim, roughness: 0.4, clearcoat: 0.8 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: "#2a2a2e", roughness: 0.35, metalness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: "#9a9aa2", roughness: 0.3, metalness: 0.9 }),
    disc: new THREE.MeshStandardMaterial({ color: "#c8c8cc", roughness: 0.25, metalness: 1 }),
    engine: new THREE.MeshStandardMaterial({ color: "#26262a", roughness: 0.55, metalness: 0.5 }),
    seat: new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#506070", roughness: 0.05, transparent: true, opacity: 0.45, metalness: 0 }),
    light: new THREE.MeshStandardMaterial({ color: "#fff8e0", emissive: "#fff2c0", emissiveIntensity: 1.2 }),
    tail: new THREE.MeshStandardMaterial({ color: "#ff2010", emissive: "#ff1000", emissiveIntensity: 1.5 }),
  };
  const bike = new THREE.Group();
  const R = 0.31;
  const front = wheel(R, m, true);
  front.position.set(0, R, 0.72);
  const rear = wheel(R, m, false);
  rear.position.set(0, R, -0.7);
  bike.add(front, rear);

  // forks, raked back 24°
  for (const side of [-1, 1]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.62, 12), m.metal);
    fork.position.set(side * 0.08, R + 0.27, 0.6);
    fork.rotation.x = -0.42;
    bike.add(fork);
    // swingarm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.62), m.rim);
    arm.position.set(side * 0.1, R + 0.06, -0.42);
    arm.rotation.x = -0.12;
    bike.add(arm);
  }
  // engine and frame
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.42), m.engine);
  engine.position.set(0, 0.42, 0.06);
  bike.add(engine);
  const sump = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 18).rotateZ(Math.PI / 2), m.engine);
  sump.position.set(0, 0.36, 0.0);
  bike.add(sump);
  for (const side of [-1, 1]) {
    const spar = panel([[-0.22, 0.52], [0.42, 0.78], [0.48, 0.7], [-0.16, 0.44]], 0.035, 0.008, m.rim);
    spar.position.x = side * 0.14;
    bike.add(spar);
  }

  // fairing: nose, sides and belly pan, one rounded profile
  // the nose sits above the front wheel; the side panels drop behind it
  const fairing = panel(
    [[0.96, 0.72], ...curve([[0.88, 0.86], [0.64, 0.98], [0.4, 0.95], [0.3, 0.78], [0.14, 0.52]], 24), [0.16, 0.3], [0.36, 0.3], [0.43, 0.5], [0.52, 0.66], [0.74, 0.66]],
    0.38,
    0.09,
    m.paint,
  );
  bike.add(fairing);
  const belly = panel([[0.3, 0.3], [0.1, 0.2], [-0.12, 0.24], [-0.06, 0.32], [0.26, 0.34]], 0.3, 0.03, m.trim);
  bike.add(belly);
  const screen = panel(curve([[0.62, 1.0], [0.52, 1.12], [0.4, 1.12], [0.44, 0.98], [0.62, 1.0]]), 0.34, 0.02, m.glass);
  bike.add(screen);
  // tank, seat and tail
  const tank = panel(curve([[0.36, 0.95], [0.22, 1.03], [-0.02, 0.99], [-0.14, 0.89], [0.0, 0.82], [0.32, 0.84], [0.36, 0.95]]), 0.4, 0.09, m.paint);
  bike.add(tank);
  const seat = panel(curve([[-0.12, 0.86], [-0.4, 0.84], [-0.5, 0.88], [-0.48, 0.8], [-0.12, 0.78], [-0.12, 0.86]]), 0.3, 0.05, m.seat);
  bike.add(seat);
  const tail = panel(curve([[-0.4, 0.84], [-0.72, 0.94], [-0.86, 0.9], [-0.7, 0.74], [-0.36, 0.7], [-0.4, 0.84]]), 0.28, 0.06, m.paint);
  bike.add(tail);
  const stripe = panel(curve([[-0.44, 0.86], [-0.74, 0.95], [-0.8, 0.93], [-0.5, 0.82], [-0.44, 0.86]]), 0.29, 0.02, m.trim);
  bike.add(stripe);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.03), m.tail);
  lamp.position.set(0, 0.88, -0.87);
  bike.add(lamp);
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), m.light);
    head.position.set(side * 0.08, 0.78, 0.87);
    head.scale.set(1.3, 0.7, 0.5);
    bike.add(head);
    // clip-on bars and mirrors
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8).rotateZ(Math.PI / 2), m.rim);
    bar.position.set(side * 0.2, 0.95, 0.42);
    bar.rotation.y = side * -0.25;
    bike.add(bar);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8).rotateZ(Math.PI / 2), m.seat);
    grip.position.set(side * 0.29, 0.95, 0.4);
    bike.add(grip);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), m.paint);
    mirror.position.set(side * 0.27, 1.0, 0.62);
    bike.add(mirror);
  }
  // exhaust, up under the tail on the right
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.42, 16).rotateX(Math.PI / 2 - 0.25), m.metal);
  pipe.position.set(-0.17, 0.62, -0.58);
  bike.add(pipe);
  bike.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return bike;
}

// ---- the rider ----

let riderAsset: Promise<GLTF> | null = null;
export const loadRider = (): Promise<GLTF> => (riderAsset ??= new GLTFLoader().loadAsync("/assets/models/rider.glb"));

// Which colour each bone's skin wears: jacket, contrast panels, gloves, boots.
function region(bone: string): "main" | "trim" | "glove" | "boot" {
  if (/^(hand|index|middle|pinky|ring|thumb)/.test(bone)) return "glove";
  if (/^(foot|ball)/.test(bone)) return "boot";
  // contrast across the shoulders and down the upper arms, as the PC
  // default rider's leathers have it
  if (/^(clavicle|spine_03|upperarm)/.test(bone)) return "trim";
  return "main";
}

export type RiderRig = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  bones: Record<string, THREE.Bone>;
  /** bones bent since the clip last posed them, with the clip's rotation */
  bent: Map<THREE.Bone, THREE.Quaternion>;
};

export function buildRider(asset: GLTF, look: Leathers): RiderRig {
  const root = SkeletonUtils.clone(asset.scene);
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
  });
  const colours = { main: new THREE.Color(look.main), trim: new THREE.Color(look.trim), glove: new THREE.Color("#18181a"), boot: new THREE.Color("#101012") };
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    // paint each vertex by the bone that moves it most
    const g = mesh.geometry.clone();
    const idx = g.getAttribute("skinIndex");
    const wt = g.getAttribute("skinWeight");
    const col = new Float32Array(idx.count * 3);
    for (let v = 0; v < idx.count; v++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (wt.getComponent(v, k) > wt.getComponent(v, best)) best = k;
      const bone = mesh.skeleton.bones[idx.getComponent(v, best)];
      colours[region(bone?.name ?? "")].toArray(col, v * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    mesh.geometry = g;
    const old = mesh.material as THREE.MeshStandardMaterial;
    // leather: the body's own normal map shows through as a tight suit
    mesh.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, normalMap: old.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color("#ffffff") });
  });

  // a full-face helmet on the head bone, kept level at the bind pose
  const head = bones.Head;
  if (head) {
    root.updateMatrixWorld(true);
    const helmet = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), new THREE.MeshPhysicalMaterial({ color: look.helmet, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }));
    shell.scale.set(0.95, 1.0, 1.12);
    // a band across the front: phi = π/2 is +z, which is forward here
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.153, 24, 12, Math.PI / 2 - 0.85, 1.7, 1.1, 0.5), new THREE.MeshPhysicalMaterial({ color: "#0c0c12", roughness: 0.05, metalness: 0.6, clearcoat: 1 }));
    visor.scale.copy(shell.scale);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), shell.material);
    chin.position.set(0, -0.08, 0.06);
    chin.scale.set(1, 0.7, 1.1);
    helmet.add(shell, visor, chin);
    helmet.traverse((o) => (o.castShadow = true));
    const world = new THREE.Vector3();
    head.getWorldPosition(world);
    world.y += 0.09;
    world.z += 0.015;
    head.add(helmet);
    helmet.position.copy(head.worldToLocal(world.clone()));
    const q = new THREE.Quaternion();
    head.getWorldQuaternion(q);
    helmet.quaternion.copy(q.invert());
    helmet.userData.helmet = true;
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const clip of asset.animations) actions[clip.name] = mixer.clipAction(clip);
  return { root, mixer, actions, bones, bent: new Map() };
}

/**
 * Bend a bone on top of the clip, remembering the clip's rotation. The mixer
 * does not rewrite a bone when the clip's time has not moved, so without
 * `unbend` every frame's bend lands on the last one's: measured, the spine
 * went 0.16, 0.38, 0.57 rad over three frames until the rider lay on his back.
 */
export function bend(rig: RiderRig, bone: THREE.Bone | undefined, axis: THREE.Vector3, angle: number): void {
  if (!bone) return;
  if (!rig.bent.has(bone)) rig.bent.set(bone, bone.quaternion.clone());
  turnBone(bone, axis, angle);
}

/** Put every bent bone back where the clip left it. Call before posing. */
export function unbend(rig: RiderRig): void {
  for (const [bone, q] of rig.bent) bone.quaternion.copy(q);
  rig.bent.clear();
}

/** Turn a bone about an axis given in world space, after the animation. */
export function turnBone(bone: THREE.Bone | undefined, axis: THREE.Vector3, angle: number): void {
  if (!bone?.parent) return;
  // the parent may have just been turned itself: read its pose fresh
  bone.parent.updateWorldMatrix(true, false);
  const pq = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(pq);
  const local = axis.clone().applyQuaternion(pq.invert()).normalize();
  bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(local, angle));
}

const RIGHT = new THREE.Vector3(-1, 0, 0);

/**
 * Bend the car-driving clip into a sport-bike crouch after the mixer has run:
 * the back folded over the tank, knees down along it, feet back on the pegs.
 * Negative turns about the rider's right pitch the top of a bone forward.
 */
export function crouch(rig: RiderRig, tuck = 1): void {
  const b = rig.bones;
  bend(rig, b.pelvis, RIGHT, -0.25 * tuck);
  bend(rig, b.spine_01, RIGHT, -0.45 * tuck);
  bend(rig, b.spine_02, RIGHT, -0.35 * tuck);
  bend(rig, b.spine_03, RIGHT, -0.2 * tuck);
  // and the head back up, eyes on the road
  bend(rig, b.neck_01, RIGHT, 0.6 * tuck);
  bend(rig, b.Head, RIGHT, 0.45 * tuck);
  bend(rig, b.thigh_l, RIGHT, -0.35);
  bend(rig, b.calf_l, RIGHT, -1.25);
  bend(rig, b.foot_l, RIGHT, 0.6);
  // the clip is a car driver's, right foot out on the pedal; solve the right
  // leg's bends so its foot lands where the left one's mirror image is
  const fix = legFix ?? (legFix = solveRightLeg(rig));
  bend(rig, b.thigh_r, RIGHT, fix[0]);
  bend(rig, b.thigh_r, FWD, fix[1]);
  bend(rig, b.calf_r, RIGHT, fix[2]);
  bend(rig, b.foot_r, RIGHT, 0.6);
}

const FWD = new THREE.Vector3(0, 0, 1);
let legFix: [number, number, number] | null = null;

/**
 * Search the right thigh's pitch and splay and the knee's bend for the pose
 * that puts the right foot and knee on the mirror image of the left ones.
 * Done once, on the first rider posed; every rider shares the clip frame.
 */
function solveRightLeg(rig: RiderRig): [number, number, number] {
  const b = rig.bones;
  const foot = new THREE.Vector3();
  const knee = new THREE.Vector3();
  rig.root.updateMatrixWorld(true);
  b.foot_l.getWorldPosition(foot);
  b.calf_l.getWorldPosition(knee);
  const wantFoot = new THREE.Vector3(-foot.x + 2 * rigCentre(rig), foot.y, foot.z);
  const wantKnee = new THREE.Vector3(-knee.x + 2 * rigCentre(rig), knee.y, knee.z);
  const saved = [b.thigh_r, b.calf_r].map((bone) => bone.quaternion.clone());
  let best: [number, number, number] = [0, 0, 0];
  let bestErr = Infinity;
  const tryPose = (p: number, sp: number, k: number): void => {
    b.thigh_r.quaternion.copy(saved[0]);
    b.calf_r.quaternion.copy(saved[1]);
    turnBone(b.thigh_r, RIGHT, p);
    turnBone(b.thigh_r, FWD, sp);
    turnBone(b.calf_r, RIGHT, k);
    b.foot_r.updateWorldMatrix(true, false);
    const f = new THREE.Vector3();
    const kn = new THREE.Vector3();
    b.foot_r.getWorldPosition(f);
    b.calf_r.getWorldPosition(kn);
    const err = f.distanceToSquared(wantFoot) + kn.distanceToSquared(wantKnee);
    if (err < bestErr) {
      bestErr = err;
      best = [p, sp, k];
    }
  };
  // coarse grid, then a finer one round the best
  for (let p = -2; p <= 1; p += 0.15) for (let sp = -0.8; sp <= 0.8; sp += 0.15) for (let k = -2.4; k <= 0.6; k += 0.15) tryPose(p, sp, k);
  const [p0, s0, k0] = best;
  for (let p = p0 - 0.15; p <= p0 + 0.15; p += 0.025) for (let sp = s0 - 0.15; sp <= s0 + 0.15; sp += 0.025) for (let k = k0 - 0.15; k <= k0 + 0.15; k += 0.025) tryPose(p, sp, k);
  b.thigh_r.quaternion.copy(saved[0]);
  b.calf_r.quaternion.copy(saved[1]);
  return best;
}

/** The rider's centre line in world x, from the pelvis. */
function rigCentre(rig: RiderRig): number {
  const p = new THREE.Vector3();
  rig.bones.pelvis.getWorldPosition(p);
  return p.x;
}

// ---- traffic (T4, V17) ----

const CAR_PAINT = ["#8a8f96", "#b8bcc0", "#5a2a2a", "#26384e", "#d8d4c8", "#3c4a34", "#7a6440"];

/** A car about 4.6 m long, facing +z: body, glasshouse, roof, wheels, lights. */
export function buildCar(kind: "sedan" | "taxi" | "pickup", id: number): THREE.Group {
  const paint = kind === "taxi" ? "#e8b818" : CAR_PAINT[id % CAR_PAINT.length];
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#1c2430", roughness: 0.05, metalness: 0.4, clearcoat: 1 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: "#a8a8b0", roughness: 0.3, metalness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }),
    head: new THREE.MeshStandardMaterial({ color: "#fff6e0", emissive: "#fff0c8", emissiveIntensity: 0.8 }),
    tail: new THREE.MeshStandardMaterial({ color: "#c01010", emissive: "#ff1000", emissiveIntensity: 0.8 }),
  };
  const car = new THREE.Group();
  // the lower body, shoulder line at about 0.95 m
  car.add(panel([[-2.3, 0.3], [-2.34, 0.78], [-2.1, 0.96], [2.05, 0.92], [2.32, 0.7], [2.3, 0.3]], 1.86, 0.1, m.paint));
  if (kind === "pickup") {
    // a cab forward and an open bed behind it
    car.add(panel([[-0.25, 0.9], [-0.15, 1.5], [0.7, 1.5], [1.2, 0.92]], 1.66, 0.05, m.glass));
    car.add(panel([[-0.2, 1.46], [0.68, 1.46], [0.68, 1.53], [-0.2, 1.53]], 1.7, 0.03, m.paint));
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 1.9), m.paint);
      wall.position.set(side * 0.88, 1.08, -1.3);
      car.add(wall);
    }
  } else {
    car.add(panel([[-1.4, 0.92], [-1.0, 1.42], [0.55, 1.44], [1.18, 0.92]], 1.62, 0.06, m.glass));
    car.add(panel([[-0.95, 1.4], [0.5, 1.42], [0.5, 1.49], [-0.95, 1.47]], 1.66, 0.03, m.paint));
  }
  if (kind === "taxi") {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.25), new THREE.MeshStandardMaterial({ color: "#f8f0d0", emissive: "#f0e0a0", emissiveIntensity: 0.4 }));
    sign.position.set(0, 1.58, -0.2);
    car.add(sign);
  }
  for (const z of [-1.45, 1.4]) {
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20).rotateZ(Math.PI / 2), m.tyre));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 14).rotateZ(Math.PI / 2), m.rim);
      w.add(hub);
      w.position.set(side * 0.82, 0.33, z);
      car.add(w);
    }
  }
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), m.head);
    hl.position.set(side * 0.62, 0.72, 2.31);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.05), m.tail);
    tl.position.set(side * 0.62, 0.78, -2.33);
    car.add(hl, tl);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.12), m.trim);
  bumper.position.set(0, 0.38, 2.34);
  const rearBumper = bumper.clone();
  rearBumper.position.z = -2.36;
  car.add(bumper, rearBumper);
  car.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return car;
}

/** A club, as every cop carries (C5, C7): a black baton out of the fist. */
export function buildClub(): THREE.Mesh {
  const club = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.6, 8), new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.5 }));
  club.geometry.translate(0, 0.25, 0);
  club.castShadow = true;
  return club;
}

/** A chain (C5): oval steel links hanging in a loose curve from the fist. */
export function buildChain(): THREE.Group {
  const chain = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#b8bcc4", metalness: 0.9, roughness: 0.35 });
  const link = new THREE.TorusGeometry(0.03, 0.008, 6, 10);
  link.scale(1, 1.6, 1);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(link, steel);
    const u = i / (n - 1);
    // out of the fist along the hand, then drooping
    m.position.set(0.05 * Math.sin(u * 2.4), 0.06 + u * 0.62, -0.12 * u * u);
    m.rotation.set(-0.3 * u, i % 2 ? Math.PI / 2 : 0, 0);
    m.castShadow = true;
    chain.add(m);
  }
  return chain;
}
