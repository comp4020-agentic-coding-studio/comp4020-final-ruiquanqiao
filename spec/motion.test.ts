import { describe, expect, it } from "vitest";
import { joints } from "../client/sprites.ts";

// The movement of a blow, checked frame by frame in 3D. spec/sprites.test.ts
// holds each blow's key poses against the recording, and every one of those
// passed while the punch read as an elbow strike and the chain as an arm
// being cranked round: nothing looked at the frames in between, which is
// where the movement is. These are the rules a coach would give, written as
// measurements on every frame (bike space, metres; a right-hand blow goes out
// towards -x).

type P = [number, number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: P): number => Math.hypot(...a);
const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** how far out towards the blow, from the shoulder */
const out = (p: P, shoulder: P): number => shoulder[0] - p[0];

describe("a punch is thrown fist first", () => {
  const frames = ["punch~strike.R", "punchOut.R", "punch~return.R", "backhand~strike.R"];

  it.each(frames)("%s: the elbow trails the fist, never out ahead of it", (f) => {
    // a jab drives the fist and the elbow follows behind it; an elbow out as
    // far as the fist before the fist arrives is an elbow strike
    const j = joints(f);
    expect(out(j.elbow, j.shoulder), `elbow out ${out(j.elbow, j.shoulder).toFixed(2)} m, fist ${out(j.hand, j.shoulder).toFixed(2)} m`).toBeLessThanOrEqual(0.6 * out(j.hand, j.shoulder) + 0.03);
  });

  it.each(frames)("%s: the elbow is down, at or below the line from shoulder to fist", (f) => {
    const j = joints(f);
    const s = sub(j.hand, j.shoulder);
    const along = Math.max(0, Math.min(1, dot(sub(j.elbow, j.shoulder), s) / dot(s, s)));
    const lineY = j.shoulder[1] + s[1] * along;
    expect(j.elbow[1] - lineY, "elbow above the shoulder-fist line, m").toBeLessThanOrEqual(0.02);
  });

  it("goes out in one movement: the fist only ever moves further out until it lands", () => {
    const path = ["ride.R", "punch~strike.R", "punchOut.R"].map((f) => joints(f));
    for (let i = 1; i < path.length; i++) expect(out(path[i].hand, path[i].shoulder)).toBeGreaterThan(out(path[i - 1].hand, path[i - 1].shoulder) + 0.1);
  });
});

describe("a chain is swung like a whip", () => {
  const swing = ["chain~raise.R", "chainUp.R", "chain~sweep1.R", "chain~sweep2.R", "chainOut.R"];
  const at = swing.map((f) => joints(f));

  it("is drawn as links in every frame it is held, riding and putting away included", () => {
    for (const f of ["rideChain.R", ...swing, "chain~return.R", "backhandChain.R"]) expect(joints(f).chain, f).not.toBeNull();
  });

  it("is a chain of links, not a stick: it bends while it swings", () => {
    for (const [i, j] of at.entries()) {
      expect(j.chain, `${swing[i]} has no links`).not.toBeNull();
    }
    // somewhere in the windup the chain is visibly curved: end to end well short of its length
    const curved = at.slice(0, 4).some((j) => {
      const c = j.chain!;
      const length = c.slice(1).reduce((n, p, k) => n + len(sub(p, c[k])), 0);
      return len(sub(c.at(-1)!, c[0])) < 0.85 * length;
    });
    expect(curved).toBe(true);
  });

  it("trails the hand on the way: the tip lags behind where the hand is going", () => {
    for (let i = 1; i < 4; i++) {
      const move = sub(at[i].hand, at[i - 1].hand);
      const lag = sub(at[i].tip!, at[i].hand);
      expect(dot(lag, move), `${swing[i]}: the tip is ahead of the hand's movement`).toBeLessThan(0);
    }
  });

  it("cracks out at the hit: the tip moves fastest into the blow, faster than the hand, and lands straight out beyond it", () => {
    const tipSteps = at.slice(1).map((j, i) => len(sub(j.tip!, at[i].tip!)));
    const handLast = len(sub(at[4].hand, at[3].hand));
    expect(tipSteps.at(-1)).toBe(Math.max(...tipSteps));
    expect(tipSteps.at(-1)!).toBeGreaterThan(2 * handLast);
    const j = at[4];
    expect(out(j.tip!, j.shoulder)).toBeGreaterThan(out(j.hand, j.shoulder) + 0.5);
    const c = j.chain!;
    const length = c.slice(1).reduce((n, p, k) => n + len(sub(p, c[k])), 0);
    expect(len(sub(c.at(-1)!, c[0]))).toBeGreaterThan(0.85 * length);
  });

  it("leads with the elbow and lets the hand follow: the arm unfolds from the shoulder out", () => {
    // a whip is thrown base first: the elbow gets most of the way out while
    // the hand is still back, then the forearm and the chain snap through. The
    // hand getting out first, the elbow trailing, reads as an arm turned on a crank
    const progress = (pick: (j: ReturnType<typeof joints>) => P, i: number): number => {
      const a = pick(at[1]);
      const b = pick(at[4]);
      return dot(sub(pick(at[i]), a), sub(b, a)) / dot(sub(b, a), sub(b, a));
    };
    expect(progress((j) => j.elbow, 2), "elbow progress at the first sweep frame").toBeGreaterThan(progress((j) => j.hand, 2) + 0.2);
  });

  it("keeps the elbow under the hand at the hit, so the arm whips rather than turns", () => {
    const j = at[4];
    expect(j.elbow[1]).toBeLessThanOrEqual(j.hand[1] + 0.02);
  });
});
