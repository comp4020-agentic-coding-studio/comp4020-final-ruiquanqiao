import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type Entry, LOAD_MIN, type ToClient } from "../game/protocol.ts";
import { NO_INPUT, type Race, beginAttack, startRace, step } from "../game/sim.ts";
import { bake } from "../game/track.ts";
import { addFeud, feudLine, moodOf, peopleRows } from "../client/people.ts";
import { drawDash } from "../client/dash.ts";
import { applyRider, encodeRider } from "../game/protocol.ts";
import { openDb } from "../server/db.ts";
import { type Conn, Lobby } from "../server/lobby.ts";

// The people in a race, listed by place in the corner (ledger N6), and the
// grudges between them, kept across races and days (O3).

const dir = mkdtempSync(join(process.cwd(), ".data-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const straight = bake("straight", [{ length: 30000, curve: 0, climb: 0 }], 30000, 1);

function field(entrants: Entry[]): Race {
  const race = startRace({ ...straight, scenery: [] }, 1, entrants, 1);
  race.cars = [];
  race.riders = race.riders.filter((r) => !r.cop);
  return race;
}

type Fake = Conn & { inbox: ToClient[] };
const conn = (rider: number, name: string): Fake => {
  const inbox: ToClient[] = [];
  return { rider, name, inbox, send: (m) => inbox.push(m), pool: null, level: 1, road: 0, race: null, local: -1, seq: 0 };
};

/** A lobby over an in-memory store that keeps grudges the way server/db.ts does. */
function lobby() {
  const kept = new Map<string, number>();
  const l = new Lobby(
    {
      startRace: () => kept.size + 1,
      finishRace: () => {},
      qualified: () => [],
      grudge: (h, a) => void kept.set(`${h}>${a}`, (kept.get(`${h}>${a}`) ?? 0) + 1),
      grudges: (ids) =>
        [...kept].map(([k, n]) => ({ holder: Number(k.split(">")[0]), against: Number(k.split(">")[1]), n })).filter((g) => ids.includes(g.holder) && ids.includes(g.against)),
    },
    () => {},
    () => 0.5,
  );
  return { l, kept };
}

/** Two people queue for the humans-only pool and get as far as loading; returns the moment loading began. */
function match(l: Lobby, a: Fake, b: Fake, now: number): number {
  l.join(a, "human", 1, now);
  l.join(b, "human", 1, now);
  l.tick(now + 10);
  for (const m of l.matches.values()) for (const c of m.members) l.accept(c, now + 10);
  return now + 10;
}

describe("every person's place in the corner (N6)", () => {
  it("lists every person in the race and no NPC, best placed first, with their place counting the NPCs", () => {
    const entrants: Entry[] = [
      { id: 0, name: "Ana", human: true, look: 2 },
      { id: 1, name: "Dex Carbine", human: false },
      { id: 2, name: "Mika", human: true, look: 5 },
      { id: 3, name: "Bo", human: true, look: 1 },
    ];
    const race = field(entrants);
    const at = (id: number, z: number) => Object.assign(race.riders.find((r) => r.id === id)!, { z });
    at(0, 300);
    at(1, 500);
    at(2, 400);
    at(3, 100);
    race.riders.find((r) => r.id === 3)!.phase = "wrecked";
    const rows = peopleRows(race, entrants, 0, []);
    expect(rows.map((r) => [r.place, r.name, r.me, r.out])).toEqual([
      [2, "Mika", false, false],
      [3, "Ana", true, false],
      [4, "Bo", false, true],
    ]);
    expect(rows[0].look).toBe(5);
  });
});

describe("grudges between people, across races (O3)", () => {
  it("names who landed the blow when a rider is knocked off", () => {
    const race = field([
      { id: 0, name: "Ana", human: true },
      { id: 1, name: "Mika", human: true },
    ]);
    const [a, b] = [0, 1].map((id) => race.riders.find((r) => r.id === id)!);
    Object.assign(a, { z: 500, x: 0, speed: 30 });
    Object.assign(b, { z: 500, x: 1, speed: 30, stamina: 1 });
    beginAttack(race, a, "hand");
    for (let i = 0; i < 30; i++) step(race, new Map([[0, NO_INPUT], [1, NO_INPUT]]));
    expect(race.events).toContainEqual(expect.objectContaining({ kind: "crash", rider: 1, cause: "knockdown", by: 0 }));
    // and a crash of one's own doing names nobody
    expect(race.events.filter((e) => e.kind === "crash" && e.cause !== "knockdown").every((e) => !("by" in e))).toBe(true);
  });

  it("keeps a knockdown between two people for good, held by the one knocked off, across a restart", () => {
    const file = join(dir, "grudge.db");
    let db = openDb(file);
    const ana = db.rider("token-ana");
    const mika = db.rider("token-mika");
    const bo = db.rider("token-bo");
    db.grudge(mika.id, ana.id, 1);
    db.grudge(mika.id, ana.id, 2);
    db.grudge(ana.id, mika.id, 2);
    db.grudge(bo.id, bo.id, 2); // knocking oneself off is not a grudge
    db.close();
    db = openDb(file);
    const held = db.grudges([ana.id, mika.id, bo.id]).sort((p, q) => p.holder - q.holder);
    expect(held).toEqual([
      { holder: ana.id, against: mika.id, n: 1 },
      { holder: mika.id, against: ana.id, n: 2 },
    ]);
    // only between the people asked about
    expect(db.grudges([mika.id, bo.id])).toEqual([]);
    db.close();
  });

  it("remembers who knocked whom off in one race, and tells both of them when they meet in the next", () => {
    const { l, kept } = lobby();
    const ana = conn(11, "Ana");
    const mika = conn(12, "Mika");
    let now = match(l, ana, mika, 0);
    for (const m of l.matches.values()) for (const c of m.members) l.progress(c, 1);
    now += LOAD_MIN;
    l.tick(now);
    const live = [...l.races.values()][0];
    // Ana knocks Mika off twice; kept for good, held by Mika
    live.race.events.push({ t: live.race.t, kind: "crash", rider: mika.local, cause: "knockdown", by: ana.local });
    live.race.events.push({ t: live.race.t, kind: "crash", rider: mika.local, cause: "knockdown", by: ana.local });
    l.tick(now + 0.1);
    expect(kept).toEqual(new Map([["12>11", 2]]));
    // a spectator arriving now is told the race's grudges as they stand
    const watcher = conn(13, "Bo");
    l.hello(watcher);
    l.watch(watcher, live.id);
    const seen = watcher.inbox.find((m) => m.t === "start") as Extract<ToClient, { t: "start" }>;
    expect(seen.feuds).toEqual([{ holder: mika.local, against: ana.local, n: 2 }]);
    l.disconnect(ana, now + 1);
    l.disconnect(mika, now + 1);
    l.tick(now + 1.1);

    // the next day, two new tabs, the same two people, the other way round in the queue
    const mika2 = conn(12, "Mika");
    const ana2 = conn(11, "Ana");
    match(l, mika2, ana2, 100);
    const loading = (c: Fake) => c.inbox.find((m) => m.t === "loading") as Extract<ToClient, { t: "loading" }>;
    const m = loading(mika2);
    const mikaBike = m.entrants.findIndex((e) => e.name === "Mika");
    const anaBike = m.entrants.findIndex((e) => e.name === "Ana");
    expect(m.feuds).toEqual([{ holder: mikaBike, against: anaBike, n: 2 }]);
    expect(loading(ana2).feuds).toEqual(m.feuds);
  });

  it("puts the grudge in words beside the person, and in the corner list, both ways", () => {
    expect(feudLine(2, 0)).toBe("Knocked you off twice");
    expect(feudLine(0, 1)).toBe("You knocked them off once");
    expect(feudLine(3, 1)).toBe("Knocked you off 3 times; you got them once");
    expect(feudLine(0, 0)).toBe("");
    const entrants: Entry[] = [
      { id: 0, name: "Ana", human: true },
      { id: 1, name: "Mika", human: true },
      { id: 2, name: "Dex Carbine", human: false },
    ];
    const feuds = [{ holder: 0, against: 1, n: 2 }];
    // a knockdown seen in the race adds to it; one by or on an NPC does not
    addFeud(feuds, entrants, 1, 0);
    addFeud(feuds, entrants, 0, 2);
    addFeud(feuds, entrants, 2, 0);
    expect(feuds).toEqual([
      { holder: 0, against: 1, n: 2 },
      { holder: 1, against: 0, n: 1 },
    ]);
    const rows = peopleRows(field(entrants), entrants, 0, feuds);
    expect(rows.find((r) => r.name === "Mika")).toMatchObject({ onYou: 2, byYou: 1 });
    expect(rows.find((r) => r.name === "Ana")).toMatchObject({ onYou: 0, byYou: 0 });
  });
});

describe("the closest opponent's mood, on their stamina wedge (O4)", () => {
  const entrants: Entry[] = [
    { id: 0, name: "Ana", human: true },
    { id: 1, name: "Mika", human: true },
    { id: 2, name: "Dex Carbine", human: false },
  ];

  it("reads red for an NPC you hit, carried to the browser in the snapshot, and yellow otherwise", () => {
    const server = field(entrants);
    const dex = server.riders.find((r) => r.id === 2)!;
    const ana = server.riders.find((r) => r.id === 0)!;
    Object.assign(ana, { z: 500, x: 0, speed: 30 });
    Object.assign(dex, { z: 500, x: 1, speed: 30 });
    // what a browser has of Dex before and after Ana's punch lands
    const seen = field(entrants).riders.find((r) => r.id === 2)!;
    applyRider(seen, encodeRider(dex));
    expect(moodOf(seen, 0, [])).toBe("neutral");
    beginAttack(server, ana, "hand");
    for (let i = 0; i < 12; i++) step(server, new Map([[0, NO_INPUT], [1, NO_INPUT]]));
    expect(server.events).toContainEqual(expect.objectContaining({ kind: "hit", by: 0, on: 2 }));
    applyRider(seen, encodeRider(dex));
    expect(moodOf(seen, 0, [])).toBe("after");
    // and only at the one who hit it
    expect(moodOf(seen, 1, [])).toBe("neutral");
  });

  it("reads red for an NPC fighting you, though you never hit it", () => {
    const server = field(entrants);
    const dex = server.riders.find((r) => r.id === 2)!;
    dex.foe = 1;
    const seen = field(entrants).riders.find((r) => r.id === 2)!;
    applyRider(seen, encodeRider(dex));
    expect(moodOf(seen, 1, [])).toBe("after");
    expect(moodOf(seen, 0, [])).toBe("neutral");
  });

  it("reads red for a person you have knocked off, in this race or an earlier one, and not the other way round", () => {
    const race = field(entrants);
    const mika = race.riders.find((r) => r.id === 1)!;
    const feuds = [{ holder: 1, against: 0, n: 1 }];
    expect(moodOf(mika, 0, feuds)).toBe("after");
    expect(moodOf(race.riders.find((r) => r.id === 0)!, 1, feuds)).toBe("neutral");
  });

  it("paints the opponent's wedge all red when they are after you, yellow when neutral, and the player's own graded", () => {
    const fills = (mood: "after" | "neutral"): string[] => {
      const got: string[] = [];
      const gradient = { addColorStop: () => {} };
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_, k) => (k === "measureText" ? (t: string) => ({ width: t.length * 8 }) : k === "createLinearGradient" || k === "createRadialGradient" ? () => gradient : () => {}),
        set: (_, k, v) => {
          if (k === "fillStyle" && typeof v === "string" && v.startsWith("hsl")) got.push(v);
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
      drawDash(ctx, 1920, 1080, { name: "Ana", kmh: 200, rpm: 0.5, position: 2, km: 1, damage: 1, stamina: 1, opponent: { name: "Dex", stamina: 1, gap: 2, mood } });
      return got;
    };
    const after = fills("after");
    const neutral = fills("neutral");
    // ten segments each: the player's graded red to green, then the opponent's
    expect(after).toHaveLength(20);
    expect(new Set(after.slice(0, 10)).size).toBe(10);
    expect(after.slice(10).every((f) => f.startsWith("hsl(0,"))).toBe(true);
    expect(neutral.slice(10).every((f) => f.startsWith("hsl(50,"))).toBe(true);
  });
});
