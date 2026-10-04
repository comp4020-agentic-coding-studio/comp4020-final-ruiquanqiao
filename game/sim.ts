// The rules of a race, as pure functions over plain data. Nothing in here
// touches a window, a socket or a clock: the server runs it for real, the
// client runs the same code to predict its own rider, and spec/ runs it with
// scripted keys. Ledger row IDs are given where a rule answers one.

import { OPEN, ROAD_HALF, SHOULDER, type Track, curveAt, wallAt } from "./track.ts";

export const DT = 1 / 60; // one fixed step, whatever the display does
export const MPH = 0.44704; // m/s
export const KMH = 1 / 3.6; // m/s

// ---- bikes (ledger S3, R5: one preset bike per level) ----

// Top speeds are read off the PC game's own dial, not the manual's spec
// sheet: a recorded race (docs/road-rash-feel.md) cruises at 280-290 km/h
// and only nitro carries it past 300. The manual's 109-158 mph left level 1
// running at 92 mph.
export type Bike = { name: string; hp: number; lbs: number; topKmh: number };

export const BIKES: readonly Bike[] = [
  { name: "Wasp 400", hp: 45, lbs: 310, topKmh: 275 },
  { name: "Hornet 450", hp: 60, lbs: 340, topKmh: 285 },
  { name: "Ronin 750", hp: 100, lbs: 510, topKmh: 295 },
  { name: "Kestrel 600", hp: 100, lbs: 430, topKmh: 305 },
  { name: "Bravo 900", hp: 140, lbs: 490, topKmh: 315 },
];

// ---- tuning (every number here is ridden before it changes; see CLAUDE.md) ----

export const TUNE = {
  /** fraction of top speed reachable before any build-up (R17) */
  baseCap: 0.88,
  /** seconds of clean riding at speed to build from nothing to full: the
   * original creeps from 250 to 285 km/h over about ten */
  buildTime: 10,
  /** full-throttle pull well below the cap, m/s²: 0 to 250 km/h in about
   * 5.5 s on the original's dial */
  accel: 15.5,
  /** nitro (R8): charges a race, seconds a burst lasts, the speed it adds to
   * the cap and how hard it pulls. A burst took the original from 44 to 226
   * km/h in 2 s, and from cruise to 316-320 */
  nitroCharges: 10,
  nitroTime: 3.5,
  nitroCap: 35 * KMH,
  nitroAccel: 24,
  /** build-up is earned only above this fraction of top speed */
  buildFloor: 0.7,
  /** build lost to a hit */
  buildHitLoss: 0.35,
  brake: 14, // m/s²
  coast: 1.2, // m/s² with no throttle
  /** the dirt shoulder is ridden at about 190 km/h in the original; grass
   * beyond it is slower */
  shoulderSpeed: 190 * KMH,
  offRoadSpeed: 30, // m/s the bike bogs down to on grass
  offRoadDrag: 14, // m/s² towards either
  /** lateral speed at a standstill and at full speed, m/s */
  steerSlow: 2.5,
  steerFast: 8.5,
  steerResponse: 9, // 1/s, how fast lateral speed follows the bars
  /** how hard a bend pushes the bike outwards: m/s per (v²·κ) */
  centrifugal: 0.2,
  /** lean (R3): builds only when steering hard at this fraction of the cap */
  leanFrom: 0.92,
  leanRise: 2.0, // per second of hard steer at speed
  leanFall: 3.0,
  leanTurn: 0.8, // extra fraction of steer rate at full lean
  /** seconds at full lean before the bike lowsides */
  leanLimit: 0.6,
  punchReach: { z: 1.8, x: 1.6 },
  kickReach: { z: 1.5, x: 1.7 },
  // a blow is 6 frames drawn back and 5 out, at 25 fps, in the original
  windup: 0.22, // s from key to contact
  punchCooldown: 0.44,
  // duels (C11): how readily a rider picks a fight per second, scaled by its
  // aggression, with a human and with another AI rider; how long it keeps at
  // it; how far off the foe's flank it rides; the beat it swings on (the
  // recording's rival: every 0.96 s); and how often it rubs the foe over
  foeHuman: 1.5,
  foeAI: 0.04,
  duelMin: 5,
  duelSpread: 8,
  duelGap: 1.15,
  duelBeat: 0.96,
  ramRate: 0.35,
  // closing speed, m/s, at which running into the back of a bike knocks its
  // rider off (K14): 50 km/h
  shuntKnock: 14,
  /** m, across and along: a rider on foot as something a bike can hit (C9) */
  walkerSize: 0.6,
  kickCooldown: 0.6,
  punchStamina: 17,
  kickStamina: 7,
  kickShove: 7, // m/s sideways given to the target
  staminaRegen: 4, // per second, after
  staminaRest: 2.5, // seconds without a hit
  thrownTime: 1.1, // s airborne and tumbling
  runSpeed: 6.5, // m/s back to the bike
  // a knockdown by another rider costs the bike nothing (K6); running into
  // the back of traffic is "almost as damaging as a head-on collision" (K7)
  crashDamage: { tree: 34, wall: 28, lowside: 16, knockdown: 0, rub: 0, rearEnd: 30, headOn: 40 },
  /** sideways speed into a cliff, wall or rail that crashes rather than
   * scrapes along it, m/s; and how much speed a scrape costs, per second */
  wallCrash: 6,
  wallScrape: 0.8,
  /** sideways closing speed at which a rub puts the other rider down (K2) */
  rubKnock: 6.5,
  /** sideways shove from a rub that does not (K1), m/s */
  rubShove: 4,
  /** closing speed along the road above which hitting a car is a crash */
  carCrash: 7,
  /** a riderless bike coasts on and slows at this rate (K5); m/s² */
  coastDecel: 7.5,
  /** a bike dropped by its own rider slides and stops quickly */
  slideDecel: 14,
  /** a weapon is swung with the punch key (C5); the chain reaches further,
   * the club hits harder */
  reach: { club: { z: 2.0, x: 2.1 }, chain: { z: 2.2, x: 2.6 } },
  weaponStamina: { club: 26, chain: 22 },
  /** the draw-back before a weapon lands: the moment it can be snatched (C6) */
  weaponWindup: 0.36,
  weaponCooldown: 0.9,
  /** share of AI riders who start a race armed (C5) */
  armedShare: 0.25,
  /** stopped or off the bike this close to a cop is Busted (P1), m */
  bustRange: 12,
};

// ---- state ----

