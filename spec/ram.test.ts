import { describe, expect, it } from "vitest";
import { Prediction, Timeline } from "../client/netview.ts";
import { encodeCar, encodeRider } from "../game/protocol.ts";
import { BIKE, DT, type Input, NO_INPUT, type Race, type RaceEvent, ride, separate, startRace, step } from "../game/sim.ts";
import { bake } from "../game/track.ts";
import arrivals from "./fixtures/arrivals.json" with { type: "json" };

// The ram detector. A rider drives into another, from behind and from the
// side, through the whole path a browser sees: a server stepping the race and
// hearing keys 40 ms late, snapshots arriving as late as the live server's
// did, the browser predicting its own bike and drawing the other from the
// snapshots. A bike drawn passing through another, or a ram nobody hears, is
// a failure here rather than in someone's hands.

const straight = bake("straight", [{ length: 30000, curve: 0, climb: 0 }], 30000, 1);

type Ram = { through: number; worst: number; bumps: number; crashes: number; frames: number };

type Start = { me: { z: number; x: number; speed: number }; them: { z: number; x: number; speed: number } };

/** The others as the first version drew them: by arrival time, 0.1 s back. */
function firstDraw(): { push(at: number, time: number, s: ReturnType<typeof encodeRider>[]): void; at(local: number): ReturnType<typeof encodeRider> | null } {
  const got: { at: number; s: ReturnType<typeof encodeRider>[] }[] = [];
  return {
    push: (at, _time, s) => got.push({ at, s }),
    at(local) {
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
      const f = b.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) : 1;
      const sa = a.s.find((x) => x[0] === 1)!;
      const sb = [...b.s.find((x) => x[0] === 1)!] as ReturnType<typeof encodeRider>;
      sb[1] = sa[1] + (sb[1] - sa[1]) * f;
      sb[2] = sa[2] + (sb[2] - sa[2]) * f;
      return sb;
    },
  };
}

function ram(start: Start, keys: (t: number) => Input, seconds = 3, draw: "now" | "first" = "now"): Ram {
  const make = (): Race => {
    const r = startRace({ ...straight, scenery: [] }, 1, [{ id: 0, name: "me", human: true }, { id: 1, name: "them", human: true }], 3);
    r.cars = [];
    r.riders = r.riders.filter((x) => !x.cop);
    Object.assign(r.riders.find((x) => x.id === 0)!, start.me, { build: 1 });
    Object.assign(r.riders.find((x) => x.id === 1)!, start.them, { build: 1 });
    return r;
  };
  const server = make();
  const client = make();
  const me = client.riders.find((x) => x.id === 0)!;
  const them = client.riders.find((x) => x.id === 1)!;
  const timeline = new Timeline();
  const first = firstDraw();
  const prediction = new Prediction();
  const queue: { at: number; time: number; s: ReturnType<typeof encodeRider>[]; events: RaceEvent[] }[] = [];
  let sent = 0;
  let arrive = 0;
  let k = 0;
  const out: Ram = { through: 0, worst: 0, bumps: 0, crashes: 0, frames: 0 };
  // them: holding their speed and line, as a rider minding their own business
  const steady: Input = { ...NO_INPUT, throttle: true };
  for (let n = 1; n <= seconds * 60; n++) {
    const local = n * DT;
    step(server, new Map([[0, keys(Math.max(0, local - 0.04))], [1, steady]]));
    if (n % 3 === 0) {
      arrive = Math.max(arrive, server.t + 0.04 + arrivals.lateMs[k++ % arrivals.lateMs.length] / 1000);
      queue.push({ at: arrive, time: server.t, s: server.riders.map(encodeRider), events: server.events.slice(sent) });
      sent = server.events.length;
    }
    while (queue.length && queue[0].at <= local) {
      const m = queue.shift()!;
      timeline.push(m.at, { time: m.time, riders: m.s, cars: server.cars.map(encodeCar) });
      first.push(m.at, m.time, m.s);
      for (const e of m.events) {
        if (e.kind === "bump" && (e.rider === 0 || e.other === 0)) out.bumps++;
        if (e.kind === "crash") out.crashes++;
      }
      const mine = m.s.find((s) => s[0] === 0)!;
      if (!prediction.heard(n, m.time, mine[1], mine[2])) {
        me.z = mine[1];
        me.x = mine[2];
        me.speed = mine[3];
        prediction.reset();
      } else me.speed = mine[3];
    }
    // the browser's frame, in client/main.ts's order: its own step, kept off
    // the others where they were last drawn...
    ride(me, keys(local), client.track);
    const fix = prediction.ease();
    me.z += fix.z;
    me.x += fix.x;
    if (them.phase === "riding") separate(me, them, 1);
    prediction.record(n, me.z, me.x);
    // ...then the others moved to where the snapshots say, and the frame drawn
    if (draw === "now") {
      const p = timeline.rider(1, timeline.now(local));
      if (p) [them.z, them.x, them.phase] = [p.z, p.x, p.s[8]];
    } else {
      const p = first.at(local);
      if (p) [them.z, them.x, them.phase] = [p[1], p[2], p[8]];
    }
    if (them.phase !== "riding" || me.phase !== "riding") continue;
    // drawn overlap: how far one box is inside the other, as a share of the bike
    const oz = (BIKE.length - Math.abs(them.z - me.z)) / BIKE.length;
    const ox = (BIKE.width - Math.abs(them.x - me.x)) / BIKE.width;
    const inside = Math.min(oz, ox);
    out.frames++;
    out.worst = Math.max(out.worst, inside);
    if (inside > 0.2) out.through++;
  }
  return out;
}

const throttle = (): Input => ({ ...NO_INPUT, throttle: true });

describe("riding into another rider", () => {
  it("catches the first version drawing a rammed bike through the rammer", () => {
    // the detector has to see the fault it was built for
    const r = ram({ me: { z: 493, x: 0, speed: 50 }, them: { z: 500, x: 0, speed: 42 } }, throttle, 3, "first");
    expect(r.through).toBeGreaterThan(0);
  });

  it("from behind, 100 km/h faster, knocks them off: never drawn through them, and felt (K14)", () => {
    const r = ram({ me: { z: 470, x: 0, speed: 70 }, them: { z: 500, x: 0, speed: 42 } }, throttle);
    expect(r, JSON.stringify(r)).toMatchObject({ through: 0 });
    expect(r.crashes).toBe(1);
    expect(r.bumps).toBeGreaterThan(0);
  });

  it("from behind, only a little faster, shoves them on and is heard", () => {
    const r = ram({ me: { z: 493, x: 0, speed: 50 }, them: { z: 500, x: 0, speed: 42 } }, throttle);
    expect(r, JSON.stringify(r)).toMatchObject({ through: 0, crashes: 0 });
    expect(r.bumps).toBeGreaterThan(0);
  });

  it("from beside, steering into them, rubs them over: never drawn through them, and heard", () => {
    const r = ram({ me: { z: 500, x: -1.6, speed: 50 }, them: { z: 500, x: 0, speed: 50 } }, () => ({ ...NO_INPUT, throttle: true, right: true }));
    expect(r, JSON.stringify(r)).toMatchObject({ through: 0 });
    expect(r.bumps + r.crashes).toBeGreaterThan(0);
  });

  it("from behind and to one side, the way a pass goes wrong", () => {
    const r = ram({ me: { z: 490, x: -0.5, speed: 52 }, them: { z: 500, x: 0, speed: 42 } }, throttle);
    expect(r, JSON.stringify(r)).toMatchObject({ through: 0 });
    expect(r.bumps + r.crashes).toBeGreaterThan(0);
  });
});
