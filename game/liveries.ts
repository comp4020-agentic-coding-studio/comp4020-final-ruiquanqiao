// The leathers a person rides in, dealt when a room forms and seen the same by
// everyone in the race. No two people in one room wear the same pair, which is
// why a room holds at most as many people as there are pairs (ROOM). Each is a classic racing pairing: a main colour for
// the sleeves, seat and legs, a second over the shoulders and back, a helmet,
// and the bike painted to match. AI riders keep their own fifteen pairs
// (client/scene.ts), none of them one of these.
//
// Before, one's own rider was dealt a pair by its number in the race, and a
// fixed "hero" set was drawn over it only in one's own view: the others saw
// someone else. Then each person picked one, and two people could pick the
// same. Black & acid and Orange & red were cut once all ten were worn by the
// rider on the road: black legs and bike melted into the asphalt and left a
// lime blob, and two warm colours with no contrast smeared into one.

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
  pair("Purple & yellow", "#5b2a86", "#f0c419", "#f0c419"),
];

/** A livery number from anywhere (a message, storage), as one that exists, or undefined. */
export const liveryOf = (n: unknown): number | undefined => {
  // Number(null) and Number("") are 0, a real livery: a first visit's empty
  // storage read as a pick of the first one, and every newcomer wore it
  if (n === null || n === undefined || n === "") return undefined;
  const i = Math.round(Number(n));
  return Number.isInteger(i) && i >= 0 && i < LIVERIES.length ? i : undefined;
};
