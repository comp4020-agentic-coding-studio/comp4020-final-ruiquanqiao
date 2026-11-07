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
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { type Rider, TUNE, windupOf } from "../game/sim.ts";
import { type Prim, meshBody } from "./body.ts";
import { type BodyJoints, type SkinnedBody, skinnedBody } from "./skin.ts";
import { buildBike } from "./models.ts";

// ---- poses ----

/**
 * Which part a pixel belongs to. The atlas keeps only how bright each pixel
 * is, and its part; the colour is the part's tint, given when it is drawn.
 * 0 (tyres, metal, gloves, boots, visor) is grey and keeps its brightness;
 * the leathers and paint take the rider's colours; the lamp and the club's
 * wood have fixed tints of their own.
 */
const PART = { fixed: 0, main: 1, trim: 2, helmet: 3, paint: 4, paintTrim: 5, lamp: 6, wood: 7 } as const;
const PARTS = 8;
/** how a part number is written in the id pass, and read back: n * ID_STEP in red */
const ID_STEP = 28;

type V = [number, number, number];

/** upper arm and forearm, m */
const ARM = 0.35;
/**
 * pelvis to the base of the neck along the spine, m. At 0.46 the arm (two
 * lengths of ARM) was 1.64 times the trunk from hip to shoulder where a
 * person's is nearer 1.2, and the rider read as short in the waist and long
 * in the arm; at 0.54 it is 1.37. The arm itself stays: shorter (0.33), the
 * chain no longer reached where the recording has it at 247.64
 */
const TRUNK = 0.54;

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
  weapon?: { kind: "club" | "chain" | "flag"; dir: V; pts?: V[] };
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

// A chain as links: it leaves the hand along `from` and bends round to lie
// along `to` at its tip, 0.77 m in all. Drawn as one fixed stick, it turned
// with the hand like a rod; a chain trails the hand on the way and snaps out
// straight only at the hit (spec/motion.test.ts).
const CHAIN_LENGTH = 0.77;
function links(from: V, to: V, n = 12): V[] {
  const a = new THREE.Vector3(...from).normalize();
  const b = new THREE.Vector3(...to).normalize();
  const step = CHAIN_LENGTH / (n - 1);
  const pts: V[] = [[0, 0, 0]];
  const p = new THREE.Vector3();
  for (let i = 1; i < n; i++) {
    const d = a.clone().lerp(b, (i - 0.5) / (n - 1)).normalize();
    p.addScaledVector(d, step);
    pts.push([p.x, p.y, p.z]);
  }
  return pts;
}
const chain = (from: V, to: V): Pose["weapon"] => ({ kind: "chain", dir: to, pts: links(from, to) });

// The blows, each as the recording shows it, measured off full-resolution
// frames and held there by spec/sprites.test.ts ("every pose against the
// recording"). Right-hand versions; the left ones are their mirror images
// (mirror()). The rider rides hunched (helmet 2.1 helmet widths over the tail
// lamp) but sits up to strike (2.85).
const RIGHT: Record<string, Pose> = {
  ride: ride(),
  rideClub: ride({ weapon: { kind: "club", dir: [-0.3, -0.5, -0.8] } }),
  rideChain: ride({ weapon: chain([-0.2, -0.9, 0.3], [0, -1, -0.3]) }),
  // the fist drawn back beside the helmet, the elbow out below it (6 frames)
  punchCock: ride({ pitch: 0.4, handR: [-0.42, 1.5, 0.05], elbowR: [-1.0, 1.1, -0.3] }),
  // then the whole arm straight out sideways at shoulder height (5 frames)
  punchOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.05], elbowR: [-0.5, 1.8, -0.2] }),
  // the kick chambered: knee out, foot drawn back by the tail (6 frames)
  // the foot 8 cm higher than first set, since the longer back lifts the helmet it is measured from
  kickCock: ride({ pitch: 0.42, roll: -0.12, footR: [-0.95, 0.8, -0.45], kneeR: [-0.9, 1.3, 0.3] }),
  // then the leg straight out sideways just over the tail: the hips slide
  // across the seat towards it and the body leans off it (5 frames)
  kick: ride({ pelvis: [-0.12, 0.96, -0.36], pitch: 0.38, roll: -0.2, footR: [-1.5, 0.84, -0.25], kneeR: [-0.6, 1.5, -0.25] }),
  // a club held up beside the helmet, pointing up over it, then brought out
  clubUp: ride({ pitch: 0.8, handR: [-0.42, 1.47, 0.0], elbowR: [-0.8, 1.9, -0.3], weapon: { kind: "club", dir: [0.35, 1, -0.2] } }),
  clubOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.1], elbowR: [-0.5, 1.8, -0.2], weapon: { kind: "club", dir: [-0.85, -0.45, 0.25] } }),
  // the chain cocked: the hand up by the helmet with the elbow raised behind
  // it, the chain hanging down behind the shoulder
  chainUp: ride({ pitch: 0.8, handR: [-0.42, 1.47, 0.0], elbowR: [-0.3, 1.9, -0.9], weapon: chain([0.2, -0.2, -1], [0.2, -1, 0]) }),
  // at the hit the arm is straight and the chain straight out beyond the fist
  chainOut: ride({ pitch: 0.4, roll: -0.1, handR: [-1.2, 1.42, 0.05], elbowR: [-0.5, 0.9, -0.2], weapon: chain([-1, -0.15, 0.2], [-1, -0.15, 0.2]) }),
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

/** On foot, standing still, arms at the sides. */
function stood(): Pose {
  return {
    pelvis: [0, 0.95, 0],
    pitch: 0.02,
    roll: 0,
    handR: [-0.24, 0.6, 0.02],
    handL: [0.24, 0.6, 0.02],
    elbowR: [-0.4, 0.9, -0.5],
    elbowL: [0.4, 0.9, -0.5],
    footR: [-0.13, 0.08, 0.02],
    footL: [0.13, 0.08, -0.02],
    kneeR: [-0.15, 0.6, 1],
    kneeL: [0.15, 0.6, 1],
    bike: false,
  };
}

