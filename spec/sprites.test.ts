import { describe, expect, it } from "vitest";
import { frameFor } from "../client/sprites.ts";
import { type Rider, TUNE, startRace } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

// Riders are drawn as pre-rendered frames, stepped through the way the
// original steps through its sprites (ledger V5, V15). The recording shows a
// blow as 6 frames drawn back and 5 out at 25 fps; these hold the stepping.

const rider = (): Rider => startRace(makeTrack(1), 1, [{ id: 0, name: "me", human: true }], 1).riders[0];

describe("rider frames", () => {
  it("draws a punch back until it lands, then shows it out at full stretch, on the side it is thrown", () => {
    const r = rider();
    r.attack = { kind: "punch", side: 1, t: 0, target: -1, landed: false };
    expect(frameFor(r)).toBe("punchCock.R");
    r.attack.t = TUNE.windup - 0.01;
    expect(frameFor(r)).toBe("punchCock.R");
    r.attack.t = TUNE.windup;
    expect(frameFor(r)).toBe("punchOut.R");
    r.attack.side = -1;
    expect(frameFor(r)).toBe("punchOut.L");
  });

  it("raises a club over the head before it comes down, and rides holding whatever it carries", () => {
    const r = rider();
    r.weapon = "club";
    expect(frameFor(r)).toBe("rideClub.R");
    r.attack = { kind: "punch", side: 1, t: TUNE.weaponWindup / 2, target: -1, landed: false };
    expect(frameFor(r)).toBe("clubUp.R");
    r.attack.t = TUNE.weaponWindup;
    expect(frameFor(r)).toBe("clubOut.R");
  });

  it("puts the leg out early in a kick", () => {
    const r = rider();
    r.attack = { kind: "kick", side: -1, t: TUNE.windup * 0.5, target: -1, landed: false };
    expect(frameFor(r)).toBe("kick.L");
  });
});
