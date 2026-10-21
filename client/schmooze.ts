// Schmooze (ledger O7): the original's riders "let racing tips slip out when
// they get loose", and "don't expect to schmooze a course tip out of a rasher
// you just spent 5.3 miles hammering into a pulp" (PCM). Here they talk while
// the race loads. Every tip is read off the road it is about, so it is true:
// where the side roads are, where the cops wait, the roadblock, the tightest
// bend. Someone you knocked off gives you nothing but a threat. Pure, so the
// spec holds it without a page.

import type { Entry, Feud } from "../game/protocol.ts";
import { type Track, biomeAt, curveAt } from "../game/track.ts";

export type Line = { from: string; text: string; cold: boolean };

const km = (z: number): string => (z / 1000).toFixed(1);

/** Everything worth knowing about a road at a level, as the field would put it. */
export function tips(track: Track, level: number): string[] {
  const out: string[] = [];
  // the tightest bend, by curvature (game/track.ts)
  let tight = 0;
  for (let z = 200; z < track.length; z += 20) if (Math.abs(curveAt(track, z)) > Math.abs(curveAt(track, tight))) tight = z;
  if (tight > 0) {
    const way = curveAt(track, tight) > 0 ? "right" : "left";
    out.push(`The ${way}-hander at ${km(tight)} km tightens. Lean early or you're on the dirt.`);
  }
  // cross traffic waits at a side road from level 2 (T5): the first one it does
  const waiting = track.crossings.filter((_, i) => i % 3 < level - 1);
  if (waiting.length) out.push(`There's always a car sat at the side road at ${km(waiting[0])} km. It pulls out the second it hears you.`);
  else if (track.crossings.length) out.push(`The side roads are quiet at this level. Enjoy it while it lasts.`);
  // the police (P2): one to three, spread down the road
  const cops = 1 + Math.floor(level / 2);
  out.push(cops === 1 ? `Only one cop on this run, about half way. Don't stop near him.` : `${cops} cops on this run. Get knocked off near one and you're done.`);
  for (const b of track.roadblocks) out.push(`Roadblock at ${km(b.z)} km. Through the gap on the yellow line, or hit the sand at the edge and fly it.`);
  const town = [...Array(Math.ceil(track.length / 100)).keys()].map((i) => i * 100).find((z) => z > 300 && biomeAt(track, z) === "town");
  if (town !== undefined) out.push(`Town from ${km(town)} km. People walk out in front of you there. Some of us aim.`);
  if (track.slicks.length) out.push(`Watch the road surface. There's ${track.slicks[0].kind} at ${km(track.slicks[0].z)} km, and it's not the only patch.`);
  return out;
}

const COLD = [
  "Nothing to say to you. See you out there.",
  "You know what you did. Watch your back.",
  "Ask someone you haven't put in the dirt.",
];

const CHAT = [
  "My bike's held together with tape. Still faster than yours.",
  "Last race I lost a tooth. Found it in my glove at the finish.",
  "Whoever's got the chain, I want it.",
];

/**
 * What the field says to the one loading (`you`): a few NPCs with tips, and
 * each person in the race who holds a grudge against you, coldly. Picked by
 * the race's seed, so a race says the same thing in every browser that loads it.
 */
export function schmooze(track: Track, level: number, entrants: Entry[], you: number, feuds: Feud[], seed: number): Line[] {
  let s = seed >>> 0 || 1;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const out: Line[] = [];
  // a person you have knocked off holds it against you (O3): no tip from them
  for (const e of entrants) {
    if (!e.human || e.id === you) continue;
    const n = feuds.find((f) => f.holder === e.id && f.against === you)?.n ?? 0;
    if (n > 0) out.push({ from: e.name, text: COLD[(e.id + n) % COLD.length], cold: true });
  }
  const npcs = entrants.filter((e) => !e.human);
  const said = tips(track, level);
  // order the tips by the seed, then hand them out one to a rider
  const order = said.map((t) => ({ t, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  // three different riders, picked by the seed
  const who = npcs.map((e) => ({ e, k: rand() })).sort((a, b) => a.k - b.k).slice(0, 3);
  who.forEach(({ e }, i) => out.push({ from: e.name, text: order[i] ?? CHAT[i % CHAT.length], cold: false }));
  return out;
}
