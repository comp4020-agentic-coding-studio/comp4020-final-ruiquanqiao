// The people in a race, as the corner of the screen lists them (ledger N6):
// every person's place, in order, as the original's network game showed them
// in its upper left; and the grudges between them (O3). Pure, so the spec can
// hold it without a page.

import type { Entry, Feud } from "../game/protocol.ts";
import { type Race, standings } from "../game/sim.ts";

export type PersonRow = {
  id: number;
  name: string;
  look?: number;
  /** place in the race as it stands, NPCs counted */
  place: number;
  /** wrecked, busted, or left (the server stands a bike whose rider left as wrecked) */
  out: boolean;
  /** the bike the screen is behind */
  me: boolean;
  /** times this person has knocked the one watching off, and been knocked off by them, across every race */
  onYou: number;
  byYou: number;
};

/** Every person in the race, best placed first, with the grudges each holds against the one watching and the other way round. */
export function peopleRows(race: Race, entrants: Entry[], you: number | null, feuds: Feud[]): PersonRow[] {
  const order = standings(race);
  const tally = (holder: number | null, against: number | null): number => feuds.find((f) => f.holder === holder && f.against === against)?.n ?? 0;
  return entrants
    .filter((e) => e.human)
    .map((e) => {
      const r = race.riders.find((x) => x.id === e.id);
      return {
        id: e.id,
        name: e.name,
        look: e.look,
        place: order.findIndex((x) => x.id === e.id) + 1,
        out: r?.phase === "wrecked" || r?.phase === "busted",
        me: e.id === you,
        onYou: you === null || e.id === you ? 0 : tally(you, e.id),
        byYou: you === null || e.id === you ? 0 : tally(e.id, you),
      };
    })
    .sort((a, b) => a.place - b.place);
}

const times = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** What one person has done to the one watching, and been done by them, in words; "" if nothing. */
export function feudLine(onYou: number, byYou: number): string {
  if (onYou && byYou) return `Knocked you off ${times(onYou)}; you got them ${times(byYou)}`;
  if (onYou) return `Knocked you off ${times(onYou)}`;
  if (byYou) return `You knocked them off ${times(byYou)}`;
  return "";
}

/** One knockdown seen in a race, added to the tally the screen keeps (O3). Only between people. */
export function addFeud(feuds: Feud[], entrants: Entry[], holder: number, against: number): void {
  const human = (id: number): boolean => entrants.some((e) => e.id === id && e.human);
  if (holder === against || !human(holder) || !human(against)) return;
  const f = feuds.find((x) => x.holder === holder && x.against === against);
  if (f) f.n++;
  else feuds.push({ holder, against, n: 1 });
}
