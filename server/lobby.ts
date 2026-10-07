// Matchmaking and the races it starts. Time comes in as an argument, so the
// pools can be tested with a fake clock (spec/lobby.test.ts) and the server
// just calls tick() with the real one.

import { type Entry, GRID, MAX_AI, type Mode, POOL_WAIT, SNAPSHOT_HZ, type Standing, type ToClient, encodeCar, encodeRider } from "../game/protocol.ts";
import { DT, type Input, type Race, NO_INPUT, humansDone, standings, startRace, step, unpackInput } from "../game/sim.ts";
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
};

type Pool = { members: Conn[]; startsAt: number | null };

export type Store = {
  startRace(mode: string, level: number, track: string): number;
  finishRace(race: number, level: number, track: string, standings: Standing[]): void;
  qualified(id: number): { level: number; track: string }[];
};

export type Logger = (event: Record<string, unknown>) => void;

// Riders of my own for the AI field (ledger H7: no names from the original).
const AI_NAMES = [
  "Dex Carbine", "Mona Sprocket", "Big Lou", "Rita Voltz", "Kid Marrow", "Saul Brake", "Juno Fang",
  "Otis Grime", "Pip Ransom", "Vera Knuckle", "Hank Rivet", "Lola Gash", "Moss", "Bruno Keel",
];

export class Lobby {
  pools: Record<Mode, Pool> = { ai: { members: [], startsAt: null }, human: { members: [], startsAt: null } };
  races = new Map<number, Live>();
  private clock = 0; // seconds

  private store: Store;
  private log: Logger;
  private random: () => number;

  constructor(store: Store, log: Logger = () => {}, random: () => number = Math.random) {
    this.store = store;
    this.log = log;
    this.random = random;
  }

  // ---- the pools (N2, N3) ----

  join(conn: Conn, mode: Mode, level: number, now: number, road = 0, field?: number): void {
    if (conn.race && !conn.race.ended) return; // already racing
    this.leave(conn, now);
    conn.pool = mode;
    conn.level = Math.min(5, Math.max(1, Math.round(level) || 1));
    conn.road = Math.min(ROADS.length - 1, Math.max(0, Math.round(road) || 0));
    conn.field = field === undefined || !Number.isFinite(field) ? undefined : Math.min(MAX_AI, Math.max(0, Math.round(field)));
    const pool = this.pools[mode];
    pool.members.push(conn);
    if (mode === "ai") {
      // everyone who joins in the five seconds after the first is taken along
      pool.startsAt ??= now + POOL_WAIT.ai;
    } else {
      // each newcomer restarts the ten seconds, so more can make it in
      pool.startsAt = now + POOL_WAIT.human;
    }
    this.log({ ev: "queue", rider: conn.rider, mode, level: conn.level, pool: pool.members.length });
    this.watchNewest(conn);
    this.announce(mode, now);
  }

  leave(conn: Conn, now: number): void {
    const mode = conn.pool;
    if (!mode) return;
    const pool = this.pools[mode];
    pool.members = pool.members.filter((c) => c !== conn);
    if (pool.members.length === 0) pool.startsAt = null;
    conn.pool = null;
    for (const live of this.races.values()) live.watchers.delete(conn);
    this.log({ ev: "unqueue", rider: conn.rider, mode });
    this.announce(mode, now);
  }

  disconnect(conn: Conn, now: number): void {
    this.leave(conn, now);
    const live = conn.race;
    if (live && !live.ended) {
      live.quit.add(conn.local);
      const r = live.race.riders.find((x) => x.id === conn.local);
      if (r && r.phase !== "finished") r.phase = "wrecked";
      live.conns.delete(conn.local);
      this.log({ ev: "quit", rider: conn.rider, race: live.id });
    }
  }

  input(conn: Conn, seq: number, keys: number): void {
    const live = conn.race;
    if (!live || live.ended || seq <= conn.seq) return;
    conn.seq = seq;
    live.inputs.set(conn.local, unpackInput(keys));
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
    conn.send({ t: "start", race: newest.id, level: newest.level, track: newest.road, seed: newest.seed, entrants: newest.entrants, you: null });
  }

