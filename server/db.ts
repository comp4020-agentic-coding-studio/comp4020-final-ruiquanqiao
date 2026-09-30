// Everything a rider expects to find when they come back lives here, in one
// SQLite file on the Fly volume. The machine stops when idle, so memory is
// never where a result is kept.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Standing } from "../game/protocol.ts";

export type Db = ReturnType<typeof openDb>;

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS riders (
      id INTEGER PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS races (
      id INTEGER PRIMARY KEY,
      mode TEXT NOT NULL,
      level INTEGER NOT NULL,
      track TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS results (
      race_id INTEGER NOT NULL REFERENCES races(id),
      rider_id INTEGER REFERENCES riders(id),
      name TEXT NOT NULL,
      place INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      time_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS qualifications (
      rider_id INTEGER NOT NULL REFERENCES riders(id),
      level INTEGER NOT NULL,
      track TEXT NOT NULL,
      race_id INTEGER NOT NULL REFERENCES races(id),
      at INTEGER NOT NULL,
      PRIMARY KEY (rider_id, level, track)
    );
  `);

  const q = {
    byToken: db.prepare("SELECT id, name FROM riders WHERE token = ?"),
    insertRider: db.prepare("INSERT INTO riders (token, name, created_at) VALUES (?, ?, ?)"),
    rename: db.prepare("UPDATE riders SET name = ? WHERE id = ?"),
    insertRace: db.prepare("INSERT INTO races (mode, level, track, started_at) VALUES (?, ?, ?, ?)"),
    endRace: db.prepare("UPDATE races SET ended_at = ? WHERE id = ?"),
    insertResult: db.prepare("INSERT INTO results (race_id, rider_id, name, place, outcome, time_ms) VALUES (?, ?, ?, ?, ?, ?)"),
    qualify: db.prepare("INSERT OR IGNORE INTO qualifications (rider_id, level, track, race_id, at) VALUES (?, ?, ?, ?, ?)"),
    qualified: db.prepare("SELECT level, track FROM qualifications WHERE rider_id = ? ORDER BY level, track"),
  };

  return {
    /** The rider behind a browser's token, made on first sight. */
    rider(token: string): { id: number; name: string } {
      const found = q.byToken.get(token) as { id: number; name: string } | undefined;
      if (found) return found;
      const name = `Rider ${Math.floor(1000 + Math.random() * 9000)}`;
      const { lastInsertRowid } = q.insertRider.run(token, name, Date.now());
      return { id: Number(lastInsertRowid), name };
    },
    rename(id: number, name: string): void {
      q.rename.run(name, id);
    },
    startRace(mode: string, level: number, track: string): number {
      return Number(q.insertRace.run(mode, level, track, Date.now()).lastInsertRowid);
    },
    /** Results for everyone; a qualification for every human in the top three (S4). */
    finishRace(race: number, level: number, track: string, standings: Standing[]): void {
      db.exec("BEGIN");
      try {
        for (const s of standings) {
          q.insertResult.run(race, s.human ? s.id : null, s.name, s.place, s.outcome, s.time === null ? null : Math.round(s.time * 1000));
          if (s.human && s.outcome === "qualified") q.qualify.run(s.id, level, track, race, Date.now());
        }
        q.endRace.run(Date.now(), race);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    qualified(id: number): { level: number; track: string }[] {
      return q.qualified.all(id) as { level: number; track: string }[];
    },
    close(): void {
      db.close();
    },
  };
}
