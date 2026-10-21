import { describe, expect, it } from "vitest";
import { type Readout, drawDash, revs } from "../client/dash.ts";
import { DT, type Input, KMH, NO_INPUT, type Race, type Rider, TUNE, beginAttack, kickPays, nearest, packInput, slickAt, startRace, step, topSpeed, unpackInput } from "../game/sim.ts";
import { ROADS, ROAD_HALF, bake, biomeAt, makeTrack } from "../game/track.ts";
import { walkerAt } from "../game/walkers.ts";

// Ledger rows that had been built for weeks with nothing to prove it, so they
// still read "planned" with a due crit long past. Each test here is the proof
// its row now names, and spec/ledger.test.ts fails if a planned row's crit
// goes by again.

const straight = bake("straight", [{ length: 30000, curve: 0, climb: 0 }], 30000, 1);

/** People alone on a dry straight road: no traffic, no cops, no NPCs, nothing on the verge, no slippery patch. */
function alone(humans = 1): Race {
  const entrants = Array.from({ length: humans }, (_, i) => ({ id: i, name: `h${i}`, human: true }));
  const race = startRace({ ...straight, scenery: [], slicks: [], cones: [], crossings: [] }, 1, entrants, 1);
  race.cars = [];
  race.riders = race.riders.filter((r) => r.human);
  race.walkers = [];
  return race;
}
const rider = (race: Race, id = 0): Rider => race.riders.find((r) => r.id === id)!;
const hold = (race: Race, keys: Partial<Input>, seconds: number): void => {
  const input = { ...NO_INPUT, ...keys };
  const n = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < n; i++) step(race, new Map(race.riders.filter((r) => r.human).map((r) => [r.id, input])));
};
/** Up to speed, then held hard over until the bike lowsides. */
const lowside = (race: Race): void => {
  hold(race, { throttle: true }, 20);
  for (let i = 0; i < 300 && rider(race).phase === "riding"; i++) hold(race, { throttle: true, right: true }, DT);
};

describe("riding", () => {
  it("runs a higher level further down the same road, never a different one (S7)", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const low = makeTrack(1, road);
      const high = makeTrack(5, road);
      expect(high.length).toBeGreaterThan(low.length);
      for (let i = 0; i < low.segments; i++) expect(high.curve[i], `road ${road}, segment ${i}`).toBe(low.curve[i]);
    }
  });

  it("leans only when steered hard near the cap, turns sharper leant over, and lowsides held there (R3)", () => {
    // well below the cap a full steer barely tips the bike
    const slow = alone();
    hold(slow, { throttle: true }, 2);
    hold(slow, { right: true }, 1);
    expect(Math.abs(rider(slow).lean)).toBeLessThanOrEqual(0.36);

    // at the cap it leans right over, and the line tightens as it does
    const fast = alone();
    hold(fast, { throttle: true }, 20);
    const r = rider(fast);
    const x0 = r.x;
    hold(fast, { throttle: true, right: true }, 0.25);
    const early = Math.abs(r.x - x0);
    expect(Math.abs(r.lean)).toBeGreaterThan(0.4);
    const x1 = r.x;
    hold(fast, { throttle: true, right: true }, 0.25);
    expect(Math.abs(r.x - x1)).toBeGreaterThan(early);

    // and held at full lean it goes down
    hold(fast, { throttle: true, right: true }, 2);
    expect(fast.events).toContainEqual(expect.objectContaining({ kind: "crash", rider: 0, cause: "lowside" }));
  });

  it("has no gears: the rev counter climbs with speed alone, and the build-up takes it to the top (R4)", () => {
    const cap = 80;
    let last = 0;
    for (let speed = 0; speed <= cap; speed += 4) {
      const n = revs(speed, cap, 0);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(revs(cap, cap, 0)).toBeLessThan(revs(cap, cap, 1));
    expect(revs(cap * 2, cap, 1)).toBeCloseTo(0.95, 9);
  });

  it("carries every action a player has, keys and touch alike, through the wire and back (R15)", () => {
    const keys: (keyof Input)[] = ["throttle", "brake", "left", "right", "hand", "foot", "off"];
    expect(Object.keys(NO_INPUT).sort()).toEqual([...keys].sort());
    for (let n = 0; n < 1 << keys.length; n++) {
      const input = Object.fromEntries(keys.map((k, i) => [k, (n & (1 << i)) !== 0])) as Input;
      expect(unpackInput(packInput(input))).toEqual(input);
    }
  });
});