export type Input = {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  hand: boolean;
  foot: boolean;
  nitro: boolean;
};

export const NO_INPUT: Input = { throttle: false, brake: false, left: false, right: false, hand: false, foot: false, nitro: false };

export const packInput = (i: Input): number =>
  (+i.throttle) | (+i.brake << 1) | (+i.left << 2) | (+i.right << 3) | (+i.hand << 4) | (+i.foot << 5) | (+i.nitro << 6);

export const unpackInput = (n: number): Input => ({
  throttle: !!(n & 1),
  brake: !!(n & 2),
  left: !!(n & 4),
  right: !!(n & 8),
  hand: !!(n & 16),
  foot: !!(n & 32),
  nitro: !!(n & 64),
});

export type Phase = "riding" | "thrown" | "running" | "finished" | "wrecked" | "busted";

export type CrashCause = "tree" | "wall" | "lowside" | "knockdown" | "rub" | "rearEnd" | "headOn";

export type AttackKind = "punch" | "backhand" | "kick";

export type Attack = { kind: AttackKind; side: -1 | 1; t: number; target: number; landed: boolean };

export type Weapon = "club" | "chain";

/** Seconds from the key to the blow: a weapon is drawn back first (C6). */
export const windupOf = (r: Rider, a: Attack): number => (r.weapon && a.kind !== "kick" ? TUNE.weaponWindup : TUNE.windup);

export type Rider = {
  id: number;
  name: string;
  human: boolean;
  bike: Bike;
  lbs: number; // rider's weight (R6)
  z: number; // rider, metres along the road
  x: number; // rider, metres from the centre line
  speed: number; // m/s along the road
  vx: number; // m/s sideways
  shove: number; // m/s sideways from a kick, decaying
  lean: number; // -1..1
  leanHeld: number; // s at full lean
  build: number; // 0..1 (R17)
  stamina: number; // 0..100 (M1)
  damage: number; // 0..100 remaining (M4)
  phase: Phase;
  phaseT: number;
  bikeZ: number; // where the bike lies while the rider is off it
  bikeX: number;
  bikeSpeed: number; // a riderless bike still moving (K5)
  cop: boolean; // a motorcycle cop (P2): never finishes, never placed
  weapon: Weapon | null; // one at a time (C5); cops carry a club (C7)
  chase: number; // the rider a cop is after, or -1 while waiting
  attack: Attack | null;
  cooldown: number;
  sinceHit: number;
  /** race time of the last bump reported for this rider, so a long rub is not a drum roll */
  bumpedAt: number;
  prevHand: boolean;
  prevFoot: boolean;
  prevNitro: boolean;
  nitro: number; // charges left (R8)
  boost: number; // seconds of the current burst left
  finishT: number; // race time at the line, or -1
  place: number; // 1-based, or 0 while racing
  // AI only
  line: number; // preferred x
  skill: number; // fraction of top speed it aims for
  aggression: number; // chance per second of starting something
  /** the rider this one has picked a fight with (C11), or -1 */
  foe: number;
  /** race time the fight is given up at, or (with no foe) when another may be picked */
  foeUntil: number;
  /** race time of the next swing it means to take; the recording's rivals swing about once a second */
  nextSwing: number;
  /** race time until which it is steering into the foe's bike to rub it over */
  ramUntil: number;
};

export type RaceEvent =
  | { t: number; kind: "hit"; by: number; on: number; move: AttackKind }
  | { t: number; kind: "crash"; rider: number; cause: CrashCause }
  | { t: number; kind: "busted"; rider: number; cop: number }
  | { t: number; kind: "snatch"; by: number; from: number; weapon: Weapon }
  | { t: number; kind: "wrecked"; rider: number }
  | { t: number; kind: "finished"; rider: number; place: number }
  /** a rider on foot, or lying in the road, ridden into (C9) */
  | { t: number; kind: "runOver"; by: number; on: number }
  /** bikes touching without anyone coming off: a rub, a shunt, a car or wall glanced (K13) */
  | { t: number; kind: "bump"; rider: number; other: number; with: "rider" | "car" | "wall"; hard: number; from: number };

/** Traffic (T4): same-direction cars in the right lanes, oncoming in the left. */
export type Car = {
  id: number;
  kind: "sedan" | "taxi" | "pickup" | "police";
  z: number;
  x: number;
  lane: number; // target x
  dir: 1 | -1; // +1 travels with the race, -1 towards it
  speed: number; // m/s, always positive
  changeT: number; // seconds until it next thinks about changing lane
};

export const CAR = { length: 4.6, width: 1.9 };
export const LANES = { with: [1.75, 5.25], against: [-1.75, -5.25] } as const;

export type Race = {
  track: Track;
  t: number;
  riders: Rider[];
  cars: Car[];
  events: RaceEvent[];
  rng: number;
  finishers: number;
};

export const topSpeed = (r: Rider): number => r.bike.topKmh * KMH * (1 + (180 - r.lbs) / 3000);

/** the speed a rider can reach right now: build-up raises the cap (R17), a
 * nitro burst lifts it past the bike's top (R8) */
export const cap = (r: Rider): number => topSpeed(r) * (TUNE.baseCap + (1 - TUNE.baseCap) * r.build) + (r.boost > 0 ? TUNE.nitroCap : 0);

// the level 3 bike pulls TUNE.accel; a better power-to-weight a little more
const accelOf = (r: Rider): number => TUNE.accel * Math.min(1.12, Math.max(0.88, (r.bike.hp / (r.bike.lbs + r.lbs)) / (100 / 690)));

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function random(race: Race): number {
  race.rng = (race.rng * 1664525 + 1013904223) >>> 0;
  return race.rng / 2 ** 32;
}

// ---- setup ----

export type Entrant = { id: number; name: string; human: boolean; lbs?: number };

