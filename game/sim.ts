// The rules of a race, as pure functions over plain data. Nothing in here
// touches a window, a socket or a clock: the server runs it for real, the
// client runs the same code to predict its own rider, and spec/ runs it with
// scripted keys. Ledger row IDs are given where a rule answers one.

import { ROAD_HALF, SHOULDER, type Track, curveAt } from "./track.ts";

export const DT = 1 / 60; // one fixed step, whatever the display does
export const MPH = 0.44704; // m/s

// ---- bikes (ledger S3: one preset bike per level, the originals' numbers) ----

export type Bike = { name: string; hp: number; lbs: number; topMph: number };

export const BIKES: readonly Bike[] = [
  { name: "Wasp 400", hp: 45, lbs: 310, topMph: 109 },
  { name: "Hornet 450", hp: 60, lbs: 340, topMph: 114 },
  { name: "Ronin 750", hp: 100, lbs: 510, topMph: 132 },
  { name: "Kestrel 600", hp: 100, lbs: 430, topMph: 141 },
  { name: "Bravo 900", hp: 140, lbs: 490, topMph: 158 },
];

// ---- tuning (every number here is ridden before it changes; see CLAUDE.md) ----

export const TUNE = {
  /** fraction of top speed reachable before any build-up (R17) */
  baseCap: 0.84,
  /** seconds of clean riding at speed to build from nothing to full */
  buildTime: 14,
  /** build-up is earned only above this fraction of top speed */
  buildFloor: 0.7,
  /** build lost to a hit */
  buildHitLoss: 0.35,
  brake: 14, // m/s²
  coast: 1.2, // m/s² with no throttle
  offRoadSpeed: 22, // m/s the bike bogs down to on grass
  offRoadDrag: 9, // m/s² towards that speed
  /** lateral speed at a standstill and at full speed, m/s */
  steerSlow: 2.5,
  steerFast: 8.5,
  steerResponse: 9, // 1/s, how fast lateral speed follows the bars
  /** how hard a bend pushes the bike outwards: m/s per (v²·κ) */
  centrifugal: 0.5,
  /** lean (R3): builds only when steering hard at this fraction of the cap */
  leanFrom: 0.92,
  leanRise: 2.0, // per second of hard steer at speed
  leanFall: 3.0,
  leanTurn: 0.8, // extra fraction of steer rate at full lean
  /** seconds at full lean before the bike lowsides */
  leanLimit: 0.6,
  punchReach: { z: 1.8, x: 1.6 },
  kickReach: { z: 1.5, x: 1.7 },
  windup: 0.14, // s from key to contact
  punchCooldown: 0.45,
  kickCooldown: 0.6,
  punchStamina: 17,
  kickStamina: 7,
  kickShove: 7, // m/s sideways given to the target
  staminaRegen: 4, // per second, after
  staminaRest: 2.5, // seconds without a hit
  thrownTime: 1.1, // s airborne and tumbling
  runSpeed: 6.5, // m/s back to the bike
  crashDamage: { tree: 34, lowside: 16, knockdown: 8 },
};

// ---- state ----

export type Input = {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  hand: boolean;
  foot: boolean;
};

export const NO_INPUT: Input = { throttle: false, brake: false, left: false, right: false, hand: false, foot: false };

export const packInput = (i: Input): number =>
  (+i.throttle) | (+i.brake << 1) | (+i.left << 2) | (+i.right << 3) | (+i.hand << 4) | (+i.foot << 5);

export const unpackInput = (n: number): Input => ({
  throttle: !!(n & 1),
  brake: !!(n & 2),
  left: !!(n & 4),
  right: !!(n & 8),
  hand: !!(n & 16),
  foot: !!(n & 32),
});

export type Phase = "riding" | "thrown" | "running" | "finished" | "wrecked";

export type AttackKind = "punch" | "backhand" | "kick";

export type Attack = { kind: AttackKind; side: -1 | 1; t: number; target: number; landed: boolean };

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
  attack: Attack | null;
  cooldown: number;
  sinceHit: number;
  prevHand: boolean;
  prevFoot: boolean;
  finishT: number; // race time at the line, or -1
  place: number; // 1-based, or 0 while racing
  // AI only
  line: number; // preferred x
  skill: number; // fraction of top speed it aims for
  aggression: number; // chance per second of starting something
};

