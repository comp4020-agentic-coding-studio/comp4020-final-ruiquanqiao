// Riders as pre-rendered sprites, the way the original drew them (ledger V5).
// The first remake posed a generic CC0 character, whose only clip was for
// driving a car, by twisting its bones about world axes at run time; a punch
// came out as an arm jammed backwards from a body lying on the tank. Here a
// puppet built for a motorbike is put into each pose the recorded race shows
// (docs/road-rash-feel.md), hands and feet placed by two-bone IK on the bars,
// the pegs, or wherever the blow lands, and every pose is rendered once, from
// eight directions, into a small atlas. The race draws those frames as
// billboards and steps between them, as the original stepped between its
// sprites; nothing bends at run time.
//
// The puppet is drawn in white where the leathers and paint go, with a second
// atlas saying which part each pixel is, so the fifteen riders and the cops
// share one atlas and get their colours in the shader.
//
// Bike space: metres, +z forward, +y up, the rider's right is -x.

import * as THREE from "three";
import { type Rider, windupOf } from "../game/sim.ts";
import { buildBike } from "./models.ts";

// ---- poses ----

/** Which part a pixel belongs to: 0 keeps its own colour; the rest are tinted. */
const PART = { fixed: 0, main: 1, trim: 2, helmet: 3, paint: 4, paintTrim: 5 } as const;

type V = [number, number, number];

type Pose = {
  /** pelvis, in bike space (or in body space when off the bike) */
  pelvis: V;
  /** spine tilt forward from upright, and sideways towards the rider's right */
  pitch: number;
  roll: number;
  handR: V;
  handL: V;
  footR: V;
  footL: V;
  /** where elbows and knees point */
  elbowR?: V;
  elbowL?: V;
  kneeR?: V;
  kneeL?: V;
  /** a weapon in the right hand, pointing along this direction */
  weapon?: { kind: "club" | "chain"; dir: V };
  bike: boolean;
  /** off the bike: the whole body turned (x pitch, z roll) and raised */
  body?: { rx: number; rz: number; lift: number };
};

// on the bike: hands on the grips, feet on the pegs (measured off the
// recording: the back rounded over the tank, helmet just above the shoulders)
const SEAT: V = [0, 0.96, -0.36];
const GRIP_R: V = [-0.29, 0.96, 0.38];
const GRIP_L: V = [0.29, 0.96, 0.38];
const PEG_R: V = [-0.19, 0.42, -0.3];
const PEG_L: V = [0.19, 0.42, -0.3];
const KNEE_R: V = [-0.5, 0.9, 0.4];
const KNEE_L: V = [0.5, 0.9, 0.4];

const ride = (over: Partial<Pose> = {}): Pose => ({
  pelvis: SEAT,
  // hunched well over the tank: from behind the back is a rounded hump with
  // the helmet just clear of the shoulders
  pitch: 1.0,
  roll: 0,
  handR: GRIP_R,
  handL: GRIP_L,
  footR: PEG_R,
  footL: PEG_L,
  elbowR: [-0.4, 1.0, -0.1],
  elbowL: [0.4, 1.0, -0.1],
  kneeR: KNEE_R,
  kneeL: KNEE_L,
  bike: true,
  ...over,
});

