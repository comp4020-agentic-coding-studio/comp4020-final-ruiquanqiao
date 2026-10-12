import { describe, expect, it } from "vitest";
import { LIVERIES, liveryOf } from "../game/liveries.ts";
import { CHECK_WAIT, LOAD_MAX, LOAD_MIN, ROOM, type Standing, type ToClient } from "../game/protocol.ts";
import { type Conn, Lobby } from "../server/lobby.ts";
import { TUNE } from "../game/sim.ts";

// The two matchmaking pools (ledger N2, N3, N4, N5), driven by a fake clock.

type Fake = Conn & { inbox: ToClient[] };

function conn(rider: number, name = `r${rider}`): Fake {
  const inbox: ToClient[] = [];
  return { rider, name, inbox, send: (m) => inbox.push(m), pool: null, level: 1, road: 0, race: null, local: -1, seq: 0 };
}

function lobby() {
  const finished: Standing[][] = [];
  let races = 0;
  const l = new Lobby(
    {
      startRace: () => ++races,
      finishRace: (_r, _l, _t, s) => void finished.push(s),
      qualified: () => [],
    },
    () => {},
    () => 0.5,
  );
  return { l, finished };
}

/** Everyone matched accepts and loads at once; the race starts LOAD_MIN later, which is returned. */
function go(l: Lobby, now: number): number {
  l.tick(now);
  for (const m of l.matches.values()) for (const c of m.members) l.accept(c, now);
  for (const m of l.matches.values()) for (const c of m.members) l.progress(c, 1);
  l.tick(now + LOAD_MIN);
  return now + LOAD_MIN;
}

const started = (c: Fake) => c.inbox.filter((m) => m.t === "start") as Extract<ToClient, { t: "start" }>[];

describe("the AI pool", () => {
  it("takes everyone who joins in the five seconds after the first, and fills the grid to fifteen", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "ai", 1, 0);
    l.join(b, "ai", 1, 3);
    l.tick(4.99);
    expect(l.races.size).toBe(0);
    go(l, 5);
    expect(l.races.size).toBe(1);
    const race = [...l.races.values()][0];
    expect(race.entrants).toHaveLength(15);
    expect(race.entrants.filter((e) => e.human)).toHaveLength(2);
    expect(started(a).at(-1)?.you).toBe(0);
    expect(started(b).at(-1)?.you).toBe(1);
  });

  it("does not restart the five seconds when someone else joins", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    l.join(conn(2), "ai", 1, 4.5);
    go(l, 5);
    expect(l.races.size).toBe(1);
  });

  it("starts a race for one rider alone", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    go(l, 5);
    expect([...l.races.values()][0].entrants.filter((e) => e.human)).toHaveLength(1);
  });

  it("lets someone who joins after the start watch the race instead", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    go(l, 5);
    const late = conn(3);
    l.join(late, "ai", 1, 7.2);
    expect(started(late).at(-1)?.you).toBeNull();
    expect(late.pool).toBe("ai");
    for (let now = 7.2; now < 8; now += 1 / 60) l.tick(now);
    expect(late.inbox.some((m) => m.t === "snap")).toBe(true);
  });

  it("takes riders out of the pool once their race starts", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    go(l, 5);
    expect(a.pool).toBeNull();
    expect(l.pools.ai.members).toHaveLength(0);
  });
});

describe("the humans-only pool", () => {
  it("keeps one rider waiting past ten seconds, and never fills with AI", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "human", 1, 0);
    l.tick(10);
    l.tick(60);
    expect(l.races.size).toBe(0);
    const last = a.inbox.filter((m) => m.t === "pool").at(-1) as Extract<ToClient, { t: "pool" }>;
    expect(last.waitingForMore).toBe(true);
  });

  it("restarts the ten seconds for each newcomer, then races only the humans", () => {
    const { l } = lobby();
    l.join(conn(1), "human", 1, 0);
    l.tick(10);
    l.join(conn(2), "human", 1, 20);
    l.join(conn(3), "human", 1, 25);
    l.tick(34.9);
    expect(l.races.size).toBe(0);
    go(l, 35);
    const race = [...l.races.values()][0];
    expect(race.entrants).toHaveLength(3);
    expect(race.entrants.every((e) => e.human)).toBe(true);
  });
});

