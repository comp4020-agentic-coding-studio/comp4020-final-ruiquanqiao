import { describe, expect, it } from "vitest";
import { DELAY, Prediction, type Snap, Timeline } from "../client/netview.ts";
import { encodeCar, encodeRider } from "../game/protocol.ts";
import { DT, type Input, NO_INPUT, type Race, ride, startRace, step } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";
import arrivals from "./fixtures/arrivals.json" with { type: "json" };

// The stutter detector. A real race is run on a pretend server, its snapshots
// are delivered as late as the live server's actually arrived
// (fixtures/arrivals.json, measured by scripts/netprobe.ts), and the other
// riders are drawn sixty times a second exactly as the browser draws them. A
// bike that jerks back and forth while being passed shows up here as frames
// where the drawn bike moves a different distance from the real one.

type Truth = { t: number; z: Map<number, number>; phase: Map<number, string> };

function race(seconds: number): { race: Race; truth: Truth[]; snaps: Snap[] } {
  const r = startRace(makeTrack(1, 0), 1, Array.from({ length: 8 }, (_, i) => ({ id: i, name: `r${i}`, human: false })), 7);
  const truth: Truth[] = [];
  const snaps: Snap[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(r, new Map());
    truth.push({ t: r.t, z: new Map(r.riders.map((x) => [x.id, x.z])), phase: new Map(r.riders.map((x) => [x.id, x.phase])) });
    if (i % 3 === 2) snaps.push({ time: r.t, riders: r.riders.map(encodeRider), cars: r.cars.map(encodeCar) });
  }
  return { race: r, truth, snaps };
}

type Sampler = { push(local: number, s: Snap): void; z(id: number, local: number): number | null };

/** The way the first version drew the others: by arrival time, 0.1 s back. */
function byArrival(): Sampler {
  const got: (Snap & { at: number })[] = [];
  return {
    push: (local, s) => got.push({ ...s, at: local }),
    z(id, local) {
      if (!got.length) return null;
      const t = local - 0.1;
      let a = got[0];
      let b = got.at(-1)!;
      for (let i = got.length - 1; i > 0; i--)
        if (got[i - 1].at <= t) {
          a = got[i - 1];
          b = got[i];
          break;
        }
      const span = b.at - a.at;
      const f = span > 0 ? Math.min(1, Math.max(0, (t - a.at) / span)) : 1;
      const sa = a.riders.find((r) => r[0] === id)!;
      const sb = b.riders.find((r) => r[0] === id)!;
      return sa[1] + (sb[1] - sa[1]) * f;
    },
  };
}

function byTimeline(): Sampler {
  const tl = new Timeline();
  return {
    push: (local, s) => tl.push(local, s),
    z: (id, local) => tl.rider(id, tl.now(local))?.z ?? null,
  };
}

const LATENCY = 0.04; // s, each way

/**
 * Drive a sampler through a 40 s race at 60 frames a second. A jerk is a frame
 * in which a bike is drawn moving 0.3 m more or less than it really moved in
 * that frame's time (a quarter of a frame's travel at 250 km/h); lag is how
 * far the drawn bike is from where it really is at that moment.
 */
