// Scenario g of docs/testing/multi-user-test-report.md: with the app scaled
// to two machines (flyctl scale count 2), two people on two machines. A new
// rider's number tells which machine answered (each machine has its own
// database, so the numbers diverge). Opens people until two land apart,
// queues them for one race together, then reconnects one cookie eight times.
//
//   node scripts/scale.ts [tag]
//
// Every person is a probe, so none of them reaches the leaderboard (N12).

const base = "https://comp4020-final-ruiquanqiao.fly.dev";
const tag = process.argv[2] ?? "G";
const stamp = (): string => new Date().toISOString().slice(11, 23);
const say = (s: string): void => console.log(`${stamp()} ${s}`);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Msg = { t: string } & Record<string, unknown>;
type Person = { name: string; ws: WebSocket; inbox: Msg[]; id: number; send(m: object): void };

const freshCookie = async (): Promise<string> => ((await fetch(base + "/")).headers.get("set-cookie") ?? "").split(";")[0];
const socket = (cookie: string): WebSocket =>
  // @ts-expect-error Node's WebSocket takes headers as a second argument
  new WebSocket(base.replace(/^http/, "ws") + "/ws?probe=1", { headers: { cookie } });

async function person(name: string): Promise<Person> {
  const ws = socket(await freshCookie());
  const inbox: Msg[] = [];
  const send = (m: object): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const id = await new Promise<number>((ok) => {
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Msg;
      inbox.push(m);
      const you = m.you as { id: number; name: string } | undefined;
      if (m.t === "hello" && you) {
        if (you.name !== name) send({ t: "name", name });
        ok(you.id);
      }
      if (m.t === "ping") send({ t: "pong", at: m.at });
    };
  });
  return { name, ws, inbox, id, send };
}

const people: Person[] = [];
for (let i = 0; i < 8; i++) {
  const p = await person(`${tag} P${i}`);
  people.push(p);
  say(`${p.name} is rider #${p.id}`);
}
// the two machines' number sequences are far apart; split at the widest gap
const ids = people.map((p) => p.id).sort((a, b) => a - b);
let cut = 0;
let gap = 0;
for (let i = 1; i < ids.length; i++) {
  if (ids[i] - ids[i - 1] > gap) {
    gap = ids[i] - ids[i - 1];
    cut = ids[i];
  }
}
const lo = people.filter((p) => p.id < cut);
const hi = people.filter((p) => p.id >= cut);
say(`machine X: ${lo.map((p) => `${p.name}#${p.id}`).join(", ")}`);
say(`machine Y: ${hi.map((p) => `${p.name}#${p.id}`).join(", ")}`);
if (!lo.length || !hi.length) {
  say("all on one machine; no split seen");
  process.exit(2);
}
const [a, b] = [lo[0], hi[0]];
for (const p of people) if (p !== a && p !== b) p.ws.close();
say(`${a.name} and ${b.name} both queue for a race with people`);
a.send({ t: "queue", mode: "human", level: 1, track: 0 });
b.send({ t: "queue", mode: "human", level: 1, track: 0 });
await sleep(15_000);
for (const p of [a, b]) {
  const pools = p.inbox.filter((m) => m.t === "pool").map((m) => m.count);
  say(`${p.name} sees pool sizes ${JSON.stringify(pools)}, found a match: ${p.inbox.some((m) => m.t === "found")}`);
}
for (const p of [a, b]) {
  p.send({ t: "leave" });
  p.ws.close();
}

// one person, one cookie, reconnecting: which rider are they each time?
const one = await freshCookie();
const seen: string[] = [];
for (let i = 0; i < 8; i++) {
  const ws = socket(one);
  seen.push(
    await new Promise<string>((ok) => {
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data)) as Msg;
        const you = m.you as { id: number; name: string } | undefined;
        if (m.t === "hello" && you) ok(`${you.name}#${you.id}`);
      };
    }),
  );
  ws.close();
}
say(`one cookie, eight connections: ${seen.join(", ")}`);
await sleep(1000);
process.exit(0);
