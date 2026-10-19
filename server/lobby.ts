// Matchmaking and the races it starts. Time comes in as an argument, so the
// pools can be tested with a fake clock (spec/lobby.test.ts) and the server
// just calls tick() with the real one.
//
// A pool that fires does not start a race straight away. It forms a match:
// everyone in it is asked to accept (N9), then everyone loads the race while
// the server measures each person's ping (N10), and only then does the race
// start, with each person's countdown shortened by half their round trip so
// GO lands at the same moment in every browser.

import { CHECK_WAIT, type Entry, type Room, GRID, LOAD_MAX, LOAD_MIN, MAX_AI, type Mode, POOL_WAIT, ROOM, SNAPSHOT_HZ, type Standing, type ToClient, encodeCar, encodeRider } from "../game/protocol.ts";
import { DT, type Input, type Race, NO_INPUT, TUNE, humansDone, standings, startRace, step, unpackInput } from "../game/sim.ts";
import { LIVERIES } from "../game/liveries.ts";
import { NET, Samples, cleanJump, cleanReport, ms } from "../game/net.ts";
import { ROADS, makeTrack } from "../game/track.ts";

export type Conn = {
  rider: number; // riders.id in the database
  name: string;
  send(msg: ToClient): void;
  pool: Mode | null;
  level: number;
  road: number; // the road this connection voted for (N4)
  /** how many AI riders this connection asked to race against (N2), or undefined for a full grid */
  field?: number;
  race: Live | null;
  local: number; // this connection's rider id inside its race
  seq: number; // last input sequence number applied
  /** the match this connection is accepting or loading, if any */
  match?: Match | null;
  /** the race this connection asked to spectate (N11), as against one it is shown while queued (N5) */
  watching?: number | null;
  /** round trip to this browser, s: the shortest seen while loading */
  rtt?: number;
};

/** One person's network over one race (N14), kept by bike so it outlives their connection. */
export type PersonNet = {
  who: string;
  /** round trips while racing, ms */
  rtt: Samples;
  /** each report's p95s, ms */
  input: Samples;
  gap: Samples;
  frame: Samples;
  stalls: number;
  snapped: number;
  spikes: number;
  /** big_jump lines written for them this race */
  jumps: number;
  /** when the last lag_spike line for them was written (s) */
  spoke: number;
};

const personNet = (who: string): PersonNet => ({ who, rtt: new Samples(600), input: new Samples(), gap: new Samples(), frame: new Samples(), stalls: 0, snapped: 0, spikes: 0, jumps: 0, spoke: -Infinity });

export type Match = {
  id: number;
  mode: Mode;
  members: Conn[];
  phase: "check" | "loading";
  accepted: Set<Conn>;
  /** check: answer by; loading: go by (s) */
  deadline: number;
  since: number;
  /** fixed when loading starts */
  level: number;
  road: number;
  seed: number;
  entrants: Entry[];
  progress: Map<Conn, number>;
  gone: Set<Conn>;
};

export type Live = {
  id: number;
  mode: Mode;
  level: number;
  road: number;
  track: string;
  race: Race;
  conns: Map<number, Conn>; // local id -> connection, while connected
  riders: Map<number, number>; // local id -> riders.id, for good
  quit: Set<number>;
  inputs: Map<number, Input>;
  watchers: Set<Conn>;
  entrants: Entry[];
  seed: number;
  steps: number;
  sent: number; // events already sent
  ended: boolean;
  timeLimit: number; // s
  /** each person's network, by bike (N14) */
  net: Map<number, PersonNet>;
};

type Pool = { members: Conn[]; startsAt: number | null };

export type Store = {
  startRace(mode: string, level: number, track: string): number;
  finishRace(race: number, level: number, track: string, standings: Standing[]): void;
  qualified(id: number): { level: number; track: string }[];
};

/** seconds before the same refusal of the same person is logged again */
export const REJECT_QUIET = 5;

export type Logger = (event: Record<string, unknown>) => void;

/** A person as the logs name them: the name they ride under, and the rider number behind it, so two people who share a name are still two. */
export const who = (c: Pick<Conn, "name" | "rider">): string => `${c.name}#${c.rider}`;

