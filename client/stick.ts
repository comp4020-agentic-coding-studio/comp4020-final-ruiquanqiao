// The phone's left thumb: one stick for riding. The first phone layout put
// steering under the left thumb as two buttons and the throttle under the
// right, beside the fists, so a right thumb holding the gas could not punch
// without letting go of it. A stick takes all of riding: across steers, up is
// the gas, down is the brake, and the right thumb is left with the fight.
//
// The sim's steer is on or off, so the stick is read in zones, not as an
// analogue value. Each axis has a dead zone, and the gas zone is wider than
// the brake zone: a thumb steering hard drifts down a little, and that must
// not touch the brake.

export type StickKeys = { left: boolean; right: boolean; throttle: boolean; brake: boolean };

/** across this fraction of the radius, the stick steers */
export const STEER_AT = 0.3;
/** up this fraction of the radius, it is the gas */
export const GAS_AT = 0.25;
/** down this fraction of the radius, it is the brake */
export const BRAKE_AT = 0.55;

/**
 * What a thumb `dx`, `dy` pixels from the stick's centre holds, on a stick of
 * `radius` pixels. Screen axes: +x right, +y down.
 */
export function stickKeys(dx: number, dy: number, radius: number): StickKeys {
  const x = dx / radius;
  const y = dy / radius;
  return { left: x < -STEER_AT, right: x > STEER_AT, throttle: y < -GAS_AT, brake: y > BRAKE_AT };
}

/** Where the knob is drawn: the thumb's offset, held inside the ring. */
export function knobAt(dx: number, dy: number, radius: number): [number, number] {
  const d = Math.hypot(dx, dy);
  return d <= radius ? [dx, dy] : [(dx / d) * radius, (dy / d) * radius];
}
