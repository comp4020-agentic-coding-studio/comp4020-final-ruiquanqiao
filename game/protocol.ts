// The messages between a browser and the server, one JSON object per
// WebSocket frame. Shared by both ends so they cannot drift apart.

import type { Phase, RaceEvent, Rider } from "./sim.ts";

export type Mode = "ai" | "human";

export const POOL_WAIT = { ai: 5, human: 10 } as const; // seconds (ledger N2, N3)
export const GRID = 15; // riders in an AI-pool race (O1)
export const SNAPSHOT_HZ = 20;

export type ToServer =
  | { t: "queue"; mode: Mode; level: number }
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
];

export type Entry = { id: number; name: string; human: boolean };

export type Standing = {
  id: number;
  name: string;
  human: boolean;
  place: number;
  outcome: "qualified" | "placed" | "wrecked" | "unfinished" | "quit";
  time: number | null;
};

export type ToClient =
  | { t: "hello"; you: { id: number; name: string }; qualified: { level: number; track: string }[] }
  | { t: "pool"; mode: Mode | null; count: number; startsIn: number | null; waitingForMore: boolean }
  | { t: "start"; race: number; level: number; seed: number; entrants: Entry[]; you: number | null }
  | { t: "snap"; race: number; time: number; ack: number; riders: RiderState[]; events: RaceEvent[] }
  | { t: "end"; race: number; standings: Standing[]; qualified: { level: number; track: string }[] }
  | { t: "live"; races: { race: number; level: number; riders: number; humans: number }[] };

export function encodeRider(r: Rider): RiderState {
  const a = r.attack ? `${r.attack.kind}:${r.attack.side}:${r.attack.t.toFixed(3)}` : "";
  const q = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
  return [r.id, q(r.z), q(r.x), q(r.speed), q(r.lean), q(r.build, 3), q(r.stamina, 1), q(r.damage, 1), r.phase, q(r.phaseT, 3), q(r.bikeZ), q(r.bikeX), a, r.place];
}

/** Write a wire state onto a rider, leaving what the wire does not carry. */
export function applyRider(r: Rider, s: RiderState): void {
  [, r.z, r.x, r.speed, r.lean, r.build, r.stamina, r.damage, r.phase, r.phaseT, r.bikeZ, r.bikeX] = s;
  r.place = s[13];
  if (s[12]) {
    const [kind, side, t] = s[12].split(":");
    r.attack = { kind: kind as "punch" | "backhand" | "kick", side: Number(side) as -1 | 1, t: Number(t), target: -1, landed: true };
  } else r.attack = null;
}