describe("combat", () => {
  it("aims at the closest rider in reach, and at no one out of it (C1)", () => {
    const race = alone(3);
    Object.assign(rider(race, 0), { z: 500, x: 0 });
    Object.assign(rider(race, 1), { z: 503, x: 1 });
    Object.assign(rider(race, 2), { z: 501, x: -1.2 });
    expect(nearest(race, rider(race, 0))?.id).toBe(2);
    Object.assign(rider(race, 1), { z: 509 });
    Object.assign(rider(race, 2), { z: 500, x: 5.5 });
    expect(nearest(race, rider(race, 0))).toBeNull();
  });

  it("turns the hand into a backhand at a rider behind, and lands it (C3)", () => {
    const race = alone(2);
    const [a, b] = [rider(race, 0), rider(race, 1)];
    Object.assign(a, { z: 500, x: 0, speed: 30 });
    Object.assign(b, { z: 498.6, x: 1, speed: 30 });
    beginAttack(race, a, "hand");
    expect(a.attack?.kind).toBe("backhand");
    hold(race, {}, 0.5);
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "hit", by: 0, on: 1, move: "backhand" }));
  });

  it("is worth a kick with a car in the far lane, and the kicked rider meets it (K8)", () => {
    const race = alone(2);
    const [a, b] = [rider(race, 0), rider(race, 1)];
    Object.assign(a, { z: 500, x: 0.5, speed: 30 });
    Object.assign(b, { z: 500, x: -1, speed: 30 });
    expect(kickPays(race, a, b)).toBe(false);
    // 25 m out: inside the second of road a rider reads before kicking, and far
    // enough that the throw has carried the foe across before the car arrives
    race.cars = [{ id: 1, kind: "sedan", z: 525, x: -5.25, lane: -5.25, dir: -1, speed: 30, changeT: 99 }];
    expect(kickPays(race, a, b)).toBe(true);
    beginAttack(race, a, "foot");
    hold(race, {}, 1.5);
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "crash", rider: 1, cause: "headOn" }));
  });
});

describe("meters and crashes", () => {
  it("wrecks a bike whose damage runs out, and the race is over for its rider (M4)", () => {
    const race = alone();
    const r = rider(race);
    r.damage = TUNE.crashDamage.lowside;
    lowside(race);
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "wrecked", rider: 0 }));
    expect(r.phase).toBe("wrecked");
    hold(race, { throttle: true }, 5);
    expect(r.phase).toBe("wrecked");
  });

  it("leaves a thrown rider lying in the road, then has them run back and ride on (K4)", () => {
    const race = alone();
    const r = rider(race);
    lowside(race);
    expect(r.phase).toBe("thrown");
    let lay = 0;
    let ran = false;
    for (let i = 0; i < 60 * 15 && r.phase !== "riding"; i++) {
      if (r.phase === "thrown" && r.air <= 0) lay += DT;
      hold(race, {}, DT);
      if (r.phase === "running") ran = true;
    }
    expect(lay).toBeGreaterThanOrEqual(TUNE.lieTime - DT);
    expect(ran).toBe(true);
    expect(r.phase).toBe("riding");
  });

  it("jolts a bike ridden over a fallen one, and says so (K11)", () => {
    const race = alone(2);
    const [a, b] = [rider(race, 0), rider(race, 1)];
    Object.assign(b, { phase: "running", z: 300, x: 8, bikeZ: 520, bikeX: 0, bikeSpeed: 0 });
    Object.assign(a, { z: 510, x: 0, speed: 40 });
    hold(race, { throttle: true }, 0.6);
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "runOver", by: 0, on: 1, what: "bike" }));
  });
});

