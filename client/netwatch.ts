// What this browser sees of the network during its race (ledger N14), kept
// over five seconds and sent to the server, which writes one line per person
// per race. Pure: no DOM and no clock of its own, so spec/net.test.ts feeds it
// times.
//
// The round trip alone does not say what a rider feels. Three other waits
// sit between a key and the screen, and each has its own number here: a key
// reaching the server and coming back in a snapshot (input), the snapshots
// themselves arriving unevenly (gap, stalls), and the page being too slow to
// draw them (frame). A prediction put back where the server said (snapped)
// is the one a rider sees as a jump.

import { NET, type NetReport, Samples, ms } from "../game/net.ts";

export class NetWatch {
  /** when each key message went out, by seq (s) */
  private sent = new Map<number, number>();
  private input = new Samples(300);
  private gap = new Samples(300);
  private frame = new Samples(600);
  private lastSnap: number | null = null;
  private stalls = 0;
  private snapped = 0;
  private since: number | null = null;
  /** the last round trip the server measured, ms, for the HUD */
  rtt: number | null = null;

  /** A key message went out at local time `now` (s). */
  keys(seq: number, now: number): void {
    this.since ??= now;
    this.sent.set(seq, now);
    // a message the server never acknowledges (one sent as the race ended) is forgotten
    if (this.sent.size > 120) this.sent.delete(this.sent.keys().next().value!);
  }

  /** A snapshot arrived at `now`, acknowledging every key message up to `ack`. */
  snap(ack: number, now: number): void {
    this.since ??= now;
    if (this.lastSnap !== null) {
      const g = (now - this.lastSnap) * 1000;
      this.gap.add(g);
      if (g > NET.stallMs) this.stalls++;
    }
    this.lastSnap = now;
    for (const [seq, at] of this.sent) {
      if (seq > ack) break;
      this.input.add((now - at) * 1000);
      this.sent.delete(seq);
    }
  }

  /** One's own bike was put where the server said, not eased there. */
  snappedBack(): void {
    this.snapped++;
  }

  /** A frame took `dt` seconds. */
  drew(dt: number): void {
    this.frame.add(dt * 1000);
  }

  /** The report, every NET.reportEvery seconds, or null when it is not yet time. Starts the next five seconds. */
  report(now: number): NetReport | null {
    if (this.since === null || now - this.since < NET.reportEvery) return null;
    const r: NetReport = { input: ms(this.input.p95()), gap: ms(this.gap.p95()), stalls: this.stalls, snapped: this.snapped, frame: ms(this.frame.p95()) };
    this.since = now;
    this.input.clear();
    this.gap.clear();
    this.frame.clear();
    this.stalls = 0;
    this.snapped = 0;
    return r;
  }
}

/** The ping the HUD shows, and the colour it shows it in. */
export function pingLabel(rtt: number | null): { text: string; tone: "good" | "fair" | "poor" } | null {
  if (rtt === null) return null;
  return { text: `${Math.round(rtt)} ms`, tone: rtt < NET.good ? "good" : rtt < NET.fair ? "fair" : "poor" };
}