// The blows, each as the recording shows it, measured off full-resolution
// frames and held there by spec/sprites.test.ts ("every pose against the
// recording"). Right-hand versions; the left ones are their mirror images
// (mirror()). The rider rides hunched (helmet 2.1 helmet widths over the tail
// lamp) but sits up to strike (2.85).
const RIGHT: Record<string, Pose> = {
  ride: ride(),
  rideClub: ride({ weapon: { kind: "club", dir: [-0.3, -0.5, -0.8] } }),
  rideChain: ride({ weapon: { kind: "chain", dir: [-0.2, -0.9, -0.3] } }),
  // the fist drawn back beside the helmet, the elbow out below it (6 frames)
  punchCock: ride({ pitch: 0.4, handR: [-0.42, 1.5, 0.05], elbowR: [-1.0, 1.1, -0.3] }),
  // then the whole arm straight out sideways at shoulder height (5 frames)
  punchOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.05], elbowR: [-0.5, 1.8, -0.2] }),
  // the backhand sweeps out and behind
  backhand: ride({ pitch: 0.4, roll: -0.1, handR: [-1.1, 1.42, -0.5], elbowR: [-0.5, 1.8, -0.2] }),
  // the kick chambered: knee out, foot drawn back by the tail (6 frames)
  kickCock: ride({ pitch: 0.42, roll: -0.12, footR: [-0.95, 0.72, -0.45], kneeR: [-0.9, 1.3, 0.3] }),
  // then the leg straight out sideways just over the tail: the hips slide
  // across the seat towards it and the body leans off it (5 frames)
  kick: ride({ pelvis: [-0.12, 0.96, -0.36], pitch: 0.38, roll: -0.2, footR: [-1.5, 0.84, -0.25], kneeR: [-0.6, 1.5, -0.25] }),
  // a club held up beside the helmet, pointing up over it, then brought out
  clubUp: ride({ pitch: 0.8, handR: [-0.42, 1.47, 0.0], elbowR: [-0.8, 1.9, -0.3], weapon: { kind: "club", dir: [0.35, 1, -0.2] } }),
  clubOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.1], elbowR: [-0.5, 1.8, -0.2], weapon: { kind: "club", dir: [-0.85, -0.45, 0.25] } }),
  chainUp: ride({ pitch: 0.8, handR: [-0.42, 1.47, 0.0], elbowR: [-0.8, 1.9, -0.3], weapon: { kind: "chain", dir: [0.3, 0.6, -0.8] } }),
  chainOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.05], elbowR: [-0.5, 1.8, -0.2], weapon: { kind: "chain", dir: [-1, -0.15, 0.2] } }),
  // struck on the right: knocked upright and over to the left, the right hand
  // jolted off the bar and up, the head thrown back - the frame a rival shows
  // the instant a blow lands (247.68: 露西娅 over and away from the chain)
  recoil: ride({ pelvis: [0.06, 0.96, -0.36], pitch: 0.35, roll: -0.42, handR: [-0.55, 1.35, 0.05], elbowR: [-0.8, 1.2, -0.3], footR: [-0.32, 0.5, -0.32] }),
};

// off the bike: thrown spread-eagled and tumbling, lying, and the jog back
const spread = (rx: number, rz: number, lift: number): Pose => ({
  pelvis: [0, 0, 0],
  pitch: 0,
  roll: 0,
  handR: [-0.75, 0.75, 0.05],
  handL: [0.75, 0.7, -0.05],
  footR: [-0.4, -0.85, 0.05],
  footL: [0.42, -0.82, -0.05],
  elbowR: [-0.4, 0.9, -0.4],
  elbowL: [0.4, 0.9, -0.4],
  kneeR: [-0.3, -0.4, 0.5],
  kneeL: [0.3, -0.4, 0.5],
  bike: false,
  body: { rx, rz, lift },
});

const run = (phase: number): Pose => {
  const s = Math.sin(phase * Math.PI * 2);
  return {
    pelvis: [0, 0.95, 0],
    pitch: 0.18,
    roll: 0,
    handR: [-0.24, 1.15, 0.28 * s],
    handL: [0.24, 1.15, -0.28 * s],
    elbowR: [-0.3, 1.2, -0.5],
    elbowL: [0.3, 1.2, -0.5],
    footR: [-0.12, 0.08 + Math.max(0, -s) * 0.25, 0.38 * s],
    footL: [0.12, 0.08 + Math.max(0, s) * 0.25, -0.38 * s],
    kneeR: [-0.15, 0.6, 1],
    kneeL: [0.15, 0.6, 1],
    bike: false,
  };
};

const OFF: Record<string, Pose> = {
  tumble0: spread(-0.3, 0, 1.0),
  tumble1: spread(1.2, 2.1, 1.0),
  tumble2: spread(2.6, 4.2, 1.0),
  lying: { ...spread(Math.PI / 2, 0, 0.18), handR: [-0.6, 0.55, 0.1], handL: [0.55, 0.65, 0], footL: [0.2, -0.9, 0] },
  run0: run(0),
  run1: run(0.25),
  run2: run(0.5),
  run3: run(0.75),
};

/** The same pose done with the other side of the body. */
function mirror(p: Pose): Pose {
  const m = (v?: V): V | undefined => (v ? [-v[0], v[1], v[2]] : undefined);
  return {
    ...p,
    roll: -p.roll,
    handR: m(p.handL)!,
    handL: m(p.handR)!,
    footR: m(p.footL)!,
    footL: m(p.footR)!,
    elbowR: m(p.elbowL),
    elbowL: m(p.elbowR),
    kneeR: m(p.kneeL),
    kneeL: m(p.kneeR),
    weapon: p.weapon && { ...p.weapon, dir: m(p.weapon.dir)!, left: true } as Pose["weapon"],
  };
}

