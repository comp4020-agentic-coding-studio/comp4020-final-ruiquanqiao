import { describe, expect, it } from "vitest";
import type { Standing, ToClient } from "../game/protocol.ts";
import { type Conn, Lobby } from "../server/lobby.ts";

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
    l.tick(5);
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
    l.tick(5);
    expect(l.races.size).toBe(1);
  });

  it("starts a race for one rider alone", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    l.tick(5);
    expect([...l.races.values()][0].entrants.filter((e) => e.human)).toHaveLength(1);
  });

  it("lets someone who joins after the start watch the race instead", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0);
    l.tick(5);
    const late = conn(3);
    l.join(late, "ai", 1, 5.2);
    expect(started(late).at(-1)?.you).toBeNull();
    expect(late.pool).toBe("ai");
    for (let now = 5.2; now < 6; now += 1 / 60) l.tick(now);
    expect(late.inbox.some((m) => m.t === "snap")).toBe(true);
  });

  it("takes riders out of the pool once their race starts", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    l.tick(5);
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
    l.tick(35);
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
    l.tick(5);
    expect([...l.races.values()][0].level).toBe(3);
  });

  it("gives two tabs of one rider two bikes with names told apart", () => {
    const { l } = lobby();
    l.join(conn(7, "Mika"), "ai", 1, 0);
    l.join(conn(7, "Mika"), "ai", 1, 1);
    l.tick(5);
    const names = [...l.races.values()][0].entrants.filter((e) => e.human).map((e) => e.name);
    expect(names).toEqual(["Mika", "Mika (2)"]);
  });

  it("ends, with every rider placed, once its only human leaves", () => {
    const { l, finished } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0);
    l.tick(5);
    l.disconnect(a, 6);
    l.tick(6.1);
    expect(l.races.size).toBe(0);
    expect(finished[0]).toHaveLength(15);
    expect(finished[0].find((s) => s.human)?.outcome).toBe("quit");
  });
});

describe("choosing how many AI riders (N2)", () => {
  it("races as many as asked for, alone", () => {
    const { l } = lobby();
    const a = conn(1);
    l.join(a, "ai", 1, 0, 0, 4);
    l.tick(5);
    const race = [...l.races.values()][0];
    expect(race.entrants.filter((e) => !e.human)).toHaveLength(4);
  });

  it("takes the median of what the pool asked for, up to the most allowed", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0, 0, 0);
    l.join(conn(2), "ai", 1, 1, 0, 20);
    l.join(conn(3), "ai", 1, 2, 0, 500);
    l.tick(5);
    const race = [...l.races.values()][0];
    expect(race.entrants.filter((e) => !e.human)).toHaveLength(20);
  });

  it("can race a human alone against nobody", () => {
    const { l } = lobby();
    l.join(conn(1), "ai", 1, 0, 0, 0);
    l.tick(5);
    expect([...l.races.values()][0].entrants).toHaveLength(1);
  });
});