function stutter(make: () => Sampler, seconds = 40): { jerks: number; frames: number; worst: number; lag: number; collisions: number; offAtCollision: number } {
  const { truth, snaps } = race(seconds);
  const late = arrivals.lateMs;
  const s = make();
  let k = 0;
  let arrive = 0;
  const prev = new Map<number, number>();
  let jerks = 0;
  let frames = 0;
  let worst = 0;
  const lags: number[] = [];
  let collisions = 0;
  let offAtCollision = 0;
  /** Whether rider `id` changed speed by more than 15 m/s in one step within 0.3 s before t: run into something. */
  const collided = (id: number, t: number): boolean => {
    const k = Math.round(t / DT) - 1;
    for (let i = Math.max(2, k - 18); i <= Math.min(truth.length - 1, k); i++) {
      const v1 = (truth[i].z.get(id)! - truth[i - 1].z.get(id)!) / DT;
      const v0 = (truth[i - 1].z.get(id)! - truth[i - 2].z.get(id)!) / DT;
      if (Math.abs(v1 - v0) > 15) return true;
    }
    return false;
  };
  const truthAt = (id: number, t: number): number | null => {
    // between the two steps around t, as the race really went
    const u = Math.max(0, Math.min(truth.length - 2, t / DT - 1));
    const i = Math.floor(u);
    const [a, b] = [truth[i], truth[i + 1]];
    if (a.phase.get(id) !== "riding" || b.phase.get(id) !== "riding") return null;
    return a.z.get(id)! + (b.z.get(id)! - a.z.get(id)!) * (u - i);
  };
  let before = 0;
  // 60 frames a second, each a little early or late as a browser's are
  for (let f = 0; f < seconds * 60; f++) {
    const local = f / 60 + 0.002 * Math.sin(f * 1.7);
    while (k < snaps.length) {
      // out in order, as TCP keeps them, each as late as the live server's k-th was
      arrive = Math.max(arrive, snaps[k].time + LATENCY + late[k % late.length] / 1000);
      if (arrive > local) break;
      s.push(arrive, snaps[k++]);
    }
    // the race as it stands at this moment, as far as anyone could know it
    const present = local - LATENCY;
    for (let id = 0; id < 8; id++) {
      const z = s.z(id, local);
      const q = prev.get(id);
      if (z !== null) prev.set(id, z);
      if (local < 2 || z === null || q === undefined) continue; // the grid
      const now = truthAt(id, present);
      const then = truthAt(id, present - (local - before));
      // just back on the bike: getting on puts the rider where the bike lay,
      // a real jump, drawn as soon as a snapshot says so
      if (now === null || then === null || truthAt(id, present - 0.25) === null) continue;
      const err = Math.abs(z - q - (now - then));
      if (collided(id, present)) {
        // a bike that runs into another stops dead within two steps, which
        // nothing drawn from the past can foresee: held only to stay close
        collisions++;
        offAtCollision = Math.max(offAtCollision, Math.abs(z - now));
        continue;
      }
      frames++;
      worst = Math.max(worst, err);
      if (err > 0.3) jerks++;
      lags.push(Math.abs(z - now));
    }
    before = local;
  }
  lags.sort((p, q) => p - q);
  // the 99th percentile: a rider knocked about by contact can be off for a frame or two
  return { jerks, frames, worst, lag: lags[Math.floor(lags.length * 0.99)], collisions, offAtCollision };
}

describe("the other riders, drawn from snapshots that arrive late and in bursts", () => {
  it("catches the stutter the first version had", () => {
    // the detector has to find the fault it was built for, or it proves
    // nothing. Measured: 451 jerks in 17,362 frames, the worst 3.9 m in one
    // frame, and bikes drawn 9.5 m behind where they were
    const old = stutter(byArrival);
    expect(old.jerks).toBeGreaterThan(100);
    expect(old.lag).toBeGreaterThan(5);
  });

  it("draws every bike moving as it really moved, frame after frame", () => {
    // measured: no jerks, the worst frame 0.11 m off (collisions aside, below)
    const now = stutter(byTimeline);
    expect(now.frames).toBeGreaterThan(15000);
    expect(now.jerks).toBe(0);
    expect(now.worst).toBeLessThan(0.25);
  });

  it("draws them where they are now, not where they were a tenth of a second ago", () => {
    // at 290 km/h a tenth of a second is 8 m: a pass would happen 8 m late.
    // Measured: 0.22 m
    expect(stutter(byTimeline).lag).toBeLessThan(1);
    expect(DELAY).toBeGreaterThan(0.05);
  });

  it("keeps a bike that runs into another within a few metres of where it stopped", () => {
    // measured: 3.5 m at worst, against the first version's 6.5. A shunt
    // stops a bike 50 m/s slower within two steps; drawn from the past, it is
    // carried on until the snapshot that says so, and a known limit
    const now = stutter(byTimeline);
    expect(now.collisions).toBeGreaterThan(0);
    expect(now.offAtCollision).toBeLessThan(4);
  });

  it("never runs its clock backwards", () => {
    const tl = new Timeline();
    let t = -1;
    for (let i = 0; i < 600; i++) {
      const local = i / 60;
      // a snapshot every 50 ms of race time, arriving 0-60 ms late
      if (i % 3 === 0) tl.push(local, { time: i / 60 - 0.03 - ((i * 37) % 60) / 1000, riders: [], cars: [] });
      const now = tl.now(local);
      expect(now).toBeGreaterThanOrEqual(t);
      t = now;
    }
  });
});