/** A canvas that records every word it is asked to write, and draws nothing. */
function recorder(): { ctx: CanvasRenderingContext2D; said: string[] } {
  const said: string[] = [];
  const noop = (): void => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy(
    {},
    {
      get: (_, k) => {
        if (k === "fillText") return (s: string) => said.push(s);
        if (k === "measureText") return (s: string) => ({ width: s.length * 8 });
        if (k === "createLinearGradient" || k === "createRadialGradient") return () => gradient;
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, said };
}

describe("the instrument panel", () => {
  const readout: Readout = { name: "Ana", kmh: 212, rpm: 0.6, position: 4, km: 1.23, damage: 0.5, stamina: 0.8, opponent: { name: "Hank Rivet", stamina: 0.3, gap: 12 } };

  it("shows position, odometer, both names and the closest opponent's distance, and no race clock (H1, T3)", () => {
    const { ctx, said } = recorder();
    drawDash(ctx, 1920, 1080, readout);
    expect(said).toEqual(expect.arrayContaining(["4", "01.2", "Ana", "Hank Rivet", "↑0.012", "km/h", "RPM x 1000"]));
    expect(said.some((s) => /\d:\d\d/.test(s))).toBe(false);
  });

  it("names no opponent when no one is in reach, and draws the same panel on a phone (V6)", () => {
    const { ctx, said } = recorder();
    drawDash(ctx, 390, 844, { ...readout, opponent: null });
    expect(said).toEqual(expect.arrayContaining(["4", "01.2", "Ana"]));
    expect(said).not.toContain("Hank Rivet");
  });
});

describe("the dashboard away (H2)", () => {
  it("draws nothing at all once F10 has put it away, and leaves the camera nothing to look over", () => {
    const readout: Readout = { name: "Ana", kmh: 212, rpm: 0.6, position: 4, km: 1.23, damage: 0.5, stamina: 0.8, opponent: null };
    const shown = recorder();
    expect(drawDash(shown.ctx, 1920, 1080, readout)).toBeGreaterThan(0);
    const away = recorder();
    expect(drawDash(away.ctx, 1920, 1080, { ...readout, hidden: true })).toBe(0);
    expect(away.said).toEqual([]);
  });
});

describe("slippery patches (R9)", () => {
  /** One rider at 95% of top speed heading over a single patch on a straight. */
  function over(kind: "oil" | "mud" | "ice" | null, steer: boolean): { drift: number; lost: number; phase: string } {
    const race = alone();
    race.track = { ...race.track, slicks: kind ? [{ z: 1000, x: 0, length: 12, half: 1.5, kind }] : [] };
    const r = rider(race);
    Object.assign(r, { z: 900, x: 0.3, vx: 0.4, speed: topSpeed(r) * 0.95 });
    const v0 = r.speed;
    let drift = 0;
    while (r.z < 1080 && r.phase === "riding") {
      hold(race, { throttle: true, left: steer && r.x > 0.2, right: steer && r.x < -0.2 }, DT);
      if (r.z > 1000) drift = Math.max(drift, Math.abs(r.x));
    }
    return { drift, lost: (v0 - r.speed) / KMH, phase: r.phase };
  }

  it("throws the bike sideways the way it was going, and steering only half wins it back", () => {
    const dry = over(null, false);
    expect(dry.drift).toBeLessThan(0.6);
    for (const kind of ["oil", "ice"] as const) {
      const still = over(kind, false);
      const fight = over(kind, true);
      expect(still.drift).toBeGreaterThan(2);
      expect(fight.drift).toBeGreaterThan(1);
      expect(fight.drift).toBeLessThan(still.drift);
      expect(still.phase).toBe("riding");
    }
    // mud grips more than oil or ice
    expect(over("mud", false).drift).toBeLessThan(over("oil", false).drift);
  });

  it("puts a dozen patches on every road, by its seed, in a lane, oil in town, ice in the mountains", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const a = makeTrack(1, road);
      expect(makeTrack(1, road).slicks).toEqual(a.slicks);
      expect(a.slicks.length).toBeGreaterThanOrEqual(8);
      for (const s of a.slicks) {
        expect(s.z).toBeGreaterThanOrEqual(300);
        expect(Math.abs(s.x) + s.half).toBeLessThan(7.5);
      }
      expect(slickAt(a, a.slicks[0].z + 1, a.slicks[0].x)).toBe(a.slicks[0]);
      expect(slickAt(a, a.slicks[0].z - 1, a.slicks[0].x)).toBeNull();
    }
    expect(makeTrack(1, 3).slicks.some((s) => s.kind === "oil")).toBe(true);
    expect(makeTrack(1, 0).slicks.some((s) => s.kind === "ice")).toBe(true);
  });
});

