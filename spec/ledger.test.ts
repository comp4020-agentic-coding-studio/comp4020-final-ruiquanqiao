import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/ledger.md is the list of every mechanic of the original game and what
// this remake does with it. These checks hold it to the rules its own
// introduction states, so a row cannot quietly go without a decision, a
// deadline, a reason or a proof.

const ledger = readFileSync("docs/ledger.md", "utf8");
const [body, sourcesPart] = ledger.split(/^## Sources$/m);

/** When each crit is due: its cutoff, and the project's deadline for the rest. */
const DUE: Record<string, string> = {
  C8: "2026-10-06T12:00:00+11:00",
  C9: "2026-10-12T12:00:00+11:00",
  C10: "2026-10-19T12:00:00+11:00",
  final: "2026-11-09T12:00:00+11:00",
};

type Row = { id: string; mechanic: string; source: string; status: string; treatment: string; due: string };

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

// Table rows only: skip the header and the |---| divider under it.
const tableLines = (text: string): string[][] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map(cells)
    .filter((row) => row[0] !== "ID" && row[0] !== "Tag");

const rows: Row[] = tableLines(body).map(([id, mechanic, source, status, treatment, due]) => ({
  id,
  mechanic,
  source,
  status,
  treatment,
  due,
}));

const sourceTags = new Set(
  tableLines(sourcesPart ?? "")
    .filter((row) => /^https?:\/\//.test(row[2] ?? ""))
    .map((row) => row[0]),
);

describe("the Road Rash ledger", () => {
  it("has rows, a sources table, and six cells in every row", () => {
    expect(rows.length).toBeGreaterThan(40);
    expect(sourceTags.size).toBeGreaterThan(5);
    for (const row of rows) expect(row.due, `row ${row.id} is missing a cell`).toBeDefined();
  });

  it("uses every ID once", () => {
    const ids = rows.map((row) => row.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("gives every row a status of built, planned or omitted", () => {
    for (const row of rows) expect(["built", "planned", "omitted"], row.id).toContain(row.status);
  });

  it("names a treatment of same or adapted, or a reason for an omission", () => {
    for (const row of rows) {
      if (row.status === "omitted") {
        expect(row.treatment, row.id).toMatch(/^omitted: \S.{10,}/);
      } else {
        expect(row.treatment, row.id).toMatch(/^(same\b|adapted: \S.{10,})/);
      }
    }
  });

  it("gives every planned row the crit it is due by", () => {
    for (const row of rows.filter((r) => r.status === "planned")) {
      expect(Object.keys(DUE), row.id).toContain(row.due);
    }
  });

  // A due crit that has gone by with the row still planned is the ledger and
  // the code disagreeing, which CLAUDE.md forbids. It happened: on 20 Oct 35
  // rows still read planned for C8 or C9, built weeks before, and the README
  // said every mechanic had a decision. Each due date is that crit's cutoff,
  // and the final one the project's deadline, in Canberra time.
  it("has no planned row left past the cutoff it was due by", () => {
    const now = Date.now();
    const late = rows.filter((r) => r.status === "planned" && Date.parse(DUE[r.due] ?? "") <= now).map((r) => `${r.id} (${r.due})`);
    expect(late, "build these, or omit them with the reason").toEqual([]);
  });

  // Some of a look can only be judged by a person, frame beside frame with the
  // original (CLAUDE.md, "Compare frame beside frame"). Such a row names the
  // commit whose message records that comparison, and the commit must exist.
  it("points every built row at a spec test that exists, or at the commit where it was judged", () => {
    for (const row of rows.filter((r) => r.status === "built")) {
      const judged = row.due.match(/^judged: ([0-9a-f]{7,40})$/);
      if (judged) {
        expect(row.id, `${row.id}: only a Look row can be judged rather than tested`).toMatch(/^V\d+$/);
        expect(() => execFileSync("git", ["cat-file", "-e", `${judged[1]}^{commit}`]), `${row.id}: no commit ${judged[1]}`).not.toThrow();
        continue;
      }
      const match = row.due.match(/^`?(spec\/[\w./-]+\.test\.ts) › (.+?)`?$/);
      expect(match, `${row.id} must name its proof as "spec/file.test.ts › test name"`).not.toBeNull();
      const [, file, name] = match!;
      expect(existsSync(file), `${row.id}: ${file} does not exist`).toBe(true);
      expect(readFileSync(file, "utf8"), `${row.id}: no test called "${name}" in ${file}`).toContain(`"${name}"`);
    }
  });

  it("resolves every source tag, and only adapted rows go without one", () => {
    for (const row of rows) {
      if (row.source === "—") {
        expect(row.treatment, `${row.id} has no source, so it must say what it adapts`).toMatch(/^adapted: /);
        continue;
      }
      for (const tag of row.source.split(",").map((t) => t.trim())) {
        expect(sourceTags.has(tag), `${row.id} cites ${tag}, which is not in Sources`).toBe(true);
      }
    }
  });
});
