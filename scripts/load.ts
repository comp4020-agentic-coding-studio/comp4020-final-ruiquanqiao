// A full room of scripted people racing on a running server, to see what the
// server does with eight at once (ledger N14). Each one throttles, steers and
// swings as a person might, answers every ping, and reports its network as a
// browser does; the server's own `net`, `server` and `server_stall` lines are
// the result, read with server/readlog.ts. Every rider is a probe (N12).
//
//   node scripts/load.ts [url] [people] [seconds] [npcs]
//     default: the live site, 8 people, 60 s, 21 NPCs (a 29-rider grid, the most there is)
//
// Prints what each person saw: round trips, snapshot gaps, a key's trip back.

import { NET, Samples } from "../game/net.ts";

const base = process.argv[2] ?? "https://comp4020-final-ruiquanqiao.fly.dev";
const people = Number(process.argv[3] ?? 8);
const seconds = Number(process.argv[4] ?? 60);
const npcs = Number(process.argv[5] ?? 29 - people);

const THROTTLE = 1;
const BRAKE = 2;
const LEFT = 4;
const RIGHT = 8;
const HAND = 16;
const FOOT = 32;

type Bot = {
  n: number;
  ws: WebSocket;
  race: number | null;
  you: number | null;
  sent: Map<number, number>;
  seq: number;
  rtt: Samples;
  gap: Samples;
  input: Samples;
  lastSnap: number | null;
  stalls: number;
  snaps: number;
  bytes: number;
};

async function bot(n: number): Promise<Bot> {
  const cookie = ((await fetch(base + "/")).headers.get("set-cookie") ?? "").split(";")[0];
  // @ts-expect-error Node's WebSocket takes headers as a second argument
  const ws: WebSocket = new WebSocket(base.replace(/^http/, "ws") + "/ws?probe=1", { headers: { cookie } });
  const b: Bot = { n, ws, race: null, you: null, sent: new Map(), seq: 0, rtt: new Samples(10_000), gap: new Samples(100_000), input: new Samples(100_000), lastSnap: null, stalls: 0, snaps: 0, bytes: 0 };
  const send = (m: object): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  ws.onmessage = (e) => {
    const raw = String(e.data);
    const m = JSON.parse(raw);
    const now = performance.now();
    if (m.t === "hello") send({ t: "name", name: `Load ${n}` });
    if (m.t === "found") send({ t: "accept" });
    if (m.t === "loading") send({ t: "progress", p: 1 });
    if (m.t === "ping") {
      send({ t: "pong", at: m.at });
      if (typeof m.rtt === "number" && b.race !== null) b.rtt.add(m.rtt);
    }
    if (m.t === "start" && m.you !== null) {
      b.race = m.race;
      b.you = m.you;
    }
    if (m.t === "snap" && m.race === b.race) {
      b.snaps++;
      b.bytes += raw.length;
      if (b.lastSnap !== null) {
        const g = now - b.lastSnap;
        b.gap.add(g);
        if (g > NET.stallMs) b.stalls++;
      }
      b.lastSnap = now;
      for (const [s, at] of b.sent) {
        if (s > m.ack) break;
        b.input.add(now - at);
        b.sent.delete(s);
      }
    }
  };
  await new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error(`bot ${n}: socket did not open`));
  });
  return b;
}

const bots = await Promise.all(Array.from({ length: people }, (_, i) => bot(i + 1)));
const sendAll = (b: Bot, m: object): void => {
  if (b.ws.readyState === WebSocket.OPEN) b.ws.send(JSON.stringify(m));
};
// everyone into the NPC pool together, so they share one room
for (const b of bots) sendAll(b, { t: "queue", mode: "ai", level: 5, track: 0, ai: npcs });
const by = performance.now() + 30_000;
while (bots.some((b) => b.race === null) && performance.now() < by) await new Promise((r) => setTimeout(r, 100));
const races = new Set(bots.map((b) => b.race));
console.log(`${bots.filter((b) => b.race !== null).length} of ${people} racing, in ${races.size} race(s): ${[...races].join(", ")}`);

// ride: throttle always, a steer every so often, a swing every second or so;
// keys go out when they change and every 250 ms besides, as a browser's do
const t0 = performance.now();
let tick = 0;
const riding = setInterval(() => {
  tick++;
  const now = performance.now();
  for (const b of bots) {
    if (b.race === null) continue;
    const phase = (tick + b.n * 7) % 40;
    let keys = THROTTLE;
    if (phase < 6) keys |= b.n % 2 ? LEFT : RIGHT;
    if (phase === 10) keys |= HAND;
    if (phase === 25) keys |= FOOT;
    if (phase > 36) keys = BRAKE;
    b.sent.set(++b.seq, now);
    sendAll(b, { t: "in", seq: b.seq, keys });
  }
}, 50);
// report as a browser does: what this one saw, every five seconds
const reporting = setInterval(() => {
  for (const b of bots) if (b.race !== null) sendAll(b, { t: "net", input: b.input.p95(), gap: b.gap.p95(), stalls: 0, snapped: 0, frame: null });
}, NET.reportEvery * 1000);

await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(riding);
clearInterval(reporting);
for (const b of bots) sendAll(b, { t: "quit" });
await new Promise((r) => setTimeout(r, 1500));
for (const b of bots) b.ws.close();

const f = (x: number | null): string => (x === null ? "-" : x.toFixed(0));
console.log(`rode ${((performance.now() - t0) / 1000).toFixed(0)} s, ${npcs} NPCs`);
console.log("bot  rtt med/p95/max   gap med/p95/max   stalls   key->ack med/p95   snaps   KB/s");
for (const b of bots) {
  console.log(
    `${String(b.n).padStart(3)}  ${f(b.rtt.median())}/${f(b.rtt.p95())}/${f(b.rtt.max())}`.padEnd(23) +
      `${f(b.gap.median())}/${f(b.gap.p95())}/${f(b.gap.max())}`.padEnd(18) +
      `${b.stalls}`.padEnd(9) +
      `${f(b.input.median())}/${f(b.input.p95())}`.padEnd(19) +
      `${b.snaps}`.padEnd(8) +
      `${(b.bytes / 1024 / seconds).toFixed(1)}`,
  );
}
process.exit(0);
