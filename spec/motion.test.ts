import { describe, expect, it } from "vitest";
import { frameFor, joints } from "../client/sprites.ts";
import { type Rider, TUNE, startRace } from "../game/sim.ts";
import { makeTrack } from "../game/track.ts";

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

  it("keeps the elbow under the hand at the hit, so the arm whips rather than turns", () => {
    const j = at[4];
    expect(j.elbow[1]).toBeLessThanOrEqual(j.hand[1] + 0.02);
  });
});

// The swing as a coach describes it (Ruiquan, against the contact sheet of
// ca9385e): the upper arm level and all but still, the forearm turning about
// the elbow on one axis, from the chest out through half a circle. The first
// chain passed every rule above and still read as an arm cranked round a
// cone: the elbow rose and fell 37 cm and moved 31 cm front to back between
// frames, because each frame aimed it afresh.
describe("a chain is whipped from the elbow", () => {
  const swing = ["chainUp.R", "chain~sweep1.R", "chain~sweep2.R", "chainOut.R"];
  const at = swing.map((f) => joints(f));
  const fore = at.map((j) => sub(j.hand, j.elbow));
  const unit = (a: P): P => [a[0] / len(a), a[1] / len(a), a[2] / len(a)];
  const cross = (a: P, b: P): P => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const angle = (a: P, b: P): number => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;

  it("holds the upper arm level through the swing, within 15 degrees of flat", () => {
    for (const [i, j] of at.entries()) {
      const upper = sub(j.elbow, j.shoulder);
      expect((Math.asin(Math.abs(upper[1]) / len(upper)) * 180) / Math.PI, `${swing[i]}: upper arm off level, degrees`).toBeLessThan(15);
    }
  });

  it("keeps the elbow where it is: no frame of the swing moves it 6 cm from another", () => {
    for (let a = 0; a < at.length; a++)
      for (let b = a + 1; b < at.length; b++) expect(len(sub(at[a].elbow, at[b].elbow)), `${swing[a]} to ${swing[b]}, m`).toBeLessThan(0.06);
  });

  it("turns the forearm about one axis: every frame of it in one plane, all the same way round", () => {
    const n = unit(cross(fore[0], fore[1]));
    for (const [i, f] of fore.entries()) expect(Math.abs(dot(unit(f), n)), `${swing[i]}: forearm out of the plane`).toBeLessThan(Math.sin((8 * Math.PI) / 180));
    for (let i = 1; i < fore.length; i++) expect(dot(cross(fore[i - 1], fore[i]), n), `${swing[i]} turns back`).toBeGreaterThan(0);
  });

  it("starts with the fist at the chest and opens through at least 150 degrees", () => {
    expect(out(at[0].hand, at[0].shoulder), "fist out past the shoulder when drawn back, m").toBeLessThan(0.05);
    expect(angle(fore[0], fore.at(-1)!)).toBeGreaterThanOrEqual(150);
  });

  it("speeds up: each frame turns the forearm further than the one before", () => {
    const steps = fore.slice(1).map((f, i) => angle(fore[i], f));
    for (let i = 1; i < steps.length; i++) expect(steps[i], `steps ${steps.map((s) => s.toFixed(0)).join(", ")} degrees`).toBeGreaterThan(steps[i - 1]);
  });
});

// A fist is loaded before it is thrown: the elbow goes back and down and the
// fist comes in to the shoulder, slowly, then the fist is driven out fast.
// Thrown straight from the bar it had no load at all, and the elbow swung
// out ahead of the fist on the way. Timed from frameFor, the frames as the
// race steps through them.
describe("a punch is loaded, then driven", () => {
  const rider = (): Rider => startRace(makeTrack(1), 1, [{ id: 0, name: "me", human: true }], 1).riders[0];
  const shown = (kind: "punch" | "backhand"): { frame: string; t: number }[] => {
    const r = rider();
    r.attack = { kind, side: 1, t: 0, target: -1, landed: false };
    const seen: { frame: string; t: number }[] = [];
    for (let t = 0; t <= TUNE.fistWindup + 1e-9; t += 1 / 480) {
      r.attack.t = t;
      const f = frameFor(r);
      if (seen.at(-1)?.frame !== f) seen.push({ frame: f, t });
    }
    return seen;
  };

  it.each(["punch", "backhand"] as const)("%s: draws the elbow back and down before the fist goes out", (kind) => {
    const seen = shown(kind);
    // loaded: the fist in by the shoulder, the elbow under it and behind it,
    // and further back than it rides (the rider sits up to strike, so the
    // shoulder itself goes back; the elbow is judged against the fist)
    const ridden = joints("ride.R").elbow;
    const loaded = seen.map((s) => joints(s.frame)).filter((j) => j.elbow[1] < j.shoulder[1] - 0.15 && j.elbow[2] < j.hand[2] - 0.08 && j.elbow[2] < ridden[2] - 0.05 && out(j.hand, j.shoulder) < 0.15);
    expect(loaded.length, `frames: ${seen.map((s) => s.frame).join(", ")}`).toBeGreaterThan(0);
  });

  it.each(["punch", "backhand"] as const)("%s: the draw-back is slow and the drive is fast", (kind) => {
    const seen = shown(kind);
    const fists = seen.map((s) => joints(s.frame));
    // the turn: the frame where the fist is least far out
    let k = 0;
    for (let i = 1; i < fists.length; i++) if (out(fists[i].hand, fists[i].shoulder) < out(fists[k].hand, fists[k].shoulder)) k = i;
    const rest = joints("ride.R");
    const path = [rest, ...fists];
    const travel = (a: number, b: number): number => path.slice(a + 1, b + 1).reduce((n, j, i) => n + len(sub(j.hand, path[a + i].hand)), 0);
    const drawTime = seen[k + 1]?.t ?? TUNE.fistWindup;
    const driveTime = TUNE.fistWindup - drawTime;
    // a fist that never comes in has nothing to drive from
    expect(k, `frames: ${seen.map((s) => s.frame).join(", ")}`).toBeGreaterThan(0);
    expect(driveTime).toBeGreaterThan(0.02);
    expect(drawTime, `drawn back for ${drawTime.toFixed(3)} s, driven for ${driveTime.toFixed(3)} s`).toBeGreaterThanOrEqual(2 * driveTime);
    const out_ = joints(kind === "punch" ? "punchOut.R" : "backhand.R");
    const drawSpeed = travel(0, k + 1) / drawTime;
    const driveSpeed = (travel(k + 1, path.length - 1) + len(sub(out_.hand, path.at(-1)!.hand))) / driveTime;
    expect(driveSpeed, `fist ${drawSpeed.toFixed(1)} m/s back, ${driveSpeed.toFixed(1)} m/s out`).toBeGreaterThan(3 * drawSpeed);
  });
});
