import { describe, expect, it } from "vitest";
import { type Measure, type Tile, frameFor, measure, tileFor, tileSize } from "../client/sprites.ts";
import { type Rider, TUNE, startRace } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

// Riders are drawn as pre-rendered frames, stepped through the way the
// original steps through its sprites (ledger V5, V15). The recording shows a
// blow as 6 frames drawn back and 5 out at 25 fps; these hold the stepping.

const rider = (): Rider => startRace(makeTrack(1), 1, [{ id: 0, name: "me", human: true }], 1).riders[0];

describe("rider frames", () => {
  it("throws a punch straight out from the bar, out at full stretch the moment it lands, on the side it is thrown", () => {
    // drawn back first, through raise, cocked and two sweep frames, it read
    // as an arm wound round for a warm-up; now one frame halfway, then out
    const r = rider();
    r.attack = { kind: "punch", side: 1, t: 0, target: -1, landed: false };
    const seen: string[] = [];
    for (let t = 0; t < TUNE.windup + 0.2; t += 1 / 120) {
      r.attack.t = t;
      if (seen.at(-1) !== frameFor(r)) seen.push(frameFor(r));
    }
    expect(seen).toEqual(["punch~strike.R", "punchOut.R", "punch~return.R"]);
    r.attack.t = TUNE.windup;
    expect(frameFor(r)).toBe("punchOut.R");
    r.attack.side = -1;
    expect(frameFor(r)).toBe("punchOut.L");
  });

  it("puts a strike's one in-between pose where the fist is halfway out, so it moves in two even steps", () => {
    // the fist, from straight behind, in helmet widths, from the bar to out
    const path = ["ride.R", "punch~strike.R", "punchOut.R"].map((f) => measure(f).hand);
    const steps = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
    const whole = Math.hypot(path[2][0] - path[0][0], path[2][1] - path[0][1]);
    // halfway by the joints' straight lines put the fist 1.67 of 2.24 out in
    // one step and 0.57 in the next: the arm is straight early
    for (const step of steps) expect(step).toBeLessThan(whole * 0.6);
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

  it("swings the weapon it holds in a backhand too, on either side", () => {
    // a backhand with a club used to show a bare fist while it hit with the club
    for (const weapon of ["club", "chain"] as const)
      for (const side of [1, -1] as const) {
        const r = rider();
        r.weapon = weapon;
        const s = side > 0 ? "R" : "L";
        r.attack = { kind: "backhand", side, t: TUNE.weaponWindup * 0.4, target: -1, landed: false };
        expect(frameFor(r)).toBe(`${weapon}Up.${s}`);
        r.attack.t = TUNE.weaponWindup;
        expect(frameFor(r)).toBe(`backhand${weapon === "club" ? "Club" : "Chain"}.${s}`);
      }
  });

  it("kicks straight out, with no chambering first", () => {
    // the recording chambers the leg for 6 frames (57.00-57.20) before it
    // goes out; copied, the kick landed late, so it goes straight out
    const r = rider();
    r.attack = { kind: "kick", side: -1, t: TUNE.windup * 0.5, target: -1, landed: false };
    expect(frameFor(r)).toBe("kick~strike.L");
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

describe("how finely the frames are drawn", () => {
  it("draws every tile at 224 px on a desktop GPU, in pages inside 4096 px and no more memory than one RGBA page", () => {
    // at 96 and then 128 px a rider near the camera showed texels 5-6 screen
    // pixels across, coarser than the original's own sprites
    const desk = tileSize(16384, false);
    expect(desk.tile).toBe(224);
    expect(desk.perRow * desk.tile).toBeLessThanOrEqual(4096);
    expect(desk.rows * desk.tile).toBeLessThanOrEqual(4096);
    expect(desk.pages * desk.rows * desk.perRow).toBeGreaterThanOrEqual(desk.pages > 0 ? 702 : 0); // 760 before fists and kicks lost their drawn-back frames
    // two bytes a texel; the one RGBA page before the in-between frames was 4032 x 4032 x 4
    const bytes = desk.pages * desk.rows * desk.tile * desk.perRow * desk.tile * 2;
    expect(bytes).toBeLessThanOrEqual(4032 * 4032 * 4 * 1.35);
    // a phone gets less, and a small GPU still gets pages it can hold
    expect(tileSize(4096, true).tile).toBeLessThanOrEqual(160);
    const small = tileSize(2048, false);
    expect(small.rows * small.tile).toBeLessThanOrEqual(2048);
  });
});
