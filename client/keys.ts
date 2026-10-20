// Which key does what (ledger R16): the original's Configure Input remapped
// every control. Each action has one key of the rider's choosing, kept by the
// browser; the arrow keys stay on as well, unless one of them has been given
// to another action. Pure, so the spec holds it without a page.

import type { Input } from "../game/sim.ts";

export type Action = keyof Input;

export const ACTIONS: { action: Action; label: string }[] = [
  { action: "throttle", label: "Ride" },
  { action: "brake", label: "Brake" },
  { action: "left", label: "Steer left" },
  { action: "right", label: "Steer right" },
  { action: "hand", label: "Punch, or a weapon" },
  { action: "foot", label: "Kick" },
];

export type Bindings = Record<Action, string>;

export const DEFAULT_KEYS: Bindings = { throttle: "KeyW", brake: "KeyS", left: "KeyA", right: "KeyD", hand: "KeyJ", foot: "KeyK" };

const ARROWS: Record<string, Action> = { ArrowUp: "throttle", ArrowDown: "brake", ArrowLeft: "left", ArrowRight: "right" };

/** Keys that already mean something else in a race: leave, chat, music. */
export const RESERVED = /^(Escape|F([1-9]|1[0-2])|KeyM|Tab|Enter|Space|MetaLeft|MetaRight)$/;

/**
 * Give an action a key. A key another action had changes places with this
 * action's old one, so no key ever does two things and no action is left
 * without one. A reserved key changes nothing.
 */
export function rebind(keys: Bindings, action: Action, code: string): Bindings {
  if (RESERVED.test(code)) return keys;
  const next = { ...keys };
  const other = (Object.keys(next) as Action[]).find((a) => a !== action && next[a] === code);
  if (other) next[other] = keys[action];
  next[action] = code;
  return next;
}

/** The action a key does in a race, if any: the chosen keys first, then any arrow no one has taken. */
export function actionOf(keys: Bindings, code: string): Action | undefined {
  const chosen = (Object.keys(keys) as Action[]).find((a) => keys[a] === code);
  if (chosen) return chosen;
  return Object.values(keys).includes(code) ? undefined : ARROWS[code];
}

/** Read the bindings a browser kept, falling back to the defaults for anything missing or broken. */
export function loadKeys(saved: string | null): Bindings {
  let keys = { ...DEFAULT_KEYS };
  try {
    const raw = JSON.parse(saved ?? "{}") as Record<string, unknown>;
    for (const { action } of ACTIONS) if (typeof raw[action] === "string") keys = rebind(keys, action, raw[action] as string);
  } catch {
    // a broken entry is the defaults
  }
  return keys;
}

/** A key code as a person reads it: "KeyW" as W, "ArrowLeft" as ←, "Digit1" as 1. */
export function keyName(code: string): string {
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  if (arrows[code]) return arrows[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code.replace(/(Left|Right)$/, " $1").replace(/^Bracket/, "Bracket ");
}