/** Every frame in the atlas, by name: "punchOut.R", "kick.L", "run2", ... */
const FRAMES: [string, Pose][] = [
  ...Object.entries(RIGHT).flatMap(([n, p]): [string, Pose][] => [
    [`${n}.R`, p],
    [`${n}.L`, mirror(p)],
  ]),
  ...Object.entries(OFF),
  ["bikeDown", { ...ride(), bike: true }],
];
export type FrameName = string;

/** Directions each frame is drawn from: 0 is from straight behind, 180 from in front, positive from the rider's right. */
const YAWS = [0, 20, 40, 65, 90, 120, 150, 180];
/**
 * How big a tile is drawn, px: the largest whose atlas fits the GPU, up to
 * 224 (160 on a touch screen, to spare a phone's memory). At 96 and then 128
 * a rider close to the camera showed texels five or six screen pixels across,
 * coarser than the original's own sprites; at 224 a texel near the camera is
 * about three. Tiles run left to right, row after row, so the atlas stays
 * square-ish and inside 4096 px, the most many GPUs can hold.
 */
export function tileSize(maxTexture: number, touch: boolean, tiles = FRAMES.length * YAWS.length): { tile: number; perRow: number; rows: number } {
  const max = Math.min(4096, maxTexture);
  for (const tile of [224, 192, 160, 128, 96, 64]) {
    if (touch && tile > 160) continue;
    const perRow = Math.floor(max / tile);
    const rows = Math.ceil(tiles / perRow);
    if (rows * tile <= max) return { tile, perRow, rows };
  }
  return { tile: 48, perRow: Math.floor(max / 48), rows: Math.ceil(tiles / Math.floor(max / 48)) };
}
/** Where frame `i` seen from yaw column `col` sits in the atlas, in tiles. */
const tileAt = (i: number, col: number, perRow: number): { x: number; y: number } => {
  const n = i * YAWS.length + col;
  return { x: n % perRow, y: Math.floor(n / perRow) };
};
/** metres the tile spans, square; the ground is at ANCHOR of its height */
export const SPAN = 2.8;
const ELEVATION = 0.17; // rad: the chase camera looks down on a rider at about this

// ---- the puppet ----

type Part = THREE.Mesh & { userData: { part: number } };

// Upper and lower limb lengths, m. The recording's riders reach 3.4 helmet
// widths with a fist and 4.2 with a boot; at 0.3 and 0.44 the puppet's limbs
// fell well short of both, so the blows read as nudges.
const ARM = 0.35;
const LEG = 0.5;

class Puppet {
  root = new THREE.Group(); // bike space
  body = new THREE.Group(); // the rider; turned as a whole when off the bike
  bike: THREE.Group;
  private mats = new Map<string, THREE.Material>();
  private parts: Record<string, Part> = {};
  private weapons: Record<"club" | "chain", THREE.Object3D>;

