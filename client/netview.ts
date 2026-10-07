// Where to draw everyone the server owns, given snapshots that arrive when the
// network lets them. Pure: no DOM, so spec/netview.test.ts replays a race
// through it with the arrival times measured off the live server.
//
// The first version interpolated between the two snapshots around "arrival
// time minus 0.1 s". Measured on the live server (scripts/netprobe.ts, 400
// snapshots), arrivals are 49 ms apart at the median but up to 111 ms, and
// five times in 20 s two arrive within 10 ms of each other. Keyed on arrival,
// a gap over 0.1 s froze the bike ahead and a burst then threw it forward
// about 4 m in one frame: the stutter seen when overtaking. Here snapshots are
// placed by the race time they carry, which is exact, and drawn by a clock
// that runs at real speed and is only ever eased, never stepped back.
//
// Drawn 0.1 s in the past the others were also 8 m behind where they were at
// 290 km/h, against a predicted rider of one's own drawn in the present, so a
// pass happened 8 m late and the predicted bike was pushed off bikes that were
// no longer there. Everyone is now interpolated 0.1 s back, where it is
// smooth, and carried forward by its own speed to the present.

import type { CarState, RiderState } from "../game/protocol.ts";
import { DT } from "../game/sim.ts";

export type Snap = { time: number; riders: RiderState[]; cars: CarState[] };

/** How far back snapshots are interpolated before being carried forward. */
export const DELAY = 0.1;

export type Placed = { z: number; x: number; lean: number; s: RiderState };

export class Timeline {
  readonly snaps: Snap[] = [];
  /** race time minus local time for the least-delayed snapshot seen */
  private offset: number | null = null;
  private clock: number | null = null;
  private last = 0;

  push(localNow: number, snap: Snap): void {
    this.snaps.push(snap);
    if (this.snaps.length > 40) this.snaps.shift();
    const o = snap.time - localNow;
    // the least-delayed arrival says most about the server's clock; let the
    // estimate sink slowly (1 ms a second) so clock drift cannot strand it
    if (this.offset === null || o > this.offset) this.offset = o;
    else this.offset -= 0.001 * (snap.time - (this.snaps.at(-2)?.time ?? snap.time));
  }

  /** The race time to draw for local time `localNow`: smooth and never backwards. */
  now(localNow: number): number {
    if (this.offset === null) return 0;
    const target = localNow + this.offset;
    const dt = Math.max(0, localNow - this.last);
    this.last = localNow;
    if (this.clock === null || Math.abs(target - this.clock) > 0.5) return (this.clock = target);
    // run at real speed, and ease towards the target by at most 10%
    const step = dt + Math.max(-0.1 * dt, Math.min(0.1 * dt, target - (this.clock + dt)));
    this.clock += step;
    return this.clock;
  }

