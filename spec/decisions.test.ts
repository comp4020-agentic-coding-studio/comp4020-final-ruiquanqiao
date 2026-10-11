import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Crit 9's second line: "one decision about how the app behaves when several
// people use it at once is made and written down in the repo". Whether the
// decision is a good one is for the crit; that it is written down in the form
// the brief asks for (the options considered and what the choice costs), and
// that PROCESS.md points at it, is checked here.
const dir = "docs/decisions";
const records = readdirSync(dir).filter((f) => /^\d{4}-.+\.md$/.test(f));
const processMd = readFileSync("PROCESS.md", "utf8");

it("has at least one decision record", () => {
  expect(records.length).toBeGreaterThan(0);
});

it.each(records)("%s gives its context, at least two options and what the choice costs", (file) => {
  // a Windows checkout has CRLF line ends
  const md = readFileSync(`${dir}/${file}`, "utf8").replace(/\r\n/g, "\n");
  const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim().toLowerCase());
  expect(headings).toContain("context");
  expect(headings).toContain("options");
  expect(headings.some((h) => h.includes("cost"))).toBe(true);
  const options = md.split(/^## Options$/m)[1].split(/^## /m)[0];
  expect([...options.matchAll(/^\d+\. /gm)].length).toBeGreaterThanOrEqual(2);
});

it.each(records)("%s is linked from PROCESS.md", (file) => {
  expect(processMd).toContain(`${dir}/${file}`);
});
