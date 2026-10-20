// Everything a rider expects to find when they come back lives here, in one
// SQLite file on the Fly volume. The machine stops when idle, so memory is
// never where a result is kept.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { type Leader, POINTS, type Standing } from "../game/protocol.ts";

export type Db = ReturnType<typeof openDb>;

/** `holder` was knocked off by `against`, `n` times over every race (O3). */
export type Grudge = { holder: number; against: number; n: number };

export function openDb(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // NORMAL, not SQLite's FULL: FULL waits for the disk on every commit, and
  // node:sqlite is synchronous, so the race clock waited with it. Writes that
  // follow a second or two of quiet took 60 to 570 ms on my machine
  // (server_stall, N14); under NORMAL the same writes took under 1 ms. In WAL
  // mode NORMAL cannot corrupt the file; a power cut can lose the last
  // commits, which a crashed process cannot.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
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
    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY,
      at TEXT NOT NULL,
      ev TEXT NOT NULL,
      who TEXT,
      line TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS log_at ON log (at);
    CREATE TABLE IF NOT EXISTS qualifications (
      rider_id INTEGER NOT NULL REFERENCES riders(id),
      level INTEGER NOT NULL,
      track TEXT NOT NULL,
      race_id INTEGER NOT NULL REFERENCES races(id),
      at INTEGER NOT NULL,
      PRIMARY KEY (rider_id, level, track)
    );
    -- who knocked whom off, between people, for good (O3): the holder was
    -- knocked off by the other, n times, the last of them in race_id
    CREATE TABLE IF NOT EXISTS grudges (
      holder INTEGER NOT NULL REFERENCES riders(id),
      against INTEGER NOT NULL REFERENCES riders(id),
      n INTEGER NOT NULL,
      race_id INTEGER NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (holder, against)
    );
  `);
  // a rider made by a script rather than a person: a probe of the network, a
  // load test, the spec run against the app. Raced like anyone, kept out of
  // the standings (N12). Added after the table had people in it, so an older
  // database gains the column here
  const cols = db.prepare("PRAGMA table_info(riders)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "probe")) db.exec("ALTER TABLE riders ADD COLUMN probe INTEGER NOT NULL DEFAULT 0");

  const q = {
    byToken: db.prepare("SELECT id, name FROM riders WHERE token = ?"),
    insertRider: db.prepare("INSERT INTO riders (token, name, created_at) VALUES (?, ?, ?)"),
    rename: db.prepare("UPDATE riders SET name = ? WHERE id = ?"),
    markProbe: db.prepare("UPDATE riders SET probe = 1 WHERE id = ?"),
    isProbe: db.prepare("SELECT probe FROM riders WHERE id = ?"),
    insertRace: db.prepare("INSERT INTO races (mode, level, track, started_at) VALUES (?, ?, ?, ?)"),
    endRace: db.prepare("UPDATE races SET ended_at = ? WHERE id = ?"),
    insertResult: db.prepare("INSERT INTO results (race_id, rider_id, name, place, outcome, time_ms) VALUES (?, ?, ?, ?, ?, ?)"),
    qualify: db.prepare("INSERT OR IGNORE INTO qualifications (rider_id, level, track, race_id, at) VALUES (?, ?, ?, ?, ?)"),
    revoke: db.prepare("DELETE FROM qualifications WHERE rider_id = ? AND level = ?"),
    qualified: db.prepare("SELECT level, track FROM qualifications WHERE rider_id = ? ORDER BY level, track"),
    grudge: db.prepare("INSERT INTO grudges (holder, against, n, race_id, at) VALUES (?, ?, 1, ?, ?) ON CONFLICT (holder, against) DO UPDATE SET n = n + 1, race_id = excluded.race_id, at = excluded.at"),
    grudges: db.prepare("SELECT holder, against, n FROM grudges WHERE holder IN (SELECT value FROM json_each(?)) AND against IN (SELECT value FROM json_each(?))"),
    log: db.prepare("INSERT INTO log (at, ev, who, line) VALUES (?, ?, ?, ?)"),
    logSince: db.prepare("SELECT at, line FROM log WHERE at >= ? AND (? IS NULL OR line LIKE ?) AND (? IS NULL OR ev IN (SELECT value FROM json_each(?))) ORDER BY id LIMIT ?"),
    // every person who has raced, from the results kept for every race: a
    // finish scores by its place across the line, NPCs counted in the place
    // but never listed; wrecked, busted, left or out of time score nothing
    leaders: db.prepare(`
      SELECT r.id, r.name,
        COUNT(*) AS races,
        SUM(CASE WHEN x.outcome IN ('qualified', 'placed') THEN COALESCE((SELECT value FROM json_each(?) WHERE key = x.place - 1), 0) ELSE 0 END) AS points,
        SUM(x.outcome IN ('qualified', 'placed') AND x.place = 1) AS wins,
        SUM(x.outcome IN ('qualified', 'placed') AND x.place <= 3) AS podiums,
        (SELECT COUNT(*) FROM qualifications q WHERE q.rider_id = r.id) AS boards
      FROM results x JOIN riders r ON r.id = x.rider_id
      WHERE r.probe = 0
      GROUP BY r.id
      ORDER BY points DESC, wins DESC, podiums DESC, races ASC, r.id ASC
      LIMIT ?`),
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
    /** Mark a rider as made by a script; for good, since a person never says so of themselves. */
    markProbe(id: number): void {
      q.markProbe.run(id);
    },
    isProbe(id: number): boolean {
      return Number((q.isProbe.get(id) as { probe: number } | undefined)?.probe ?? 0) === 1;
    },
    startRace(mode: string, level: number, track: string): number {
      return Number(q.insertRace.run(mode, level, track, Date.now()).lastInsertRowid);
    },
    /**
     * Results for everyone; a qualification for every human in the top three
     * (S4), and every qualification on the level taken from a human wrecked
     * or busted in it (S5).
     */
    finishRace(race: number, level: number, track: string, standings: Standing[]): void {
      db.exec("BEGIN");
      try {
        for (const s of standings) {
          q.insertResult.run(race, s.human ? s.id : null, s.name, s.place, s.outcome, s.time === null ? null : Math.round(s.time * 1000));
          if (s.human && s.outcome === "qualified") q.qualify.run(s.id, level, track, race, Date.now());
          if (s.human && (s.outcome === "wrecked" || s.outcome === "busted")) q.revoke.run(s.id, level);
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
    /** One person knocked another off (O3): the one knocked off holds it against the other. */
    grudge(holder: number, against: number, race: number): void {
      if (holder !== against) q.grudge.run(holder, against, race, Date.now());
    },
    /** Every grudge held between any two of these people (O3). */
    grudges(ids: number[]): Grudge[] {
      const list = JSON.stringify(ids);
      return (q.grudges.all(list, list) as Grudge[]).map((g) => ({ holder: Number(g.holder), against: Number(g.against), n: Number(g.n) }));
    },
    /** Keep one log line: who did what, outliving the process and Fly's log buffer. */
    log(at: string, event: Record<string, unknown>): void {
      q.log.run(at, String(event.ev ?? ""), typeof event.who === "string" ? event.who : null, JSON.stringify(event));
    },
    /** The kept log from a moment on, optionally only lines mentioning some text (a name, a race), and only of some kinds. */
    logSince(at: string, text: string | null = null, limit = 1000, kinds: string[] | null = null): { at: string; line: Record<string, unknown> }[] {
      const ks = kinds === null ? null : JSON.stringify(kinds);
      const rows = q.logSince.all(at, text, text === null ? null : `%${text}%`, ks, ks, limit) as { at: string; line: string }[];
      return rows.map((r) => ({ at: r.at, line: JSON.parse(r.line) }));
    },
    /** Everyone who has raced, best first (N12). */
    leaderboard(limit = 100): Leader[] {
      const rows = q.leaders.all(JSON.stringify(POINTS), limit) as Omit<Leader, "rank">[];
      return rows.map((r, i) => ({ rank: i + 1, id: Number(r.id), name: r.name, points: Number(r.points), races: Number(r.races), wins: Number(r.wins), podiums: Number(r.podiums), boards: Number(r.boards) }));
    },
    /** How commits reach the disk on this connection: the journal, and synchronous as SQLite numbers it (1 is NORMAL, 2 FULL). */
    durability(): { journal: string; synchronous: number } {
      const j = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      const s = db.prepare("PRAGMA synchronous").get() as { synchronous: number };
      return { journal: j.journal_mode, synchronous: Number(s.synchronous) };
    },
    close(): void {
      db.close();
    },
  };
}
