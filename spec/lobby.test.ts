import { describe, expect, it } from "vitest";
import { LIVERIES, liveryOf } from "../game/liveries.ts";
import { CHECK_WAIT, LOAD_MAX, LOAD_MIN, ROOM, SAYINGS, SAY_GAP, type Standing, type ToClient } from "../game/protocol.ts";
import { type Conn, Lobby } from "../server/lobby.ts";
import { TUNE, unpackInput } from "../game/sim.ts";

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

describe("live rooms and spectating (N11)", () => {
  it("lists every race on the road with the people in it, and lets anyone watch one, and stop", () => {
    const { l } = lobby();
    const a = conn(1, "Ana");
    l.join(a, "ai", 1, 0, 0, 3);
    const t = go(l, 5);
    const eye = conn(9);
    l.hello(eye);
    const room = of(eye, "live").at(-1)!.races[0];
    expect(room).toMatchObject({ mode: "ai", level: 1, npcs: 3, watchers: 0 });
    expect(room.humans).toEqual([{ name: "Ana", look: started(a).at(-1)!.entrants[0].look, out: false, ping: null }]);

    l.watch(eye, room.race);
    expect(started(eye).at(-1)).toMatchObject({ race: room.race, you: null });
    for (let now = t; now < t + 1; now += 1 / 60) l.tick(now);
    expect(of(eye, "snap").length).toBeGreaterThan(0);
    expect(l.rooms()[0].watchers).toBe(1);

    l.unwatch(eye);
    const seen = of(eye, "snap").length;
    for (let now = t + 1; now < t + 2; now += 1 / 60) l.tick(now);
    expect(of(eye, "snap").length).toBe(seen);
    expect(l.rooms()[0].watchers).toBe(0);
  });

  it("keeps a spectator watching the race they picked through joining and leaving a queue", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    const t = go(l, 5);
    const id = [...l.races.keys()][0];
    const eye = conn(9);
    l.watch(eye, id);
    l.join(eye, "human", 1, t);
    l.leave(eye, t + 0.1);
    expect(l.races.get(id)!.watchers.has(eye)).toBe(true);
  });

  it("lets no one spectate while they are racing or being matched", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    go(l, 5);
    const id = [...l.races.keys()][0];
    const before = started(a).length;
    l.watch(a, id);
    expect(started(a).length).toBe(before);
  });
});

// The logs are what the crit is narrated from and what is read when the
// deployed app misbehaves: every line has to say who, by name.
describe("the log (who did what)", () => {
  function logged() {
    const lines: Record<string, unknown>[] = [];
    const l = new Lobby({ startRace: () => 1, finishRace: () => {}, qualified: () => [] }, (e) => void lines.push(e), () => 0.5);
    return { l, lines };
  }

  it("names every person in matchmaking and at the start, so two people can be told apart", () => {
    const { l, lines } = logged();
    const ana = conn(11, "Ana");
    const ben = conn(12, "Ben");
    l.join(ana, "human", 1, 0);
    l.join(ben, "human", 1, 1);
    go(l, 11);
    expect(lines.find((e) => e.ev === "queue")).toMatchObject({ who: "Ana#11" });
    expect(lines.filter((e) => e.ev === "accept").map((e) => e.who)).toEqual(["Ana#11", "Ben#12"]);
    expect(lines.find((e) => e.ev === "race_start")).toMatchObject({ riders: { 0: "Ana#11", 1: "Ben#12" } });
  });

  it("writes a race event with every rider by name, and leaves out the ones no person is part of", () => {
    const { l, lines } = logged();
    const ana = conn(11, "Ana");
    l.join(ana, "ai", 1, 0, 0, 3);
    const t = go(l, 5);
    const live = [...l.races.values()][0];
    const npc = live.entrants.find((e) => !e.human)!;
    const other = live.entrants.filter((e) => !e.human)[1];
    live.race.events.push({ t: 1, kind: "hit", by: ana.local, on: npc.id, move: "punch" });
    live.race.events.push({ t: 1, kind: "hit", by: npc.id, on: other.id, move: "kick" });
    for (let now = t; now < t + 0.2; now += 1 / 60) l.tick(now);
    const hits = lines.filter((e) => e.ev === "hit");
    expect(hits).toEqual([{ ev: "hit", race: live.id, t: 1, by: "Ana#11", on: `${npc.name} (NPC)`, move: "punch" }]);
  });

  it("names who was refused what and why, once a few seconds however often they ask", () => {
    const lines: Record<string, unknown>[] = [];
    let ms = 0;
    const l = new Lobby({ startRace: () => 1, finishRace: () => {}, qualified: () => [] }, (e) => void lines.push(e), () => 0.5, () => ms);
    const ana = conn(11, "Ana");
    const ben = conn(12, "Ben");
    l.join(ana, "human", 1, 0);
    l.join(ben, "human", 1, 1);
    go(l, 11);
    const live = [...l.races.values()][0];
    l.input(ana, 5, 0);
    for (let i = 0; i < 100; i++) l.input(ana, 3, 0b1111);
    l.join(ana, "ai", 1, 14);
    const stranger = conn(13, "Cat");
    l.quit(stranger);
    l.watch(stranger, 99);
    const refused = () => lines.filter((e) => e.ev === "reject");
    expect(refused()).toEqual([
      { ev: "reject", who: "Ana#11", action: "input", why: "stale sequence", seq: 3, last: 5 },
      { ev: "reject", who: "Ana#11", action: "queue", why: "already racing" },
      { ev: "reject", who: "Cat#13", action: "quit", why: "not racing" },
      { ev: "reject", who: "Cat#13", action: "watch", why: "no such race", race: 99 },
    ]);
    ms += 6000;
    l.input(ana, 3, 0);
    expect(refused()).toHaveLength(5);
    // the refused keys never reached the bike
    expect(live.inputs.get(ana.local)).toEqual(unpackInput(0));
  });

  it("says when a spectator is sent the race as it stands", () => {
    const { l, lines } = logged();
    const ana = conn(11, "Ana");
    l.join(ana, "ai", 1, 0, 0, 3);
    go(l, 5);
    const live = [...l.races.values()][0];
    const cat = conn(13, "Cat");
    l.watch(cat, live.id);
    expect(lines.find((e) => e.ev === "snapshot")).toMatchObject({ who: "Cat#13", kind: "race", race: live.id, riders: live.race.riders.length });
  });

  it("ends every race as stopped when the server shuts down, tells everyone in it, and scores nobody", () => {
    const lines: Record<string, unknown>[] = [];
    const finished: Standing[][] = [];
    const l = new Lobby({ startRace: () => 7, finishRace: (_r, _l, _t, st) => void finished.push(st), qualified: () => [] }, (e) => void lines.push(e), () => 0.5);
    const ana = conn(11, "Ana");
    const ben = conn(12, "Ben");
    l.join(ana, "human", 1, 0);
    l.join(ben, "human", 1, 1);
    const t = go(l, 11);
    for (let now = t; now < t + 1; now += 1 / 60) l.tick(now);
    const cat = conn(13, "Cat");
    l.watch(cat, 7);
    l.shutdown("server restarting");
    for (const c of [ana, ben, cat]) {
      const end = c.inbox.findLast((m) => m.t === "end") as Extract<ToClient, { t: "end" }> | undefined;
      expect(end, c.name).toMatchObject({ race: 7, aborted: "server restarting" });
      expect(end!.standings.filter((x) => x.human).map((x) => x.outcome)).toEqual(["aborted", "aborted"]);
    }
    const end = lines.find((e) => e.ev === "race_end")!;
    expect(end).toMatchObject({ race: 7, aborted: "server restarting" });
    expect((end.standings as [string, number, string][]).map(([w, , o]) => `${w} ${o}`).sort()).toEqual(["Ana#11 aborted", "Ben#12 aborted"]);
    expect(finished).toEqual([]);
    expect(ana.race).toBeNull();
  });

  it("does not call a closing tab's leaving a refusal", () => {
    const { l, lines } = logged();
    l.disconnect(conn(11, "Ana"), 0);
    expect(lines.filter((e) => e.ev === "reject")).toEqual([]);
  });
});