/** Grid rows of three, six metres apart; humans at the back (O1). */
export function startRace(track: Track, level: number, entrants: Entrant[], seed: number): Race {
  const bike = BIKES[level - 1];
  const ordered = [...entrants.filter((e) => !e.human), ...entrants.filter((e) => e.human)];
  const race: Race = { track, t: 0, riders: [], cars: [], events: [], rng: seed >>> 0 || 1, finishers: 0 };
  ordered.forEach((e, i) => {
    const row = Math.floor(i / 3);
    const col = (i % 3) - 1;
    const z = 10 + (Math.ceil(ordered.length / 3) - row) * 6;
    race.riders.push({
      id: e.id,
      name: e.name,
      human: e.human,
      bike,
      lbs: e.lbs ?? 180,
      z,
      x: col * 2.8,
      speed: 0,
      vx: 0,
      shove: 0,
      lean: 0,
      leanHeld: 0,
      build: 0,
      stamina: 100,
      damage: 100,
      phase: "riding",
      phaseT: 0,
      bikeZ: z,
      bikeX: col * 2.8,
      bikeSpeed: 0,
      cop: false,
      weapon: null,
      chase: -1,
      attack: null,
      cooldown: 0,
      sinceHit: 99,
      bumpedAt: -99,
      prevHand: false,
      prevFoot: false,
      prevNitro: false,
      nitro: TUNE.nitroCharges,
      boost: 0,
      finishT: -1,
      place: 0,
      line: col * 2.8,
      skill: 0,
      aggression: 0,
      foe: -1,
      foeUntil: 0,
      nextSwing: 0,
      ramUntil: 0,
    });
  });
  for (const r of race.riders) {
    if (r.human) continue;
    r.skill = 0.9 + random(race) * 0.12;
    r.aggression = 0.15 + random(race) * 0.5;
    r.line = (random(race) * 2 - 1) * (ROAD_HALF - 1.5);
    // "some rashers begin each race with a weapon (either a chain or a bat)"
    if (random(race) < TUNE.armedShare) r.weapon = random(race) < 0.5 ? "chain" : "club";
  }
  placeCops(race, level, bike);
  placeTraffic(race, level);
  return race;
}

/**
 * Motorcycle cops wait at fixed points along the road (P2), parked on the
 * right shoulder, more of them at higher levels. Everything here comes off
 * the seeded generator, so every browser builds the same race.
 */
function placeCops(race: Race, level: number, bike: Bike): void {
  const marks = [0.13, 0.51, 0.85, 0.32, 0.68].slice(0, 2 + level);
  marks.forEach((m, i) => {
    const z = m * race.track.length;
    const template = race.riders[0];
    race.riders.push({
      ...template,
      id: 1000 + i,
      name: "Police",
      human: false,
      bike,
      lbs: 200,
      z,
      x: ROAD_HALF + 1.2,
      bikeZ: z,
      bikeX: ROAD_HALF + 1.2,
      cop: true,
      weapon: "club",
      chase: -1,
      line: ROAD_HALF - 1,
      // slow at the low levels (P3)
      skill: 0.82 + 0.04 * level,
      aggression: 2.5,
      attack: null,
    });
  });
}

function placeTraffic(race: Race, level: number): void {
  const kinds: Car["kind"][] = ["sedan", "sedan", "taxi", "pickup", "sedan", "police"];
  let id = 0;
  // more traffic at each level (S6)
  // the original's traffic is sparse: a car every 30-60 s at cruise
  const gap = 1100 - level * 120;
  for (let z = 300; z < race.track.length; z += gap * (0.6 + random(race) * 0.8)) {
    const dir: 1 | -1 = random(race) < 0.5 ? 1 : -1;
    const lanes = dir > 0 ? LANES.with : LANES.against;
    const lane = lanes[random(race) < 0.5 ? 0 : 1];
    race.cars.push({
      id: id++,
      kind: kinds[Math.floor(random(race) * kinds.length)],
      z,
      x: lane,
      lane,
      dir,
      speed: (dir > 0 ? 16 : 20) + random(race) * 8,
      changeT: 2 + random(race) * 8,
    });
  }
}

// ---- one rider's own physics (also what the client predicts) ----