  constructor() {
    this.bike = buildBike("#ff00ff", "#00ffff");
    // paint and trim were built in marker colours: turn them white and tag them
    this.bike.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const col = (m.material as THREE.MeshStandardMaterial).color?.getHexString();
      const part = col === "ff00ff" ? PART.paint : col === "00ffff" ? PART.paintTrim : PART.fixed;
      m.userData.part = part;
      if (part) m.material = this.mat("#ffffff", 0.35, 0.1);
    });
    this.root.add(this.bike, this.body);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
    const ball = new THREE.SphereGeometry(1, 18, 12);
    // limbs turned on a lathe, from the near joint (y -0.5) to the far one,
    // so an arm has a shoulder, a biceps and a wrist and a leg a thigh, a
    // calf and an ankle. Straight cylinders read as sticks the moment an arm
    // or a leg went out straight for a blow
    const lathe = (profile: [number, number][], stripe = false): THREE.BufferGeometry =>
      stripe
        ? // a panel down the outside only: a sixth of the way round, centred on +x, standing just proud
          new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * 1.05, y)), 6, Math.PI / 2 - Math.PI / 6, Math.PI / 3)
        : new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const UPPER: [number, number][] = [[0.001, -0.56], [0.95, -0.5], [1.18, -0.3], [1.22, -0.1], [1.0, 0.25], [0.8, 0.5], [0.001, 0.56]];
    const FORE: [number, number][] = [[0.001, -0.55], [0.9, -0.5], [1.12, -0.3], [1.0, -0.05], [0.72, 0.35], [0.6, 0.5], [0.001, 0.55]];
    const THIGH: [number, number][] = [[0.001, -0.55], [1.12, -0.5], [1.18, -0.25], [1.0, 0.15], [0.78, 0.5], [0.001, 0.55]];
    const SHIN: [number, number][] = [[0.001, -0.55], [0.82, -0.5], [1.08, -0.25], [0.95, 0.05], [0.65, 0.4], [0.6, 0.5], [0.001, 0.55]];
    const [upper, fore, thigh, shin] = [UPPER, FORE, THIGH, SHIN].map((p) => lathe(p));
    const [upperS, foreS, thighS, shinS] = [UPPER, FORE, THIGH, SHIN].map((p) => lathe(p, true));
    // the trunk in one piece, hips to collar, wider across than it is deep:
    // a stack of three balls read as a balloon animal, not a rider in leathers
    const torso = lathe([[0.001, -0.02], [0.78, 0], [0.86, 0.12], [0.8, 0.26], [0.72, 0.4], [0.86, 0.6], [1.0, 0.78], [0.94, 0.92], [0.5, 1.0], [0.001, 1.02]]);
    // leather is shiny: highlights pick out the shapes the tint alone flattened
    const add = (name: string, geo: THREE.BufferGeometry, part: number, colour = "#ffffff", rough = 0.38): void => {
      const m = new THREE.Mesh(geo, this.mat(part ? "#ffffff" : colour, rough, 0)) as unknown as Part;
      m.userData.part = part;
      this.parts[name] = m;
      this.body.add(m);
    };
    // leathers: the suit in the main colour, shoulders, elbows and knees in the trim
    add("torso", torso, PART.main);
    add("hump", ball, PART.trim);
    add("neck", cyl, PART.fixed, "#1a1a1a");
    add("helmet", ball, PART.helmet, "#ffffff", 0.25);
    add("stripe", ball, PART.trim, "#ffffff", 0.25);
    add("visor", ball, PART.fixed, "#101318", 0.1);
    for (const s of ["R", "L"]) {
      add(`shoulder${s}`, ball, PART.trim);
      add(`upper${s}`, upper, PART.main);
      add(`upperS${s}`, upperS, PART.trim);
      add(`elbow${s}`, ball, PART.trim);
      add(`fore${s}`, fore, PART.main);
      add(`foreS${s}`, foreS, PART.trim);
      add(`glove${s}`, ball, PART.fixed, "#151515");
      add(`hip${s}`, ball, PART.main);
      add(`thigh${s}`, thigh, PART.main);
      add(`thighS${s}`, thighS, PART.trim);
      add(`knee${s}`, ball, PART.trim);
      add(`shin${s}`, shin, PART.main);
      add(`shinS${s}`, shinS, PART.trim);
      add(`boot${s}`, new THREE.BoxGeometry(1, 1, 1), PART.fixed, "#121212");
    }
    const wood = this.mat("#8a5a30", 0.8, 0);
    const steel = this.mat("#9a9aa2", 0.35, 0.8);
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.75, 10).translate(0, 0.33, 0), wood);
    const chainPts = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.5) * 0.04, i * 0.07, 0));
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 40, 0.018, 6), steel);
    this.weapons = { club, chain };
    for (const w of [club, chain]) {
      w.userData.part = PART.fixed;
      this.body.add(w);
    }
  }

  private mat(colour: string, roughness: number, metalness: number): THREE.Material {
    const key = `${colour}/${roughness}/${metalness}`;
    let m = this.mats.get(key);
    if (!m) this.mats.set(key, (m = new THREE.MeshStandardMaterial({ color: colour, roughness, metalness })));
    return m;
  }

  /** Put the rider (and the bike) into a pose. */
  set(p: Pose, bikeDown = false): void {
    const P = this.parts;
    const v = (a: V): THREE.Vector3 => new THREE.Vector3(...a);
    const right = new THREE.Vector3(-1, 0, 0);
    // the spine: tilted forward by pitch, sideways by roll
    const spine = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, -p.pitch).applyAxisAngle(new THREE.Vector3(0, 0, 1), p.roll);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(right, -p.pitch);
    const pelvis = v(p.pelvis);
    const chest = pelvis.clone().addScaledVector(spine, 0.46);
    const across = right.clone();
    const blob = (m: THREE.Mesh, at: THREE.Vector3, s: V, up = spine): void => {
      m.position.copy(at);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize());
      m.scale.set(...s);
    };
    /** Turn a mesh so its y runs along `up` and its x points as near `out` as it can. */
    const orient = (m: THREE.Mesh, up: THREE.Vector3, out: THREE.Vector3): void => {
      const y = up.clone().normalize();
      const x = out.clone().addScaledVector(y, -out.dot(y));
      if (x.lengthSq() < 1e-6) x.copy(Math.abs(y.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)).addScaledVector(y, -y.x);
      x.normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    const bone = (m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number, out = across.clone(), stripe?: THREE.Mesh): void => {
      const d = b.clone().sub(a);
      for (const k of stripe ? [m, stripe] : [m]) {
        k.position.copy(a).addScaledVector(d, 0.5);
        orient(k, d, out);
        k.scale.set(r, d.length(), r);
      }
    };
    // the trunk along the spine, hips at the pelvis, its width across the shoulders
    P.torso.position.copy(pelvis);
    orient(P.torso, spine, across);
    P.torso.scale.set(0.205, 0.59, 0.145);
    // the back protector hump, behind the shoulders
    blob(P.hump, chest.clone().addScaledVector(spine, -0.08).addScaledVector(fwd, -0.11), [0.13, 0.15, 0.06]);
    const neckTop = chest.clone().addScaledVector(spine, 0.13);
    bone(P.neck, chest, neckTop, 0.06);
    const head = neckTop.clone().addScaledVector(spine, 0.1).addScaledVector(fwd, 0.04);
    // the helmet faces where the bike goes even when the back is bent
    const look = new THREE.Vector3(0, 0, 1);
    P.helmet.position.copy(head);
    P.helmet.quaternion.identity();
    P.helmet.scale.set(0.145, 0.15, 0.165);
    P.stripe.position.copy(head).add(new THREE.Vector3(0, 0.01, 0));
    P.stripe.scale.set(0.03, 0.16, 0.172);
    P.visor.position.copy(head).addScaledVector(look, 0.075).add(new THREE.Vector3(0, 0.01, 0));
    P.visor.scale.set(0.115, 0.055, 0.1);
    for (const [s, sign] of [
      ["R", 1],
      ["L", -1],
    ] as const) {
      const shoulder = chest.clone().addScaledVector(across, sign * 0.22).addScaledVector(spine, -0.03);
      const hand = v(s === "R" ? p.handR : p.handL);
      const elbowPole = v((s === "R" ? p.elbowR : p.elbowL) ?? [sign * -0.6, 1, -0.1]);
      const elbow = ik(shoulder, hand, ARM, ARM, elbowPole);
      // the panel down each limb faces away from the body
      const out = across.clone().multiplyScalar(sign);
      blob(P[`shoulder${s}`], shoulder, [0.078, 0.078, 0.078]);
      bone(P[`upper${s}`], shoulder, elbow, 0.072, out, P[`upperS${s}`]);
      blob(P[`elbow${s}`], elbow, [0.06, 0.06, 0.06]);
      const handAt = elbow.clone().add(hand.clone().sub(elbow).normalize().multiplyScalar(ARM));
      bone(P[`fore${s}`], elbow, handAt, 0.064, out, P[`foreS${s}`]);
      // a gauntlet: a fist, wider across the knuckles than it is thick
      blob(P[`glove${s}`], handAt, [0.08, 0.075, 0.09], handAt.clone().sub(elbow));
      const hip = pelvis.clone().addScaledVector(across, sign * 0.11);
      const foot = v(s === "R" ? p.footR : p.footL);
      const kneePole = v((s === "R" ? p.kneeR : p.kneeL) ?? [sign * -0.4, 0.9, 0.4]);
      const knee = ik(hip, foot, LEG, LEG, kneePole);
      blob(P[`hip${s}`], hip, [0.09, 0.09, 0.09]);
      bone(P[`thigh${s}`], hip, knee, 0.092, out, P[`thighS${s}`]);
      blob(P[`knee${s}`], knee, [0.076, 0.076, 0.076]);
      const footAt = knee.clone().add(foot.clone().sub(knee).normalize().multiplyScalar(LEG));
      bone(P[`shin${s}`], knee, footAt, 0.07, out, P[`shinS${s}`]);
      const boot = P[`boot${s}`];
      boot.position.copy(footAt).add(new THREE.Vector3(0, -0.02, 0.05));
      boot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), knee.clone().sub(footAt).normalize());
      boot.scale.set(0.1, 0.16, 0.22);
      if (s === "R") {
        for (const [k, w] of Object.entries(this.weapons)) {
          w.visible = p.weapon?.kind === k;
          if (!w.visible) continue;
          const left = (p.weapon as { left?: boolean }).left;
          w.position.copy(left ? new THREE.Vector3() : handAt);
          w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v(p.weapon!.dir).normalize());
        }
      } else if ((p.weapon as { left?: boolean } | undefined)?.left) {
        const w = this.weapons[p.weapon!.kind];
        w.position.copy(handAt);
      }
    }
    // on or off the bike
    this.bike.visible = p.bike;
    this.body.visible = !bikeDown;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    if (p.body) {
      this.body.rotation.set(p.body.rx, 0, p.body.rz, "ZXY");
      this.body.position.y = p.body.lift;
    }
    // a bike down on its side, sliding (V13)
    this.bike.rotation.set(0, 0, bikeDown ? Math.PI / 2 - 0.15 : 0);
    this.bike.position.set(bikeDown ? 0.5 : 0, bikeDown ? 0.18 : 0, 0);
  }

  /** Where a part sits, in bike space. */
  at(name: string): THREE.Vector3 {
    return this.parts[name].position.clone();
  }

  /** Swap every material for flat part numbers, or back. */
  ids(on: boolean): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (on) {
        m.userData.real ??= m.material;
        const id = (m.userData.part ?? 0) as number;
        m.material = idMaterial(id);
      } else if (m.userData.real) m.material = m.userData.real;
    });
  }
}