describe("one's own rider, predicted here and corrected by the server", () => {
  /**
   * Ride 30 s on the client and on a pretend server that hears each key 40 ms
   * late and answers as late as the live server did. Returns the biggest
   * correction made in one frame, and how far apart the two ended.
   */
  function own(mode: "eased" | "first"): { worstFix: number; gap: number } {
    const solo = (): Race => {
      const r = startRace({ ...makeTrack(1, 0), scenery: [] }, 1, [{ id: 0, name: "me", human: true }], 3);
      r.cars = [];
      r.riders = r.riders.filter((x) => !x.cop);
      return r;
    };
    const server = solo();
    const client = solo();
    const me = client.riders[0];
    // throttle on; a lane change every two seconds; a dab of brake now and then
    const keys = (t: number): Input => ({ ...NO_INPUT, throttle: true, left: t % 2 < 0.35, right: t % 2 > 1 && t % 2 < 1.3, brake: t % 7 > 6.6 });
    const prediction = new Prediction();
    const history = new Map<number, { z: number; x: number }>();
    let offset: number | null = null;
    const queue: { at: number; time: number; z: number; x: number }[] = [];
    let arrive = 0;
    let k = 0;
    let worstFix = 0;
    for (let n = 1; n <= 30 * 60; n++) {
      const local = n * DT;
      // the server: a step, with the keys as they were 40 ms ago
      step(server, new Map([[0, keys(Math.max(0, local - 0.04))]]));
      if (n % 3 === 0) {
        arrive = Math.max(arrive, server.t + 0.04 + arrivals.lateMs[k++ % arrivals.lateMs.length] / 1000);
        queue.push({ at: arrive, time: server.t, z: server.riders[0].z, x: server.riders[0].x });
      }
      // what has arrived
      while (queue.length && queue[0].at <= local) {
        const m = queue.shift()!;
        if (mode === "eased") {
          if (!prediction.heard(n, m.time, m.z, m.x)) {
            me.z = m.z;
            me.x = m.x;
            prediction.reset();
          }
        } else {
          // the first version: 30% of the error at once, against an uncorrected history
          const o = m.time - n * DT;
          offset = offset === null ? o : Math.min(offset + 0.002, o);
          const p = history.get(Math.round(m.time / DT));
          if (p) {
            const fz = (m.z - p.z) * 0.3;
            me.z += fz;
            me.x += (m.x - p.x) * 0.3;
            worstFix = Math.max(worstFix, Math.abs(fz));
          }
        }
      }
      ride(me, keys(local), client.track);
      if (mode === "eased") {
        const fix = prediction.ease();
        me.z += fix.z;
        me.x += fix.x;
        if (n > 120) worstFix = Math.max(worstFix, Math.abs(fix.z));
        prediction.record(n, me.z, me.x);
      } else history.set(n + Math.round((offset ?? 0) / DT), { z: me.z, x: me.x });
    }
    return { worstFix, gap: Math.abs(me.z - server.riders[0].z) };
  }

  it("catches the jolt the first version had", () => {
    // measured: 0.94 m in a single frame, the whole world jumping past the camera
    expect(own("first").worstFix).toBeGreaterThan(0.3);
  });

  it("never moves one's own bike more than 0.15 m in a frame to agree with the server", () => {
    const r = own("eased");
    // measured: 0.06 m
    expect(r.worstFix).toBeLessThan(0.15);
    // and does agree with it (measured 1.0 m apart at the end, at speed)
    expect(r.gap).toBeLessThan(3);
  });
});
