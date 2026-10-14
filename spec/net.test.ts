import { describe, expect, it } from "vitest";
import { NET, Samples, cleanJump, cleanReport } from "../game/net.ts";
import type { ToClient } from "../game/protocol.ts";
import { type Conn, Lobby } from "../server/lobby.ts";
import { NetWatch, pingLabel } from "../client/netwatch.ts";
import { LOAD_MIN } from "../game/protocol.ts";

// The network while people race (ledger N14): measured at both ends, written
// down one line per person per race, and a spike written down as it happens.

type Fake = Conn & { inbox: ToClient[] };

function conn(rider: number, name: string): Fake {
  const inbox: ToClient[] = [];
  return { rider, name, inbox, send: (m) => inbox.push(m), pool: null, level: 1, road: 0, race: null, local: -1, seq: 0 };
}

const of = <T extends ToClient["t"]>(c: Fake, t: T) => c.inbox.filter((m) => m.t === t) as Extract<ToClient, { t: T }>[];

/** Ana and Ben in a humans-only race, started at the time returned; every log line in `lines`. */
function racing(perf?: () => number) {
  const lines: Record<string, unknown>[] = [];
  const l = new Lobby({ startRace: () => 7, finishRace: () => {}, qualified: () => [] }, (e) => void lines.push(e), () => 0.5, perf);
  const ana = conn(11, "Ana");
  const ben = conn(12, "Ben");
  l.join(ana, "human", 1, 0);
  l.join(ben, "human", 1, 1);
  l.tick(11);
  l.accept(ana, 11);
  l.accept(ben, 11);
  l.progress(ana, 1);
  l.progress(ben, 1);
  l.tick(11 + LOAD_MIN);
  return { l, lines, ana, ben, t: 11 + LOAD_MIN };
}

/** Run the server's clock from `from` to `to` at 120 ticks a second, answering every ping after `rtt(c)` seconds. */
function ride(l: Lobby, people: Fake[], from: number, to: number, rtt: (c: Fake, now: number) => number): void {
  for (let now = from; now < to; now += 1 / 120) {
    l.tick(now);
    for (const c of people) {
      const ping = c.inbox.at(-1);
      if (ping?.t === "ping" && c.race) {
        c.inbox.push({ t: "hello", you: { id: 0, name: "" }, qualified: [] }); // answered: not answered twice
        l.pong(c, ping.at, ping.at + rtt(c, now));
      }
    }
  }
}