const idMats: THREE.MeshBasicMaterial[] = [];
function idMaterial(id: number): THREE.MeshBasicMaterial {
  // part n is written as n*40 in red, read back exactly with no filtering
  return (idMats[id] ??= new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((id * 40) / 255, 0, 0, THREE.SRGBColorSpace) }));
}

/** Two-bone IK: the middle joint, given both ends' lengths and where it should point. */
function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const d = target.clone().sub(a);
  const dist = Math.min(d.length(), (l1 + l2) * 0.999);
  const dir = d.normalize();
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const toPole = pole.clone().sub(a);
  toPole.addScaledVector(dir, -toPole.dot(dir));
  if (toPole.lengthSq() < 1e-6) toPole.set(0, 1, 0);
  return a.clone().addScaledVector(dir, along).addScaledVector(toPole.normalize(), h);
}

// ---- measuring a frame against the recording ----

/** The bike's tail lamp, the one fixed point the recording always shows. */
const TAIL_LAMP: V = [0, 0.88, -0.87];

export type Measure = Record<"elbow" | "hand" | "knee" | "foot" | "tailLamp", [number, number]>;

/**
 * A right-handed frame as the chase camera sees it from straight behind: each
 * joint of the striking side relative to the helmet's centre, in helmet
 * widths, x out towards the blow and y up. The same numbers are read off the
 * recording (docs/road-rash-feel.md, "Poses"), so spec/sprites.test.ts can
 * hold every frame to them.
 */
