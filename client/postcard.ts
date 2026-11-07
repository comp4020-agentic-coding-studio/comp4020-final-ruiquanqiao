// The bulletin board (ledger V18): the original signs you up for a road on a
// cork board, the road's name in orange-red condensed type over a line about
// it, its length, and a photo postcard of it pinned at the top right. The
// postcards here are photographs of each road taken in this game.

import type { Track } from "../game/track.ts";

/** A line about each road, in the order of ROADS, written by me. */
export const TAGLINES = [
  "Pine, ice in the shade, and a bend near the top that keeps on tightening.",
  "A cliff on one side, the sea on the other, and oil all over the towns between.",
  "Open farmland and long straights, over crests that throw you into the air.",
  "Main streets and side streets, full of people who never look before they cross.",
  "The walls close in on both sides. There is nowhere to go but through.",
];

/**
 * The postcard of a road: a photograph of it from the game itself, ridden
 * and taken by scripts/postcards.ts. Drawn as flat SVG shapes of the road's
 * country, the five cards were five colour fields that told a player nothing
 * of what each road looks like before they picked it.
 */
export function postcard(track: Track): string {
  return `<img src="/assets/postcards/road${track.id}.jpg" width="600" height="400" alt="Postcard: ${track.name}, as you ride it">`;
}
