import { describe, expect, it } from "vitest";
import { ROADS } from "../game/track.ts";
import { tally } from "../scripts/fights.ts";

// The aggression detector (ledger C11). A player who rides flat out and never
// swings, on every road, against a full field. The recording's rival rides up
// beside the player and stays there six seconds and more, swinging about once
// a second (351.5-357.5). The first AI only swung at whoever happened to be
// within 1.6 m and held its line away from everyone else: 3-7 swings at the
// player in 90 s, and never more than a few seconds alongside.

describe("the field picks fights with a player", () => {
  const all = ROADS.map((_, road) => tally(road, 11, 90, 1, 1));

  it("swings at a player who never swings back, on every road", () => {
    // measured: 7-19 a road in 90 s, 12 on average, now that a cop rides
    // alongside the player for much of a race and takes a flank a rider would
    // otherwise duel from (7-28 and 20 before). The race is chaotic, so
    // any change to the riding moves one road's count a lot: the floor is on
    // every road, and the bar on the average. Since a rub costs stamina
    // instead of knocking a rider off and a shunt never does, over four seeds
    // and every road: 14.1 swings a race down to 12.1, while blows landed went
    // up from 10.3 to 12.1 and the player was knocked off 1.75 times a race,
    // not 2.3. This seed gives 11.2, against the 12 it was set at. With cops
    // patrolling and no longer riding alongside the player: 14.9 a race
    for (const t of all) expect(t.swingsAtMe, t.road).toBeGreaterThanOrEqual(5);
    expect(all.reduce((n, t) => n + t.swingsAtMe, 0) / all.length).toBeGreaterThanOrEqual(10);
  });

  it("rides alongside for as long as the recording's rival does, somewhere on every road", () => {
    // measured: the longest stretch alongside 5.9-11.4 s
    for (const t of all) expect(t.longest, t.road).toBeGreaterThan(4);
  });

  it("knocks such a player off now and then, but does not hound them off every few seconds", () => {
    const down = all.reduce((n, t) => n + t.meDown, 0);
    // measured: 16 in 450 s
    expect(down).toBeGreaterThan(3);
    expect(down).toBeLessThan(30);
  });
});