  private startFrom(mode: Mode, now: number): void {
    const pool = this.pools[mode];
    const members = pool.members;
    pool.members = [];
    pool.startsAt = null;
    for (const c of members) c.pool = null;

    // level by majority vote; a tie is broken at random (N4)
    const votes = new Map<number, number>();
    for (const c of members) votes.set(c.level, (votes.get(c.level) ?? 0) + 1);
    const most = Math.max(...votes.values());
    const tied = [...votes.keys()].filter((l) => votes.get(l) === most).sort();
    const level = tied[Math.floor(this.random() * tied.length)];
    // and the road the same way (N4)
    const roadVotes = new Map<number, number>();
    for (const c of members) roadVotes.set(c.road ?? 0, (roadVotes.get(c.road ?? 0) ?? 0) + 1);
    const roadMost = Math.max(...roadVotes.values());
    const roadTied = [...roadVotes.keys()].filter((r) => roadVotes.get(r) === roadMost).sort();
    const road = roadTied[Math.floor(this.random() * roadTied.length)];

    const entrants: Entry[] = [];
    const seen = new Map<number, number>();
    members.forEach((c, i) => {
      // two tabs of one rider are two bikes; tell them apart by number
      const n = (seen.get(c.rider) ?? 0) + 1;
      seen.set(c.rider, n);
      entrants.push({ id: i, name: n > 1 ? `${c.name} (${n})` : c.name, human: true });
    });
    if (mode === "ai") {
      // as many AI riders as asked for (N2): the median of what everyone in
      // the pool asked, so one person cannot empty or flood the road alone;
      // anyone who did not say wants the original's full grid of fifteen
      const asks = members.map((c) => c.field ?? Math.max(0, GRID - members.length)).sort((p, q) => p - q);
      const ai = asks[Math.floor((asks.length - 1) / 2)];
      const names = [...AI_NAMES].sort(() => this.random() - 0.5);
      for (let i = entrants.length; i < members.length + ai; i++) entrants.push({ id: i, name: names[(i - members.length) % names.length], human: false });
    }

    const track = makeTrack(level, road);
    const seed = Math.floor(this.random() * 2 ** 31);
    const id = this.store.startRace(mode, level, track.name);
    const race = startRace(track, level, entrants, seed);
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
    };
    members.forEach((c, i) => {
      for (const other of this.races.values()) other.watchers.delete(c);
      c.race = live;
      c.local = i;
      c.seq = 0;
      live.conns.set(i, c);
      c.send({ t: "start", race: id, level, track: road, seed, entrants, you: i });
    });
    this.races.set(id, live);
    this.log({ ev: "race_start", race: id, mode, level, humans: members.length, riders: entrants.length });
    // anyone still queued for the other pool watches the new race
    for (const c of this.pools[mode === "ai" ? "human" : "ai"].members) {
      for (const other of this.races.values()) other.watchers.delete(c);
      this.watchNewest(c);
    }
  }

  // ---- the clock ----

  /** Advance everything to `now` (seconds). */
  tick(now: number): void {
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
    step(live.race, inputs);
    live.steps++;

    if (live.steps % (60 / SNAPSHOT_HZ) === 0) {
      // logged once each, as they go out (this ran every step, from the last
      // snapshot's mark, and logged most events three times); bumps are too
      // many and too small to be worth a line
      for (let i = live.sent; i < live.race.events.length; i++) {
        const e = live.race.events[i];
        if (e.kind !== "bump") this.log({ ev: e.kind, race: live.id, ...e });
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
    this.log({ ev: "race_end", race: live.id, secs: Math.round(live.race.t), standings: result.filter((s) => s.human).map((s) => [s.name, s.place, s.outcome]) });
    for (const c of live.conns.values()) {
      c.send({ t: "end", race: live.id, standings: result, qualified: this.store.qualified(c.rider) });
      c.race = null;
    }
    for (const c of live.watchers) c.send({ t: "end", race: live.id, standings: result, qualified: [] });
    void now;
  }
}