export type RaceEvent =
  | { t: number; kind: "hit"; by: number; on: number; move: AttackKind }
  | { t: number; kind: "crash"; rider: number; cause: "tree" | "lowside" | "knockdown" }
  | { t: number; kind: "wrecked"; rider: number }
  | { t: number; kind: "finished"; rider: number; place: number };

export type Race = {
  track: Track;
  t: number;
  riders: Rider[];
  events: RaceEvent[];
  rng: number;
  finishers: number;
};

export const topSpeed = (r: Rider): number => r.bike.topMph * MPH * (1 + (180 - r.lbs) / 3000);

/** the speed a rider can reach right now: build-up raises the cap (R17) */
export const cap = (r: Rider): number => topSpeed(r) * (TUNE.baseCap + (1 - TUNE.baseCap) * r.build);

const accelOf = (r: Rider): number => Math.min(12, Math.max(4, (58 * r.bike.hp) / (r.bike.lbs + r.lbs)));

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
  const race: Race = { track, t: 0, riders: [], events: [], rng: seed >>> 0 || 1, finishers: 0 };
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
      attack: null,
      cooldown: 0,
      sinceHit: 99,
      prevHand: false,
      prevFoot: false,
      finishT: -1,
      place: 0,
      line: col * 2.8,
      skill: 0,
      aggression: 0,
    });
  });
  for (const r of race.riders) {
    if (r.human) continue;
    r.skill = 0.9 + random(race) * 0.12;
    r.aggression = 0.15 + random(race) * 0.5;
    r.line = (random(race) * 2 - 1) * (ROAD_HALF - 1.5);
  }
  return race;
}

// ---- one rider's own physics (also what the client predicts) ----

