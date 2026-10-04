// What a touch looks and sounds like (ledger K13). Pure, so spec/feel.test.ts
// can hold it to the recording without a screen.
//
// Measured off the recorded race (docs/road-rash-feel.md, "Contact"): a bike
// that is struck tilts away on the very next frame (kick lands 57.24, the
// rival's bike is over at 57.28); the striker's own bike wobbles for about
// four frames after a blow lands (355.80-355.92); nothing shakes or flashes
// the screen. The first remake moved bikes apart on contact and said nothing
// else, so a rub, a shunt, a car glanced or a wall scraped felt like touching
// air.

import type { RaceEvent, Rider } from "../game/sim.ts";
import type { Sfx } from "./audio.ts";

/** A bike's tilt, radians to its right, `age` seconds after a touch of size `amp`. */
export function wobble(age: number, amp: number): number {
  if (age < 0 || age > 0.6) return 0;
  // over at once and back up, settled within about four frames: a critically
  // damped spring. A springier one (4.5 Hz) was tried first and was already
  // swinging back through upright by the next frame, so the tilt never showed
  const u = age / 0.05;
  return amp * (1 + u) * Math.exp(-u);
}

export type Reaction = {
  /** riders whose bikes tilt: positive to their right */
  tilt: { id: number; amp: number }[];
  /** a car knocked, by id */
  car: { id: number; amp: number } | null;
  /** what is heard, and how loud (0-1), if anything */
  sound: { kind: Sfx; gain: number } | null;
  /** thrown high and far: over a car or off a tree, not down in a slide */
  launched: number | null;
};

/** Tilt away from something at x `from`, for a bike at x `at` (the rider's right is -x). */
const away = (at: number, from: number): number => (from > at ? 1 : -1);

/** How one race event is felt by a rider at `me` (or a spectator, me null). */
export function react(e: RaceEvent, riders: readonly Rider[], me: number | null): Reaction {
  const out: Reaction = { tilt: [], car: null, sound: null, launched: null };
  const find = (id: number): Rider | undefined => riders.find((r) => r.id === id);
  const self = (r?: Rider): boolean => !!r && r.id === me;
  const viewer = me === null ? null : find(me);
  // within earshot of whoever is listening
  const heard = (r?: Rider): number => (!r ? 0 : !viewer || self(r) ? 1 : Math.max(0, 1 - Math.abs(r.z - viewer.z) / 60));
  if (e.kind === "hit") {
    const by = find(e.by);
    const on = find(e.on);
    if (by && on) {
      out.tilt.push({ id: on.id, amp: 0.5 * away(on.x, by.x) });
      // the striker's bike rocks back from the blow
      out.tilt.push({ id: by.id, amp: 0.18 * away(by.x, on.x) });
    }
  } else if (e.kind === "bump") {
    const r = find(e.rider);
    if (!r) return out;
    const hard = e.hard;
    if (e.with === "rider") {
      const o = find(e.other);
      if (o) {
        out.tilt.push({ id: r.id, amp: (0.2 + 0.35 * hard) * away(r.x, e.from) });
        out.tilt.push({ id: o.id, amp: (0.1 + 0.15 * hard) * away(o.x, r.x) });
      }
      const g = Math.max(heard(r), heard(o));
      if (g > 0) out.sound = { kind: "bump", gain: g * (0.4 + 0.6 * hard) };
    } else if (e.with === "car") {
      out.tilt.push({ id: r.id, amp: (0.3 + 0.2 * hard) * away(r.x, e.from) });
      out.car = { id: e.other, amp: 0.06 + 0.06 * hard };
      const g = heard(r);
      if (g > 0) out.sound = { kind: "carBump", gain: g * (0.5 + 0.5 * hard) };
    } else {
      // a wall: tilted off it, and the long scrape
      out.tilt.push({ id: r.id, amp: (0.2 + 0.3 * hard) * away(r.x, e.from) });
      const g = heard(r);
      if (g > 0) out.sound = { kind: "scrape", gain: g * (0.4 + 0.6 * hard) };
    }
  } else if (e.kind === "crash") {
    // a square hit on a car, a tree or a rock throws the rider over it; a wall
    // ridden into, like a crate clipped (212.9), puts bike and rider down together
    if (e.cause === "rearEnd" || e.cause === "headOn" || e.cause === "tree") out.launched = e.rider;
  }
  return out;
}
