import { expect, inject, it } from "vitest";
import type { RiderState, ToClient } from "../game/protocol.ts";

// Crit 9's first line, against the RUNNING app: "a change one person makes
// appears in every other open session within about a second, with no reload".
// Two people (two cookies, two sockets) queue for a humans-only race; each must
// land in the same race with the other in its entry list, and a steer one of
// them makes must move their bike in the snapshots the other receives within a
// second. Everything else in spec/ drives the race in-process; this is the one
// check that goes through the real server and the real sockets.
const baseUrl = inject("baseUrl");

const THROTTLE = 1;
const LEFT = 4;
const RIGHT = 8; // steering right moves a bike to +x on the road

type Person = {
  ws: WebSocket;
  inbox: ToClient[];
  /** the latest snapshot's riders, and when it arrived */
  riders: Map<number, RiderState>;
  heardAt: number;
  you: number | null;
  race: number | null;
  keys: number;
};

async function person(): Promise<Person> {
  // the server only lets a rider in with its cookie: take one the way a browser does
  const cookie = ((await fetch(new URL("/", baseUrl))).headers.get("set-cookie") ?? "").split(";")[0];
  // Node's WebSocket (undici) takes headers as a second argument; the DOM type does not say so
  const Ws = WebSocket as unknown as new (url: string, opts: { headers: Record<string, string> }) => WebSocket;
  // ?probe=1: two scripted people, kept off the leaderboard (N12)
  const ws = new Ws(new URL("/ws?probe=1", baseUrl).href.replace(/^http/, "ws"), { headers: { cookie } });
  const p: Person = { ws, inbox: [], riders: new Map(), heardAt: 0, you: null, race: null, keys: 0 };
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as ToClient;
    p.inbox.push(msg);
    // a person with no screen: accepts the match, is loaded at once, answers the ping (N9, N10)
    if (msg.t === "found") send(p, { t: "accept" });
    if (msg.t === "loading") send(p, { t: "progress", p: 1 });
    if (msg.t === "ping") send(p, { t: "pong", at: msg.at });
    if (msg.t === "start") {
      p.you = msg.you;
      p.race = msg.race;
    }
    if (msg.t === "snap" && msg.race === p.race) {
      p.riders = new Map(msg.riders.map((r) => [r[0], r]));
      p.heardAt = performance.now();
    }
  };
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("socket did not open"));
  });
  return p;
}

const send = (p: Person, msg: object): void => p.ws.send(JSON.stringify(msg));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(ok: () => boolean, ms: number): Promise<boolean> {
  const by = performance.now() + ms;
  while (performance.now() < by) {
    if (ok()) return true;
    await sleep(5);
  }
  return ok();
}

/** Ms from `from` steering towards the middle of the road to `to` seeing that bike 0.3 m across, or null. */
async function steerSeen(from: Person, to: Person, limit: number): Promise<number | null> {
  const id = from.you!;
  const x0 = to.riders.get(id)![2];
  from.keys = THROTTLE | (x0 < 0 ? RIGHT : LEFT);
  send(from, { t: "in", seq: Date.now(), keys: from.keys });
  const pressed = performance.now();
  const seen = await until(() => Math.abs(to.riders.get(id)![2] - x0) > 0.3, limit);
  const ms = performance.now() - pressed;
  from.keys = THROTTLE;
  send(from, { t: "in", seq: Date.now(), keys: from.keys });
  return seen ? ms : null;
}

it("shows a steer made in one session in the other within a second, with no reload", async () => {
  const a = await person();
  const b = await person();
  try {
    send(a, { t: "queue", mode: "human", level: 1, track: 0 });
    send(b, { t: "queue", mode: "human", level: 1, track: 0 });
    // a humans-only pool gathers for 10 s once a second person is in (N3)
    expect(await until(() => a.race !== null && b.race !== null, 20_000)).toBe(true);

    // the same race, and each one's entry list holds both people
    expect(a.race).toBe(b.race);
    expect(a.you).not.toBe(b.you);
    for (const p of [a, b]) {
      const start = p.inbox.findLast((m) => m.t === "start");
      const people = start?.t === "start" ? start.entrants.filter((e) => e.human).map((e) => e.id) : [];
      expect(people.sort()).toEqual([a.you, b.you].sort());
    }

    // ride through the countdown and up to speed, holding the throttle as a
    // browser does, resending the keys as it does
    a.keys = b.keys = THROTTLE;
    const hold = setInterval(() => {
      send(a, { t: "in", seq: Date.now(), keys: a.keys });
      send(b, { t: "in", seq: Date.now(), keys: b.keys });
    }, 100);
    try {
      await sleep(5_000);
      // each sees the other's bike, moving, in a snapshot that keeps arriving
      for (const [p, other] of [[a, b], [b, a]] as const) {
        expect(p.riders.get(other.you!)?.[3]).toBeGreaterThan(10); // m/s
        expect(performance.now() - p.heardAt).toBeLessThan(500);
      }

      // the line itself, both ways, three times each
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        for (const [from, to] of [[a, b], [b, a]] as const) {
          const ms = await steerSeen(from, to, 1_000);
          expect(ms, `steer from rider ${from.you} not seen by rider ${to.you} within a second`).not.toBeNull();
          times.push(ms!);
          await sleep(500);
        }
      }
      console.log(`steer seen on the other session after ${times.map((t) => t.toFixed(0)).join(", ")} ms`);
    } finally {
      clearInterval(hold);
    }
  } finally {
    a.ws.close();
    b.ws.close();
  }
}, 45_000);