const OFF: Record<string, Pose> = {
  tumble0: spread(-0.3, 0, 1.0),
  tumble1: spread(1.2, 2.1, 1.0),
  tumble2: spread(2.6, 4.2, 1.0),
  lying: { ...spread(Math.PI / 2, 0, 0.18), handR: [-0.6, 0.55, 0.1], handL: [0.55, 0.65, 0], footL: [0.2, -0.9, 0] },
  run0: run(0),
  run1: run(0.25),
  run2: run(0.5),
  run3: run(0.75),
  // the winner over the line (V14): sat up straight, both fists high and
  // wide in a V above the helmet (pc-race-city-finish-arms-up-01)
  armsUp: ride({ pitch: -0.05, handR: [-0.5, 1.9, 0.05], handL: [0.5, 1.9, 0.05], elbowR: [-1, 1.5, -0.3], elbowL: [1, 1.5, -0.3] }),
  // people on foot (T6): standing, and the flagger with the chequered flag up
  // over the grid and swung across it (H3)
  stand: { ...stood(), handR: [-0.24, 0.6, 0.02], handL: [0.24, 0.6, 0.02] },
  // held up at about head height and swung across: higher, the flag ran off
  // the top of the 2.8 m tile and only its stick was drawn
  flag0: { ...stood(), handR: [-0.45, 1.5, 0.15], elbowR: [-0.8, 1.3, -0.2], weapon: { kind: "flag", dir: [-0.85, 0.5, 0.1] } },
  flag1: { ...stood(), handR: [-0.15, 1.55, 0.15], elbowR: [-0.8, 1.3, -0.2], weapon: { kind: "flag", dir: [0.3, 0.95, 0.1] } },
};

/** The same pose done with the other side of the body. */
function mirror(p: Pose): Pose {
  const m = (v?: V): V | undefined => (v ? [-v[0], v[1], v[2]] : undefined);
  const out: Pose = {
    ...p,
    // the hips slide across the seat towards a kick on either side
    pelvis: m(p.pelvis)!,
    roll: -p.roll,
    handR: m(p.handL)!,
    handL: m(p.handR)!,
    footR: m(p.footL)!,
    footL: m(p.footR)!,
    elbowR: m(p.elbowL),
    elbowL: m(p.elbowR),
    kneeR: m(p.kneeL),
    kneeL: m(p.kneeR),
    weapon: p.weapon && { ...p.weapon, dir: m(p.weapon.dir)!, ...(p.weapon.pts ? { pts: p.weapon.pts.map((q) => m(q)!) } : {}), left: true } as Pose["weapon"],
  };
  mirrorOf.set(out, p);
  return out;
}
/** each left-hand pose's right-hand original: its body is the same surface turned over */
const mirrorOf = new WeakMap<Pose, Pose>();

/** A body surface reflected across the bike's centre line. */
function reflect(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const r = g.clone();
  for (const name of ["position", "normal"]) {
    const a = r.attributes[name];
    for (let i = 0; i < a.count; i++) a.setX(i, -a.getX(i));
  }
  // a reflection turns every face inside out: wind them back
  const idx = r.index!.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  r.userData.shaded = r.attributes.color;
  return r;
}

// Each blow as a movement, not two pictures. It was drawn as two frames,
// drawn back and out, and cut from one to the other the instant it landed,
// so a punch jumped from beside the helmet to arm's length. Frame by frame,
// the recording's swing travels (247.2-248.0): the arm goes up and holds,
// then sweeps out through several frames in between, holds at full stretch,
// and comes back. Here every blow runs through rest, raised, drawn back,
// two points on the sweep, out, and back down, the in-between poses
// interpolated from the measured ones on either side.

/** A blow's three measured poses: at rest, drawn back, and out. */
const BLOWS: Record<string, [string, string, string]> = {
  punch: ["ride", "punchCock", "punchOut"],
  club: ["rideClub", "clubUp", "clubOut"],
  chain: ["rideChain", "chainUp", "chainOut"],
  kick: ["ride", "kickCock", "kick"],
};

/** The pose `f` of the way from `a` to `b`: every point moved along the straight line between. */
function between(a: Pose, b: Pose, f: number): Pose {
  const lerp = (p?: V, q?: V): V | undefined => (p && q ? [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f] : (f < 0.5 ? p : q));
  const w = b.weapon ?? a.weapon;
  const dir = a.weapon && b.weapon ? new THREE.Vector3(...lerp(a.weapon.dir, b.weapon.dir)!).normalize().toArray() as V : w?.dir;
  const pts = a.weapon?.pts && b.weapon?.pts ? a.weapon.pts.map((p, i) => lerp(p, b.weapon!.pts![i])!) : (f < 0.5 ? a.weapon : b.weapon)?.pts;
  return {
    ...a,
    pelvis: lerp(a.pelvis, b.pelvis)!,
    pitch: a.pitch + (b.pitch - a.pitch) * f,
    roll: a.roll + (b.roll - a.roll) * f,
    handR: lerp(a.handR, b.handR)!,
    handL: lerp(a.handL, b.handL)!,
    footR: lerp(a.footR, b.footR)!,
    footL: lerp(a.footL, b.footL)!,
    elbowR: lerp(a.elbowR, b.elbowR),
    elbowL: lerp(a.elbowL, b.elbowL),
    kneeR: lerp(a.kneeR, b.kneeR),
    kneeL: lerp(a.kneeL, b.kneeL),
    weapon: w && dir ? { kind: w.kind, dir, ...(pts ? { pts } : {}) } : undefined,
  };
}

// Where on the way out the two sweep frames sit. Evenly, a third and two
// thirds, the fist moved 0.97, 0.67 and then 0.09 helmet widths from frame to
// frame: the measured out pose reaches past arm's length, so the arm is
// straight long before it gets there. Set earlier for the arm, the fist
// covers even ground each frame; a kick is chambered nearly out already.
const SWEEP: Record<string, [number, number]> = { kick: [1 / 3, 2 / 3] };
const ARM_SWEEP: [number, number] = [0.22, 0.48];

// A fist or a kick is one movement, straight out from the bar through a single
// frame halfway, with nothing drawn back first. Through raise, drawn back and
// two sweep frames it read as an arm being wound round for a warm-up, and the
// hit came late (TUNE.windup). A weapon keeps its swing: it is snatched while
// it is drawn back.
const STRIKES = new Set(["punch", "kick"]);
/** where on the way out a fist's one in-between frame sits */
const STRIKE_ARM = 0.3;
/** where the elbow points while a fist goes out or comes back: down and behind */
const ELBOW_DOWN: V = [-0.3, 0.4, -0.5];