describe("crests (R10)", () => {
  /** A rider holding a share of top speed over Orchard Valley's first hump; `air` keys are held only once off the ground. */
  function hump(frac: number, air: Partial<Input> = {}) {
    const race = startRace({ ...makeTrack(1, 2), scenery: [], slicks: [] }, 1, [{ id: 0, name: "h", human: true }], 1);
    race.cars = [];
    race.riders = race.riders.filter((r) => r.human);
    const r = rider(race);
    const want = topSpeed(r) * frac;
    Object.assign(r, { z: 2600, x: 3.5, speed: want });
    let peak = 0;
    let airborne = 0;
    let xUp = 0;
    let xDown = 0;
    while (r.z < 3100) {
      const was = r.air > 0;
      hold(race, { throttle: r.speed < want, ...(was ? air : {}) }, DT);
      if (r.air > 0 && !was && xDown === 0) xUp = r.x;
      if (was && r.air <= 0 && xDown === 0) xDown = r.x;
      if (r.air > 0) airborne += DT;
      peak = Math.max(peak, r.air);
    }
    return { peak, airborne, phase: r.phase, drift: xDown - xUp };
  }

  it("throws a bike flat out into the air over a hump, lands it riding, and keeps a slower one on the road", () => {
    const fast = hump(1);
    expect(fast.peak).toBeGreaterThan(2);
    expect(fast.airborne).toBeGreaterThan(1);
    expect(fast.phase).toBe("riding");
    expect(hump(0.6).peak).toBeLessThan(0.05);
  });

  it("does not steer in the air: the bike carries on as it left", () => {
    expect(Math.abs(hump(1, { left: true }).drift - hump(1).drift)).toBeLessThan(0.05);
  });
});

describe("traffic cones (R11)", () => {
  function cones(frac: number, x = 0) {
    const race = alone();
    race.track = { ...race.track, cones: [{ z: 1000, x: 0 }, { z: 1002.5, x: 0 }, { z: 1005, x: 0 }] };
    const r = rider(race);
    Object.assign(r, { z: 980, x, speed: topSpeed(r) * frac });
    let peak = 0;
    while (r.z < 1100) {
      hold(race, { throttle: true }, DT);
      peak = Math.max(peak, r.air);
    }
    return { peak, phase: r.phase, bumps: race.events.filter((e) => e.kind === "bump" && e.with === "cone").length };
  }

  it("throws a bike that rides over one into the air, higher the faster, and it lands riding", () => {
    const slow = cones(0.3);
    const fast = cones(1);
    expect(slow.peak).toBeGreaterThan(0.2);
    expect(fast.peak).toBeGreaterThan(slow.peak);
    expect(fast.phase).toBe("riding");
    // the first cone launches it, and it flies over the rest of the line
    expect(fast.bumps).toBe(1);
    // a bike beside the line never leaves the road
    expect(cones(1, 1.5).peak).toBe(0);
  });

  it("stands a line of cones across a lane on every road, in the same place every race", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const a = makeTrack(1, road);
      expect(makeTrack(1, road).cones).toEqual(a.cones);
      expect(a.cones.length).toBeGreaterThanOrEqual(15);
      for (const c of a.cones) expect(Math.abs(c.x)).toBeLessThan(ROAD_HALF - 1);
    }
  });
});

