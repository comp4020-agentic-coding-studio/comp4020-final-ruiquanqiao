// The end of a race as the original shows it (ledger V19, with H4): a spiked
// star burst behind the word, then a still that says where you finished, as
// pc-end-winner-logo-01 and pc-end-winner-02 do. Drawn, not filmed. Pure, so
// the spec holds it without a page.

import type { Standing } from "../game/protocol.ts";

const PLACES = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

/** "First Place", "Twelfth" is past the original's words: "12th Place". */
export function placeWords(place: number): string {
  const n = PLACES[place - 1];
  if (n) return `${n} Place`;
  const s = place % 100 >= 11 && place % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][place % 10] ?? "th";
  return `${place}${s} Place`;
}

/** The word on the star for each way a race ends; the winner alone gets WINNER, with its bang. */
export function starWord(outcome: Standing["outcome"] | "watched", place: number): string {
  if (outcome === "qualified" && place === 1) return "Winner!";
  return { qualified: "Qualified", placed: "Placed", wrecked: "Wrecked", busted: "Busted", unfinished: "Out of time", quit: "Left", aborted: "Stopped", watched: "Race over" }[outcome];
}

/** The still's one line: "Ana finished in First Place." */
export function finishLine(name: string, outcome: Standing["outcome"], place: number): string {
  return outcome === "qualified" || outcome === "placed" ? `${name} finished in ${placeWords(place)}.` : "";
}

/**
 * The spiked star as inline SVG: twelve points of uneven length, orange to
 * deep red for a finish, steel blue for a wreck or a bust, behind a dark band
 * that the word sits on.
 */
export function starburst(outcome: Standing["outcome"] | "watched"): string {
  const hot = outcome === "qualified" || outcome === "placed" || outcome === "watched";
  const [a, b] = hot ? ["#ffb24a", "#c8321e"] : ["#9ab0d8", "#3a4870"];
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2 - Math.PI / 2;
    // long and short spikes in turn, every third long one longer still
    const r = i % 2 ? 34 : i % 6 === 0 ? 100 : 78;
    pts.push(`${(160 + Math.cos(ang) * r * 1.25).toFixed(1)},${(100 + Math.sin(ang) * r * 0.95).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<defs><radialGradient id="burst" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
<polygon points="${pts.join(" ")}" fill="url(#burst)" stroke="#000" stroke-width="2" stroke-linejoin="miter"/>
<rect x="0" y="78" width="320" height="44" fill="#120e16" opacity="0.82"/>
</svg>`;
}
