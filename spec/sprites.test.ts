import { describe, expect, it } from "vitest";
import { type Measure, type Tile, frameFor, measure, tileFor } from "../client/sprites.ts";
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

  it("chambers a kick, leg bent and out, until it lands, then kicks it straight", () => {
    // the recording: leg cocked 57.00-57.20 (6 frames), out 57.24-57.40 (5)
    const r = rider();
    r.attack = { kind: "kick", side: -1, t: TUNE.windup * 0.5, target: -1, landed: false };
    expect(frameFor(r)).toBe("kickCock.L");
    r.attack.t = TUNE.windup;
    expect(frameFor(r)).toBe("kick.L");
  });
});

// The detail check. Each frame's joints, seen from straight behind as the
// chase camera sees them, against the same joints read off the recording at
// full resolution (docs/road-rash-feel.md, "Poses"): helmet widths from the
// helmet's centre, x out towards the blow, y up. A pose drawn by eye that
// comes out short, crouched or with the fist in the wrong place fails here
// instead of in someone's hands.
const POSES: [frame: string, at: string, joint: keyof Measure, x: number | null, y: number][] = [
  ["ride.R", "56.90", "tailLamp", null, -2.1],
  ["ride.R", "56.90", "elbow", 1.1, -1.35],
  ["punchCock.R", "247.44", "tailLamp", null, -2.85],
  ["punchCock.R", "247.44", "hand", 1.45, -0.4],
  ["punchCock.R", "247.44", "elbow", 1.8, -0.9],
  ["punchOut.R", "247.64", "tailLamp", 0.4, -2.85],
  ["punchOut.R", "247.64", "hand", 3.4, -0.6],
  ["chainOut.R", "247.64", "hand", 3.4, -0.6],
  ["clubOut.R", "247.64", "hand", 3.4, -0.6],
  ["clubUp.R", "355.32", "tailLamp", null, -2.4],
  ["clubUp.R", "355.32", "hand", 1.4, 0],
  ["chainUp.R", "355.32", "hand", 1.4, 0],
  ["kickCock.R", "57.08", "tailLamp", 0.45, -2.8],
  ["kickCock.R", "57.08", "knee", 2.2, -2.2],
  ["kickCock.R", "57.08", "foot", 3.2, -2.85],
  ["kick.R", "57.32", "tailLamp", 0.45, -2.9],
  ["kick.R", "57.32", "foot", 4.2, -2.45],
];

describe("every pose against the recording", () => {
  for (const [frame, at, joint, x, y] of POSES) {
    it(`${frame}: ${joint} where the recording has it at ${at} s`, () => {
      const [mx, my] = measure(frame)[joint];
      // half a helmet width: about what the recording can be read to
      if (x !== null) expect(Math.abs(mx - x), `x ${mx.toFixed(2)} against ${x}`).toBeLessThan(0.5);
      expect(Math.abs(my - y), `y ${my.toFixed(2)} against ${y}`).toBeLessThan(0.5);
    });
  }
});

describe("which drawn direction a bike is shown from", () => {
  /**
   * Swaps of tile or mirror image over 8 s while the camera closes on a bike
   * from `dz` metres behind at `closing` m/s, `dx` metres to one side, both bikes
   * wobbling sideways by `wobble` metres three times a second as they do.
   */
  function swaps(pick: (view: number, last: Tile) => Tile, dz: number, closing: number, dx: number, wobble: number): { swaps: number; tiles: number } {
    let last: Tile = { col: 0, flip: dx < 0 };
    let swaps = 0;
    const seen = new Set<string>();
    for (let f = 0; f < 60 * 8; f++) {
      const t = f / 60;
      const ahead = dz - closing * t;
      const side = dx + wobble * Math.sin(t * Math.PI * 6);
      const tile = pick(Math.atan2(side, ahead), last);
      if (tile.col !== last.col || tile.flip !== last.flip) swaps++;
      seen.add(`${tile.col}${tile.flip}`);
      last = tile;
    }
    return { swaps, tiles: seen.size };
  }
  // picked afresh every frame, as the first version did
  const afresh = (view: number): Tile => tileFor(view, { col: tileFor(view, { col: 0, flip: view < 0 }).col, flip: view < 0 });

  it("catches the flicker of picking afresh every frame", () => {
    // straight ahead, wobbling 8 cm: measured 47 swaps of mirror image in 8 s
    expect(swaps(afresh, 20, 0, 0, 0.08).swaps).toBeGreaterThan(10);
  });

  it("shows a bike straight ahead from one side only, whatever its wobble", () => {
    expect(swaps(tileFor, 20, 0, 0, 0.08).swaps).toBe(0);
  });

  it("turns a bike being passed through each drawn direction once", () => {
    // from 30 m behind to 2 m past it, 1.8 m over
    const pass = swaps(tileFor, 30, 4, 1.8, 0.08);
    expect(pass.tiles).toBeGreaterThan(3);
    expect(pass.swaps).toBe(pass.tiles - 1);
  });
});