/** The ids a race event names a rider by, which the log replaces with who they are. */
const ROLES = ["by", "on", "rider", "from", "other", "cop"] as const;

// Riders of my own for the AI field (ledger H7: no names from the original).
const AI_NAMES = [
  "Dex Carbine", "Mona Sprocket", "Big Lou", "Rita Voltz", "Kid Marrow", "Saul Brake", "Juno Fang",
  "Otis Grime", "Pip Ransom", "Vera Knuckle", "Hank Rivet", "Lola Gash", "Moss", "Bruno Keel",
];

export class Lobby {
  pools: Record<Mode, Pool> = { ai: { members: [], startsAt: null }, human: { members: [], startsAt: null } };
  races = new Map<number, Live>();
  matches = new Map<number, Match>();
  private clock = 0; // seconds
  private matchIds = 0;
  /** every open connection, for the live rooms list */
  conns = new Set<Conn>();
  private listed = -1;
  private pinged = -1;
  private racePinged = -1;
  /** the server's own share of the wait (N14): ms each tick started late, and ms one race step took */
  readonly late = new Samples(600);
  readonly stepCost = new Samples(600);
  private lastTick: number | null = null;
  private stalled = -Infinity;
  /** when each person was last logged refused, by action and reason, so a page that keeps asking writes one line, not hundreds */
  private refused = new WeakMap<Conn, Map<string, number>>();

  private store: Store;
  private log: Logger;
  private random: () => number;
  /** a wall clock in ms, for timing the work itself; a test passes a fake */
  private perf: () => number;

  constructor(store: Store, log: Logger = () => {}, random: () => number = Math.random, perf: () => number = () => performance.now()) {
    this.store = store;
    this.log = log;
    this.random = random;
    this.perf = perf;
  }

  // ---- the pools (N2, N3) ----

  join(conn: Conn, mode: Mode, level: number, now: number, road = 0, field?: number): void {
    if (conn.race && !conn.race.ended) return this.reject(conn, "queue", "already racing");
    if (conn.match) return this.reject(conn, "queue", "already matched");
    this.leave(conn, now);
    conn.pool = mode;
    conn.level = Math.min(5, Math.max(1, Math.round(level) || 1));
    conn.road = Math.min(ROADS.length - 1, Math.max(0, Math.round(road) || 0));
    conn.field = field === undefined || !Number.isFinite(field) ? undefined : Math.min(MAX_AI, Math.max(0, Math.round(field)));
    const pool = this.pools[mode];
    pool.members.push(conn);
    if (pool.members.length >= ROOM) {
      // a full room goes now; anyone after it waits for the next (N1)
      pool.startsAt = now;
    } else if (mode === "ai") {
      // everyone who joins in the five seconds after the first is taken along
      pool.startsAt ??= now + POOL_WAIT.ai;
    } else {
      // each newcomer restarts the ten seconds, so more can make it in
      pool.startsAt = now + POOL_WAIT.human;
    }
    this.log({ ev: "queue", who: who(conn), mode, level: conn.level, road: ROADS[conn.road]?.name, pool: pool.members.length });
    if (!conn.watching) this.watchNewest(conn);
    this.announce(mode, now);
  }

  leave(conn: Conn, now: number): void {
    // leaving the queue once a match is found is a decline
    if (conn.match?.phase === "check") return this.decline(conn, now);
    const mode = conn.pool;
    if (!mode) return;
    const pool = this.pools[mode];
    pool.members = pool.members.filter((c) => c !== conn);
    if (pool.members.length === 0) pool.startsAt = null;
    conn.pool = null;
    for (const live of this.races.values()) if (live.id !== conn.watching) live.watchers.delete(conn);
    this.log({ ev: "unqueue", who: who(conn), mode });
    this.announce(mode, now);
  }

  /** A new connection, listed for the live rooms page. */
  hello(conn: Conn): void {
    this.conns.add(conn);
    conn.send({ t: "live", races: this.rooms() });
  }

  // ---- live rooms and spectating (N11) ----