export function measure(frame: string): Measure {
  const pose = FRAMES.find(([n]) => n === frame)?.[1];
  if (!pose) throw new Error(`no frame ${frame}`);
  const puppet = new Puppet();
  puppet.set(pose);
  const width = 0.29;
  const head = puppet.at("helmet");
  // from behind and a little above: the rider's right (-x) is screen right
  const flat = (p: THREE.Vector3): [number, number] => [
    -(p.x - head.x) / width,
    ((p.y - head.y) * Math.cos(ELEVATION) + (p.z - head.z) * Math.sin(ELEVATION)) / width,
  ];
  return {
    elbow: flat(puppet.at("elbowR")),
    hand: flat(puppet.at("gloveR")),
    knee: flat(puppet.at("kneeR")),
    foot: flat(puppet.at("bootR")),
    tailLamp: flat(new THREE.Vector3(...TAIL_LAMP)),
  };
}

// ---- the atlas ----

/** The frames, drawn: colour in RGB, and in alpha which part each pixel is (0 where there is nothing). */
export type Atlas = { colour: THREE.DataTexture; frames: Map<string, number>; anchor: number; perRow: number; rows: number };

/**
 * Render every frame from every direction, once. About 250 tiles; a frame of
 * the race costs nothing for it afterwards.
 */