describe("getting off on purpose (M3)", () => {
  it("lets a rider near a stop get off, the bike stood beside them, and walk back on with stamina full", () => {
    const race = alone();
    const r = rider(race);
    Object.assign(r, { z: 500, x: 2, speed: 3, stamina: 30 });
    hold(race, { off: true }, DT);
    expect(r.phase).toBe("running");
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "dismount", rider: 0 }));
    expect(Math.abs(r.bikeX - r.x)).toBeGreaterThan(2);
    // standing there while the key is held
    hold(race, { off: true }, 1);
    expect(r.phase).toBe("running");
    // back to it by the run, as after a fall (M2), and stamina full (C8)
    for (let i = 0; i < 600 && r.phase !== "riding"; i++) hold(race, { left: true }, DT);
    expect(r.phase).toBe("riding");
    expect(r.stamina).toBe(100);
  });

  it("does nothing at speed", () => {
    const race = alone();
    const r = rider(race);
    Object.assign(r, { z: 500, x: 0, speed: 20 });
    hold(race, { off: true, throttle: true }, 0.5);
    expect(r.phase).toBe("riding");
  });
});

describe("cross traffic (T5)", () => {
  it("waits at the same side roads on every road at every level, none at level 1 and one at every side road from level 4", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const low = makeTrack(1, road);
      expect(low.crossings.length, `road ${road}`).toBeGreaterThan(0);
      for (const level of [1, 2, 3, 4, 5]) {
        const t = makeTrack(level, road);
        // higher levels run further down the same road, past the same side roads
        expect(t.crossings.slice(0, low.crossings.length - 1)).toEqual(low.crossings.slice(0, -1));
        for (const z of t.crossings) expect(["town", "valley", "alpine"]).toContain(biomeAt(t, z));
        const waiting = startRace(t, level, [{ id: 0, name: "h", human: true }], 1).cars.filter((c) => c.cross);
        if (level === 1) expect(waiting).toEqual([]);
        if (level >= 4) expect(waiting.map((c) => c.z)).toEqual(t.crossings);
      }
    }
  });

  it("pulls across as a rider comes up, and takes down one who rides on into it, but not one who brakes", () => {
    function meet(brake: boolean) {
      const race = alone();
      race.track = { ...race.track, crossings: [1000] };
      race.cars = [{ id: 1, kind: "sedan", z: 1000, x: -TUNE.crossWait, lane: -TUNE.crossWait, dir: 1, speed: 11, changeT: 0, cross: true }];
      const r = rider(race);
      Object.assign(r, { z: 600, x: 0, speed: topSpeed(r) * 0.9 });
      while (r.z < 1050 && r.phase === "riding" && race.t < 60) hold(race, brake && r.z > 780 ? { brake: true } : { throttle: true }, DT);
      return { r, car: race.cars[0], race };
    }
    const on = meet(false);
    expect(on.car.lane).toBe(TUNE.crossWait);
    expect(on.race.events).toContainEqual(expect.objectContaining({ kind: "crash", rider: 0, cause: "broadside" }));
    const stopped = meet(true);
    expect(stopped.r.phase).toBe("riding");
    expect(stopped.car.x).toBe(TUNE.crossWait);
  });
});

