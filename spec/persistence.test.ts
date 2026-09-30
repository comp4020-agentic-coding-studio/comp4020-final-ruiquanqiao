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
