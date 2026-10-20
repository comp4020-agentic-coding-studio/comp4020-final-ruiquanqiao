import { describe, expect, it } from "vitest";
import { ACTIONS, DEFAULT_KEYS, actionOf, keyName, loadKeys, rebind } from "../client/keys.ts";

// Configure Input (ledger R16): every control remapped by the rider.

describe("remapping the controls (R16)", () => {
  it("gives any action any key, swapping with whoever had it, so no key does two things and no action has none", () => {
    let keys = rebind(DEFAULT_KEYS, "hand", "KeyF");
    expect(actionOf(keys, "KeyF")).toBe("hand");
    expect(actionOf(keys, "KeyJ")).toBeUndefined();
    // F is taken by the hand; giving it to the kick swaps them
    keys = rebind(keys, "foot", "KeyF");
    expect(keys.foot).toBe("KeyF");
    expect(keys.hand).toBe("KeyK");
    for (const { action } of ACTIONS) expect(actionOf(keys, keys[action])).toBe(action);
    expect(new Set(Object.values(keys)).size).toBe(ACTIONS.length);
  });

  it("keeps the arrows working until one is given away, and refuses the keys a race already uses", () => {
    expect(actionOf(DEFAULT_KEYS, "ArrowLeft")).toBe("left");
    const keys = rebind(DEFAULT_KEYS, "hand", "ArrowLeft");
    expect(actionOf(keys, "ArrowLeft")).toBe("hand");
    expect(actionOf(keys, "ArrowRight")).toBe("right");
    for (const code of ["Escape", "F1", "F8", "KeyM"]) expect(rebind(DEFAULT_KEYS, "throttle", code)).toEqual(DEFAULT_KEYS);
  });

  it("comes back as it was left, from what the browser kept, and as the defaults from anything broken", () => {
    const keys = rebind(rebind(DEFAULT_KEYS, "throttle", "KeyI"), "brake", "KeyK");
    expect(loadKeys(JSON.stringify(keys))).toEqual(keys);
    expect(loadKeys(null)).toEqual(DEFAULT_KEYS);
    expect(loadKeys("{not json")).toEqual(DEFAULT_KEYS);
    // two actions on one key, written by hand: never both
    const odd = loadKeys(JSON.stringify({ ...DEFAULT_KEYS, hand: "KeyW" }));
    expect(new Set(Object.values(odd)).size).toBe(ACTIONS.length);
    expect(keyName("KeyW")).toBe("W");
    expect(keyName("ArrowLeft")).toBe("←");
    expect(keyName("ShiftLeft")).toBe("Shift Left");
  });
});

it("puts getting off the bike (M3) on L, out of the way of the riding keys", () => {
  expect(DEFAULT_KEYS.off).toBe("KeyL");
  expect(actionOf(DEFAULT_KEYS, "KeyL")).toBe("off");
});
