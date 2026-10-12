// The kept log, read back: who did what, from the database, so it is still
// there after a restart or a redeploy has emptied Fly's own log buffer.
//
//   node server/readlog.ts [--since 2026-10-19T03:00] [--about "Ana"] [--limit 500]
//
// On the deployed app:
//   flyctl ssh console -a comp4020-final-ruiquanqiao -C "node server/readlog.ts --about Ana"
//
// --since is UTC, as the log's own times are; it defaults to the last hour.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "./db.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const DATA = process.env.DATA_DIR ?? (existsSync("/data") ? "/data" : ".data");
const since = flag("since") ?? new Date(Date.now() - 3600_000).toISOString();
const db = openDb(join(DATA, "rash.db"));

for (const { at, line } of db.logSince(since, flag("about"), Number(flag("limit") ?? 1000))) {
  const { ev, who, ...rest } = line as { ev: string; who?: string } & Record<string, unknown>;
  const more = Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  console.log(`${at.slice(11, 19)}  ${String(ev).padEnd(12)} ${who ? `${who}  ` : ""}${more}`);
}
db.close();
