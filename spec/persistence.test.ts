import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { openDb } from "../server/db.ts";

// What a rider finds on coming back (ledger S4, S9): the same rider behind the
// same browser token, and their qualifications, after the database has been
// closed and opened again — which is what a restart or a redeploy does to it.

const dir = mkdtempSync(join(process.cwd(), ".data-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("keeps a rider and a qualification across a restart", () => {
  const file = join(dir, "rash.db");
  let db = openDb(file);
  const rider = db.rider("token-for-a-returning-rider");
  db.rename(rider.id, "Mika");
  const race = db.startRace("ai", 2, "Ridge Road");
  db.finishRace(race, 2, "Ridge Road", [
    { id: rider.id, name: "Mika", human: true, place: 2, outcome: "qualified", time: 201.5 },
    { id: -1, name: "Dex Carbine", human: false, place: 1, outcome: "qualified", time: 199.1 },
  ]);
  db.close();

  db = openDb(file);
  expect(db.rider("token-for-a-returning-rider")).toEqual({ id: rider.id, name: "Mika" });
  expect(db.qualified(rider.id)).toEqual([{ level: 2, track: "Ridge Road" }]);
  db.close();
});

it("does not qualify a rider who only placed", () => {
  const db = openDb(join(dir, "placed.db"));
  const rider = db.rider("token-placed");
  const race = db.startRace("ai", 1, "Ridge Road");
  db.finishRace(race, 1, "Ridge Road", [{ id: rider.id, name: rider.name, human: true, place: 4, outcome: "placed", time: 190 }]);
  expect(db.qualified(rider.id)).toEqual([]);
  db.close();
});

it("ranks everyone who has raced by points for their finishes, wins and podiums, and lists no NPC (N12)", () => {
  const db = openDb(join(dir, "leaders.db"));
  const mika = db.rider("token-mika");
  const juno = db.rider("token-juno");
  db.rename(mika.id, "Mika");
  db.rename(juno.id, "Juno");
  const one = db.startRace("ai", 1, "Ridge Road");
  db.finishRace(one, 1, "Ridge Road", [
    { id: -1, name: "Dex Carbine", human: false, place: 1, outcome: "qualified", time: 190 },
    { id: mika.id, name: "Mika", human: true, place: 2, outcome: "qualified", time: 191 },
    { id: juno.id, name: "Juno", human: true, place: 5, outcome: "placed", time: 199 },
  ]);
  const two = db.startRace("human", 1, "Gold Town");
  db.finishRace(two, 1, "Gold Town", [
    { id: juno.id, name: "Juno", human: true, place: 1, outcome: "qualified", time: 180 },
    { id: mika.id, name: "Mika", human: true, place: 2, outcome: "wrecked", time: null },
  ]);
  expect(db.leaderboard()).toEqual([
    { rank: 1, id: juno.id, name: "Juno", points: 10 + 25, races: 2, wins: 1, podiums: 1, boards: 1 },
    { rank: 2, id: mika.id, name: "Mika", points: 18, races: 2, wins: 0, podiums: 1, boards: 1 },
  ]);
  db.close();
});

it("keeps the log of who did what across a restart, and finds a person's lines by name", () => {
  const file = join(dir, "log.db");
  let db = openDb(file);
  db.log("2026-10-19T03:00:01.000Z", { ev: "connect", who: "Ana#11" });
  db.log("2026-10-19T03:00:02.000Z", { ev: "connect", who: "Ben#12" });
  db.log("2026-10-19T03:00:09.000Z", { ev: "hit", race: 4, by: "Ana#11", on: "Ben#12", move: "punch" });
  db.close();

  db = openDb(file);
  expect(db.logSince("2026-10-19T03:00:00Z").map((r) => r.line.ev)).toEqual(["connect", "connect", "hit"]);
  expect(db.logSince("2026-10-19T03:00:00Z", "Ana").map((r) => r.line)).toEqual([
    { ev: "connect", who: "Ana#11" },
    { ev: "hit", race: 4, by: "Ana#11", on: "Ben#12", move: "punch" },
  ]);
  db.close();
});

// Timed directly, the stall would not come back on a fresh file: it needed a
// WAL the size of the real one, and even then came one write in four. So the
// setting that removes it is what is held, read back off the open connection.
it("does not make the race wait on the disk for every commit: WAL with synchronous NORMAL (N14)", () => {
  const db = openDb(join(dir, "quiet.db"));
  expect(db.durability()).toEqual({ journal: "wal", synchronous: 1 });
  db.close();
});

it("reads back only the kinds of line asked for, so the network's story is one query (N14)", () => {
  const db = openDb(join(dir, "kinds.db"));
  db.log("2026-10-19T03:00:01.000Z", { ev: "connect", who: "Ana#11" });
  db.log("2026-10-19T03:00:05.000Z", { ev: "lag_spike", who: "Ana#11", race: 4, kind: "rtt", ms: 420, usual: 30 });
  db.log("2026-10-19T03:00:06.000Z", { ev: "hit", race: 4, by: "Ana#11", on: "Ben#12", move: "punch" });
  db.log("2026-10-19T03:02:00.000Z", { ev: "net", who: "Ana#11", race: 4, rtt: 30 });
  db.log("2026-10-19T03:02:00.000Z", { ev: "net", who: "Ben#12", race: 4, rtt: 12 });
  expect(db.logSince("2026-10-19T03:00:00Z", null, 1000, ["net", "lag_spike"]).map((r) => r.line.ev)).toEqual(["lag_spike", "net", "net"]);
  expect(db.logSince("2026-10-19T03:00:00Z", "Ben", 1000, ["net"]).map((r) => r.line.who)).toEqual(["Ben#12"]);
  db.close();
});