  /** The two snapshots around race time t, the one before them, and how far between the two. */
  private around(t: number): { prev: Snap | null; a: Snap; b: Snap; f: number } | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    if (s.length === 1) return { prev: null, a: s[0], b: s[0], f: 0 };
    let i = s.length - 1;
    while (i > 1 && s[i - 1].time > t) i--;
    const a = s[i - 1];
    const b = s[i];
    // past the newest, b and a carry on as they were going (bounded below)
    return { prev: i > 1 ? s[i - 2] : null, a, b, f: (t - a.time) / (b.time - a.time) };
  }

  /** Rider `id` as drawn at race time `t`. */
  rider(id: number, t: number): Placed | null {
    const w = this.around(t - DELAY);
    if (!w) return null;
    const sa = w.a.riders.find((r) => r[0] === id);
    const sb = w.b.riders.find((r) => r[0] === id);
    if (!sb) return null;
    // a rider who came off, got up or got back on between the two is not
    // somewhere in between: they are where the newer one says, carried on
    // and so is a cop sent out from off the road (OFF_ROAD) between the two
    if (!sa || sa[8] !== sb[8] || Math.abs(sb[1] - sa[1]) > 60) return { z: sb[1] + sb[3] * Math.max(0, t - w.b.time), x: sb[2], lean: sb[4], s: sb };
    const dt = w.b.time - w.a.time || 1;
    const f = Math.max(0, Math.min(w.f, 1 + 0.3 / dt));
    const lerp = (i: 1 | 2 | 4 | 17): number => sa[i] + (sb[i] - sa[i]) * Math.min(1, f);
    // how it was moving at each snapshot, from where it had got to since the
    // one before. The speed a snapshot carries was tried first and jumps when
    // a bike is shunted from behind, which threw the drawn bike 1.2 m forward
    // and back
    const sp = w.prev?.riders.find((r) => r[0] === id);
    const into = (i: 1 | 2): number => (sp && sp[8] === sa[8] ? (sa[i] - sp[i]) / (w.a.time - w.prev!.time) : (sb[i] - sa[i]) / dt);
    const out = (i: 1 | 2): number => (sb[i] - sa[i]) / dt;
    const v = (i: 1 | 2): number => into(i) + (out(i) - into(i)) * Math.min(1, f);
    // beyond the newest snapshot, keep going the way the last two were going
    const past = Math.max(0, f - 1) * dt;
    // and carried forward to the present
    // a rider in the air is drawn at the height between the two, not stepped
    // up and down twenty times a second
    const s: RiderState = sb[8] === "thrown" ? [...sb] : sb;
    if (sb[8] === "thrown") s[17] = Math.max(0, lerp(17));
    return { z: lerp(1) + out(1) * past + v(1) * DELAY, x: lerp(2) + out(2) * past + v(2) * DELAY, lean: lerp(4), s };
  }

  /** Car `id` as drawn at race time `t`, or null when the server has dropped it. */
  car(id: number, t: number): { z: number; x: number } | null {
    const w = this.around(t - DELAY);
    if (!w) return null;
    const cb = w.b.cars.find((c) => c[0] === id);
    if (!cb) return null;
    const ca = w.a.cars.find((c) => c[0] === id);
    // a car that wrapped round the road between snapshots jumps, not slides
    if (!ca || Math.abs(cb[1] - ca[1]) > 50 || w.a === w.b) return { z: cb[1], x: cb[2] };
    const dt = w.b.time - w.a.time;
    const f = Math.max(0, Math.min(w.f, 1 + 0.3 / dt));
    const vz = (cb[1] - ca[1]) / dt;
    return { z: ca[1] + vz * dt * f + vz * DELAY, x: ca[2] + (cb[2] - ca[2]) * Math.min(1, f) };
  }
}


/**
 * One's own rider, predicted here step by step and checked against what the
 * server says it was. The first version moved the predicted bike 30% of the
 * way to the server's word on each snapshot, all in one frame, and compared
 * the next snapshot with a history that still held the uncorrected path, so
 * the same error was corrected again and again. Here a correction is spread
 * over the following steps, and the history moves with it, so each error is
 * corrected once.
 */
export class Prediction {
  /** predicted position by local step, less the correction made since */
  private past = new Map<number, { z: number; x: number }>();
  private shift = { z: 0, x: 0 };
  private pending = { z: 0, x: 0 };
  /** race time minus local step time, for the least-delayed snapshot */
  private offset: number | null = null;

  /** Note where the predicted rider is after local step `n`. */
  record(n: number, z: number, x: number): void {
    this.past.set(n, { z: z - this.shift.z, x: x - this.shift.x });
    this.past.delete(n - 240);
  }

  /**
   * The server says the rider was at (z, x) at race time `time`, heard at
   * local step `n`. Returns false when there is no prediction to compare or
   * it is too far out to ease, and the caller should take the server's word
   * outright (and call reset()).
   */
  heard(n: number, time: number, z: number, x: number): boolean {
    const o = time - n * DT;
    if (this.offset === null || o > this.offset) this.offset = o;
    else this.offset -= 0.001 * DT * 3;
    const s = (time - this.offset) / DT;
    const a = this.past.get(Math.floor(s));
    const b = this.past.get(Math.ceil(s));
    if (!a || !b) return false;
    const f = s - Math.floor(s);
    const ez = z - (a.z + (b.z - a.z) * f + this.shift.z);
    const ex = x - (a.x + (b.x - a.x) * f + this.shift.x);
    if (Math.abs(ez) > 6 || Math.abs(ex) > 3) return false;
    this.pending = { z: ez, x: ex };
    return true;
  }

  /** The part of the outstanding correction to make this step. */
  ease(): { z: number; x: number } {
    const d = { z: this.pending.z * 0.12, x: this.pending.x * 0.12 };
    this.pending.z -= d.z;
    this.pending.x -= d.x;
    this.shift.z += d.z;
    this.shift.x += d.x;
    return d;
  }

  reset(): void {
    this.past.clear();
    this.shift = { z: 0, x: 0 };
    this.pending = { z: 0, x: 0 };
  }
}