for (const [blow, [rest, back, out]] of Object.entries(BLOWS)) {
  const [A, B, C] = [RIGHT[rest], RIGHT[back], RIGHT[out]];
  if (STRIKES.has(blow)) {
    // the arm is straight early, so its frame sits nearer the bar than halfway
    // a fist goes out and comes back through one and the same frame halfway
    // (ride, return, out, return). It was loaded first, drawn down beside the
    // bike and driven out through a strike frame of its own, and the elbow
    // swung round through those three poses: the arm read as cranked
    if (blow === "kick") RIGHT[`${blow}~strike`] = between(A, C, 0.5);
    RIGHT[`${blow}~return`] = between(C, A, blow === "kick" ? 0.5 : 0.6);
    // the elbow follows down behind the fist. Interpolated with everything
    // else, its aim went from the bar's (down) to full stretch's (up), and on
    // the frame between it swung up and out as far as the fist: an elbow strike
    if (blow !== "kick") RIGHT[`${blow}~return`].elbowR = ELBOW_DOWN;
    continue;
  }
  if (blow === "chain") {
    whip(A);
    continue;
  }
  const [f1, f2] = SWEEP[blow] ?? ARM_SWEEP;
  RIGHT[`${blow}~raise`] = between(A, B, 0.5);
  RIGHT[`${blow}~sweep1`] = between(B, C, f1);
  RIGHT[`${blow}~sweep2`] = between(B, C, f2);
  RIGHT[`${blow}~return`] = between(C, A, 0.5);
}

/**
 * The chain's swing, from the elbow. The upper arm is held level and out to
 * the side and stays put; the forearm turns about one upright axis through
 * the elbow, from the fist at the chest out through 170 degrees to straight,
 * a little further each frame than the last, and the chain trails the fist's
 * path until it cracks out straight at the hit. Interpolated between a pose
 * by the helmet and one at full stretch, every frame aimed the elbow afresh:
 * it rose and fell 37 cm through the swing and the forearm swept a cone.
 */
function whip(rest: Pose): void {
  const lean = { pitch: 0.4, roll: -0.1 };
  const S = shoulderOf({ ...rest, ...lean }, 1);
  const upper = new THREE.Vector3(-0.8, 0, 0.6).normalize();
  const E = S.clone().addScaledVector(upper, ARM);
  const at = (deg: number): { hand: V; trail: THREE.Vector3 } => {
    const a = (deg * Math.PI) / 180;
    const f = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // the way the fist is going is round the circle; the chain hangs back from it
    const going = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    return { hand: E.clone().addScaledVector(f, ARM).toArray() as V, trail: going.negate() };
  };
  const pose = (deg: number, from: V, to: V): Pose => {
    const { hand } = at(deg);
    return ride({ ...lean, handR: hand, elbowR: E.toArray() as V, weapon: chain(from, to) });
  };
  const tr = (deg: number, down: number): V => {
    const t = at(deg).trail;
    return [t.x, -down, t.z];
  };
  RIGHT["chain~raise"] = { ...between(rest, pose(10, [0, -1, 0], [0, -1, 0]), 0.5), weapon: chain([0.1, -0.9, -0.3], [0, -1, -0.2]) };
  // drawn back: the fist at the chest, the chain hanging down behind it
  RIGHT.chainUp = pose(10, [0.3, -0.8, -0.5], [0.1, -1, -0.2]);
  RIGHT["chain~sweep1"] = pose(35, tr(35, -0.2), [0.1, -1, 0.5]);
  RIGHT["chain~sweep2"] = pose(85, tr(85, 0.3), [0.4, -0.8, -0.6]);
  RIGHT.chainOut = pose(180, [-1, -0.08, 0], [-1, -0.08, 0]);
  RIGHT["chain~return"] = between(RIGHT.chainOut, rest, 0.5);
}

