// Scenario h of docs/testing/multi-user-test-report.md: two people mid-race
// when the machine restarts. Each reconnects a second after its socket drops,
// as the page does (client/main.ts, connect), with the same cookie.
//
//   FLY=<path to flyctl> MACHINE=<machine id> node scripts/restart.ts [tag]
//
// Every person is a probe, so none of them reaches the leaderboard (N12).

import { execFileSync } from "node:child_process";

const base = "https://comp4020-final-ruiquanqiao.fly.dev";
const tag = process.argv[2] ?? "H";
const fly = process.env.FLY ?? "flyctl";
const machine = process.env.MACHINE;
if (!machine) throw new Error("set MACHINE to the machine id (flyctl machines list)");
const stamp = (): string => new Date().toISOString().slice(11, 23);
const say = (s: string): void => console.log(`${stamp()} ${s}`);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Msg = { t: string; at: number } & Record<string, unknown>;
type Person = {
  name: string;
  ws: WebSocket;
  inbox: Msg[];
  race: number | null;
  you: number | null;
  opens: number;
  closes: number[];
  stop: boolean;
  send(m: object): void;
};

function person(name: string, cookie: string): Person {
  const p = { name, inbox: [], race: null, you: null, opens: 0, closes: [], stop: false } as unknown as Person;
  p.send = (m) => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(m));
  };
  const connect = (): void => {
    // @ts-expect-error Node's WebSocket takes headers as a second argument
    const ws: WebSocket = new WebSocket(base.replace(/^http/, "ws") + "/ws?probe=1", { headers: { cookie } });
    p.ws = ws;
    ws.onopen = () => {
      p.opens++;
      if (p.opens > 1) say(`${name} reconnected`);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      const ping = m.at;
      m.at = Date.now();
      p.inbox.push(m);
      const you = m.you as { id: number; name: string } | null;
      if (m.t === "hello" && you) {
        if (p.opens > 1) say(`${name} back as ${you.name}#${you.id}`);
        if (you.name !== name) p.send({ t: "name", name });
      }
      if (m.t === "ping") p.send({ t: "pong", at: ping });
      if (m.t === "end") {
        const mine = (m.standings as { human: boolean; name: string; outcome: string }[]).find((x) => x.name === name);
        say(`${name} is sent the end of race ${m.race}: ${mine?.outcome}${m.aborted ? `, aborted: ${m.aborted}` : ""}`);
      }
      if (m.t === "found") p.send({ t: "accept" });
      if (m.t === "loading") p.send({ t: "progress", p: 1 });
      if (m.t === "start" && m.you !== null) {
        p.race = m.race as number;
        p.you = m.you as unknown as number;
      }
    };
    ws.onclose = (e) => {
      p.closes.push(Date.now());
      say(`${name}'s socket closed, code ${e.code}${e.reason ? ` (${e.reason})` : ""}`);
      if (!p.stop) setTimeout(connect, 1000);
    };
    ws.onerror = () => {};
  };
  connect();
  return p;
}

const cookie = async (): Promise<string> => ((await fetch(base + "/")).headers.get("set-cookie") ?? "").split(";")[0];
const A = person(`${tag} Ana`, await cookie());
const B = person(`${tag} Ben`, await cookie());
await sleep(1500);
A.send({ t: "queue", mode: "human", level: 1, track: 0 });
B.send({ t: "queue", mode: "human", level: 1, track: 0 });
while (A.race === null || B.race === null) await sleep(100);
say(`race ${A.race} running: ${A.name} bike ${A.you}, ${B.name} bike ${B.you}`);
const restartAt = { t: 0 };
let seq = 0;
const ride = setInterval(() => A.send({ t: "in", seq: ++seq, keys: 1 }), 50);
await sleep(8000);
const before = A.inbox.filter((m) => m.t === "snap").at(-1)!;
const mine = (before.riders as number[][]).find((r) => r[0] === A.you)!;
say(`before restart: race time ${(before.time as number).toFixed(1)} s, ${A.name} at z ${mine[1]} m`);
say("flyctl machine restart");
const t0 = Date.now();
restartAt.t = t0;
execFileSync(fly, ["machine", "restart", machine, "-a", "comp4020-final-ruiquanqiao"], { stdio: "inherit" });
say(`restart command returned after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const by = Date.now() + 60_000;
while ((A.opens < 2 || B.opens < 2) && Date.now() < by) await sleep(200);
await sleep(3000);
clearInterval(ride);
for (const p of [A, B]) {
  const after = p.inbox.filter((m) => m.at > p.closes[0]);
  const back = after.find((m) => m.t === "hello");
  const listed = after.filter((m) => m.t === "live").at(-1);
  const down = back ? ((back.at - p.closes[0]) / 1000).toFixed(1) : "?";
  say(
    `${p.name}: down ${down} s; snaps of race ${p.race} after: ${after.filter((m) => m.t === "snap" && m.race === p.race).length}; ` +
      `races listed after: ${JSON.stringify(listed?.races ?? null)}; end message: ${p.inbox.some((m) => m.t === "end" && m.at >= restartAt.t)}`,
  );
}
A.send({ t: "in", seq: 1000, keys: 1 });
await sleep(1500);
A.stop = B.stop = true;
A.ws.close();
B.ws.close();
await sleep(1000);
process.exit(0);