// Who may change what (docs/decisions/0002): the server never takes a rider
// from what a browser sends, only from which connection sent it.
describe("what a person may change", () => {
  it("lets a person's keys move only their own bike, whatever else the message carries", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    go(l, 11);
    const live = [...l.races.values()][0];
    // a forged message naming the other rider changes nothing of theirs
    (l.input as (...args: unknown[]) => void)(a, 1, 0b1111, b.local);
    expect([...live.inputs.keys()]).toEqual([a.local]);
    // and keys from someone not in the race go nowhere
    const stranger = conn(3);
    l.input(stranger, 1, 0b1111);
    expect([...live.inputs.keys()]).toEqual([a.local]);
  });

  it("lets a person leave only their own race, and answer only their own match", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    go(l, 11);
    const live = [...l.races.values()][0];
    const stranger = conn(3);
    l.quit(stranger);
    l.accept(stranger, 14);
    l.decline(stranger, 14);
    expect(live.quit.size).toBe(0);
    expect(live.conns.size).toBe(2);
  });
});

describe("the race's chat (N7)", () => {
  const chats = (c: Fake) => c.inbox.filter((m) => m.t === "chat") as Extract<ToClient, { t: "chat" }>[];

  it("sends a canned line to everyone racing and watching, from the bike that said it, one every second and a half", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    const t = go(l, 11);
    const live = [...l.races.values()][0];
    const watcher = conn(3);
    l.watch(watcher, live.id);
    l.say(a, 2, t);
    for (const c of [a, b, watcher]) expect(chats(c)).toEqual([{ t: "chat", race: live.id, from: a.local, say: 2 }]);
    expect(SAYINGS[2]).toBe("You'll pay for that.");
    // too soon, no such line, not racing: nothing goes out
    l.say(a, 3, t + 1);
    l.say(b, 99, t + 1);
    l.say(b, -1, t + 1);
    l.say(conn(4), 0, t + 1);
    expect(chats(b)).toHaveLength(1);
    l.say(a, 3, t + SAY_GAP);
    expect(chats(b).at(-1)).toMatchObject({ from: a.local, say: 3 });
  });

  it("posts a person wrecked, busted or leaving, and no NPC", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "ai", 1, 0);
    l.join(b, "ai", 1, 1);
    const t = go(l, 5);
    const live = [...l.races.values()][0];
    const npc = live.entrants.find((e) => !e.human)!.id;
    live.race.events.push({ t: 1, kind: "wrecked", rider: b.local }, { t: 1, kind: "busted", rider: npc, cop: 99 }, { t: 1, kind: "busted", rider: a.local, cop: 99 });
    l.tick(t + 0.1);
    expect(chats(a).map((m) => [m.from, m.status])).toEqual([
      [b.local, "wrecked"],
      [a.local, "busted"],
    ]);
  });

  it("posts a person who leaves mid-race to the others", () => {
    const { l } = lobby();
    const a = conn(1);
    const b = conn(2);
    l.join(a, "human", 1, 0);
    l.join(b, "human", 1, 1);
    go(l, 11);
    l.quit(a);
    expect(chats(b)).toEqual([expect.objectContaining({ from: a.local, status: "left" })]);
  });
});