/** Advance one rider by one step, ignoring every other rider. */
export function ride(r: Rider, input: Input, track: Track, dt = DT, race: Race | null = null): void {
  r.phaseT += dt;
  r.cooldown = Math.max(0, r.cooldown - dt);
  r.sinceHit += dt;
  if (r.phase === "finished" || r.phase === "wrecked" || r.phase === "busted") {
    r.speed = Math.max(0, r.speed - TUNE.brake * dt);
    r.z += r.speed * dt;
    return;
  }

  if (r.phase === "thrown" || r.phase === "running") {
    // a bike its rider was knocked off coasts on riderless (K5); one its
    // rider dropped slides and stops
    r.bikeZ += r.bikeSpeed * dt;
    r.bikeSpeed = Math.max(0, r.bikeSpeed - (r.bikeSpeed > 0 ? decelOf(r) : 0) * dt);
  }

  if (r.phase === "thrown") {
    // the rider tumbles on ahead
    // 280 km/h down to 20 in under a second, as measured off the original
    r.speed = Math.max(0, r.speed - (10 + 3 * r.speed) * dt);
    r.z += r.speed * dt;
    r.x += r.vx * dt;
    r.vx *= Math.exp(-3 * dt);
    r.x = Math.min(wallAt(track, r.z, 1) - 0.6, Math.max(-wallAt(track, r.z, -1) + 0.6, r.x));
    if (r.phaseT >= TUNE.thrownTime) setPhase(r, "running");
    return;
  }

  if (r.phase === "running") {
    // back to the bike, steered sideways by the rider (M2)
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dz = r.bikeZ - r.z;
    const dx = r.bikeX - r.x;
    const d = Math.hypot(dz, dx);
    if (d < 1.2) {
      r.z = r.bikeZ;
      r.x = r.bikeX;
      r.speed = 0;
      r.vx = 0;
      r.lean = 0;
      r.build = 0;
      if (r.stamina <= 0) r.stamina = 50;
      setPhase(r, "riding");
      return;
    }
    r.z += (dz / d) * TUNE.runSpeed * dt;
    r.x += ((dx / d) * TUNE.runSpeed + steer * 2) * dt;
    r.speed = 0;
    return;
  }

  // riding. Nitro (R8): one burst per press, while charges last
  if (input.nitro && !r.prevNitro && r.nitro > 0 && r.boost <= 0 && r.speed > 3) {
    r.nitro--;
    r.boost = TUNE.nitroTime;
  }
  r.prevNitro = input.nitro;
  r.boost = Math.max(0, r.boost - dt);
  const top = topSpeed(r);
  const limit = cap(r);
  const offRoad = Math.abs(r.x) > ROAD_HALF;

  const ground = Math.abs(r.x) > SHOULDER ? TUNE.offRoadSpeed : offRoad ? TUNE.shoulderSpeed : Infinity;
  if (input.brake) {
    r.speed -= TUNE.brake * dt;
    r.boost = 0;
  } else if (input.throttle || r.boost > 0) {
    // off the asphalt the throttle pulls only up to what the ground allows
    const f = Math.min(1, r.speed / Math.min(limit, ground));
    // a full pull until close to the cap, then a short taper: the original's
    // needle sweeps up steadily and settles, it does not crawl the last part
    const a = r.boost > 0 ? TUNE.nitroAccel : accelOf(r);
    r.speed += a * (1 - f ** 6) * dt;
    if (r.speed > limit) r.speed = Math.max(limit, r.speed - 3 * dt);
  } else r.speed -= (TUNE.coast + 0.0004 * r.speed * r.speed) * dt;
  if (r.speed > ground) r.speed = Math.max(ground, r.speed - TUNE.offRoadDrag * dt);
  r.speed = Math.max(0, r.speed);

  // build-up (R17): earned above the floor, lost to a stop
  if (r.speed > TUNE.buildFloor * top && !offRoad) r.build = Math.min(1, r.build + dt / TUNE.buildTime);
  if (r.speed < 3) r.build = 0;

  // steering and lean (R1, R3)
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const atSpeed = r.speed >= TUNE.leanFrom * limit;
  if (steer !== 0 && atSpeed) {
    r.lean = clamp(r.lean + steer * TUNE.leanRise * dt, -1, 1);
  } else {
    const toward = steer * 0.35 * (r.speed / top);
    r.lean += clamp(toward - r.lean, -TUNE.leanFall * dt, TUNE.leanFall * dt);
  }
  const full = Math.abs(r.lean) > 0.97 && Math.sign(r.lean) === steer;
  r.leanHeld = full ? r.leanHeld + dt : 0;

  const speedFrac = Math.min(1, r.speed / top);
  const rate = TUNE.steerSlow + (TUNE.steerFast - TUNE.steerSlow) * speedFrac;
  const target = r.speed < 0.5 ? 0 : steer * rate * (1 + TUNE.leanTurn * Math.abs(r.lean));
  r.vx += (target - r.vx) * Math.min(1, TUNE.steerResponse * dt);
  r.shove *= Math.exp(-4 * dt);
  const outward = TUNE.centrifugal * r.speed * r.speed * curveAt(track, r.z);
  const lateral = r.vx + r.shove - outward;
  r.x += lateral * dt;
  r.x = clamp(r.x, -30, 30);
  r.z += r.speed * dt;
  r.bikeZ = r.z;
  r.bikeX = r.x;

  // cliffs, canyon walls, shopfronts and the sea rail are solid: ridden
  // into square they crash you, glanced along they scrape you slower
  for (const side of [-1, 1] as const) {
    const wall = wallAt(track, r.z, side);
    if (wall >= OPEN || r.x * side < wall - BIKE.width / 2) continue;
    r.x = side * (wall - BIKE.width / 2);
    if (lateral * side > TUNE.wallCrash && r.speed > 15) {
      crash(r, "wall", race);
      r.bikeX = r.x - side * 0.8;
      return;
    }
    r.speed *= 1 - TUNE.wallScrape * dt;
    if (lateral * side > 0.5) bump(race, r, -1, "wall", (lateral * side) / TUNE.wallCrash, side * wall);
    if (r.vx * side > 0) r.vx = 0;
    if (r.shove * side > 0) r.shove = 0;
  }

  if (r.leanHeld > TUNE.leanLimit) crash(r, "lowside", race);
}

/** A coasting riderless bike slows gently; a sliding dropped one quickly. */
const decelOf = (r: Rider): number => (r.bikeSpeed > 6 ? TUNE.coastDecel : TUNE.slideDecel);

function setPhase(r: Rider, phase: Phase): void {
  r.phase = phase;
  r.phaseT = 0;
}

/**
 * Off the bike (M2, M4). Knocked off by another rider, the bike coasts on
 * without you (K5); come off by your own doing, it slides a little and stops.
 */
function crash(r: Rider, cause: CrashCause, race: Race | null): void {
  r.damage = Math.max(0, r.damage - TUNE.crashDamage[cause]);
  r.bikeZ = r.z;
  r.bikeX = r.x;
  const byRider = cause === "knockdown" || cause === "rub";
  // a riderless bike coasts on (K5), but not a quarter of a mile at 300 km/h
  r.bikeSpeed = byRider ? Math.min(r.speed * 0.9, 25) : Math.min(r.speed * 0.2, 6);
  r.boost = 0;
  r.vx = r.vx * 0.5 + Math.sign(r.x || 1) * 1.5;
  r.lean = 0;
  r.leanHeld = 0;
  r.build = 0;
  r.attack = null;
  if (race) race.events.push({ t: race.t, kind: "crash", rider: r.id, cause });
  if (r.damage <= 0) {
    setPhase(r, "wrecked");
    r.speed = 0;
    if (race) race.events.push({ t: race.t, kind: "wrecked", rider: r.id });
    return;
  }
  setPhase(r, "thrown");
}

/**
 * Report a touch that put no one down, so it can be heard and seen (K13).
 * `hard` runs 0 to 1. A rub held for seconds reports about four times a second.
 */
function bump(race: Race | null, r: Rider, other: number, kind: "rider" | "car" | "wall", hard: number, from: number): void {
  if (!race || race.t - r.bumpedAt < 0.25) return;
  r.bumpedAt = race.t;
  race.events.push({ t: race.t, kind: "bump", rider: r.id, other, with: kind, hard: Math.round(Math.min(1, Math.max(0.1, hard)) * 100) / 100, from: Math.round(from * 100) / 100 });
}

// ---- the whole race ----