describe("the race a pool starts", () => {
  it("is run at the level most riders voted for", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 3, 0);
    l.join(conn(2), "ai", 3, 1);
    l.join(conn(3), "ai", 1, 2);
    go(l, 5);
    expect([...l.races.values()][0].level).toBe(3);
  });

  it("gives two tabs of one rider two bikes with names told apart", () => {
    const { l } = lobby();
    l.join(conn(7, "Mika"), "ai", 1, 0);
    l.join(conn(7, "Mika"), "ai", 1, 1);
    go(l, 5);
    const names = [...l.races.values()][0].entrants.filter((e) => e.human).map((e) => e.name);
    expect(names).toEqual(["Mika", "Mika (2)"]);
  });

  it("ends, with every rider placed, once its only human leaves", () => {
    const { l, finished } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    go(l, 5);
    l.disconnect(a, 8);
    l.tick(8.1);
    expect(l.races.size).toBe(0);
    expect(finished[0]).toHaveLength(15);
    expect(finished[0].find((s) => s.human)?.outcome).toBe("quit");
  });

  it("lets a rider leave mid-race with the tab still open, races on for the rest, and lets them queue again (H8)", () => {
    const { l, finished } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    go(l, 11);
    const live = [...l.races.values()][0];
    l.quit(a);
    expect(a.race).toBeNull();
    l.tick(13.5);
    // still on the road for the one who stayed, and nothing more sent to the one who left
    expect(l.races.size).toBe(1);
    expect(live.race.riders.find((r) => r.id === a.local)?.phase).toBe("wrecked");
    const snaps = a.inbox.filter((m) => m.t === "snap").length;
    l.tick(14);
    expect(a.inbox.filter((m) => m.t === "snap").length).toBe(snaps);
    // free to queue for another race straight away
    l.join(a, "ai", 1, 14);
    expect(a.pool).toBe("ai");
    l.disconnect(b, 15);
    l.tick(15.1);
    expect(finished[0].find((s) => s.name === "r1")?.outcome).toBe("quit");
  });
});

describe("choosing how many AI riders (N2)", () => {
  it("races as many as asked for, alone", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0, 0, 4);
    go(l, 5);
    const race = [...l.races.values()][0];
    expect(race.entrants.filter((e) => !e.human)).toHaveLength(4);
  });

  it("takes the median of what the pool asked for, up to the most allowed", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0, 0, 0);
    l.join(conn(2), "ai", 1, 1, 0, 20);
    l.join(conn(3), "ai", 1, 2, 0, 500);
    go(l, 5);
    const race = [...l.races.values()][0];
    expect(race.entrants.filter((e) => !e.human)).toHaveLength(20);
  });

  it("can race a human alone against nobody", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0, 0, 0);
    go(l, 5);
    expect([...l.races.values()][0].entrants).toHaveLength(1);
  });
});

// Leathers. One's own rider used to be drawn in a fixed set of colours in
// one's own view only; then each person picked a livery, and two could pick
// the same. Now the room deals them, one each, and the pair travels in the
// entry list every rider in the race is sent.
describe("each person's leathers", () => {
  it("are dealt by the room, never the same twice among its people, and the same in everyone's entry list", () => {
    const { l } = lobby();
    const people = Array.from({ length: ROOM }, (_, i) => conn(i + 1));
    people.forEach((c, i) => l.join(c, "human", 1, i * 0.1));
    go(l, 20);
    const lists = people.map((c) => started(c).at(-1)!.entrants.filter((e) => e.human).map((e) => [e.name, e.look]));
    for (const list of lists) expect(list).toEqual(lists[0]);
    const looks = lists[0].map(([, look]) => look as number);
    expect(new Set(looks).size).toBe(ROOM);
    for (const look of looks) expect(LIVERIES[look]).toBeDefined();
  });

  it("come from a set of at least eight, with the two that vanished on the road cut", () => {
    expect(LIVERIES.length).toBeGreaterThanOrEqual(ROOM);
    const names = LIVERIES.map((l) => l.name);
    expect(names).not.toContain("Black & acid");
    expect(names).not.toContain("Orange & red");
  });

  it("are not taken from the queue message, whatever it says", () => {
    const { l } = lobby();
    const a = conn(1);
    (l.join as (...args: unknown[]) => void)(a, "ai", 1, 0, 0, 0, 99);
    go(l, 6);
    expect(LIVERIES[started(a).at(-1)!.entrants.find((e) => e.human)!.look!]).toBeDefined();
  });

  it("still validates a number from anywhere as a livery or nothing", () => {
    for (const nothing of [null, undefined, "", 99, -1]) expect(liveryOf(nothing)).toBeUndefined();
    expect(liveryOf("0")).toBe(0);
  });
});

describe("a room (N1)", () => {
  it("holds at most eight people; the ninth waits for the next room", () => {
    const { l } = lobby();
    const people = Array.from({ length: ROOM + 1 }, (_, i) => conn(i + 1));
    people.forEach((c, i) => l.join(c, "ai", 1, i * 0.1));
    go(l, 1);
    expect(l.races.size).toBe(1);
    expect([...l.races.values()][0].entrants.filter((e) => e.human)).toHaveLength(ROOM);
    expect(people[ROOM].pool).toBe("ai");
    expect(started(people[ROOM]).every((m) => m.you === null)).toBe(true);
  });
});

const of = <T extends ToClient["t"]>(c: Fake, t: T) => c.inbox.filter((m) => m.t === t) as Extract<ToClient, { t: T }>[];