export function buildAtlas(renderer: THREE.WebGLRenderer): Atlas {
  const puppet = new Puppet();
  const scene = new THREE.Scene();
  scene.add(puppet.root);
  scene.add(new THREE.HemisphereLight("#ffffff", "#404050", 0.9));
  const sun = new THREE.DirectionalLight("#ffffff", 3.0);
  scene.add(sun, sun.target);
  const half = SPAN / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 40);
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const { tile: TILE, perRow, rows } = tileSize(renderer.capabilities.maxTextureSize, touch);
  const rt = new THREE.WebGLRenderTarget(TILE, TILE);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const W = perRow * TILE;
  const H = rows * TILE;
  // one texture: the part numbers ride in the colour's alpha, which halves
  // the memory a second atlas of them took
  const colour = new Uint8Array(W * H * 4);
  const buf = new Uint8Array(TILE * TILE * 4);
  const frames = new Map<string, number>();
  const centre = new THREE.Vector3(0, 0.95, 0);

  const before = { tone: renderer.toneMapping, target: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const copy = (row: number, col: number): void => {
    renderer.readRenderTargetPixels(rt, 0, 0, TILE, TILE, buf);
    for (let y = 0; y < TILE; y++) colour.set(buf.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((row * TILE + y) * W + col * TILE) * 4);
  };
  /** Write the part numbers just rendered into the alpha of the tile's colour. */
  const copyIds = (row: number, col: number): void => {
    renderer.readRenderTargetPixels(rt, 0, 0, TILE, TILE, buf);
    for (let y = 0; y < TILE; y++) {
      const dst = ((row * TILE + y) * W + col * TILE) * 4;
      for (let x = 0; x < TILE; x++) {
        const o = dst + x * 4 + 3;
        // part n (written as n*40 in red) becomes 40 + n*40; nothing stays 0
        if (colour[o] >= 128) colour[o] = 40 + Math.round(buf[(y * TILE + x) * 4] / 40) * 40;
        else colour[o] = 0;
      }
    }
  };

  FRAMES.forEach(([name, pose], row) => {
    frames.set(name, row);
    puppet.set(pose, name === "bikeDown");
    YAWS.forEach((deg, col) => {
      const yaw = (deg * Math.PI) / 180;
      // from behind (yaw 0) the camera sits at -z; positive yaws swing it to
      // the rider's right (-x)
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(ELEVATION), Math.sin(ELEVATION), -Math.cos(yaw) * Math.cos(ELEVATION));
      cam.position.copy(centre).addScaledVector(dir, 12);
      cam.lookAt(centre);
      cam.updateMatrixWorld();
      // light from high over the camera's left shoulder, the same on every tile: from
      // just over the camera the back of a rider came out one flat colour
      sun.position.copy(cam.position).add(new THREE.Vector3(0, 9, 0)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 9);
      sun.target.position.copy(centre);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      const at = tileAt(row, col, perRow);
      copy(at.y, at.x);
      puppet.ids(true);
      renderer.clear();
      renderer.render(scene, cam);
      copyIds(at.y, at.x);
      puppet.ids(false);
    });
  });
  renderer.setRenderTarget(before.target);
  renderer.toneMapping = before.tone;
  renderer.setClearColor(before.clear, before.alpha);
  rt.dispose();

  const tex = (data: Uint8Array): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    // big square texels near the camera, as the original's sprites (V4)
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  // where the ground (y = 0) falls in a tile, as a fraction of its height up
  const anchor = 0.5 - (centre.y * Math.cos(ELEVATION)) / SPAN;
  return { colour: tex(colour), frames, anchor, perRow, rows };
}

// ---- drawing a frame ----

