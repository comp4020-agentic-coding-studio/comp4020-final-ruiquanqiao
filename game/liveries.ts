// The leathers a person rides in, dealt when a room forms and seen the same by
// everyone in the race. No two people in one room wear the same pair, which is
// why a room holds at most as many people as there are pairs (ROOM). Each is a classic racing pairing: a main colour for
// the sleeves, seat and legs, a second over the shoulders and back, a helmet,
// and the bike painted to match. AI riders keep their own fifteen pairs
// (AI_LEATHERS below), none of them one of these.
//
// Before, one's own rider was dealt a pair by its number in the race, and a
// fixed "hero" set was drawn over it only in one's own view: the others saw
// someone else. Then each person picked one, and two people could pick the
// same. Black & acid and Orange & red were cut once all ten were worn by the
// rider on the road: black legs and bike melted into the asphalt and left a
// lime blob, and two warm colours with no contrast smeared into one.

export type Livery = { name: string; main: string; trim: string; helmet: string; paint: string; paintTrim: string };

const pair = (name: string, main: string, trim: string, helmet: string): Livery => ({ name, main, trim, helmet, paint: main, paintTrim: trim });

// How a helmet goes with the leathers, as racing kit is matched: it repeats
// one of the suit's colours rather than bringing a third, and is never the
// suit's main colour, which from behind melted the head into the back. So the
// shell is the second colour, or white or black, and its stripe is the main
// colour (client/sprites.ts). Before, eleven of the fifteen AI sets and three
// of these eight broke that: six helmets were the suit's own colour and the
// rest a colour the suit did not have (a red helmet over white and navy, a
// yellow one over magenta and lime). Purple & yellow and Green & red went
// with them, the first for a helmet that matched nothing and the second for
// two colours that fought; Green & yellow and Orange & navy took their place.
export const NEUTRAL = ["#f2f2f2", "#141414"];

export const LIVERIES: Livery[] = [
  pair("Powder & orange", "#74b9e0", "#f2711c", "#f2711c"),
  pair("White & navy", "#f0f0f0", "#1b3a8a", "#1b3a8a"),
  pair("Black & gold", "#161616", "#c9a23a", "#c9a23a"),
  pair("Blue & white", "#1d3f8f", "#f2f2f2", "#f2f2f2"),
  pair("Green & yellow", "#0d7a3d", "#f2c418", "#f2c418"),
  pair("White & red", "#f2f2f2", "#d01e2d", "#d01e2d"),
  pair("Lime & black", "#62bd2e", "#141414", "#141414"),
  pair("Orange & navy", "#ec6a1a", "#14254f", "#14254f"),
];

/** The AI riders' leathers, none of them one of the people's pairs: [main, second, helmet]. */
export const AI_LEATHERS: [string, string, string][] = [
  ["#c81e24", "#f2f2f2", "#f2f2f2"],
  ["#f2c418", "#1d3f8f", "#1d3f8f"],
  ["#12968c", "#f2f2f2", "#f2f2f2"],
  ["#b8bec6", "#1f4fa8", "#1f4fa8"],
  ["#1a2650", "#d21f2b", "#d21f2b"],
  ["#ec6a1a", "#f2f2f2", "#f2f2f2"],
  ["#4aa8e0", "#14254f", "#14254f"],
  ["#161616", "#d21f2b", "#d21f2b"],
  ["#5b2a86", "#f2f2f2", "#f2f2f2"],
  ["#c81e24", "#f2c418", "#f2c418"],
  ["#7a1a2e", "#c8ccd2", "#c8ccd2"],
  ["#1f4fa8", "#f2c418", "#f2c418"],
  ["#1f8a3a", "#141414", "#141414"],
  ["#f2f2f2", "#141414", "#141414"],
  ["#c9a23a", "#141414", "#141414"],
];

/** A livery number from anywhere (a message, storage), as one that exists, or undefined. */
export const liveryOf = (n: unknown): number | undefined => {
  // Number(null) and Number("") are 0, a real livery: a first visit's empty
  // storage read as a pick of the first one, and every newcomer wore it
  if (n === null || n === undefined || n === "") return undefined;
  const i = Math.round(Number(n));
  return Number.isInteger(i) && i >= 0 && i < LIVERIES.length ? i : undefined;
};