  /** Every race on the road, as the live rooms page lists them. */
  rooms(): Room[] {
    return [...this.races.values()]
      .filter((l) => !l.ended)
      .map((l) => ({
        race: l.id,
        mode: l.mode,
        level: l.level,
        track: l.road,
        time: Math.round(l.race.t * 10) / 10,
        humans: l.entrants.filter((e) => e.human).map((e) => ({ name: e.name, look: e.look, out: l.quit.has(e.id), ping: ms(l.net.get(e.id)?.rtt.median() ?? null) })),
        npcs: l.entrants.filter((e) => !e.human).length,
        watchers: [...l.watchers].filter((c) => c.watching === l.id).length,
      }));
  }

  watch(conn: Conn, race: number): void {
    const live = this.races.get(race);
    if (!live || live.ended) return this.reject(conn, "watch", "no such race", { race });
    if ((conn.race && !conn.race.ended) || conn.match) return this.reject(conn, "watch", "busy racing", { race });
    for (const other of this.races.values()) other.watchers.delete(conn);
    conn.watching = race;
    live.watchers.add(conn);
    conn.send({ t: "start", race: live.id, level: live.level, track: live.road, seed: live.seed, entrants: live.entrants, you: null, countdown: Math.max(0, -live.race.t) });
    this.log({ ev: "watch", who: who(conn), race });
    this.log({ ev: "snapshot", who: who(conn), kind: "race", race, riders: live.race.riders.length, raceT: Math.round(live.race.t * 10) / 10 });
  }

  unwatch(conn: Conn): void {
    const race = conn.watching;
    if (race) this.log({ ev: "unwatch", who: who(conn), race });
    conn.watching = null;
    for (const live of this.races.values()) if (live.id === race) live.watchers.delete(conn);
  }

  disconnect(conn: Conn, now: number): void {
    this.conns.delete(conn);
    this.unwatch(conn);
    const m = conn.match;
    // gone while loading: the bike is in the race as one that left
    if (m?.phase === "loading") m.gone.add(conn);
    this.leave(conn, now);
    this.quit(conn, true);
  }

  // ---- a match found (N9) ----

  accept(conn: Conn, now: number): void {
    const m = conn.match;
    if (!m || m.phase !== "check") return this.reject(conn, "accept", "no match to answer");
    if (m.accepted.has(conn)) return this.reject(conn, "accept", "already accepted", { match: m.id });
    m.accepted.add(conn);
    this.log({ ev: "accept", who: who(conn), match: m.id, accepted: m.accepted.size, of: m.members.length });
    for (const c of m.members) c.send({ t: "check", match: m.id, accepted: m.accepted.size, of: m.members.length });
    if (m.accepted.size === m.members.length) this.load(m, now);
  }

  decline(conn: Conn, now: number): void {
    const m = conn.match;
    if (!m || m.phase !== "check") return this.reject(conn, "decline", "no match to answer");
    this.log({ ev: "decline", who: who(conn), match: m.id });
    this.fail(m, [conn], now, "declined");
  }

  /** Those who did not accept are out; everyone who did goes back to the front of the pool. */
  private fail(m: Match, out: Conn[], now: number, why: "declined" | "missed"): void {
    this.matches.delete(m.id);
    for (const c of out) {
      c.match = null;
      c.send({ t: "dropped", why });
    }
    const back = m.members.filter((c) => !out.includes(c));
    const pool = this.pools[m.mode];
    for (const c of back) {
      c.match = null;
      c.pool = m.mode;
      c.send({ t: "requeued", mode: m.mode });
    }
    pool.members.unshift(...back);
    if (pool.members.length > 0) pool.startsAt = now + POOL_WAIT[m.mode];
    this.log({ ev: "match_failed", match: m.id, why, out: out.map(who), back: back.map(who) });
    this.announce(m.mode, now);
  }

  // ---- loading (N10) ----

  progress(conn: Conn, p: number): void {
    const m = conn.match;
    if (!m || m.phase !== "loading" || !Number.isFinite(p)) return;
    m.progress.set(conn, Math.max(m.progress.get(conn) ?? 0, Math.min(1, Math.max(0, p))));
  }