describe("people on foot (T6, H3)", () => {
  it("puts a flagger in front of the grid who waves it off and can be run over, and pedestrians in town and at the side roads", () => {
    for (let road = 0; road < ROADS.length; road++) {
      const t = makeTrack(1, road);
      const race = startRace(t, 1, Array.from({ length: 15 }, (_, i) => ({ id: i, name: `r${i}`, human: false })), 1, 3);
      const flagger = race.walkers.find((w) => w.kind === "flagger")!;
      const front = Math.max(...race.riders.filter((r) => !r.cop).map((r) => r.z));
      expect(flagger.z - front).toBeGreaterThan(3);
      expect(walkerAt(flagger, -1).state).toBe("flag");
      expect(race.walkers.filter((w) => w.kind === "crosser").length).toBeGreaterThanOrEqual(2 * t.crossings.length);
    }
    // ridden straight up the middle off the line, the flagger goes flying
    const race = startRace({ ...straight, scenery: [], slicks: [], cones: [], crossings: [] }, 1, [{ id: 0, name: "h", human: true }], 1, 3);
    race.cars = [];
    race.riders = race.riders.filter((r) => r.human);
    Object.assign(rider(race), { x: 0 });
    hold(race, {}, 3);
    hold(race, { throttle: true }, 3);
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "runOver", by: 0, what: "walker" }));
    expect(rider(race).phase).toBe("riding");
  });

  it("is a ramp: a bike that rides into someone throws them flying, goes up over them and lands riding (R11)", () => {
    const race = alone();
    race.walkers = [{ id: 9001, kind: "crosser", z: 1000, x: 0, span: 0.001, wait: 1000, phase: 0, look: 0, down: -1, hitSpeed: 0, side: 1 }];
    const r = rider(race);
    Object.assign(r, { z: 900, x: 0, speed: topSpeed(r) * 0.9 });
    let peak = 0;
    while (r.z < 1100) {
      hold(race, { throttle: true }, DT);
      peak = Math.max(peak, r.air);
    }
    expect(race.walkers[0].down).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(0.3);
    expect(r.phase).toBe("riding");
    const p = walkerAt(race.walkers[0], race.walkers[0].down + 0.3);
    expect(p.state).toBe("thrown");
    expect(p.z).toBeGreaterThan(1005);
  });
});

describe("police roadblocks (P5)", () => {
  function through(x: number) {
    const race = alone();
    race.track = { ...race.track, roadblocks: [{ z: 1000, gap: 1.1, mound: 1.8 }] };
    const r = rider(race);
    Object.assign(r, { z: 900, x, speed: topSpeed(r) * 0.95 });
    let peak = 0;
    while (r.z < 1100 && r.phase === "riding") {
      hold(race, { throttle: true }, DT);
      peak = Math.max(peak, r.air);
    }
    return { phase: r.phase, peak, z: r.z };
  }

  it("is passed exactly on the centre line or over a sand mound, and stops anything else at the barrier", () => {
    expect(through(0).phase).toBe("riding");
    for (const x of [6.2, -6.2]) {
      const over = through(x);
      expect(over.phase).toBe("riding");
      expect(over.peak).toBeGreaterThan(1.1);
    }
    for (const x of [0.6, 3.5, -3.5]) expect(through(x).phase).toBe("thrown");
  });

  it("stands one on every road from level 4 and none below, on a straight, with no car driving through it", () => {
    for (let road = 0; road < ROADS.length; road++) {
      expect(makeTrack(3, road).roadblocks).toEqual([]);
      const t = makeTrack(4, road);
      expect(t.roadblocks).toHaveLength(1);
      const b = t.roadblocks[0];
      expect(t.cones.every((c) => Math.abs(c.z - b.z) > 100)).toBe(true);
      const race = startRace(t, 4, [{ id: 0, name: "h", human: true }], 3);
      for (let i = 0; i < 90 / DT; i++) {
        step(race, new Map());
        for (const c of race.cars) expect(Math.abs(c.z - b.z), `road ${road}`).toBeGreaterThanOrEqual(150);
      }
    }
  });
});