/** Advance one rider by one step, ignoring every other rider. */
export function ride(r: Rider, input: Input, track: Track, dt = DT): void {
  r.phaseT += dt;
  r.cooldown = Math.max(0, r.cooldown - dt);
  r.sinceHit += dt;
  if (r.phase === "finished" || r.phase === "wrecked") {
    r.speed = Math.max(0, r.speed - TUNE.brake * dt);
    r.z += r.speed * dt;
    return;
  }

  if (r.phase === "thrown") {
    // the rider tumbles on ahead; the bike slides to a stop where it fell
    r.speed = Math.max(0, r.speed - 18 * dt);
    r.z += r.speed * dt;
    r.x += r.vx * dt;
    r.vx *= Math.exp(-3 * dt);
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

  // riding
  const top = topSpeed(r);
  const limit = cap(r);
  const offRoad = Math.abs(r.x) > ROAD_HALF;

  if (input.brake) r.speed -= TUNE.brake * dt;
  else if (input.throttle) {
    const f = r.speed / limit;
    r.speed += accelOf(r) * Math.max(0, 1 - f * f) * dt;
    if (r.speed > limit) r.speed = Math.max(limit, r.speed - 3 * dt);
  } else r.speed -= (TUNE.coast + 0.0004 * r.speed * r.speed) * dt;
  if (offRoad && r.speed > TUNE.offRoadSpeed) {
    r.speed = Math.max(TUNE.offRoadSpeed, r.speed - TUNE.offRoadDrag * dt);
  }
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
  r.x += (r.vx + r.shove - outward) * dt;
  r.x = clamp(r.x, -30, 30);
  r.z += r.speed * dt;
  r.bikeZ = r.z;
  r.bikeX = r.x;

  if (r.leanHeld > TUNE.leanLimit) crash(r, "lowside", null);
}

function setPhase(r: Rider, phase: Phase): void {
  r.phase = phase;
  r.phaseT = 0;
}

/** Off the bike: it stays where it fell, the rider is thrown on (M2, M4). */
function crash(r: Rider, cause: "tree" | "lowside" | "knockdown", race: Race | null): void {
  r.damage = Math.max(0, r.damage - TUNE.crashDamage[cause]);
  r.bikeZ = r.z;
  r.bikeX = r.x;
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
  r.cooldown = kind === "foot" ? TUNE.kickCooldown : TUNE.punchCooldown;
}

function resolveAttack(race: Race, r: Rider): void {
  const a = r.attack;
  if (!a) return;
  a.t += DT;
  if (!a.landed && a.t >= TUNE.windup) {
    a.landed = true;
    const reach = a.kind === "kick" ? TUNE.kickReach : TUNE.punchReach;
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
  if (a.t >= TUNE.windup + 0.2) r.attack = null;
}

function hit(race: Race, by: Rider, on: Rider, move: AttackKind): void {
  const weight = by.lbs / 180; // heavier riders hit harder (R6)
  const loss = (move === "kick" ? TUNE.kickStamina : TUNE.punchStamina) * weight;
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
    const width = s.kind === "tree" ? 1.3 : 0.6;
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

/** Bikes do not pass through each other; a faster bike behind pushes (R7). */
function contact(race: Race): void {
  const riding = race.riders.filter((r) => r.phase === "riding");
  for (let i = 0; i < riding.length; i++) {
    for (let j = i + 1; j < riding.length; j++) {
      const a = riding[i];
      const b = riding[j];
      const dz = b.z - a.z;
      const dx = b.x - a.x;
      if (Math.abs(dz) > 1.8 || Math.abs(dx) > 0.8) continue;
      const push = (0.8 - Math.abs(dx)) / 2;
      const s = dx >= 0 ? 1 : -1;
      a.x -= s * push;
      b.x += s * push;
      const [back, front] = dz >= 0 ? [a, b] : [b, a];
      if (back.speed > front.speed) {
        const diff = back.speed - front.speed;
        front.speed += Math.min(7 * MPH, diff * 0.5);
        back.speed = front.speed;
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
export function aiInput(race: Race, r: Rider): Input {
  const input: Input = { ...NO_INPUT, throttle: true };
  const curve = curveAt(race.track, r.z + r.speed * 1.2);
  // hold the line against the bend
  const want = r.line - r.x + TUNE.centrifugal * r.speed * r.speed * curve * 0.25;
  if (want > 0.4) input.right = true;
  else if (want < -0.4) input.left = true;
  if (r.speed > topSpeed(r) * r.skill) input.throttle = false;
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
  if (r.phase === "running") {
    input.left = false;
    input.right = false;
  }
  return input;
}

/** Advance the race one fixed step. `inputs` holds the humans' keys by id. */
export function step(race: Race, inputs: Map<number, Input>): void {
  race.t += DT;
  for (const r of race.riders) {
    const input = r.human ? (inputs.get(r.id) ?? NO_INPUT) : aiInput(race, r);
    if (input.hand && !r.prevHand) beginAttack(race, r, "hand");
    if (input.foot && !r.prevFoot) beginAttack(race, r, "foot");
    r.prevHand = input.hand;
    r.prevFoot = input.foot;
    ride(r, input, race.track);
  }
  for (const r of race.riders) {
    resolveAttack(race, r);
    scenery(race, r);
    recover(r);
  }
  contact(race);
  for (const r of race.riders) {
    if (r.phase !== "finished" && r.phase !== "wrecked" && r.z >= race.track.length) {
      r.phase = "finished";
      r.finishT = race.t;
      r.place = ++race.finishers;
      race.events.push({ t: race.t, kind: "finished", rider: r.id, place: r.place });
    }
  }
}

/** Standings: finishers by place, then everyone else by distance. */
export function standings(race: Race): Rider[] {
  return [...race.riders].sort((a, b) => {
    if (a.place && b.place) return a.place - b.place;
    if (a.place) return -1;
    if (b.place) return 1;
    if (a.phase === "wrecked" && b.phase !== "wrecked") return 1;
    if (b.phase === "wrecked" && a.phase !== "wrecked") return -1;
    return b.z - a.z;
  });
}

export const positionOf = (race: Race, id: number): number => standings(race).findIndex((r) => r.id === id) + 1;

/** A race is over once no human is still riding it. */
export const humansDone = (race: Race): boolean =>
  race.riders.every((r) => !r.human || r.phase === "finished" || r.phase === "wrecked");
