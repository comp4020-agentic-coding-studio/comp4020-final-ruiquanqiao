import axe from "axe-core";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

// The accessibility floor the course template ran on every page, and that the
// final project's starter left for me to write: axe-core's full rule set
// against the HTML the server sends, for every page a visitor can land on.
// jsdom does no layout, so the two rules that need rendered colour are off
// here; scripts/a11y.ts runs axe in Chrome against each screen as it is drawn.
const baseUrl = inject("baseUrl");

const PAGES = ["/", "/live", "/leaderboard", "/readme/", "/readme/docs/ledger.md"];

describe.each(PAGES)("%s", (path) => {
  it("has no axe violations", async () => {
    const html = await (await fetch(new URL(path, baseUrl))).text();
    const dom = new JSDOM(html, { url: new URL(path, baseUrl).href, runScripts: "outside-only" });
    const window = dom.window as unknown as { eval: (source: string) => void; axe: typeof axe };
    window.eval(axe.source);
    const results = await window.axe.run(dom.window.document, {
      rules: { "color-contrast": { enabled: false }, "link-in-text-block": { enabled: false } },
    });
    const violations = results.violations.map(({ id, help, nodes }) => `${id}: ${help} (${nodes.map((n) => n.target.join(" ")).join("; ")})`);
    expect(violations).toEqual([]);
  });
});