/** Where a pose puts the shoulder, side 1 the right: as Puppet.set builds it. */
function shoulderOf(p: Pose, sign: number): THREE.Vector3 {
  const right = new THREE.Vector3(-1, 0, 0);
  const spine = new THREE.Vector3(0, 1, 0).applyAxisAngle(right, -p.pitch).applyAxisAngle(new THREE.Vector3(0, 0, 1), p.roll);
  const chest = new THREE.Vector3(...p.pelvis).addScaledVector(spine, TRUNK);
  return chest.addScaledVector(right, sign * 0.22).addScaledVector(spine, -0.03);
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
 * How big a tile is drawn, px, and how the tiles are laid out: the largest
 * size up to 224 (160 on a touch screen, to spare a phone's memory) whose
 * pages fit, each at most 4096 px a side, the most many GPUs can hold, in
 * as few pages as it takes. At 96 and then 128 a rider close to the camera
 * showed texels five or six screen pixels across, coarser than the
 * original's own sprites; at 224 a texel near the camera is about three.
 * Tiles run left to right, row after row, page after page.
 */
export function tileSize(maxTexture: number, touch: boolean, tiles = FRAMES.length * YAWS.length): { tile: number; perRow: number; rows: number; pages: number } {
  const max = Math.min(4096, maxTexture);
  const fit = (tile: number) => {
    const perRow = Math.floor(max / tile);
    const all = Math.ceil(tiles / perRow);
    const perPage = Math.floor(max / tile);
    const pages = Math.ceil(all / perPage);
    // every page as tall as it needs to be, and all of them alike
    return { tile, perRow, rows: Math.ceil(all / pages), pages };
  };
  for (const tile of [224, 192, 160, 128, 96, 64]) {
    if (touch && tile > 160) continue;
    const t = fit(tile);
    if (t.pages <= 3) return t;
  }
  return fit(48);
}
/** Where frame `i` seen from yaw column `col` sits, in tiles and pages. */
const tileAt = (i: number, col: number, perRow: number, rows: number): { x: number; y: number; page: number } => {
  const n = i * YAWS.length + col;
  const row = Math.floor(n / perRow);
  return { x: n % perRow, y: row % rows, page: Math.floor(row / rows) };
};
/** metres the tile spans, square; the ground is at ANCHOR of its height */
export const SPAN = 2.8;
const ELEVATION = 0.17; // rad: the chase camera looks down on a rider at about this

// ---- the puppet ----

type Part = THREE.Mesh & { userData: { part: number } };

// Upper and lower limb lengths, m. The recording's riders reach 3.4 helmet
// widths with a fist and 4.2 with a boot; at 0.3 and 0.44 the puppet's limbs
// fell well short of both, so the blows read as nudges.

const LEG = 0.5;

/**
 * The modelled human the body is skinned from, once loaded (client/skin.ts).
 * Until then, and in Node where there is no model, the blended capsules
 * stand in.
 */
let human: THREE.Object3D | null = null;
export const useHuman = (scene: THREE.Object3D): void => {
  human = scene;
};

/**
 * Which atlas part a vertex of the human is, from the bone that moves it
 * most, how far along it (0 at its root, 1 where the next bone starts) and
 * where it is in the model's rest pose.
 *
 * One colour for the suit, the second only on the shoulders and upper back,
 * whole pieces bounded by the joints, so every edge between them runs round
 * the body where the suit's own seams are, never across a panel. A back panel
 * and stripes cut by a line through the mesh, copied from the recording's
 * leathers, stepped along the suit's triangles and came out ragged at the
 * atlas's size, however finely the mesh was split.
 */
function humanPart(bone: string, _from: THREE.Vector3, along: number, _at: THREE.Vector3): number {
  if (/^(hand|thumb|index|middle|ring|pinky)_/.test(bone)) return PART.fixed;
  // the gauntlet's cuff, the last fifth of the forearm
  if (/^lowerarm_/.test(bone) && along > 0.8) return PART.fixed;
  if (/^(foot|ball)_/.test(bone)) return PART.fixed;
  // the boot: the suit's leg ends a little above the ankle
  if (/^calf_/.test(bone) && along > 0.78) return PART.fixed;
  if (/^(neck|head|Head)/.test(bone)) return PART.fixed;
  // the yoke: the upper chest and back and the tops of the shoulders
  if (/^(spine_03|clavicle_)/.test(bone)) return PART.trim;
  return PART.main;
}

class Puppet {
  root = new THREE.Group(); // bike space
  body = new THREE.Group(); // the rider; turned as a whole when off the bike
  bike: THREE.Group;
  private mats = new Map<string, THREE.Material>();
  private parts: Record<string, Part> = {};
  private weapons: Record<"club" | "chain" | "flag", THREE.Object3D>;
  private flesh: THREE.Mesh;
  private skin: SkinnedBody | null = null;
  private skinJoints: BodyJoints | null = null;
  /** joints, for measuring a pose against the recording */
  private joints: Record<string, THREE.Vector3> = {};
  private mesh: boolean;
  private last: { pose: Pose; geometry: THREE.BufferGeometry } | null = null;

  /** `mesh` false skips building the surface, for measuring alone */
  constructor(mesh = true) {
    this.mesh = mesh;
    this.bike = buildBike("#ff00ff", "#00ffff");
    // paint and trim were built in marker colours: turn them white and tag them
    this.bike.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const col = (m.material as THREE.MeshStandardMaterial).color?.getHexString();
      const part = col === "ff00ff" ? PART.paint : col === "00ffff" ? PART.paintTrim : col === "ff2010" ? PART.lamp : PART.fixed;
      m.userData.part = part;
      if (part === PART.lamp) m.material = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.6 });
      else if (part) m.material = this.mat("#ffffff", 0.35, 0.1);
    });
    this.root.add(this.bike, this.body);
    const ball = new THREE.SphereGeometry(1, 18, 12);
    // leather is shiny: highlights pick out the shapes the tint alone flattened
    const add = (name: string, geo: THREE.BufferGeometry, part: number, colour = "#ffffff", rough = 0.38): void => {
      const m = new THREE.Mesh(geo, this.mat(part ? "#ffffff" : colour, rough, 0)) as unknown as Part;
      m.userData.part = part;
      this.parts[name] = m;
      this.body.add(m);
    };
    // the helmet is a hard shell, not leather: it stays a piece of its own
    add("helmet", ball, PART.helmet, "#ffffff", 0.25);
    // its stripe is the suit's main colour, as the shell is its second (game/liveries.ts)
    add("stripe", ball, PART.main, "#ffffff", 0.25);
    add("visor", ball, PART.fixed, "#101318", 0.1);
    // everything else is one surface (client/body.ts), coloured per vertex
    this.flesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 }));
    this.body.add(this.flesh);
    if (mesh && human) {
      this.skin = skinnedBody(human, humanPart, fleshColour, (part) => idMaterial(part).color);
      this.body.add(this.skin.mesh);
      this.flesh.visible = false;
      // gauntlets: a squared fist, wider across the knuckles than it is thick
      const glove = new RoundedBoxGeometry(0.1, 0.085, 0.12, 3, 0.025);
      for (const s of ["gloveR", "gloveL"]) add(s, glove, PART.fixed, "#171717", 0.5);
    }
    const wood = this.mat("#ffffff", 0.8, 0);
    const steel = this.mat("#9a9aa2", 0.35, 0.8);
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.75, 10).translate(0, 0.33, 0), wood);
    const chainPts = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.5) * 0.04, i * 0.07, 0));
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts), 40, 0.018, 6), steel);
    // the flagger's chequered flag on its stick (H3): black and white squares,
    // which the atlas keeps as they are, untinted
    const flag = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8).translate(0, 0.3, 0), wood);
    stick.userData.part = PART.wood;
    flag.add(stick);
    const sq = new THREE.BoxGeometry(0.11, 0.11, 0.01);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const m = new THREE.Mesh(sq, this.mat((i + j) % 2 ? "#141414" : "#f4f4f4", 0.7, 0));
        m.position.set(0.075 + i * 0.11, 0.56 - j * 0.11, 0);
        m.userData.part = PART.fixed;
        flag.add(m);
      }
    }
    this.weapons = { club, chain, flag };
    club.userData.part = PART.wood;
    chain.userData.part = PART.fixed;
    this.body.add(club, chain, flag);
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
    const chest = pelvis.clone().addScaledVector(spine, TRUNK);
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
    const prims: Prim[] = [];
    const cone = (a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, part: number, k: number, extra: Partial<Prim> = {}): void => {
      prims.push({ a: a.clone(), b: b.clone(), r1, r2, part, k, ...extra });
    };
    /** A rounded black block at `c`, its length along `along`, its height as near `up` as it can be: gloves and boots. */
    const block = (c: THREE.Vector3, along: THREE.Vector3, up: THREE.Vector3, half: [number, number, number], round: number, k: number): void => {
      const w = along.clone().normalize();
      let u = new THREE.Vector3().crossVectors(up, w);
      if (u.lengthSq() < 1e-6) u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), w);
      u.normalize();
      const vv = new THREE.Vector3().crossVectors(w, u);
      prims.push({ a: c.clone(), b: c.clone(), r1: 0, r2: 0, part: PART.fixed, k, box: { u, v: vv, w, half, round } });
    };
    // the trunk: hips to collar, broader across the shoulders than at the
    // waist and wider than it is deep, the back rounded by the protector.
    // Two-tone as the recording's riders are (punch.jpg, 247.4): the second
    // colour over the shoulders and back, the first on the seat, the sleeves
    // and the legs
    const collar = chest.clone().addScaledVector(spine, 0.06);
    const flat = { axis: fwd.clone(), s: 0.7 };
    const waist = pelvis.clone().addScaledVector(spine, 0.2);
    cone(pelvis.clone().addScaledVector(spine, 0.04), waist, 0.15, 0.16, PART.main, 0.01, { squash: flat });
    cone(waist, collar, 0.165, 0.215, PART.trim, 0.06, { squash: flat });
    cone(chest.clone().addScaledVector(spine, -0.1).addScaledVector(fwd, -0.06), chest.clone().addScaledVector(fwd, -0.07), 0.11, 0.13, PART.trim, 0.08);
    const neckTop = chest.clone().addScaledVector(spine, 0.13);
    cone(chest, neckTop, 0.065, 0.055, PART.fixed, 0.04);
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
    this.joints.helmet = head.clone();
    const sk: Partial<BodyJoints> = { pelvis: pelvis.clone(), spine: spine.clone(), fwd: fwd.clone(), neckBase: chest.clone(), neckTop: neckTop.clone(), head: head.clone() };
    for (const [s, sign] of [
      ["R", 1],
      ["L", -1],
    ] as const) {
      const shoulder = chest.clone().addScaledVector(across, sign * 0.22).addScaledVector(spine, -0.03);
      const hand = v(s === "R" ? p.handR : p.handL);
      const elbowPole = v((s === "R" ? p.elbowR : p.elbowL) ?? [sign * -0.6, 1, -0.1]);
      const elbow = ik(shoulder, hand, ARM, ARM, elbowPole);
      const handAt = elbow.clone().add(hand.clone().sub(elbow).normalize().multiplyScalar(ARM));
      const wrist = elbow.clone().lerp(handAt, 0.82);
      // the sleeve grows out of the shoulder and bends at the elbow; the
      // gauntlet is a fist, blended only a little so the cuff stays a cuff
      cone(shoulder, elbow, 0.095, 0.074, PART.main, 0.07);
      cone(elbow, wrist, 0.074, 0.056, PART.main, 0.04);
      // a gauntlet: a flared cuff, then a squared fist, wider across the
      // knuckles than it is thick. A capsule here ended the arm in a ball
      const fist = handAt.clone().sub(elbow).normalize();
      cone(wrist, handAt.clone().addScaledVector(fist, -0.02), 0.06, 0.063, PART.fixed, 0.012);
      block(handAt.clone().addScaledVector(fist, 0.03), fist, new THREE.Vector3(0, 1, 0), [0.048, 0.038, 0.056], 0.018, 0.012);
      const glove = P[`glove${s}`];
      if (glove) {
        // its length along the forearm, its back facing up as near as it can
        glove.position.copy(handAt).addScaledVector(fist, 0.03);
        const up = new THREE.Vector3(0, 1, 0).addScaledVector(fist, -fist.y);
        if (up.lengthSq() < 1e-6) up.set(sign, 0, 0);
        up.normalize();
        glove.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, fist), up, fist));
        glove.scale.set(1, 1, 1);
      }
      const hip = pelvis.clone().addScaledVector(across, sign * 0.11);
      const foot = v(s === "R" ? p.footR : p.footL);
      const kneePole = v((s === "R" ? p.kneeR : p.kneeL) ?? [sign * -0.4, 0.9, 0.4]);
      const knee = ik(hip, foot, LEG, LEG, kneePole);
      const footAt = knee.clone().add(foot.clone().sub(knee).normalize().multiplyScalar(LEG));
      cone(hip, knee, 0.12, 0.085, PART.main, 0.06);
      const ankle = knee.clone().lerp(footAt, 0.78);
      cone(knee, ankle, 0.085, 0.064, PART.main, 0.04);
      // the boot: a shaft up the shin, and a foot that is longer than it is
      // tall, toe ahead of the heel, its sole square to the shin
      cone(ankle, footAt, 0.064, 0.06, PART.fixed, 0.015);
      const shin = knee.clone().sub(footAt).normalize();
      const ahead = new THREE.Vector3(0, 0, 1).addScaledVector(shin, -shin.z).normalize();
      block(footAt.clone().addScaledVector(ahead, 0.06).addScaledVector(shin, -0.025), ahead, shin, [0.048, 0.05, 0.125], 0.024, 0.02);
      this.joints[`shoulder${s}`] = shoulder;
      this.joints[`elbow${s}`] = elbow;
      this.joints[`glove${s}`] = handAt;
      this.joints[`knee${s}`] = knee;
      this.joints[`hip${s}`] = hip;
      this.joints[`boot${s}`] = footAt.clone().add(new THREE.Vector3(0, -0.02, 0.05));
      Object.assign(sk, {
        [`shoulder${s}`]: shoulder,
        [`elbow${s}`]: elbow,
        [`wrist${s}`]: wrist,
        [`fist${s}`]: handAt.clone().addScaledVector(fist, 0.07),
        [`hip${s}`]: hip,
        [`knee${s}`]: knee,
        [`ankle${s}`]: ankle,
        [`toe${s}`]: footAt.clone().addScaledVector(ahead, 0.17).addScaledVector(shin, -0.05),
      });
      if (s === "R") {
        for (const [k, w] of Object.entries(this.weapons)) {
          w.visible = p.weapon?.kind === k;
          if (!w.visible) continue;
          const left = (p.weapon as { left?: boolean }).left;
          w.position.copy(left ? new THREE.Vector3() : handAt);
          if (k === "chain" && p.weapon!.pts) {
            // its links, laid out from the hand: rebuilt per pose, once, when the atlas is drawn
            const m = w as THREE.Mesh;
            m.geometry.dispose();
            m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.weapon!.pts.map((q) => v(q))), 40, 0.018, 6);
            w.quaternion.identity();
          } else {
            w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v(p.weapon!.dir).normalize());
          }
        }
      } else if ((p.weapon as { left?: boolean } | undefined)?.left) {
        const w = this.weapons[p.weapon!.kind];
        w.position.copy(handAt);
      }
    }
    if (this.skin) this.skinJoints = sk as BodyJoints;
    else if (this.mesh) {
      // the atlas draws each left-hand pose straight after its right-hand one
      const done = this.last && mirrorOf.get(p) === this.last.pose ? reflect(this.last.geometry) : meshBody(prims, fleshColour, (part) => idMaterial(part).color);
      this.flesh.geometry.dispose();
      this.flesh.geometry = done;
      this.last = { pose: p, geometry: done };
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
    // the skinned body's bones are written in world space, so after the body is placed
    if (this.skin && this.skinJoints) {
      this.root.updateMatrixWorld(true);
      this.skin.pose(this.skinJoints, this.skin.mesh.matrixWorld);
    }
    // a bike down on its side, sliding (V13)
    this.bike.rotation.set(0, 0, bikeDown ? Math.PI / 2 - 0.15 : 0);
    this.bike.position.set(bikeDown ? 0.5 : 0, bikeDown ? 0.18 : 0, 0);
  }

  /** Where a part sits, in bike space. */
  at(name: string): THREE.Vector3 {
    return (this.joints[name] ?? this.parts[name].position).clone();
  }

  /** Swap every material for flat part numbers, or back. */
  ids(on: boolean): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m === this.flesh || m === this.skin?.mesh) {
        // the one surface carries its part numbers per vertex
        const g = m.geometry;
        if (g.attributes.idColour) g.setAttribute("color", on ? g.attributes.idColour : g.userData.shaded);
        m.userData.real ??= m.material;
        m.material = on ? idFlesh : m.userData.real;
        return;
      }
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
  // part n is written as n*ID_STEP in red, read back exactly with no filtering
  return (idMats[id] ??= new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB((id * ID_STEP) / 255, 0, 0, THREE.SRGBColorSpace) }));
}