describe("a match found (N9)", () => {
  it("asks everyone in a room to accept, and starts loading only once all have", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    l.tick(11);
    for (const c of [a, b]) expect(of(c, "found").at(-1)).toMatchObject({ of: 2, answer: CHECK_WAIT });
    expect(l.races.size).toBe(0);
    l.accept(a, 12);
    expect(of(b, "check").at(-1)).toMatchObject({ accepted: 1, of: 2 });
    expect(of(a, "loading")).toHaveLength(0);
    l.accept(b, 13);
    for (const c of [a, b]) expect(of(c, "loading")).toHaveLength(1);
  });

  it("sends whoever declines back to the board, and everyone else back to the front of the pool", () => {
    const { l } = lobby();
    const [a, b, c] = [conn(1), conn(2), conn(3)];
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    l.join(c, "human", 1, 2);
    l.tick(12);
    l.accept(a, 12.5);
    l.decline(b, 13);
    expect(of(b, "dropped").at(-1)?.why).toBe("declined");
    expect(b.pool).toBeNull();
    expect(b.match).toBeNull();
    for (const x of [a, c]) {
      expect(of(x, "requeued")).toHaveLength(1);
      expect(x.pool).toBe("human");
    }
    expect(l.pools.human.members.slice(0, 2)).toEqual([a, c]);
    // and the two of them are matched again when the pool's wait runs out
    l.tick(23);
    expect(of(a, "found")).toHaveLength(2);
  });

  it("drops whoever has not answered in ten seconds", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    l.tick(11);
    l.accept(a, 12);
    l.tick(11 + CHECK_WAIT);
    expect(of(b, "dropped").at(-1)?.why).toBe("missed");
    expect(of(a, "requeued")).toHaveLength(1);
    expect(l.races.size).toBe(0);
  });

  it("asks even one person alone in an NPC race", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    l.tick(5);
    expect(of(a, "found")).toHaveLength(1);
    expect(l.races.size).toBe(0);
    l.tick(5 + CHECK_WAIT);
    expect(of(a, "dropped").at(-1)?.why).toBe("missed");
    expect(l.races.size).toBe(0);
  });
});

describe("loading a race (N10)", () => {
  function loading() {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    l.tick(11);
    l.accept(a, 11);
    l.accept(b, 11);
    return { l, a, b };
  }

  it("starts the race once everyone has loaded, and not before the loading screen has been seen", () => {
    const { l, a, b } = loading();
    l.progress(a, 1);
    l.progress(b, 0.5);
    l.tick(16);
    expect(l.races.size).toBe(0);
    l.progress(b, 1);
    l.tick(16.1);
    expect(l.races.size).toBe(1);

    const quick = loading();
    quick.l.progress(quick.a, 1);
    quick.l.progress(quick.b, 1);
    quick.l.tick(11 + LOAD_MIN - 0.1);
    expect(quick.l.races.size).toBe(0);
    quick.l.tick(11 + LOAD_MIN);
    expect(quick.l.races.size).toBe(1);
  });

  it("does not let one slow browser hold the room past twenty seconds", () => {
    const { l, a, b } = loading();
    l.progress(a, 1);
    l.tick(11 + LOAD_MAX - 0.1);
    expect(l.races.size).toBe(0);
    l.tick(11 + LOAD_MAX);
    expect(l.races.size).toBe(1);
    // the slow one still has a bike, and gets the start when it arrives
    expect(started(b).at(-1)?.you).toBe(1);
  });

  it("tells everyone how everyone is loading, with each person's ping", () => {
    const { l, a, b } = loading();
    const ping = of(a, "ping").at(-1)!;
    l.pong(a, ping.at, ping.at + 0.08);
    l.pong(b, ping.at, ping.at + 0.3);
    l.progress(a, 0.6);
    l.tick(12);
    expect(of(b, "loads").at(-1)?.riders).toEqual([
      { id: 0, p: 0.6, ping: 80 },
      { id: 1, p: 0, ping: 300 },
    ]);
  });

  it("takes the shortest round trip seen, not an average a busy page has made late", () => {
    const { l, a } = loading();
    l.pong(a, 0, 0.3);
    l.pong(a, 1, 1.05);
    l.pong(a, 2, 2.4);
    expect(a.rtt).toBeCloseTo(0.05, 6);
  });

  it("shortens each person's countdown by half their round trip, so GO lands at the same moment for everyone", () => {
    const { l, a, b } = loading();
    const ping = of(a, "ping").at(-1)!;
    l.pong(a, ping.at, ping.at + 0.2);
    l.pong(b, ping.at, ping.at + 0.04);
    l.progress(a, 1);
    l.progress(b, 1);
    l.tick(11 + LOAD_MIN);
    const [sa, sb] = [started(a).at(-1)!, started(b).at(-1)!];
    expect(sa.countdown).toBeCloseTo(TUNE.countdown - 0.1, 6);
    expect(sb.countdown).toBeCloseTo(TUNE.countdown - 0.02, 6);
    // each arrives half a round trip after it is sent: both reach zero together
    expect(0.1 + sa.countdown!).toBeCloseTo(0.02 + sb.countdown!, 6);
  });
});
