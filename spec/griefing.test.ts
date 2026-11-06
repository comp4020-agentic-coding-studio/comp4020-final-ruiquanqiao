import { describe, expect, it } from "vitest";
import { IDLE_OUT, LOAD_MIN, MIN_FIELD, type Standing, type ToClient } from "../game/protocol.ts";
import { TUNE, packInput, NO_INPUT } from "../game/sim.ts";
import { type Conn, Lobby } from "../server/lobby.ts";

// Players the race is not built for (ledger G1-G3). A shared race is only as
// good as its worst-behaved person, and a public URL at a showcase will get
// every one of these within the hour.

type Fake = Conn & { inbox: ToClient[] };
const conn = (rider: number, name = `r${rider}`): Fake => {
  const inbox: ToClient[] = [];
  return { rider, name, inbox, send: (m) => inbox.push(m), pool: null, level: 1, road: 0, race: null, local: -1, seq: 0 };
};
function lobby() {
  const finished: Standing[][] = [];
  const lines: Record<string, unknown>[] = [];
  const l = new Lobby({ startRace: () => 1, finishRace: (_r, _l, _t, s) => void finished.push(s), qualified: () => [] }, (e) => void lines.push(e), () => 0.5);
  return { l, finished, lines };
}
function start(l: Lobby, cs: Fake[], ai?: number): number {
  cs.forEach((c, i) => l.join(c, "ai", 1, i * 0.01, 0, ai));
  l.tick(5.1);
  for (const m of l.matches.values()) for (const c of m.members) l.accept(c, 5.1);
  for (const m of l.matches.values()) for (const c of m.members) l.progress(c, 1);
  l.tick(5.1 + LOAD_MIN);
  return 5.1 + LOAD_MIN;
}
/** run the server clock on from `from` for `secs`, a step at a time */
function ride(l: Lobby, from: number, secs: number): number {
  let t = from;
  for (const end = from + secs; t < end; t += 1 / 30) l.tick(t);
  return t;
}
const throttle = (l: Lobby, c: Fake, seq: number) => l.input(c, seq, packInput({ ...NO_INPUT, throttle: true }));

describe("someone who rides nowhere (G1)", () => {
  it("is taken out after 45 s with no progress down the road, and the race goes on for everyone else", () => {
    expect(IDLE_OUT).toBe(45);
    const { l, finished, lines } = lobby();
    const [a, b] = [conn(1), conn(2)];
    let t = start(l, [a, b]);
    throttle(l, b, 1);
    const live = [...l.races.values()][0];
    t = ride(l, t, TUNE.countdown + IDLE_OUT + 2);
    expect(live.idle.has(a.local), "the one who never rode is out").toBe(true);
    expect(live.idle.has(b.local), "the one riding is not").toBe(false);
    expect(lines.some((e) => e.ev === "idle")).toBe(true);
    expect(live.ended, "the race goes on for the one still riding").toBe(false);
    l.disconnect(b, t);
    // the one taken out is still connected, watching; the race closes the
    // usual moment after the last person is done
    ride(l, t, 3);
    expect(finished[0].find((s) => s.name === "r1")?.outcome).toBe("idle");
  });

  it("is never taken out for the count, or for being slow: only for getting nowhere", () => {
    const { l } = lobby();
    const a = conn(1);
    let t = start(l, [a]);
    // still at the line at the end of the countdown plus most of the window
    const live = [...l.races.values()][0];
    t = ride(l, t, TUNE.countdown + IDLE_OUT - 5);
    expect(live.race.riders.find((r) => r.id === a.local)?.phase).toBe("riding");
    // then rides on: the clock starts again from wherever they got to
    throttle(l, a, 1);
    t = ride(l, t, TUNE.countdown + 4);
    l.input(a, 2, packInput(NO_INPUT));
    ride(l, t, IDLE_OUT - 10);
    expect(live.race.riders.find((r) => r.id === a.local)?.phase).toBe("riding");
  });
});

describe("a race with nobody to beat (G3)", () => {
  it("scores nothing with fewer than 4 on the grid, and says so", () => {
    expect(MIN_FIELD).toBe(4);
    const { l, finished } = lobby();
    const a = conn(1);
    const t = start(l, [a], 0);
    const live = [...l.races.values()][0];
    expect(live.race.riders.filter((r) => !r.cop)).toHaveLength(1);
    // ride it to the end: the person finished first
    const r = live.race.riders.find((x) => x.id === a.local)!;
    r.phase = "finished";
    r.finishT = 60;
    ride(l, t, TUNE.countdown + 4);
    expect(finished).toHaveLength(0);
    const end = a.inbox.find((m) => m.t === "end") as Extract<ToClient, { t: "end" }>;
    expect(end.unscored).toBe(true);
  });

  it("scores a full grid as before", () => {
    const { l, finished } = lobby();
    const a = conn(1);
    const t = start(l, [a]);
    const live = [...l.races.values()][0];
    expect(live.race.riders.filter((x) => !x.cop).length).toBeGreaterThanOrEqual(MIN_FIELD);
    const r = live.race.riders.find((x) => x.id === a.local)!;
    r.phase = "finished";
    r.finishT = 60;
    ride(l, t, TUNE.countdown + 4);
    expect(finished).toHaveLength(1);
  });

  it("scores two people racing each other with no NPCs at all", () => {
    const { l, finished } = lobby();
    const [a, b] = [conn(1), conn(2)];
    a.field = 0;
    [a, b].forEach((c, i) => l.join(c, "human", 1, i * 0.01));
    l.tick(10.1);
    for (const m of l.matches.values()) for (const c of m.members) l.accept(c, 10.1);
    for (const m of l.matches.values()) for (const c of m.members) l.progress(c, 1);
    const t = 10.1 + LOAD_MIN;
    l.tick(t);
    const live = [...l.races.values()][0];
    expect(live.race.riders.filter((x) => !x.cop)).toHaveLength(2);
    for (const r of live.race.riders.filter((x) => !x.cop)) { r.phase = "finished"; r.finishT = 60; }
    ride(l, t, TUNE.countdown + 4);
    expect(finished).toHaveLength(1);
  });
});
