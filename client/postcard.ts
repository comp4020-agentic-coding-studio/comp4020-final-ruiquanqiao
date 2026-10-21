// The bulletin board (ledger V18): the original signs you up for a road on a
// cork board, the road's name in orange-red condensed type over a line about
// it, its length, and a photo postcard of it pinned at the top right. The
// postcards here are drawn from the road itself (its first country, which way
// it bends, how it climbs), not photographed, so each matches the road it is
// pinned for. Pure, so the spec holds it without a page.

import { type Biome, type Track, biomeAt, curveAt, heightAt } from "../game/track.ts";

/** A line about each road, in the order of ROADS, written by me. */
export const TAGLINES = [
  "Pine, ice in the shade, and a bend near the top that keeps on tightening.",
  "A cliff on one side, the sea on the other, and oil all over the towns between.",
  "Open farmland and long straights, over crests that throw you into the air.",
  "Main streets and side streets, full of people who never look before they cross.",
  "The walls close in on both sides. There is nowhere to go but through.",
];

/** Which country each road's postcard shows, in the order of ROADS. */
const CARD: Biome[] = ["alpine", "coast", "valley", "town", "canyon"];

const SKY: Record<Biome, [string, string]> = {
  alpine: ["#5d7fb8", "#c9d6e6"],
  coast: ["#4f86c0", "#d8e4ee"],
  valley: ["#6a8fc4", "#e8dcc0"],
  town: ["#6c78a8", "#e6c9a0"],
  canyon: ["#7c6aa0", "#f0b878"],
};
const LAND: Record<Biome, string> = { alpine: "#3f6a44", coast: "#5a7a4a", valley: "#8a9a48", town: "#7a6a58", canyon: "#a8583a" };
const HILLS: Record<Biome, string> = { alpine: "#56607a", coast: "#6a7890", valley: "#8a8ca0", town: "#8a7a80", canyon: "#b06848" };

/**
 * A postcard of the road as inline SVG, 300 x 200: the sky, a range on the
 * horizon and the ground of the country it is known for, and the road
 * running away into it, bent the way it first bends.
 */
export function postcard(track: Track): string {
  // the country the road is known for, chosen as its tagline is: the first
  // 300 m gave Ridge Road a farmland card, and the most metres gave Gold
  // Town a canyon (74 of 170 samples against 54 in town)
  const b = CARD[track.id] ?? biomeAt(track, 300);
  // which way and how hard the first real bend goes, and whether it climbs
  let bend = 0;
  for (let z = 100; z < 1200; z += 20) if (Math.abs(curveAt(track, z)) > Math.abs(bend)) bend = curveAt(track, z);
  const climb = heightAt(track, 1000) - heightAt(track, 0);
  const horizon = 92 - Math.max(-12, Math.min(12, climb / 2));
  const lean = Math.max(-1, Math.min(1, bend * 300)) * 70;
  const [top, low] = SKY[b];
  const vx = 150 + lean;
  const peaks = [0, 40, 75, 120, 160, 205, 245, 300].map((x, i) => `${x},${horizon - (i % 2 ? 26 + ((x * 7) % 14) : 6)}`).join(" ");
  const id = `pc${track.id}`;
  return `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Postcard: ${track.name}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient></defs>
<rect width="300" height="200" fill="url(#${id})"/>
<polygon points="0,${horizon} ${peaks} 300,${horizon}" fill="${HILLS[b]}"/>
${b === "alpine" ? `<polygon points="${peaks}" fill="none" stroke="#f4f4f4" stroke-width="3" stroke-linejoin="round" opacity="0.8"/>` : ""}
<rect y="${horizon}" width="300" height="${200 - horizon}" fill="${LAND[b]}"/>
${b === "coast" ? `<rect x="${lean > 0 ? 0 : 200}" y="${horizon}" width="100" height="${200 - horizon}" fill="#2f6aa8"/>` : ""}
${b === "town" || b === "canyon" ? `<rect x="0" y="${horizon - 40}" width="70" height="${240 - horizon}" fill="${b === "town" ? "#9a4a3a" : "#8a4630"}"/><rect x="230" y="${horizon - 34}" width="70" height="${234 - horizon}" fill="${b === "town" ? "#c8b48a" : "#9a5034"}"/>` : ""}
<path d="M${vx - 3},${horizon} Q${150 + lean * 0.2},${horizon + 40} 40,200 L260,200 Q${150 + lean * 0.2 + 20},${horizon + 40} ${vx + 3},${horizon} Z" fill="#56505e"/>
<path d="M${vx},${horizon} Q${150 + lean * 0.2 + 10},${horizon + 40} 150,200" fill="none" stroke="#c0b04c" stroke-width="3" stroke-dasharray="10 9"/>
<rect x="3" y="3" width="294" height="194" fill="none" stroke="#f4ecdc" stroke-width="6"/>
</svg>`;
}
