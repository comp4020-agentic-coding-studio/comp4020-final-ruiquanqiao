import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/ledger.md is the list of every mechanic of the original game and what
// this remake does with it. These checks hold it to the rules its own
// introduction states, so a row cannot quietly go without a decision, a
// deadline, a reason or a proof.

const ledger = readFileSync("docs/ledger.md", "utf8");
const [body, sourcesPart] = ledger.split(/^## Sources$/m);

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
      expect(["C8", "C9", "C10", "final"], row.id).toContain(row.due);
    }
  });

  it("points every built row at a spec test that exists", () => {
    for (const row of rows.filter((r) => r.status === "built")) {
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
