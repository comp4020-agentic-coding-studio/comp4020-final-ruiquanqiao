// How the network is doing while people race (ledger N14), measured the same
// way at both ends so a number in the log means what the HUD showed.
//
// Before this, a round trip was measured only while a race loaded, and only
// its shortest was kept (N10): right for timing GO, and blind to a connection
// that went bad in the second minute. scripts/netprobe.ts measured the rest
// from a test machine, never from anyone actually racing.

export const NET = {
  /** seconds between round trips asked of everyone racing */
  pingEvery: 1,
  /** seconds between a browser's reports of what it saw */
  reportEvery: 5,
  /** a round trip is a spike past both this many ms and SPIKE_RATIO times the person's usual */
  spikeMs: 150,
  spikeRatio: 3,
  /** a gap between snapshots this long (ms) is a stall: the bikes freeze, then jump */
  stallMs: 250,
  /** a server tick this late (ms) delays every snapshot behind it */
  serverStallMs: 100,
  /** seconds between two spike lines for one person, so a bad connection writes one line, not sixty */
  spikeQuiet: 10,
  /** what the HUD colours: below `good` ms green, below `fair` amber, else red */
  good: 80,
  fair: 150,
} as const;

/**
 * The last `size` samples of something, and the few numbers worth reading off
 * them. A ring, so the server can note every step of every race in one
 * without shifting an array sixty times a second.
 */
export class Samples {
  private ring: number[] = [];
  private next = 0;
  readonly size: number;

  constructor(size = 60) {
    this.size = size;
  }

  add(x: number): void {
    if (!Number.isFinite(x)) return;
    if (this.ring.length < this.size) this.ring.push(x);
    else this.ring[this.next] = x;
    this.next = (this.next + 1) % this.size;
  }

  get count(): number {
    return this.ring.length;
  }

  /** Oldest first. */
  values(): number[] {
    return this.ring.length < this.size ? [...this.ring] : [...this.ring.slice(this.next), ...this.ring.slice(0, this.next)];
  }

  /** The p-th quantile (0 to 1), nearest rank; null with nothing to read. */
  pct(p: number): number | null {
    if (this.ring.length === 0) return null;
    const s = [...this.ring].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  }

  median(): number | null {
    return this.pct(0.5);
  }

  p95(): number | null {
    return this.pct(0.95);
  }

  max(): number | null {
    return this.ring.length ? Math.max(...this.ring) : null;
  }

  /** The mean change from one sample to the next: jitter as RFC 3550 means it, unsmoothed. */
  jitter(): number | null {
    const xs = this.values();
    if (xs.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < xs.length; i++) sum += Math.abs(xs[i] - xs[i - 1]);
    return sum / (xs.length - 1);
  }

  clear(): void {
    this.ring = [];
    this.next = 0;
  }
}

/** A whole number of ms, or null: how every figure here goes into the log and onto the wire. */
export const ms = (x: number | null): number | null => (x === null ? null : Math.round(x));

/** What a browser saw over the last few seconds of a race, as it reports it. */
export type NetReport = {
  /** ms from a key going out to a snapshot saying the server had it: p95 */
  input: number | null;
  /** ms between snapshots arriving: p95 */
  gap: number | null;
  /** snapshot gaps past NET.stallMs */
  stalls: number;
  /** times one's own predicted bike was too far out to ease, and was put where the server said */
  snapped: number;
  /** ms a frame took to draw: p95 */
  frame: number | null;
};

/** A report off the wire, as numbers in range or nothing: it comes from a browser, and is believed no further. */
export function cleanReport(r: Record<string, unknown>): NetReport {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(60_000, Math.round(v)) : null);
  const count = (v: unknown): number => Math.min(1000, num(v) ?? 0);
  return { input: num(r.input), gap: num(r.gap), stalls: count(r.stalls), snapped: count(r.snapped), frame: num(r.frame) };
}