/** The closest opponent a rider can reach or is about to (C1). */
export function nearest(race: Race, r: Rider): Rider | null {
  let best: Rider | null = null;
  let bestD = Infinity;
  for (const o of race.riders) {
    if (o === r || o.phase !== "riding") continue;
    const dz = o.z - r.z;
    const dx = o.x - r.x;
    if (Math.abs(dz) > 8 || Math.abs(dx) > 5) continue;
    const d = Math.hypot(dz, dx * 1.5);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/** Start a swing. The client calls this on its own rider so the arm moves on
 * the keypress; only the server's step decides whether it lands. */
export function beginAttack(race: Race, r: Rider, kind: "hand" | "foot"): void {
  if (r.phase !== "riding" || r.cooldown > 0 || r.attack) return;
  const target = nearest(race, r);
  const side: -1 | 1 = target ? (target.x >= r.x ? 1 : -1) : 1;
  // J turns into a backhand on its own for a rider beside or behind (C3)
  const move: AttackKind = kind === "foot" ? "kick" : target && target.z < r.z - 0.6 ? "backhand" : "punch";
  r.attack = { kind: move, side, t: 0, target: target?.id ?? -1, landed: false };
  r.cooldown = kind === "foot" ? TUNE.kickCooldown : r.weapon ? TUNE.weaponCooldown : TUNE.punchCooldown;
}

const reachOf = (r: Rider, kind: AttackKind): { z: number; x: number } =>
  kind === "kick" ? TUNE.kickReach : r.weapon ? TUNE.reach[r.weapon] : TUNE.punchReach;

/** Someone drawing a weapon back to swing it at `r`, close enough to grab. */
export function windingAt(race: Race, r: Rider): Rider | null {
  for (const o of race.riders) {
    const a = o.attack;
    if (o === r || !a || !o.weapon || a.kind === "kick" || a.landed || o.phase !== "riding") continue;
    const dz = r.z - o.z;
    const dx = r.x - o.x;
    const reach = reachOf(o, a.kind);
    if (Math.sign(dx || a.side) !== a.side || Math.abs(dx) > reach.x) continue;
    const zOk = a.kind === "backhand" ? dz > -reach.z - 0.8 && dz < 0.6 : Math.abs(dz) < reach.z;
    if (zOk) return o;
  }
  return null;
}

/**
 * The punch key, pressed empty-handed while an opponent draws a weapon back
 * to swing it at you, takes the weapon off them (C6). Returns whether it did.
 */
function snatch(race: Race, r: Rider): boolean {
  if (r.phase !== "riding" || r.weapon || r.attack) return false;
  const o = windingAt(race, r);
  if (!o?.weapon) return false;
  r.weapon = o.weapon;
  o.weapon = null;
  o.attack = null;
  o.cooldown = TUNE.weaponCooldown;
  r.cooldown = TUNE.punchCooldown;
  race.events.push({ t: race.t, kind: "snatch", by: r.id, from: o.id, weapon: r.weapon });
  return true;
}

function resolveAttack(race: Race, r: Rider): void {
  const a = r.attack;
  if (!a) return;
  a.t += DT;
  const windup = windupOf(r, a);
  if (!a.landed && a.t >= windup) {
    a.landed = true;
    const reach = reachOf(r, a.kind);
    // whoever is within reach on that side when the blow arrives takes it
    for (const o of race.riders) {
      if (o === r || o.phase !== "riding") continue;
      const dz = o.z - r.z;
      const dx = o.x - r.x;
      if (Math.sign(dx || a.side) !== a.side) continue;
      const zOk = a.kind === "backhand" ? dz > -reach.z - 0.8 && dz < 0.6 : Math.abs(dz) < reach.z;
      if (!zOk || Math.abs(dx) > reach.x) continue;
      hit(race, r, o, a.kind);
      break;
    }
  }
  if (a.t >= windup + 0.2) r.attack = null;
}

function hit(race: Race, by: Rider, on: Rider, move: AttackKind): void {
  const weight = by.lbs / 180; // heavier riders hit harder (R6)
  const blow = move === "kick" ? TUNE.kickStamina : by.weapon ? TUNE.weaponStamina[by.weapon] : TUNE.punchStamina;
  const loss = blow * weight;
  on.stamina = Math.max(0, on.stamina - loss);
  on.sinceHit = 0;
  on.build = Math.max(0, on.build - TUNE.buildHitLoss);
  if (move === "kick") on.shove = (on.x >= by.x ? 1 : -1) * TUNE.kickShove; // (C4)
  race.events.push({ t: race.t, kind: "hit", by: by.id, on: on.id, move });
  if (on.stamina <= 0) crash(on, "knockdown", race); // (C8)
}

/** Trees and poles beyond the shoulder stop a bike dead (R12). */
function scenery(race: Race, r: Rider): void {
  // a bike walked into a tree is not a crash; one ridden into it is
  if (r.phase !== "riding" || r.speed < 4 || Math.abs(r.x) < SHOULDER + 0.5) return;
  for (const s of race.track.scenery) {
    if (s.z < r.z - 2) continue;
    if (s.z > r.z + 2) break;
    const width = s.kind === "tree" ? 1.3 : s.kind === "rock" ? 1.2 : s.kind === "bush" ? 1.0 : 0.6;
    if (Math.abs(s.x - r.x) < width) {
      r.speed *= 0.3;
      crash(r, "tree", race);
      // the bike bounces off the trunk towards the road, so the rider does not
      // get back on it inside the tree
      r.bikeX = s.x - Math.sign(s.x) * (width + 0.8);
      return;
    }
  }
}

/** A bike and its rider as a box on the road, the same size the scene draws. */
export const BIKE = { length: 2.1, width: 0.8 };

/**
 * Push two overlapping bikes apart along whichever axis they overlap less —
 * sideways when they rub, lengthways when one runs into the back of the other
 * — and return which it was, or null if they do not touch. `share` is how
 * much of the separation `a` takes: 0.5 on the server, 1 when a client moves
 * only its own predicted rider.
 */
export function separate(a: Rider, b: Rider, share = 0.5): "side" | "rear" | null {
  const dz = b.z - a.z;
  const dx = b.x - a.x;
  const oz = BIKE.length - Math.abs(dz);
  const ox = BIKE.width - Math.abs(dx);
  if (oz <= 0 || ox <= 0) return null;
  // whichever overlap is smaller for the bike's size: compared in metres, a
  // bike 2.1 m long and 0.8 wide counted almost every shunt from behind as a
  // rub and threw the bike in front 0.8 m sideways in one step
  if (ox / BIKE.width < oz / BIKE.length) {
    const s = dx >= 0 ? 1 : -1;
    a.x -= s * ox * share;
    b.x += s * ox * (1 - share);
    return "side";
  }
  const s = dz >= 0 ? 1 : -1;
  a.z -= s * oz * share;
  b.z += s * oz * (1 - share);
  return "rear";
}

/**
 * A rider off the bike - running back to it, or lying where they landed - is
 * run over by a bike ridden into them (C9). The first remake left them out of
 * every collision, so a bike went straight through them. In the recording
 * (318.04-318.44) the walker is thrown up spread-eagled at once and flies back
 * past the camera in 0.4 s, while the bike that hit them hops and rides on.
 */
export function onFoot(o: Rider): boolean {
  return o.phase === "running" || (o.phase === "thrown" && o.phaseT > TUNE.thrownTime * 0.75);
}

function runOver(race: Race): void {
  for (const r of race.riders) {
    if (r.phase !== "riding" || r.speed < 3) continue;
    for (const o of race.riders) {
      if (o === r || !onFoot(o)) continue;
      if (Math.abs(o.z - r.z) > (BIKE.length + TUNE.walkerSize) / 2 || Math.abs(o.x - r.x) > (BIKE.width + TUNE.walkerSize) / 2) continue;
      // thrown up and off to the side, far slower than the bike, so they go
      // back past it towards the camera as the recording's walker does. At
      // 0.55 of the bike's speed and 3 m/s sideways they were thrown on
      // ahead and hidden behind the rider who hit them
      setPhase(o, "thrown");
      o.speed = r.speed * 0.3;
      o.vx = (o.x >= r.x ? 1 : -1) * 6;
      o.sinceHit = 0;
      r.speed *= 0.85;
      race.events.push({ t: race.t, kind: "runOver", by: r.id, on: o.id });
    }
  }
}

/** Bikes do not pass through each other; a faster bike behind pushes (R7). */
function contact(race: Race): void {
  const riding = race.riders.filter((r) => r.phase === "riding");
  // several passes: pushing one pair apart can push one of them into a third.
  // Four were enough until riders started duelling; six bikes packed into a
  // fight were left 3 cm inside each other, and eight clear them
  for (let pass = 0; pass < 8; pass++) contactPass(race, riding, pass === 0);
}

function contactPass(race: Race, riding: Rider[], transfer: boolean): void {
  for (let i = 0; i < riding.length; i++) {
    for (let j = i + 1; j < riding.length; j++) {
      const a = riding[i];
      const b = riding[j];
      const closing = a.vx + a.shove - (b.vx + b.shove);
      const kind = separate(a, b);
      if (!kind || !transfer) continue;
      if (kind === "side") {
        rub(race, a, b, closing);
        continue;
      }
      const [back, front] = b.z >= a.z ? [a, b] : [b, a];
      if (back.speed > front.speed) {
        const diff = back.speed - front.speed;
        // run into from behind hard enough, the bike in front goes down in a
        // slide, as a hard rub puts it (K14); the rammer is checked to its speed
        if (diff >= TUNE.shuntKnock && front.speed > 5) {
          crash(front, "rub", race);
          back.speed -= diff * 0.6;
          bump(race, back, front.id, "rider", 1, front.x);
          continue;
        }
        front.speed += Math.min(7 * MPH, diff * 0.5);
        back.speed = front.speed;
        if (diff > 1) bump(race, front, back.id, "rider", diff / 10, back.x);
      }
    }
  }
}

function recover(r: Rider): void {
  if (r.sinceHit > TUNE.staminaRest && r.phase === "riding") {
    r.stamina = Math.min(100, r.stamina + TUNE.staminaRegen * DT); // (M1)
  }
}

/** What an AI rider does this step. Humans' inputs come from their keys. */
/**
 * Two bikes rubbing side by side (K1, K2). The one moving into the other
 * shoves it over, the same as a kick; hard enough, the shoved rider goes down
 * in a slide, which costs no bike damage (K6).
 */
function rub(race: Race, a: Rider, b: Rider, closing: number): void {
  if (Math.abs(closing) < 0.5) return;
  // the mover is whichever is itself travelling harder towards the other;
  // the sign of `closing` alone cannot say, since it is the same either way
  const towards = a.x < b.x ? 1 : -1;
  const aIn = (a.vx + a.shove) * towards;
  const bIn = -(b.vx + b.shove) * towards;
  const [mover, struck] = aIn >= bIn ? [a, b] : [b, a];
  const away = struck.x >= mover.x ? 1 : -1;
  const fast = Math.min(mover.speed, struck.speed) > 15;
  if (fast && Math.abs(closing) >= TUNE.rubKnock) {
    crash(struck, "rub", race);
    return;
  }
  struck.shove = away * Math.max(Math.abs(struck.shove), TUNE.rubShove * Math.min(1, Math.abs(closing) / TUNE.rubKnock));
  mover.vx *= 0.5;
  bump(race, struck, mover.id, "rider", Math.abs(closing) / TUNE.rubKnock, mover.x);
}

/** What a cop does: wait on the shoulder, then ride down a human (P2). */
function copInput(race: Race, r: Rider): Input {
  const input: Input = { ...NO_INPUT };
  let target = race.riders.find((o) => o.id === r.chase);
  if (r.chase < 0) {
    // the first human to come by within 30 m sets him off; AI riders are
    // never chased, as in the original (P4)
    target = race.riders.find((o) => o.human && o.phase === "riding" && Math.abs(o.z - r.z) < 30);
    if (!target) return input;
    r.chase = target.id;
  }
  if (!target || target.phase === "finished" || target.phase === "wrecked" || target.phase === "busted" || target.z - r.z > 150) {
    // lost them: pull over
    r.chase = -2;
    r.line = ROAD_HALF + 1.2;
  } else {
    // ride alongside, on whichever side he is already
    const side = r.x >= target.x ? 1 : -1;
    r.line = target.phase === "riding" ? target.x + side * 1.4 : target.x;
    input.throttle = target.z + 1 > r.z || r.speed < target.speed;
    if (r.z > target.z + 2 && r.speed > target.speed) input.brake = true;
    if (target.phase === "riding" && Math.abs(target.z - r.z) < 1.8 && Math.abs(target.x - r.x) < 2 && random(race) < r.aggression * DT * 4) input.hand = true;
  }
  const want = r.line - r.x;
  if (want > 0.4) input.right = true;
  else if (want < -0.4) input.left = true;
  if (r.speed > topSpeed(r) * r.skill) input.throttle = false;
  return input;
}

/**
 * Traffic for one step (T4): cars hold their speed, wander between the two
 * lanes of their own direction, and wrap round when they leave the road so
 * the density stays even along it.
 */
function drive(race: Race): void {
  const L = race.track.length;
  for (const c of race.cars) {
    c.z += c.dir * c.speed * DT;
    if (c.z > L + 50) c.z -= L;
    if (c.z < -50) c.z += L;
    c.changeT -= DT;
    if (c.changeT <= 0) {
      const lanes = c.dir > 0 ? LANES.with : LANES.against;
      if (random(race) < 0.4) c.lane = lanes[c.lane === lanes[0] ? 1 : 0];
      c.changeT = 4 + random(race) * 8;
    }
    const dx = c.lane - c.x;
    c.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.4 * DT);
  }
}

/**
 * A bike against a car. Glancing along its side shoves the bike off; running
 * into it - the back of a slower one, or head-on - is a crash, the rider
 * thrown clear (K3, K7).
 */
function hitCars(race: Race, r: Rider): void {
  if (r.phase !== "riding") return;
  for (const c of race.cars) {
    const dz = c.z - r.z;
    const dx = c.x - r.x;
    const oz = (CAR.length + BIKE.length) / 2 - Math.abs(dz);
    const ox = (CAR.width + BIKE.width) / 2 - Math.abs(dx);
    if (oz <= 0 || ox <= 0) continue;
    const closing = r.speed - c.dir * c.speed;
    if (ox < oz * 0.5 || Math.abs(closing) < TUNE.carCrash) {
      // along its side, or barely moving against it: pushed off
      r.x -= Math.sign(dx || 1) * ox;
      r.shove = -Math.sign(dx || 1) * 3;
      r.speed = Math.max(0, r.speed * 0.9);
      bump(race, r, c.id, "car", 0.4 + Math.abs(closing) / TUNE.carCrash / 2, c.x);
      continue;
    }
    r.z = c.z - Math.sign(dz || 1) * ((CAR.length + BIKE.length) / 2);
    // a rider thrown off over a car carries less forward speed
    r.speed = Math.max(0, Math.min(r.speed, Math.abs(closing)) * 0.5);
    crash(r, c.dir > 0 ? "rearEnd" : "headOn", race);
    // the struck car is knocked on a little, not stopped
    if (c.dir > 0) c.speed += 2;
    return;
  }
}

/** Stopped, or off the bike, with a cop close by: Busted (P1). */
function busts(race: Race): void {
  const cops = race.riders.filter((c) => c.cop && c.phase === "riding");
  for (const r of race.riders) {
    if (!r.human) continue;
    const down = r.phase === "thrown" || r.phase === "running" || (r.phase === "riding" && r.speed < 2 && race.t > 3);
    if (!down) continue;
    const cop = cops.find((c) => Math.abs(c.z - r.z) < TUNE.bustRange && Math.abs(c.x - r.x) < TUNE.bustRange);
    if (!cop) continue;
    r.phase = "busted";
    r.phaseT = 0;
    r.speed = 0;
    r.attack = null;
    race.events.push({ t: race.t, kind: "busted", rider: r.id, cop: cop.id });
  }
}

/**
 * Where a rider can ride in the next three seconds without running into a
 * car: the given line if it is clear, else the nearest clear lane, else null
 * (every lane blocked - brake). Used by the AI and by scripted riders.
 */
export function clearLine(race: Race, r: Rider, line: number): number | null {
  const blocked = (x: number): boolean =>
    race.cars.some((c) => {
      const dz = c.z - r.z;
      const closing = r.speed - c.dir * c.speed;
      if (dz < -1 || closing <= 0) return false;
      const t = (dz - (CAR.length + BIKE.length) / 2) / closing;
      return t < 3 && Math.abs(c.x - x) < (CAR.width + BIKE.width) / 2 + 0.6;
    });
  if (!blocked(line)) return line;
  const options = [...LANES.with, ...LANES.against, 0, ROAD_HALF - 0.5, -(ROAD_HALF - 0.5)].filter((x) => !blocked(x));
  if (options.length === 0) return null;
  return options.reduce((best, x) => (Math.abs(x - r.x) < Math.abs(best - r.x) ? x : best));
}

/**
 * Picking a fight (C11). In the recording a rival rides up beside the player,
 * matches speed and stays there trading blows for six seconds and more
 * (351.5-357.5), swinging about once a second. The first AI only swung at
 * whoever happened to be within 1.6 m and held its line to avoid everyone
 * else, so a player could ride a whole race untouched: 3-7 swings in 90 s
 * (scripts/fights.ts). Now each AI rider picks a foe near it - a human far
 * more readily than another AI - rides to its side and duels it.
 */
function pickFoe(race: Race, r: Rider): Rider | null {
  let foe = r.foe >= 0 ? race.riders.find((o) => o.id === r.foe) : undefined;
  if (foe && (foe.phase !== "riding" || race.t > r.foeUntil || Math.abs(foe.z - r.z) > 60)) {
    // given up: a breather before the next
    r.foe = -1;
    r.foeUntil = race.t + 2 + random(race) * 3;
    foe = undefined;
  }
  if (foe) return foe;
  // nobody starts a fight on the grid, before the field has strung out
  if (race.t < r.foeUntil || race.t < 4 || r.speed < 12) return null;
  for (const o of race.riders) {
    if (o === r || o.cop || o.phase !== "riding") continue;
    const dz = o.z - r.z;
    if (dz < -25 || dz > 50) continue;
    // humans are who the field is out for; AI riders mostly leave each other be
    const keen = r.aggression * (o.human ? TUNE.foeHuman : TUNE.foeAI);
    if (random(race) < keen * DT) {
      r.foe = o.id;
      r.foeUntil = race.t + TUNE.duelMin + random(race) * TUNE.duelSpread * (0.5 + r.aggression);
      r.nextSwing = race.t + 0.3 + random(race) * 0.5;
      return o;
    }
  }
  return null;
}

export function aiInput(race: Race, r: Rider): Input {
  if (r.cop) return copInput(race, r);
  const foe = pickFoe(race, r);
  if (foe) return duelInput(race, r, foe);
  const line = clearLine(race, r, r.line);
  const input: Input = { ...NO_INPUT, throttle: true };
  const curve = curveAt(race.track, r.z + r.speed * 1.2);
  // hold the line against the bend
  const want = (line ?? r.x) - r.x + TUNE.centrifugal * r.speed * r.speed * curve * 0.25;
  if (want > 0.4) input.right = true;
  else if (want < -0.4) input.left = true;
  // look before changing line: a rider alongside on that side is waited
  // for, not ridden into. At 280 km/h the bars move a bike sideways faster
  // than a rub can be survived, and an AI that steered blind put its own
  // pack down 7-9 times a race. Fights are started on purpose, below.
  for (const o of race.riders) {
    // dodging a car comes first, and close enough to swing at is fine
    if (line !== r.line) break;
    if (o === r || o.phase !== "riding" || Math.abs(o.z - r.z) > BIKE.length * 1.4) continue;
    const dx = o.x - r.x;
    // the faster it is already moving over, the earlier it holds back; slow,
    // it may still close in to swing
    const closing = (r.vx - o.vx) * Math.sign(dx);
    if (Math.abs(dx) > 1.0 + Math.max(0, closing) * 0.3) continue;
    if (dx > 0) input.right = false;
    else input.left = false;
  }
  // ease the bars before a held lean puts the bike down (R3)
  if (Math.abs(r.lean) > 0.85 && r.leanHeld > TUNE.leanLimit * 0.4) input.left = input.right = false;
  if (r.speed > topSpeed(r) * r.skill) input.throttle = false;
  if (line === null) {
    input.throttle = false;
    input.brake = true;
  }
  // ease off for a bend the bars alone cannot hold, brake for one far past it
  const need = TUNE.centrifugal * r.speed * r.speed * Math.abs(curve);
  if (need > 0.8 * TUNE.steerFast) input.throttle = false;
  if (need > 1.05 * TUNE.steerFast) input.brake = true;
  const target = nearest(race, r);
  // nobody starts a fight standing on the grid
  if (r.speed > 12 && target && Math.abs(target.z - r.z) < 1.6 && Math.abs(target.x - r.x) < 1.6 && random(race) < r.aggression * DT * 4) {
    if (random(race) < 0.65) input.hand = true;
    else input.foot = true;
  }
  // an unarmed rider sometimes grabs at a weapon drawn back at them (C6)
  if (!r.weapon && !r.prevHand && windingAt(race, r) && random(race) < r.aggression * DT * 3) input.hand = true;
  if (r.phase === "running") {
    input.left = false;
    input.right = false;
  }
  return input;
}

/** Riding a duel: up beside the foe, held there, swinging on the beat, now and then rubbing it over. */
function duelInput(race: Race, r: Rider, foe: Rider): Input {
  const input: Input = { ...NO_INPUT, throttle: true };
  const dz = foe.z - r.z;
  // stay on whichever side of it this rider is already on
  const side = r.x >= foe.x ? 1 : -1;
  if (race.t >= r.ramUntil && Math.abs(dz) < 1.5 && random(race) < r.aggression * TUNE.ramRate * DT) r.ramUntil = race.t + 0.35;
  const gap = race.t < r.ramUntil ? 0.4 : TUNE.duelGap;
  let want = clamp(foe.x + side * gap, -(ROAD_HALF - 0.5), ROAD_HALF - 0.5);
  // a car in the way comes first
  const line = clearLine(race, r, want);
  if (line === null) return { ...input, throttle: false, brake: true };
  want = line;
  const curve = curveAt(race.track, r.z + r.speed * 1.2);
  const steer = want - r.x + TUNE.centrifugal * r.speed * r.speed * curve * 0.25;
  if (steer > 0.25) input.right = true;
  else if (steer < -0.25) input.left = true;
  if (Math.abs(r.lean) > 0.85 && r.leanHeld > TUNE.leanLimit * 0.4) input.left = input.right = false;
  // level with it: catch up, or ease off and brake when past it
  const closing = r.speed - foe.speed;
  const ahead = -dz + closing * 0.4;
  if (ahead > 0.3) input.throttle = false;
  if (ahead > 1.5) input.brake = true;
  // riding a fight it rides flat out, whatever blows it has taken: with the
  // build-up knocked back by every hit it could never catch a player who had
  // not been touched, and the fight went to whoever was in front (R17)
  r.build = 1;
  // too far behind to close on the throttle: a burst of nitro (R8)
  if (dz > 6 && closing < 4 && r.boost <= 0 && !r.prevNitro) input.nitro = true;
  // bends still have to be ridden
  const need = TUNE.centrifugal * r.speed * r.speed * Math.abs(curve);
  if (need > 0.8 * TUNE.steerFast) input.throttle = false;
  if (need > 1.05 * TUNE.steerFast) input.brake = true;
  // swing on the beat when it is in reach (C1): hand mostly, foot to shove
  if (race.t >= r.nextSwing && Math.abs(dz) < 1.6 && Math.abs(foe.x - r.x) < 1.7 && !r.attack) {
    if (random(race) < 0.7) input.hand = true;
    else input.foot = true;
    r.nextSwing = race.t + TUNE.duelBeat * (0.8 + random(race) * 0.4);
  }
  // grabbing a weapon drawn back at it still comes first (C6)
  if (!r.weapon && !r.prevHand && windingAt(race, r) && random(race) < r.aggression * DT * 3) input.hand = true;
  return input;
}

/** Advance the race one fixed step. `inputs` holds the humans' keys by id. */
export function step(race: Race, inputs: Map<number, Input>): void {
  race.t += DT;
  for (const r of race.riders) {
    const input = r.human ? (inputs.get(r.id) ?? NO_INPUT) : aiInput(race, r);
    if (input.hand && !r.prevHand && !snatch(race, r)) beginAttack(race, r, "hand");
    if (input.foot && !r.prevFoot) beginAttack(race, r, "foot");
    r.prevHand = input.hand;
    r.prevFoot = input.foot;
    ride(r, input, race.track, DT, race);
  }
  for (const r of race.riders) {
    resolveAttack(race, r);
    scenery(race, r);
    recover(r);
  }
  contact(race);
  runOver(race);
  drive(race);
  for (const r of race.riders) hitCars(race, r);
  busts(race);
  for (const r of race.riders) {
    if (r.cop) continue;
    if (r.phase !== "finished" && r.phase !== "wrecked" && r.phase !== "busted" && r.z >= race.track.length) {
      r.phase = "finished";
      r.finishT = race.t;
      r.place = ++race.finishers;
      race.events.push({ t: race.t, kind: "finished", rider: r.id, place: r.place });
    }
  }
}

/** Standings: finishers by place, then everyone else by distance. */
/** Standings: finishers by place, then everyone else by distance. Cops are
 * not in the race. */
export function standings(race: Race): Rider[] {
  const out = (r: Rider): boolean => r.phase === "wrecked" || r.phase === "busted";
  return race.riders
    .filter((r) => !r.cop)
    .sort((a, b) => {
      if (a.place && b.place) return a.place - b.place;
      if (a.place) return -1;
      if (b.place) return 1;
      if (out(a) !== out(b)) return out(a) ? 1 : -1;
      return b.z - a.z;
    });
}

export const positionOf = (race: Race, id: number): number => standings(race).findIndex((r) => r.id === id) + 1;

/** A race is over once no human is still riding it. */
export const humansDone = (race: Race): boolean =>
  race.riders.every((r) => !r.human || r.phase === "finished" || r.phase === "wrecked" || r.phase === "busted");
