import { describe, expect, it } from "vitest";
import { AI_LEATHERS, LIVERIES, NEUTRAL } from "../game/liveries.ts";

// A helmet is matched to the leathers as racing kit is: it repeats the
// suit's second colour or is white or black, never a third colour and never
// the suit's own main colour. Eleven of the fifteen AI sets and three of
// the eight people's broke it (a red helmet over white and navy, a green
// one over a green suit, a yellow one over magenta and lime): from behind
// the head either melted into the back or looked borrowed from someone else.
const sets = [...LIVERIES.map((l) => ({ name: l.name, main: l.main, trim: l.trim, helmet: l.helmet })), ...AI_LEATHERS.map(([main, trim, helmet], i) => ({ name: `AI ${i}`, main, trim, helmet }))];

describe("every set of leathers", () => {
  it.each(sets)("$name: the helmet is the second colour, or white or black", ({ trim, helmet }) => {
    expect([trim, ...NEUTRAL]).toContain(helmet);
  });

  it.each(sets)("$name: the helmet is never the suit's main colour", ({ main, helmet }) => {
    expect(helmet).not.toBe(main);
  });

  it("gives the AI riders pairs no person can be wearing", () => {
    const people = new Set(LIVERIES.map((l) => `${l.main}/${l.trim}`));
    for (const [main, trim] of AI_LEATHERS) expect(people.has(`${main}/${trim}`), `${main}/${trim}`).toBe(false);
  });
});
