// The leathers a person can ride in, picked in the lobby and seen the same by
// everyone in the race. Each is a classic racing pairing: a main colour for
// the sleeves, seat and legs, a second over the shoulders and back, a helmet,
// and the bike painted to match. AI riders keep their own fifteen pairs
// (client/scene.ts), none of them one of these.
//
// Before, one's own rider was dealt a pair by its number in the race, and a
// fixed "hero" set was drawn over it only in one's own view: the others saw
// someone else.

export type Livery = { name: string; main: string; trim: string; helmet: string; paint: string; paintTrim: string };

const pair = (name: string, main: string, trim: string, helmet: string): Livery => ({ name, main, trim, helmet, paint: main, paintTrim: trim });

export const LIVERIES: Livery[] = [
  pair("Powder & orange", "#74b9e0", "#f2711c", "#f4f4f4"),
  pair("White & navy", "#f0f0f0", "#1b3a8a", "#d21f2b"),
  pair("Black & gold", "#161616", "#c9a23a", "#c9a23a"),
  pair("Blue & white", "#1d3f8f", "#f2f2f2", "#f2f2f2"),
  pair("Green & red", "#0d7a3d", "#d81e2b", "#f2f2f2"),
  pair("White & red", "#f2f2f2", "#d01e2d", "#d01e2d"),
  pair("Lime & black", "#62bd2e", "#141414", "#62bd2e"),
  pair("Black & acid", "#151515", "#9bd12a", "#9bd12a"),
  pair("Orange & red", "#f2711c", "#c8102e", "#f2f2f2"),
  pair("Purple & yellow", "#5b2a86", "#f0c419", "#f0c419"),
];

/** A livery number from anywhere (a message, storage), as one that exists, or undefined. */
export const liveryOf = (n: unknown): number | undefined => {
  const i = Math.round(Number(n));
  return Number.isInteger(i) && i >= 0 && i < LIVERIES.length ? i : undefined;
};