describe("the network while racing (N14)", () => {
  it("asks everyone racing for a round trip every second, and keeps every one, not only the shortest", () => {
    const { l, ana, ben, t } = racing();
    ride(l, [ana, ben], t, t + 10.01, (c) => (c === ana ? 0.03 : 0.12));
    const asked = of(ana, "ping").filter((p) => p.at >= t);
    expect(asked.length).toBeGreaterThanOrEqual(10);
    expect(asked.length).toBeLessThanOrEqual(11);
    const live = [...l.races.values()][0];
    expect(live.net.get(ana.local)!.rtt.median()).toBeCloseTo(30, 6);
    expect(live.net.get(ben.local)!.rtt.median()).toBeCloseTo(120, 6);
    // and tells each person their last one, for the corner of the screen
    expect(of(ben, "ping").at(-1)?.rtt).toBe(120);
    // the shortest seen while loading, which times GO, is left as it was
    expect(ana.rtt).toBeUndefined();
  });

  it("writes one line per person when the race ends, by name, with their round trip, jitter and what their browser saw", () => {
    const { l, lines, ana, ben, t } = racing();
    ride(l, [ana, ben], t, t + 6, (c) => (c === ana ? 0.03 : 0.05));
    l.report(ana, { input: 70, gap: 55, stalls: 0, snapped: 1, frame: 17 }, t + 6);
    const live = [...l.races.values()][0];
    live.race.t = live.timeLimit + 1;
    l.tick(t + 6.01);
    l.tick(t + 6.03);
    const net = lines.filter((e) => e.ev === "net");
    expect(net.map((e) => e.who)).toEqual(["Ana#11", "Ben#12"]);
    expect(net[0]).toMatchObject({ race: 7, rtt: 30, jitter: 0, spikes: 0, input: 70, gap: 55, stalls: 0, snapped: 1, frame: 17 });
    expect(net[1]).toMatchObject({ rtt: 50, input: null });
    expect(lines.find((e) => e.ev === "server")).toMatchObject({ race: 7 });
  });

  it("writes a person's line when they leave the race, not only when it ends", () => {
    const { l, lines, ana, ben, t } = racing();
    ride(l, [ana, ben], t, t + 3, () => 0.04);
    l.quit(ana);
    expect(lines.filter((e) => e.ev === "net").map((e) => e.who)).toEqual(["Ana#11"]);
  });

  it("writes a spike down as it happens: a round trip three times the usual and past 150 ms, once per ten seconds", () => {
    const { l, lines, ana, ben, t } = racing();
    // 40 ms for eight seconds, then 600 ms for three: one line, not three
    ride(l, [ana, ben], t, t + 11, (c, now) => (c === ana && now > t + 8 ? 0.6 : 0.04));
    const spikes = lines.filter((e) => e.ev === "lag_spike");
    expect(spikes).toHaveLength(1);
    expect(spikes[0]).toMatchObject({ who: "Ana#11", race: 7, kind: "rtt", ms: 600, usual: 40 });
    const live = [...l.races.values()][0];
    expect(live.net.get(ana.local)!.spikes).toBeGreaterThanOrEqual(2);
    // a merely slow connection, slow from the start, is not a spike
    expect(spikes.some((e) => e.who === "Ben#12")).toBe(false);
  });

  it("writes a stall down when a browser reports snapshots that stopped coming", () => {
    const { l, lines, ana, t } = racing();
    l.report(ana, { input: 90, gap: 400, stalls: 2, snapped: 1, frame: 16 }, t + 5);
    expect(lines.find((e) => e.ev === "lag_spike")).toMatchObject({ who: "Ana#11", kind: "stall", stalls: 2, gap: 400 });
  });

  it("believes a browser's report no further than numbers in range", () => {
    expect(cleanReport({ input: -5, gap: "x", stalls: 1e9, snapped: Number.NaN, frame: 1e12 })).toEqual({ input: null, gap: null, stalls: 1000, snapped: 0, frame: 60_000 });
    // and a report from someone not racing changes nothing
    const { l, lines } = racing();
    l.report(conn(99, "Stranger"), { stalls: 5 }, 20);
    expect(lines.some((e) => e.ev === "lag_spike")).toBe(false);
  });

  it("times its own ticks and steps, and says so when a tick runs over 100 ms late", () => {
    let clock = 0;
    const { l, lines, t } = racing(() => (clock += 0.4));
    l.tick(t + 0.01);
    l.tick(t + 0.3); // a tick 290 ms after the last, due 8 ms after it
    const stall = lines.find((e) => e.ev === "server_stall");
    expect(stall).toMatchObject({ ms: 282, races: 1 });
    expect(l.stepCost.median()).toBeCloseTo(0.4, 6);
  });

  it("writes a big jump down whole, by name, with the round trip, and no more than five a race", () => {
    const { l, lines, ana, ben, t } = racing();
    ride(l, [ana, ben], t, t + 3, () => 0.02);
    const jump = { gap: 22.03, time: 31.05, was: "riding", now: "thrown", mine: [632.1, -10.9, 70.1], server: [610.1, -10.6, 21.0], sinceFrame: 8.4, sinceSnap: 49, events: ["crash:tree"], steps: 1980 };
    l.jump(ana, jump);
    const line = lines.find((e) => e.ev === "big_jump");
    expect(line).toMatchObject({ who: "Ana#11", race: 7, gap: 22.03, was: "riding", now: "thrown", events: ["crash:tree"], rtt: 20 });
    expect(line?.raceNow).toBeTypeOf("number");
    for (let i = 0; i < 9; i++) l.jump(ana, jump);
    expect(lines.filter((e) => e.ev === "big_jump")).toHaveLength(NET.jumpsPerRace);
    // and the person's race line counts them
    l.quit(ana);
    expect(lines.find((e) => e.ev === "net" && e.who === "Ana#11")).toMatchObject({ bigJumps: NET.jumpsPerRace });
  });

  it("believes a jump report no further than numbers in range and short words", () => {
    expect(cleanJump({ gap: "far", time: 1, mine: [0, 0, 0], server: [0, 0, 0] })).toBeNull();
    expect(cleanJump({ gap: 12, time: 1, mine: [0, 0], server: [0, 0, 0] })).toBeNull();
    const j = cleanJump({ gap: 12.3456, time: 1, was: "riding<script>", now: "thrown", mine: [1, 2, 3], server: [4, 5, 6], events: ["crash:tree", 7, "x".repeat(99), "a", "b", "c", "d", "e"], steps: 3.7 })!;
    expect(j).toMatchObject({ gap: 12.35, was: "ridingscript", steps: 4 });
    expect(j.events).toHaveLength(5);
    expect(j.events[1]).toHaveLength(24);
    // and from someone not racing, nothing
    const { l, lines } = racing();
    l.jump(conn(99, "Stranger"), { gap: 12, time: 1, mine: [0, 0, 0], server: [0, 0, 0] });
    expect(lines.some((e) => e.ev === "big_jump")).toBe(false);
  });

  it("shows each person's usual round trip on the live races page", () => {
    const { l, ana, ben, t } = racing();
    ride(l, [ana, ben], t, t + 6, (c) => (c === ana ? 0.03 : 0.2));
    expect(l.rooms()[0].humans.map((h) => h.ping)).toEqual([30, 200]);
  });
});

describe("what a browser sees (N14)", () => {
  it("times a key from going out to the snapshot that acknowledges it, and counts gaps past 250 ms as stalls", () => {
    const w = new NetWatch();
    w.keys(1, 0);
    w.snap(0, 0.05); // not yet
    w.keys(2, 0.06);
    w.snap(2, 0.1); // both
    w.snap(2, 0.15);
    w.snap(2, 0.5); // 350 ms: a stall
    for (let f = 0; f < 300; f++) w.drew(1 / 60);
    expect(w.report(4.9)).toBeNull();
    const r = w.report(5)!;
    expect(r).toEqual({ input: 100, gap: 350, stalls: 1, snapped: 0, frame: 17 });
    // and the next five seconds start from nothing
    expect(w.report(10.1)).toEqual({ input: null, gap: null, stalls: 0, snapped: 0, frame: null });
  });

  it("colours the ping green under 80 ms, amber under 150, red past it", () => {
    expect(pingLabel(null)).toBeNull();
    expect(pingLabel(12)).toEqual({ text: "12 ms", tone: "good" });
    expect(pingLabel(NET.good)?.tone).toBe("fair");
    expect(pingLabel(NET.fair)?.tone).toBe("poor");
  });

  it("reads the quantiles off the last samples only", () => {
    const s = new Samples(4);
    for (const x of [100, 1, 2, 3, 4]) s.add(x);
    expect(s.values()).toEqual([1, 2, 3, 4]);
    expect(s.max()).toBe(4);
    expect(s.median()).toBe(2);
    expect(s.jitter()).toBe(1);
  });
});
