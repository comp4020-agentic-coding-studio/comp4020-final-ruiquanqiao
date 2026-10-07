// The messages between a browser and the server, one JSON object per
// WebSocket frame. Shared by both ends so they cannot drift apart.

import { type Car, type Phase, type RaceEvent, type Rider, type Weapon, windupOf } from "./sim.ts";

export type Mode = "ai" | "human";

export const POOL_WAIT = { ai: 5, human: 10 } as const; // seconds (ledger N2, N3)
export const GRID = 15; // riders in an AI-pool race (O1)
/** the most AI riders anyone can ask for (N2): ten rows of three on the grid */
export const MAX_AI = 29;
export const SNAPSHOT_HZ = 20;

export type ToServer =
  | { t: "queue"; mode: Mode; level: number; track?: number; ai?: number }
  | { t: "leave" }
  | { t: "in"; seq: number; keys: number }
  | { t: "name"; name: string };

/** One rider as the wire carries it: just what drawing and the HUD need. */
export type RiderState = [
  id: number,
  z: number,
  x: number,
  speed: number,
  lean: number,
  build: number,
  stamina: number,
  damage: number,
  phase: Phase,
  phaseT: number,
  bikeZ: number,
  bikeX: number,
  attack: string, // "" or kind:side:t
  place: number,
  weapon: Weapon | "",
  nitro: number,
  boost: number,
];

export type Entry = { id: number; name: string; human: boolean };

/** A car on the wire: where it is, and how fast, for drawing between snaps. */
export type CarState = [id: number, z: number, x: number];

export const encodeCar = (c: Car): CarState => [c.id, Math.round(c.z * 100) / 100, Math.round(c.x * 100) / 100];

export type Standing = {
  id: number;
  name: string;
  human: boolean;
  place: number;
  outcome: "qualified" | "placed" | "wrecked" | "busted" | "unfinished" | "quit";
  time: number | null;
};

export type ToClient =
  | { t: "hello"; you: { id: number; name: string }; qualified: { level: number; track: string }[] }
  | { t: "pool"; mode: Mode | null; count: number; startsIn: number | null; waitingForMore: boolean }
  | { t: "start"; race: number; level: number; track: number; seed: number; entrants: Entry[]; you: number | null }
  | { t: "snap"; race: number; time: number; ack: number; riders: RiderState[]; cars: CarState[]; events: RaceEvent[] }
  | { t: "end"; race: number; standings: Standing[]; qualified: { level: number; track: string }[] }
  | { t: "live"; races: { race: number; level: number; riders: number; humans: number }[] };

export function encodeRider(r: Rider): RiderState {
  const a = r.attack ? `${r.attack.kind}:${r.attack.side}:${r.attack.t.toFixed(3)}` : "";
  const q = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
  return [r.id, q(r.z), q(r.x), q(r.speed), q(r.lean), q(r.build, 3), q(r.stamina, 1), q(r.damage, 1), r.phase, q(r.phaseT, 3), q(r.bikeZ), q(r.bikeX), a, r.place, r.weapon ?? "", r.nitro, q(r.boost)];
}

/** Write a wire state onto a rider, leaving what the wire does not carry. */
export function applyRider(r: Rider, s: RiderState): void {
  [, r.z, r.x, r.speed, r.lean, r.build, r.stamina, r.damage, r.phase, r.phaseT, r.bikeZ, r.bikeX] = s;
  r.place = s[13];
  r.weapon = s[14] || null;
  r.nitro = s[15];
  r.boost = s[16];
  if (s[12]) {
    const [kind, side, t] = s[12].split(":");
    r.attack = { kind: kind as "punch" | "backhand" | "kick", side: Number(side) as -1 | 1, t: Number(t), target: -1, landed: false };
    // whether it has landed follows from how far into the swing it is
    r.attack.landed = r.attack.t >= windupOf(r, r.attack);
  } else r.attack = null;
}