const idFlesh = new THREE.MeshBasicMaterial({ vertexColors: true });
/** the leathers' own colour per part, before the tint: white where tinted, near black for gloves, boots and neck */
const fleshColour = (part: number): THREE.Color => (part ? new THREE.Color(1, 1, 1) : new THREE.Color().setRGB(0.09, 0.09, 0.09, THREE.SRGBColorSpace));

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
  const puppet = new Puppet(false);
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

/**
 * The frames, drawn: in each texel, red is how bright it is and green which
 * part it is (0 where there is nothing). Four bytes a texel, colour and part,
 * held 296 tiles in one 4096 px page; the in-between frames of every blow
 * took that to 760, and at two bytes they fit in the memory one page took.
 */
export type Atlas = { texture: THREE.DataArrayTexture; frames: Map<string, number>; anchor: number; perRow: number; rows: number; pages: number };

/**
 * Renders every frame from every direction, once, a few at a time so the page
 * stays responsive while it works (`step`), or all at once (`finish`). A
 * frame of the race costs nothing for it afterwards.
 */
export class AtlasBuilder {
  private next = 0;
  private atlas: Atlas | null = null;
  private puppet = new Puppet();
  private scene = new THREE.Scene();
  private sun = new THREE.DirectionalLight("#ffffff", 3.0);
  private cam: THREE.OrthographicCamera;
  private rt: THREE.WebGLRenderTarget;
  private data: Uint8Array;
  private buf: Uint8Array;
  private frames = new Map<string, number>();
  private layout: ReturnType<typeof tileSize>;
  private W: number;
  private H: number;
  private readonly centre = new THREE.Vector3(0, 0.95, 0);
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.scene.add(this.puppet.root, new THREE.HemisphereLight("#ffffff", "#404050", 0.9), this.sun, this.sun.target);
    const half = SPAN / 2;
    this.cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 40);
    const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    this.layout = tileSize(renderer.capabilities.maxTextureSize, touch);
    const { tile, perRow, rows, pages } = this.layout;
    this.rt = new THREE.WebGLRenderTarget(tile, tile);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.W = perRow * tile;
    this.H = rows * tile;
    this.data = new Uint8Array(this.W * this.H * pages * 2);
    this.buf = new Uint8Array(tile * tile * 4);
  }

  /** Draw frames for up to `ms`; true once every frame is drawn. */
  step(ms: number): boolean {
    if (this.atlas) return true;
    const r = this.renderer;
    const before = { tone: r.toneMapping, target: r.getRenderTarget(), clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha() };
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 0);
    const until = performance.now() + ms;
    while (this.next < FRAMES.length && performance.now() < until) this.draw(this.next++);
    r.setRenderTarget(before.target);
    r.toneMapping = before.tone;
    r.setClearColor(before.clear, before.alpha);
    if (this.next < FRAMES.length) return false;
    this.done();
    return true;
  }

  /** Every frame drawn, however long it takes. */
  finish(): Atlas {
    while (!this.step(1000));
    return this.atlas!;
  }

  private draw(row: number): void {
    const [name, pose] = FRAMES[row];
    const { tile, perRow, rows } = this.layout;
    const { renderer, puppet, scene, cam, sun, rt, buf, centre } = this;
    this.frames.set(name, row);
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
      const at = tileAt(row, col, perRow, rows);
      const base = at.page * this.W * this.H;
      const texel = (y: number, x: number): number => (base + (at.y * tile + y) * this.W + at.x * tile + x) * 2;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, tile, tile, buf);
      // brightness; and whether anything is there, held until the part is known
      for (let y = 0; y < tile; y++)
        for (let x = 0; x < tile; x++) {
          const i = (y * tile + x) * 4;
          const o = texel(y, x);
          this.data[o] = Math.round(0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]);
          this.data[o + 1] = buf[i + 3] >= 128 ? 255 : 0;
        }
      puppet.ids(true);
      renderer.clear();
      renderer.render(scene, cam);
      puppet.ids(false);
      renderer.readRenderTargetPixels(rt, 0, 0, tile, tile, buf);
      for (let y = 0; y < tile; y++)
        for (let x = 0; x < tile; x++) {
          const o = texel(y, x) + 1;
          // part n becomes ID_STEP + n*ID_STEP; nothing stays 0
          if (this.data[o]) this.data[o] = ID_STEP + Math.round(buf[(y * tile + x) * 4] / ID_STEP) * ID_STEP;
        }
    });
  }

  private done(): void {
    this.rt.dispose();
    const { perRow, rows, pages } = this.layout;
    const t = new THREE.DataArrayTexture(this.data, this.W, this.H, pages);
    t.format = THREE.RGFormat;
    t.type = THREE.UnsignedByteType;
    // read texel by texel in the shader (texelFetch), which blends them itself:
    // the part ids must never be averaged between two parts
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    // where the ground (y = 0) falls in a tile, as a fraction of its height up
    const anchor = 0.5 - (this.centre.y * Math.cos(ELEVATION)) / SPAN;
    this.atlas = { texture: t, frames: this.frames, anchor, perRow, rows, pages };
  }
}