export type Look = { main: string; trim: string; helmet: string; paint: string; paintTrim: string };

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform sampler2D map;
uniform vec4 tile;
uniform vec2 texel;
uniform float flip;
uniform vec3 tints[6];
uniform float shade;
uniform float flash;
varying vec2 vUv;
int idAt(vec4 c) { return c.a < 0.08 ? -1 : int(floor(c.a * 255.0 / 40.0 + 0.5)) - 1; }
vec4 near(vec2 uv, vec2 d) { return texture2D(map, clamp(uv + d * texel, tile.xy + texel * 0.5, tile.xy + tile.zw - texel * 0.5)); }
void main() {
  vec2 uv = vUv;
  if (flip > 0.5) uv.x = 1.0 - uv.x;
  uv = tile.xy + uv * tile.zw;
  vec4 c = texture2D(map, uv);
  int id = idAt(c);
  int l = idAt(near(uv, vec2(-1.0, 0.0)));
  int r = idAt(near(uv, vec2(1.0, 0.0)));
  int u = idAt(near(uv, vec2(0.0, 1.0)));
  int d = idAt(near(uv, vec2(0.0, -1.0)));
  // a dark line one texel wide round the whole figure, as the original's
  // hand-drawn sprites have
  if (id < 0) {
    if (max(max(l, r), max(u, d)) < 0) discard;
    gl_FragColor = vec4(mix(vec3(0.06, 0.05, 0.07), vec3(1.0, 0.97, 0.85), flash), 1.0);
    return;
  }
  vec3 t = vec3(1.0);
  for (int i = 1; i < 6; i++) if (i == id) t = tints[i];
  // and a softer one where one part meets another of a different colour
  float seam = (l >= 0 && l != id) || (u >= 0 && u != id) ? 0.62 : 1.0;
  gl_FragColor = vec4(mix(c.rgb * t * shade * seam, vec3(1.0, 0.97, 0.85), flash), 1.0);
}`;

export type Tile = { col: number; flip: boolean };

/** Degrees past the halfway point before a sprite changes direction. */
const HOLD = 4;

/**
 * Which of the drawn directions to show for `view` radians round from behind,
 * and whether mirrored for a view from the left. Each sprite keeps what it
 * showed last until the view is clearly past the halfway point to the next
 * one: picked afresh every frame, a bike straight ahead swapped between its
 * mirror images, and a bike at a direction halfway between two drawn ones
 * swapped tiles, with every few centimetres of sideways wobble - a flicker
 * when overtaking (spec/sprites.test.ts counts the swaps).
 */
export function tileFor(view: number, last: Tile): Tile {
  const hold = (HOLD * Math.PI) / 180;
  const flip = last.flip ? view < hold : view < -hold;
  const deg = (Math.abs(view) * 180) / Math.PI;
  let best = 0;
  for (let i = 1; i < YAWS.length; i++) if (Math.abs(YAWS[i] - deg) < Math.abs(YAWS[best] - deg)) best = i;
  const col = Math.abs(YAWS[best] - deg) + HOLD < Math.abs(YAWS[last.col] - deg) ? best : last.col;
  return { col, flip };
}

/** A billboard showing one rider's frames in their own colours. */
export class RiderSprite {
  readonly mesh: THREE.Mesh;
  private u: { tile: { value: THREE.Vector4 }; texel: { value: THREE.Vector2 }; flip: { value: number }; shade: { value: number }; flash: { value: number } };

  private atlas: Atlas;
  private tile: Tile = { col: 0, flip: false };

  constructor(atlas: Atlas, look: Look) {
    this.atlas = atlas;
    const srgb = (c: string): THREE.Vector3 => {
      const col = new THREE.Color(c);
      const o = { r: 0, g: 0, b: 0 };
      col.getRGB(o, THREE.SRGBColorSpace);
      return new THREE.Vector3(o.r, o.g, o.b);
    };
    const tints = [new THREE.Vector3(1, 1, 1), srgb(look.main), srgb(look.trim), srgb(look.helmet), srgb(look.paint), srgb(look.paintTrim)];
    this.u = { tile: { value: new THREE.Vector4() }, texel: { value: new THREE.Vector2(1 / atlas.colour.image.width, 1 / atlas.colour.image.height) }, flip: { value: 0 }, shade: { value: 1 }, flash: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.colour }, tints: { value: tints }, ...this.u },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    // the tile's ground line sits at the mesh's origin, so lean turns it
    // about the tyre's contact patch
    const g = new THREE.PlaneGeometry(SPAN, SPAN).translate(0, SPAN / 2 - atlas.anchor * SPAN, 0);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  /**
   * Show frame `name` (a right-handed name: "punchOut.R") seen from `view`
   * radians round from behind, positive from the rider's right.
   */
  /** Light the sprite towards white, 0 to 1: the instant a blow lands on it. */
  setFlash(f: number): void {
    this.u.flash.value = f;
  }

  show(name: string, view: number): void {
    const a = this.atlas;
    this.tile = tileFor(view, this.tile);
    const { col, flip } = this.tile;
    // seen from the left: the right-hand view, mirrored, of the other side's move
    const frame = !flip ? name : name.endsWith(".R") ? name.slice(0, -2) + ".L" : name.endsWith(".L") ? name.slice(0, -2) + ".R" : name;
    const at = tileAt(a.frames.get(frame) ?? 0, col, a.perRow);
    const cols = a.perRow;
    const rows = a.rows;
    // DataTexture rows run bottom-up, the same as readRenderTargetPixels
    this.u.tile.value.set(at.x / cols, at.y / rows, 1 / cols, 1 / rows);
    this.u.flip.value = flip ? 1 : 0;
  }
}

/**
 * The frame a rider on the bike shows: drawn back for the first part of a
 * blow, out at full stretch from the moment it lands (V15, C3, C4), as the
 * recording steps 6 frames back and 5 out.
 */
export function frameFor(r: Rider): string {
  const a = r.attack;
  if (!a) return r.weapon === "club" ? "rideClub.R" : r.weapon === "chain" ? "rideChain.R" : "ride.R";
  const side = a.side > 0 ? "R" : "L";
  const windup = windupOf(r, a);
  const out = a.t >= windup;
  if (a.kind === "kick") return `${out ? "kick" : "kickCock"}.${side}`;
  if (a.kind === "backhand") return a.t >= windup * 0.4 ? `backhand.${side}` : `punchCock.${side}`;
  if (r.weapon === "club") return `${out ? "clubOut" : "clubUp"}.${side}`;
  if (r.weapon === "chain") return `${out ? "chainOut" : "chainUp"}.${side}`;
  return `${out ? "punchOut" : "punchCock"}.${side}`;
}
