import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAKE_AT, GAS_AT, STEER_AT, knobAt, stickKeys } from "../client/stick.ts";

// The phone layout gives riding to the left thumb and the fight to the right.
// The first layout had the gas under the right thumb beside the fists, so a
// player could not hold the throttle and punch with the same thumb at once.

const R = 100;

describe("the stick", () => {
  it("does nothing at rest, or inside its dead zone", () => {
    expect(stickKeys(0, 0, R)).toEqual({ left: false, right: false, throttle: false, brake: false });
    expect(stickKeys(R * STEER_AT * 0.9, -R * GAS_AT * 0.9, R)).toEqual({ left: false, right: false, throttle: false, brake: false });
  });

  it("steers across, with screen x to the right as the rider's right", () => {
    expect(stickKeys(-R, 0, R)).toMatchObject({ left: true, right: false });
    expect(stickKeys(R, 0, R)).toMatchObject({ left: false, right: true });
  });

  it("is the gas pushed up and the brake pulled down", () => {
    expect(stickKeys(0, -R, R)).toMatchObject({ throttle: true, brake: false });
    expect(stickKeys(0, R, R)).toMatchObject({ throttle: false, brake: true });
  });

  it("holds the gas and a steer together on a diagonal, as a thumb rides a bend", () => {
    expect(stickKeys(-0.7 * R, -0.7 * R, R)).toEqual({ left: true, right: false, throttle: true, brake: false });
  });

  it("never brakes a thumb steering hard that sags a little below centre", () => {
    expect(BRAKE_AT).toBeGreaterThan(GAS_AT);
    expect(stickKeys(R, 0.4 * R, R)).toMatchObject({ right: true, brake: false });
  });

  it("keeps working past the ring: a thumb that slides off still steers", () => {
    expect(stickKeys(-3 * R, -3 * R, R)).toMatchObject({ left: true, throttle: true });
    const [x, y] = knobAt(-3 * R, -3 * R, R);
    expect(Math.hypot(x, y)).toBeCloseTo(R);
  });
});

describe("the phone layout", () => {
  const html = readFileSync("client/index.html", "utf8");
  const pad = html.slice(html.indexOf('<div id="touch"'), html.indexOf("</section>", html.indexOf('<div id="touch"')));
  const keysIn = (part: string): string[] => [...part.matchAll(/data-key="(\w+)"/g)].map((m) => m[1]);

  it("puts riding on the stick and leaves the right thumb only the fight and getting off", () => {
    expect(pad).toContain('id="stick"');
    const right = pad.slice(pad.indexOf('class="pad right"'));
    expect(keysIn(right).sort()).toEqual(["foot", "hand", "off"]);
    expect(keysIn(pad)).not.toContain("throttle");
    expect(keysIn(pad)).not.toContain("left");
  });
});
