// The messages between a browser and the server, one JSON object per
// WebSocket frame. Shared by both ends so they cannot drift apart.

import type { NetReport } from "./net.ts";
import { type Car, type Phase, type RaceEvent, type Rider, type Weapon, windupOf } from "./sim.ts";

export type Mode = "ai" | "human";

export const POOL_WAIT = { ai: 5, human: 10 } as const; // seconds (ledger N2, N3)
export const GRID = 15; // riders in an AI-pool race (O1)
/** the most AI riders anyone can ask for (N2): ten rows of three on the grid */
export const MAX_AI = 29;
/** the most people in one room: the original's Mano a Mano limit (N1), and one livery each */
export const ROOM = 8;
export const SNAPSHOT_HZ = 20;
/** a match found: seconds to accept it (N9) */
export const CHECK_WAIT = 10;
/** the loading screen: at least this long, so it is seen, and at most this, so one slow browser cannot hold a room (N10) */
export const LOAD_MIN = 2;
export const LOAD_MAX = 20;

export type ToServer =
  | { t: "queue"; mode: Mode; level: number; track?: number; ai?: number }
  | { t: "leave" }
  /** out of the race one is in, back to the board (H8) */
  | { t: "quit" }
  | { t: "in"; seq: number; keys: number }
  | { t: "name"; name: string }
  /** the answer to a match found (N9) */
  | { t: "accept" }
  | { t: "decline" }
  /** how far this browser is with loading the race, 0 to 1; 1 is ready (N10) */
  | { t: "progress"; p: number }
  | { t: "pong"; at: number }
  /** what this browser saw of the network over the last few seconds of its race (N14) */
  | ({ t: "net" } & NetReport)
  /** spectate a race in progress, or stop (N11) */
  | { t: "watch"; race: number }
  | { t: "unwatch" };

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
  /** thrown off: m above the road, m/s upwards, and the slope flown along */
  air: number,
  vy: number,
  tilt: number,
];

export type Entry = { id: number; name: string; human: boolean; /** a person's leathers, an index in LIVERIES, the same in everyone's view */ look?: number };

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
  /** a room is ready: accept within `answer` seconds (N9) */
  | { t: "found"; match: number; mode: Mode; of: number; answer: number }
  | { t: "check"; match: number; accepted: number; of: number }
  /** out of matchmaking: one's own decline, or no answer in time */
  | { t: "dropped"; why: "declined" | "missed" }
  /** someone else did not accept: back at the front of the pool */
  | { t: "requeued"; mode: Mode }
  /** everyone accepted: the race as it will be, to load (N10) */
  | { t: "loading"; match: number; level: number; track: number; seed: number; entrants: Entry[]; you: number }
  /** every person's loading and ping, in ms */
  | { t: "loads"; match: number; riders: { id: number; p: number; ping: number }[] }
  /** a round trip asked for; in a race it carries this person's last one, in ms, for the HUD (N14) */
  | { t: "ping"; at: number; rtt?: number | null }
  | { t: "start"; race: number; level: number; track: number; seed: number; entrants: Entry[]; you: number | null; /** seconds on the grid before the race goes (V16) */ countdown?: number }
  | { t: "snap"; race: number; time: number; ack: number; riders: RiderState[]; cars: CarState[]; events: RaceEvent[] }
  | { t: "end"; race: number; standings: Standing[]; qualified: { level: number; track: string }[] }
  /** every room on the road, once a second, to everyone not racing (N11) */
  | { t: "live"; races: Room[] };

/** One person on the leaderboard (N12). */
export type Leader = { rank: number; id: number; name: string; points: number; races: number; wins: number; podiums: number; boards: number };

/** Points by place across the line, F1's: only a finish scores (N12). */
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/** A race in progress as the live rooms page shows it. */
export type Room = { race: number; mode: Mode; level: number; track: number; time: number; humans: { name: string; look?: number; out: boolean; /** their usual round trip in this race, ms (N14) */ ping?: number | null }[]; npcs: number; watchers: number };

export function encodeRider(r: Rider): RiderState {
  const a = r.attack ? `${r.attack.kind}:${r.attack.side}:${r.attack.t.toFixed(3)}` : "";
  const q = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
  return [r.id, q(r.z), q(r.x), q(r.speed), q(r.lean), q(r.build, 3), q(r.stamina, 1), q(r.damage, 1), r.phase, q(r.phaseT, 3), q(r.bikeZ), q(r.bikeX), a, r.place, r.weapon ?? "", q(r.air), q(r.vy), Number.isFinite(r.tilt) ? q(r.tilt, 4) : 0];
}

/** Write a wire state onto a rider, leaving what the wire does not carry. */
export function applyRider(r: Rider, s: RiderState): void {
  [, r.z, r.x, r.speed, r.lean, r.build, r.stamina, r.damage, r.phase, r.phaseT, r.bikeZ, r.bikeX] = s;
  r.place = s[13];
  r.weapon = s[14] || null;
  r.air = s[15] ?? 0;
  r.vy = s[16] ?? 0;
  r.tilt = s[17] ?? 0;
  if (s[12]) {
    const [kind, side, t] = s[12].split(":");
    r.attack = { kind: kind as "punch" | "backhand" | "kick", side: Number(side) as -1 | 1, t: Number(t), target: -1, landed: false };
    // whether it has landed follows from how far into the swing it is
    r.attack.landed = r.attack.t >= windupOf(r, r.attack);
  } else r.attack = null;
}