  pong(conn: Conn, at: number, now: number): void {
    const rtt = now - at;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 5) return;
    const live = conn.race;
    if (live && !live.ended) return this.racePong(live, conn, rtt * 1000, now);
    // the shortest, as NTP takes it: a page busy loading answers late, and
    // that wait is the page, not the network. Averaged, a browser on the same
    // machine read 147 ms while it built the scene, and the count it was sent
    // would have run out 70 ms before everyone else's
    conn.rtt = conn.rtt === undefined ? rtt : Math.min(conn.rtt, rtt);
  }

  // ---- the network while racing (N14) ----

  /**
   * A round trip in a race. Every one is kept, not the shortest: here the
   * question is how the connection is doing, and a slow answer is the answer.
   * One far past the person's usual is a spike, and is written down.
   */
  private racePong(live: Live, conn: Conn, rtt: number, now: number): void {
    const n = live.net.get(conn.local);
    if (!n) return;
    const usual = n.rtt.count >= 5 ? n.rtt.median()! : null;
    n.rtt.add(rtt);
    if (usual !== null && rtt > NET.spikeMs && rtt > NET.spikeRatio * usual) {
      n.spikes++;
      if (now - n.spoke >= NET.spikeQuiet) {
        n.spoke = now;
        this.log({ ev: "lag_spike", who: n.who, race: live.id, kind: "rtt", ms: Math.round(rtt), usual: Math.round(usual) });
      }
    }
  }

  /** What a racing browser saw over its last few seconds. */
  report(conn: Conn, raw: Record<string, unknown>, now: number): void {
    const live = conn.race;
    const n = live && !live.ended ? live.net.get(conn.local) : undefined;
    if (!live || !n) return;
    const r = cleanReport(raw);
    if (r.input !== null) n.input.add(r.input);
    if (r.gap !== null) n.gap.add(r.gap);
    if (r.frame !== null) n.frame.add(r.frame);
    n.stalls += r.stalls;
    n.snapped += r.snapped;
    if (r.stalls > 0 && now - n.spoke >= NET.spikeQuiet) {
      n.spoke = now;
      this.log({ ev: "lag_spike", who: n.who, race: live.id, kind: "stall", stalls: r.stalls, gap: r.gap, snapped: r.snapped });
    }
  }

  /**
   * One's own bike seen far from where the server had it (N14): written down
   * whole, with the round trip the server knows of, so the log holds what was
   * going on. A few per person per race, so a bug that fires every frame
   * cannot fill the database.
   */
  jump(conn: Conn, raw: Record<string, unknown>): void {
    const live = conn.race;
    const n = live && !live.ended ? live.net.get(conn.local) : undefined;
    if (!live || !n) return this.reject(conn, "jump", "not racing");
    if (n.jumps >= NET.jumpsPerRace) return this.reject(conn, "jump", "over the per-race limit", { race: live.id });
    const j = cleanJump(raw);
    if (!j) return this.reject(conn, "jump", "malformed", { race: live.id });
    n.jumps++;
    this.log({ ev: "big_jump", who: n.who, race: live.id, ...j, raceNow: Math.round(live.race.t * 100) / 100, rtt: ms(n.rtt.values().at(-1) ?? null) });
  }

  /**
   * One line per person per race: how their network was, start to finish or
   * to leaving. The browser's figures are p95s of five seconds each; the line
   * gives their median (a typical stretch) and their worst.
   */
  private netLine(live: Live, id: number): void {
    const n = live.net.get(id);
    if (!n) return;
    live.net.delete(id);
    this.log({
      ev: "net",
      who: n.who,
      race: live.id,
      pings: n.rtt.count,
      rtt: ms(n.rtt.median()),
      rttP95: ms(n.rtt.p95()),
      rttMax: ms(n.rtt.max()),
      jitter: ms(n.rtt.jitter()),
      spikes: n.spikes,
      bigJumps: n.jumps,
      input: ms(n.input.median()),
      inputWorst: ms(n.input.max()),
      gap: ms(n.gap.median()),
      gapWorst: ms(n.gap.max()),
      stalls: n.stalls,
      snapped: n.snapped,
      frame: ms(n.frame.median()),
      frameWorst: ms(n.frame.max()),
    });
  }


  /**
   * Out of the race and back to the board, with the tab still open (H8). The
   * race goes on for everyone else, and the standings say "left".
   */
  quit(conn: Conn, closing = false): void {
    const live = conn.race;
    if (!closing && !(live && !live.ended)) this.reject(conn, "quit", "not racing");
    if (live && !live.ended) {
      live.quit.add(conn.local);
      const r = live.race.riders.find((x) => x.id === conn.local);
      if (r && r.phase !== "finished") r.phase = "wrecked";
      live.conns.delete(conn.local);
      this.log({ ev: "quit", who: who(conn), race: live.id });
      this.netLine(live, conn.local);
    }
    conn.race = null;
  }

  input(conn: Conn, seq: number, keys: number): void {
    const live = conn.race;
    if (!live || live.ended) return this.reject(conn, "input", "not racing");
    if (seq <= conn.seq) return this.reject(conn, "input", "stale sequence", { seq, last: conn.seq });
    conn.seq = seq;
    live.inputs.set(conn.local, unpackInput(keys));
  }

  /**
   * An action the server refused, logged once per person, action and reason
   * in any few seconds. Refusing without a word was how the server behaved
   * until crit 10's test, which needs "server rejects action" in the log.
   */
  reject(conn: Conn, action: string, why: string, extra: Record<string, unknown> = {}): void {
    const at = this.perf() / 1000;
    let seen = this.refused.get(conn);
    if (!seen) this.refused.set(conn, (seen = new Map()));
    const key = `${action}|${why}`;
    const last = seen.get(key);
    if (last !== undefined && at - last < REJECT_QUIET) return;
    seen.set(key, at);
    this.log({ ev: "reject", who: who(conn), action, why, ...extra });
  }

  private announce(mode: Mode, now: number): void {
    const pool = this.pools[mode];
    for (const c of pool.members) {
      c.send({
        t: "pool",
        mode,
        count: pool.members.length,
        startsIn: pool.startsAt === null ? null : Math.max(0, pool.startsAt - now),
        waitingForMore: mode === "human" && pool.startsAt === null,
      });
    }
  }

  /** People waiting in a pool watch the newest race on the road (N5). */
  private watchNewest(conn: Conn): void {
    const newest = [...this.races.values()].filter((l) => !l.ended).at(-1);
    if (!newest) return;
    newest.watchers.add(conn);
    conn.send({ t: "start", race: newest.id, level: newest.level, track: newest.road, seed: newest.seed, entrants: newest.entrants, you: null, countdown: TUNE.countdown });
  }

  /** A pool fires: the first eight in it are a match, asked to accept (N9). */
  private startFrom(mode: Mode, now: number): void {
    const pool = this.pools[mode];
    // a room takes the first eight; the rest start the wait for the next
    const members = pool.members.slice(0, ROOM);
    pool.members = pool.members.slice(ROOM);
    pool.startsAt = pool.members.length === 0 ? null : now + POOL_WAIT[mode];
    for (const c of members) c.pool = null;
    const m: Match = { id: ++this.matchIds, mode, members, phase: "check", accepted: new Set(), deadline: now + CHECK_WAIT, since: now, level: 1, road: 0, seed: 0, entrants: [], progress: new Map(), gone: new Set() };
    this.matches.set(m.id, m);
    for (const c of members) {
      c.match = m;
      c.send({ t: "found", match: m.id, mode, of: members.length, answer: CHECK_WAIT });
    }
    this.log({ ev: "match_found", match: m.id, mode, people: members.map(who) });
    if (pool.members.length > 0) this.announce(mode, now);
  }

  /** Everyone accepted: fix the race as it will be, and have everyone load it (N10). */
  private load(m: Match, now: number): void {
    const { members, mode } = m;
    for (const c of members) c.rtt = undefined; // measured afresh for this race
    m.phase = "loading";
    m.since = now;
    m.deadline = now + LOAD_MAX;

    // level by majority vote; a tie is broken at random (N4)
    const votes = new Map<number, number>();
    for (const c of members) votes.set(c.level, (votes.get(c.level) ?? 0) + 1);
    const most = Math.max(...votes.values());
    const tied = [...votes.keys()].filter((l) => votes.get(l) === most).sort();
    m.level = tied[Math.floor(this.random() * tied.length)];
    // and the road the same way (N4)
    const roadVotes = new Map<number, number>();
    for (const c of members) roadVotes.set(c.road ?? 0, (roadVotes.get(c.road ?? 0) ?? 0) + 1);
    const roadMost = Math.max(...roadVotes.values());
    const roadTied = [...roadVotes.keys()].filter((r) => roadVotes.get(r) === roadMost).sort();
    m.road = roadTied[Math.floor(this.random() * roadTied.length)];

    const entrants: Entry[] = [];
    const seen = new Map<number, number>();
    // the leathers, dealt: a shuffle of every pair, one each, so no two people
    // in the room look alike (N13)
    const deck = LIVERIES.map((_, i) => i).sort(() => this.random() - 0.5);
    members.forEach((c, i) => {
      // two tabs of one rider are two bikes; tell them apart by number
      const n = (seen.get(c.rider) ?? 0) + 1;
      seen.set(c.rider, n);
      entrants.push({ id: i, name: n > 1 ? `${c.name} (${n})` : c.name, human: true, look: deck[i] });
    });
    if (mode === "ai") {
      // as many NPC riders as asked for (N2): the median of what everyone in
      // the pool asked, so one person cannot empty or flood the road alone;
      // anyone who did not say wants the original's full grid of fifteen
      const asks = members.map((c) => c.field ?? Math.max(0, GRID - members.length)).sort((p, q) => p - q);
      const ai = asks[Math.floor((asks.length - 1) / 2)];
      const names = [...AI_NAMES].sort(() => this.random() - 0.5);
      for (let i = entrants.length; i < members.length + ai; i++) entrants.push({ id: i, name: names[(i - members.length) % names.length], human: false });
    }
    m.entrants = entrants;
    m.seed = Math.floor(this.random() * 2 ** 31);
    members.forEach((c, i) => c.send({ t: "loading", match: m.id, level: m.level, track: m.road, seed: m.seed, entrants, you: i }));
    this.ping(m, now);
  }

  /** Ask every browser in a loading match for a round trip, and tell them all how everyone is doing. */
  private ping(m: Match, now: number): void {
    const riders = m.members.map((c, i) => ({ id: i, p: m.gone.has(c) ? 0 : (m.progress.get(c) ?? 0), ping: Math.round((c.rtt ?? 0) * 1000) }));
    for (const c of m.members) {
      if (m.gone.has(c)) continue;
      c.send({ t: "ping", at: now });
      c.send({ t: "loads", match: m.id, riders });
    }
  }

  /** Everyone loaded, or the wait ran out: the race starts. */
  private launch(m: Match, now: number): void {
    this.matches.delete(m.id);
    const { members, mode, level, road, entrants, seed } = m;
    const track = makeTrack(level, road);
    const id = this.store.startRace(mode, level, track.name);
    const race = startRace(track, level, entrants, seed, TUNE.countdown);
    const live: Live = {
      id,
      mode,
      level,
      road,
      track: track.name,
      race,
      conns: new Map(),
      riders: new Map(members.map((c, i) => [i, c.rider])),
      quit: new Set(),
      inputs: new Map(),
      watchers: new Set(),
      entrants,
      seed,
      steps: 0,
      sent: 0,
      ended: false,
      timeLimit: track.length / 30 + 90,
      net: new Map(),
    };
    this.races.set(id, live);
    members.forEach((c, i) => {
      c.match = null;
      if (m.gone.has(c)) {
        // left while loading: a bike that never moves, standing as one that left
        live.quit.add(i);
        const r = race.riders.find((x) => x.id === i);
        if (r) r.phase = "wrecked";
        return;
      }
      for (const other of this.races.values()) other.watchers.delete(c);
      c.watching = null;
      c.race = live;
      c.local = i;
      c.seq = 0;
      live.conns.set(i, c);
      live.net.set(i, personNet(who(c)));
      // the message takes half a round trip to arrive; the count it carries is
      // that much shorter, so GO lands at the same moment for everyone
      c.send({ t: "start", race: id, level, track: road, seed, entrants, you: i, countdown: Math.max(0, TUNE.countdown - (c.rtt ?? 0) / 2) });
    });
    const late = members.filter((c) => !m.gone.has(c) && (m.progress.get(c) ?? 0) < 1).length;
    // who each rider number in this race is, for reading its events back
    const riders = Object.fromEntries(members.map((c, i) => [i, who(c)]));
    this.log({ ev: "race_start", race: id, match: m.id, mode, level, road: track.name, riders, npcs: entrants.length - members.length, loadSecs: Math.round((now - m.since) * 10) / 10, late, pings: members.map((c) => Math.round((c.rtt ?? 0) * 1000)) });
    // anyone still queued watches the new race
    for (const p of Object.values(this.pools)) {
      for (const c of p.members) {
        if (c.watching) continue;
        for (const other of this.races.values()) other.watchers.delete(c);
        this.watchNewest(c);
      }
    }
  }

  // ---- the clock ----

  /** Advance everything to `now` (seconds). */
  tick(now: number): void {
    // how far past its due time this tick ran; only while racing, since an
    // idle server's ticks keep nobody waiting
    if (this.lastTick !== null && this.races.size > 0) {
      const late = Math.max(0, (now - this.lastTick - 1 / 120) * 1000);
      this.late.add(late);
      if (late > NET.serverStallMs && now - this.stalled >= NET.spikeQuiet) {
        this.stalled = now;
        this.log({ ev: "server_stall", ms: Math.round(late), races: this.races.size, riders: [...this.races.values()].reduce((k, l) => k + l.race.riders.length, 0) });
      }
    }
    this.lastTick = now;
    for (const mode of ["ai", "human"] as const) {
      const pool = this.pools[mode];
      if (pool.startsAt === null || now < pool.startsAt) continue;
      if (mode === "human" && pool.members.length < 2) {
        // alone in the human pool: keep waiting for someone (N3)
        pool.startsAt = null;
        this.announce(mode, now);
        continue;
      }
      if (pool.members.length > 0) this.startFrom(mode, now);
    }

    for (const m of [...this.matches.values()]) {
      if (m.phase === "check" && now >= m.deadline) {
        this.fail(m, m.members.filter((c) => !m.accepted.has(c)), now, "missed");
        continue;
      }
      if (m.phase !== "loading") continue;
      if (m.members.every((c) => m.gone.has(c))) {
        // everyone left while loading: there is no one to race
        this.matches.delete(m.id);
        continue;
      }
      const ready = m.members.every((c) => m.gone.has(c) || (m.progress.get(c) ?? 0) >= 1);
      if ((ready && now - m.since >= LOAD_MIN) || now >= m.deadline) this.launch(m, now);
    }
    // once a second, the live rooms to everyone not on the road themselves
    if (now - this.listed >= 1) {
      this.listed = now;
      const races = this.rooms();
      for (const c of this.conns) if (!c.race) c.send({ t: "live", races });
    }
    // every half second, a round trip asked of everyone loading
    if (now - this.pinged >= 0.5) {
      this.pinged = now;
      for (const m of this.matches.values()) if (m.phase === "loading") this.ping(m, now);
    }
    // and once a second of everyone racing, carrying the last round trip for the HUD (N14)
    if (now - this.racePinged >= NET.pingEvery) {
      this.racePinged = now;
      for (const live of this.races.values()) {
        if (live.ended) continue;
        for (const [id, c] of live.conns) c.send({ t: "ping", at: now, rtt: ms(live.net.get(id)?.rtt.values().at(-1) ?? null) });
      }
    }

    // nothing on the road: the race clock simply follows the wall clock. A
    // stall longer than a quarter of a second is dropped rather than replayed
    // in one burst.
    if (this.races.size === 0 || now - this.clock > 0.25) this.clock = Math.max(this.clock, now - DT);
    while (this.clock + DT <= now) {
      this.clock += DT;
      for (const live of this.races.values()) this.advance(live, this.clock);
    }
    for (const [id, live] of this.races) if (live.ended) this.races.delete(id);
  }

  private advance(live: Live, now: number): void {
    if (live.ended) return;
    const inputs = new Map<number, Input>();
    for (const r of live.race.riders) if (r.human) inputs.set(r.id, live.quit.has(r.id) ? NO_INPUT : (live.inputs.get(r.id) ?? NO_INPUT));
    const before = this.perf();
    step(live.race, inputs);
    this.stepCost.add(this.perf() - before);
    live.steps++;

    if (live.steps % (60 / SNAPSHOT_HZ) === 0) {
      // logged once each, as they go out (this ran every step, from the last
      // snapshot's mark, and logged most events three times); bumps are too
      // many and too small to be worth a line
      for (let i = live.sent; i < live.race.events.length; i++) {
        const e = live.race.events[i];
        const line = e.kind === "bump" ? null : this.named(live, e as unknown as Record<string, unknown> & { kind: string; t: number });
        if (line) this.log(line);
      }
      const events = live.race.events.slice(live.sent);
      live.sent = live.race.events.length;
      const riders = live.race.riders.map(encodeRider);
      // only the cars near someone; the rest are nowhere a camera is
      const near = (z: number): boolean => live.race.riders.some((r) => !r.cop && Math.abs(r.z - z) < 1300);
      const cars = live.race.cars.filter((c) => near(c.z)).map(encodeCar);
      for (const c of live.conns.values()) c.send({ t: "snap", race: live.id, time: live.race.t, ack: c.seq, riders, cars, events });
      for (const c of live.watchers) c.send({ t: "snap", race: live.id, time: live.race.t, ack: 0, riders, cars, events });
    }

    const everyoneGone = live.conns.size === 0;
    if (humansDone(live.race) || everyoneGone || live.race.t > live.timeLimit) this.finish(live, now);
  }

  /**
   * A race event as the log keeps it: every rider by name, a person as who
   * they are and the rest marked NPC or cop. An event no person is part of is
   * not kept: fifteen NPCs fighting each other wrote a line every few tenths
   * of a second and buried the two people the log is read for.
   */
  private named(live: Live, e: Record<string, unknown> & { kind: string; t: number }): Record<string, unknown> | null {
    const line: Record<string, unknown> = { ev: e.kind, race: live.id, t: Math.round(e.t * 10) / 10 };
    let person = false;
    for (const [k, v] of Object.entries(e)) {
      if (k === "kind" || k === "t") continue;
      if (!(ROLES as readonly string[]).includes(k) || typeof v !== "number") {
        line[k] = v;
        continue;
      }
      const c = live.riders.has(v) ? live.entrants.find((x) => x.id === v && x.human) : undefined;
      if (c) {
        person = true;
        line[k] = `${c.name}#${live.riders.get(v)}`;
      } else {
        const r = live.race.riders.find((x) => x.id === v);
        line[k] = r ? `${r.name} (${r.cop ? "cop" : "NPC"})` : v;
      }
    }
    return person ? line : null;
  }

  private finish(live: Live, now: number): void {
    live.ended = true;
    const order = standings(live.race);
    const result: Standing[] = order.map((r, i) => {
      const quit = live.quit.has(r.id);
      const outcome: Standing["outcome"] = quit
        ? "quit"
        : r.phase === "finished"
          ? i < 3
            ? "qualified"
            : "placed"
          : r.phase === "wrecked"
            ? "wrecked"
            : r.phase === "busted"
              ? "busted"
              : "unfinished";
      return {
        id: r.human ? (live.riders.get(r.id) ?? -1) : -1,
        name: r.name,
        human: r.human,
        place: i + 1,
        outcome,
        time: r.finishT >= 0 ? Math.round(r.finishT * 1000) / 1000 : null,
      };
    });
    this.store.finishRace(live.id, live.level, live.track, result);
    this.log({ ev: "race_end", race: live.id, secs: Math.round(live.race.t), standings: result.filter((s) => s.human).map((s) => [`${s.name}#${s.id}`, s.place, s.outcome]) });
    for (const id of [...live.net.keys()]) this.netLine(live, id);
    // and the server's own share of the wait, over its last ten seconds or so
    const hundredths = (x: number | null): number | null => (x === null ? null : Math.round(x * 100) / 100);
    this.log({ ev: "server", race: live.id, lateP95: ms(this.late.p95()), lateMax: ms(this.late.max()), stepP95: hundredths(this.stepCost.p95()), stepMax: hundredths(this.stepCost.max()) });
    for (const c of live.conns.values()) {
      c.send({ t: "end", race: live.id, standings: result, qualified: this.store.qualified(c.rider) });
      c.race = null;
    }
    for (const c of live.watchers) c.send({ t: "end", race: live.id, standings: result, qualified: [] });
    void now;
  }
}