/** Render every frame from every direction, all at once. */
export function buildAtlas(renderer: THREE.WebGLRenderer): Atlas {
  return new AtlasBuilder(renderer).finish();
}

// ---- drawing a frame ----

export type Look = { main: string; trim: string; helmet: string; paint: string; paintTrim: string };

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Each pixel blends the four texels round it, as a photograph is sampled:
// the brightness, the part's tint and whether anything is there at all, so
// the outline and the silhouette come out smooth and the shading graded.
// Sampled nearest, each texel was drawn as a square block about three
// screen pixels across with a stepped black line round it, which read as a
// low resolution chosen on purpose (ledger V4).
const FRAG = `
precision highp sampler2DArray;
uniform sampler2DArray map;
uniform float page;
uniform vec4 tile;
uniform vec2 size;
uniform float flip;
uniform vec3 tints[${PARTS}];
uniform float shade;
varying vec2 vUv;
ivec2 lo;
ivec2 hi;
int idAt(vec4 c) { return c.g < 0.05 ? -1 : int(floor(c.g * 255.0 / ${ID_STEP}.0 + 0.5)) - 1; }
vec4 px(ivec2 q) { return texelFetch(map, ivec3(clamp(q, lo, hi), int(page)), 0); }
vec3 tintOf(int id) {
  vec3 t = vec3(1.0);
  for (int i = 1; i < ${PARTS}; i++) if (i == id) t = tints[i];
  return t;
}
/** how much of the figure covers texel-space point p, blended from the four texels round it */
float cover(vec2 p) {
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  float a = idAt(px(i)) >= 0 ? 1.0 : 0.0;
  float b = idAt(px(i + ivec2(1, 0))) >= 0 ? 1.0 : 0.0;
  float c = idAt(px(i + ivec2(0, 1))) >= 0 ? 1.0 : 0.0;
  float d = idAt(px(i + ivec2(1, 1))) >= 0 ? 1.0 : 0.0;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 uv = vUv;
  if (flip > 0.5) uv.x = 1.0 - uv.x;
  lo = ivec2(tile.xy * size + 0.5);
  hi = lo + ivec2(tile.zw * size + 0.5) - 1;
  vec2 p = (tile.xy + uv * tile.zw) * size - 0.5;
  // the figure is where the blended coverage passes a half: its contour runs
  // diagonally across texels instead of round their squares. The line round
  // it is the same contour of a wider blend, a little further out. Each edge
  // is antialiased over one screen pixel
  float body = cover(p);
  float wide = 0.25 * (cover(p + vec2(0.8, 0.8)) + cover(p + vec2(-0.8, 0.8)) + cover(p + vec2(0.8, -0.8)) + cover(p + vec2(-0.8, -0.8)));
  float edge = max(body, wide);
  float lineA = clamp((edge - 0.1) / max(fwidth(edge), 1e-4) + 0.5, 0.0, 1.0);
  if (lineA <= 0.0) discard;
  float bodyA = clamp((body - 0.5) / max(fwidth(body), 1e-4) + 0.5, 0.0, 1.0);
  ivec2 i = ivec2(floor(p));
  vec2 f = fract(p);
  vec3 col = vec3(0.0);
  float cov = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    vec4 c = px(i + o);
    int id = idAt(c);
    if (id < 0) continue;
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    // a softer line where one part meets another of a different colour
    int l = idAt(px(i + o - ivec2(1, 0)));
    int u = idAt(px(i + o + ivec2(0, 1)));
    float seam = (l >= 0 && l != id) || (u >= 0 && u != id) ? 0.7 : 1.0;
    col += w * c.r * tintOf(id) * seam;
    cov += w;
  }
  vec3 inside = cov > 0.0 ? col / cov * shade : vec3(0.0);
  vec3 line = vec3(0.06, 0.05, 0.07);
  gl_FragColor = vec4(mix(line, inside, bodyA), lineA);
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
  private u: { tile: { value: THREE.Vector4 }; page: { value: number }; size: { value: THREE.Vector2 }; flip: { value: number }; shade: { value: number } };

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
    // the lamp glows red and the club is wood, whoever holds it
    const tints = [new THREE.Vector3(1, 1, 1), srgb(look.main), srgb(look.trim), srgb(look.helmet), srgb(look.paint), srgb(look.paintTrim), srgb("#ff3018"), srgb("#a8723e")];
    const img = atlas.texture.image as { width: number; height: number };
    this.u = { tile: { value: new THREE.Vector4() }, page: { value: 0 }, size: { value: new THREE.Vector2(img.width, img.height) }, flip: { value: 0 }, shade: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.texture }, tints: { value: tints }, ...this.u },
      vertexShader: VERT,
      fragmentShader: FRAG,
      // the edge's partial coverage, through the canvas's multisampling: smooth
      // without sorting the sprites back to front
      alphaToCoverage: true,
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
  show(name: string, view: number): void {
    const a = this.atlas;
    this.tile = tileFor(view, this.tile);
    const { col, flip } = this.tile;
    // seen from the left: the right-hand view, mirrored, of the other side's move
    const frame = !flip ? name : name.endsWith(".R") ? name.slice(0, -2) + ".L" : name.endsWith(".L") ? name.slice(0, -2) + ".R" : name;
    const at = tileAt(a.frames.get(frame) ?? 0, col, a.perRow, a.rows);
    const cols = a.perRow;
    const rows = a.rows;
    // texture rows run bottom-up, the same as readRenderTargetPixels
    this.u.tile.value.set(at.x / cols, at.y / rows, 1 / cols, 1 / rows);
    this.u.page.value = at.page;
    this.u.flip.value = flip ? 1 : 0;
  }
}

/**
 * The frame a rider on the bike shows. A blow is a movement: up from rest
 * (raise), drawn back and held, swept out through two frames in between,
 * out at full stretch from the moment it lands until it is put away, and
 * back down. The recording steps about 6 frames back and 5 out (V15, C3, C4),
 * and sweeps between them rather than cutting.
 */
export function frameFor(r: Rider): string {
  // across the line first: arms up while the bike coasts on (V14)
  if (r.phase === "finished" && r.place === 1) return "armsUp";
  const a = r.attack;
  if (!a) return r.weapon === "club" ? "rideClub.R" : r.weapon === "chain" ? "rideChain.R" : "ride.R";
  const side = a.side > 0 ? "R" : "L";
  const held = r.weapon === "club" ? "Club" : r.weapon === "chain" ? "Chain" : "";
  // one swing wherever the opponent is (C3): a weapon if one is held, else the fist
  const blow = a.kind === "kick" ? "kick" : held ? r.weapon! : "punch";
  const [, back, out] = BLOWS[blow];
  const w = windupOf(r, a);
  const t = a.t;
  // a fist: out through the frame it comes back through, held, and back
  if (blow === "punch") return `${t < w ? "punch~return" : t < w + TUNE.fistHold ? out : "punch~return"}.${side}`;
  if (STRIKES.has(blow)) return `${t < w ? `${blow}~strike` : t < w + 0.12 ? out : `${blow}~return`}.${side}`;
  const name =
    t < 0.3 * w ? `${blow}~raise`
    : t < 0.55 * w ? back
    : t < 0.78 * w ? `${blow}~sweep1`
    : t < w ? `${blow}~sweep2`
    : t < w + 0.12 ? out
    : `${blow}~return`;
  return `${name}.${side}`;
}

// ---- the movement of a blow, in 3D, for spec/motion.test.ts ----

export type Joints = { shoulder: [number, number, number]; elbow: [number, number, number]; hand: [number, number, number]; tip: [number, number, number] | null; chain: [number, number, number][] | null };

/**
 * The striking arm of a right-handed frame in bike space, metres: x is the
 * rider's left (so the blow goes out towards -x), y up, z forward. `tip` and
 * `chain` are a chain's links when the frame holds one.
 */
export function joints(frame: string): Joints {
  const pose = FRAMES.find(([n]) => n === frame)?.[1];
  if (!pose) throw new Error(`no frame ${frame}`);
  const puppet = new Puppet(false);
  puppet.set(pose);
  const arr = (p: THREE.Vector3): [number, number, number] => [p.x, p.y, p.z];
  const hand = puppet.at("gloveR");
  const pts = (pose.weapon as { pts?: V[] } | undefined)?.pts;
  const chain = pose.weapon?.kind === "chain" && pts ? pts.map((q) => arr(hand.clone().add(new THREE.Vector3(...q)))) : null;
  return { shoulder: arr(puppet.at("shoulderR")), elbow: arr(puppet.at("elbowR")), hand: arr(hand), tip: chain ? chain.at(-1)! : null, chain };
}

/** Every frame name, in order: for a test to walk a blow through. */
export const frameNames = (): string[] => FRAMES.map(([n]) => n);

/**
 * Frames drawn as they look, for a person to judge: each named frame of the
 * striking side, shaded and outlined as the atlas draws it, from behind (as
 * the chase camera sees it), from the side and from above. scripts/blows.ts
 * lays them out as a contact sheet.
 */
export function drawFrames(renderer: THREE.WebGLRenderer, names: string[], size = 240, labels: string[] = names): HTMLCanvasElement {
  const views: [string, THREE.Vector3][] = [["behind", new THREE.Vector3(0.3, 1.6, -3.2)], ["side", new THREE.Vector3(-3.4, 1.3, 0)], ["above", new THREE.Vector3(-0.2, 4.2, -0.5)]];
  const out = document.createElement("canvas");
  // one column per frame, and a last one tracing the elbow (blue), the fist
  // (red) and a chain's tip (yellow) through every frame: the arcs an
  // animator checks, smooth and spaced wider where it is fast
  out.width = (names.length + 1) * size;
  out.height = views.length * size;
  const g = out.getContext("2d")!;
  g.fillStyle = "#3b3f46";
  g.fillRect(0, 0, out.width, out.height);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#555566", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 2);
  sun.position.set(-2, 4, -3);
  scene.add(sun);
  const puppet = new Puppet(true);
  puppet.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m !== (puppet as unknown as { flesh: THREE.Mesh }).flesh && m.userData.part) m.material = new THREE.MeshStandardMaterial({ color: m.userData.part === PART.trim ? "#2a5bd7" : "#e8e8e8", roughness: 0.4 });
  });
  scene.add(puppet.root);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  renderer.setSize(size, size, false);
  for (const [i, n] of names.entries()) {
    const pose = FRAMES.find(([f]) => f === n)?.[1];
    if (!pose) continue;
    puppet.set(pose);
    for (const [j, [, at]] of views.entries()) {
      cam.position.copy(at);
      cam.lookAt(-0.35, 1.15, 0);
      renderer.render(scene, cam);
      g.drawImage(renderer.domElement, i * size, j * size, size, size);
    }
    g.fillStyle = "#fff";
    g.font = "13px sans-serif";
    g.fillText(labels[i] ?? n, i * size + 6, 16);
  }
  const x0 = names.length * size;
  const paths = names.filter((n) => FRAMES.some(([f]) => f === n)).map((n) => joints(n));
  for (const [j, [, at]] of views.entries()) {
    cam.position.copy(at);
    cam.lookAt(-0.35, 1.15, 0);
    cam.updateMatrixWorld();
    const px = (p: [number, number, number]): [number, number] => {
      const q = new THREE.Vector3(...p).project(cam);
      return [x0 + ((q.x + 1) / 2) * size, j * size + ((1 - q.y) / 2) * size];
    };
    for (const [pick, colour] of [[(k: Joints) => k.elbow, "#4aa3ff"], [(k: Joints) => k.hand, "#ff5a4a"], [(k: Joints) => k.tip, "#ffd84a"]] as const) {
      const pts = paths.map(pick).filter((p): p is [number, number, number] => !!p).map(px);
      g.strokeStyle = colour;
      g.fillStyle = colour;
      g.lineWidth = 1.5;
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      pts.forEach(([x, y], k) => {
        g.beginPath();
        g.arc(x, y, 3.5, 0, 7);
        g.fill();
        g.fillText(String(k + 1), x + 5, y - 4);
      });
    }
  }
  g.fillStyle = "#fff";
  g.fillText("paths: elbow, fist, tip", x0 + 6, 16);
  return out;
}

/**
 * The skinned body in a pose, its vertices where the bones put them, for
 * measuring its shape against the recording (spec/body-shape.test.ts).
 * Needs useHuman() first.
 */
export function posedBody(frame: string): { pos: THREE.BufferAttribute; at: (joint: string) => THREE.Vector3 } {
  const pose = FRAMES.find(([n]) => n === frame)?.[1];
  if (!pose) throw new Error(`no frame ${frame}`);
  const puppet = new Puppet(true);
  puppet.set(pose);
  const mesh = (puppet as unknown as { skin: SkinnedBody | null }).skin?.mesh;
  if (!mesh) throw new Error("no modelled body: call useHuman first");
  const src = mesh.geometry.attributes.position;
  const out = new THREE.BufferAttribute(new Float32Array(src.count * 3), 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < src.count; i++) {
    mesh.getVertexPosition(i, v);
    out.setXYZ(i, v.x, v.y, v.z);
  }
  return { pos: out, at: (j) => puppet.at(j) };
}
