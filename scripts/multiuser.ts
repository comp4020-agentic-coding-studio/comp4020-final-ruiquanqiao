// The multi-user scenarios of docs/testing/multi-user-test-report.md, run
// against a server by scripted people, each with a cookie of their own (so,
// as far as the server can tell, each in their own browser). It checks what
// each person was sent; the server's log of the same minutes, tailed with
// `flyctl logs`, is the other half of the evidence.
//
//   node scripts/multiuser.ts [url] [tag]
//     default: the live site; tag (default "T") prefixes every name, so one
//     run's people can be found in the log
//
// Every person is a probe, so none of them reaches the leaderboard (N12).

const base = process.argv[2] ?? "https://comp4020-final-ruiquanqiao.fly.dev";
const tag = process.argv[3] ?? "T";
const THROTTLE = 1;
const LEFT = 4;

type Msg = { t: string } & Record<string, unknown>;
type Person = {
  name: string;
  cookie: string;
  ws: WebSocket;
  inbox: { at: number; m: Msg }[];
  send(m: object): void;
  race: number | null;
  you: number | null;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const stamp = (): string => new Date().toISOString().slice(11, 23);
const say = (s: string): void => console.log(`${stamp()}  ${s}`);
let failures = 0;
const check = (ok: boolean, what: string): void => {
  if (!ok) failures++;
  say(`${ok ? "PASS" : "FAIL"}  ${what}`);
};

async function open(name: string, cookie?: string, autoAccept = false): Promise<Person> {
  cookie ??= ((await fetch(base + "/")).headers.get("set-cookie") ?? "").split(";")[0];
  // @ts-expect-error Node's WebSocket takes headers as a second argument
  const ws: WebSocket = new WebSocket(base.replace(/^http/, "ws") + "/ws?probe=1", { headers: { cookie } });
  const p: Person = {
    name,
    cookie,
    ws,
    inbox: [],
    send: (m) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    },
    race: null,
    you: null,
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as Msg;
    p.inbox.push({ at: Date.now(), m });
    if (m.t === "hello" && (m.you as { name: string }).name !== name) p.send({ t: "name", name });
    if (m.t === "ping") p.send({ t: "pong", at: m.at });
    if (m.t === "found" && autoAccept) p.send({ t: "accept" });
    if (m.t === "loading") p.send({ t: "progress", p: 1 });
    if (m.t === "start" && m.you !== null) {
      p.race = m.race as number;
      p.you = m.you as number;
    }
    if (m.t === "end" && m.race === p.race) p.race = null;
  };
  await new Promise<void>((ok, fail) => {
    ws.onopen = () => ok();
    ws.onerror = () => fail(new Error(`${name}: socket did not open`));
  });
  return p;
}

async function until(what: string, test: () => boolean, ms = 30_000): Promise<boolean> {
  const by = Date.now() + ms;
  while (!test()) {
    if (Date.now() > by) {
      say(`gave up waiting for ${what}`);
      return false;
    }
    await sleep(50);
  }
  return true;
}

const got = (p: Person, t: string, since = 0): Msg[] => p.inbox.filter((x) => x.m.t === t && x.at >= since).map((x) => x.m);
const riderIn = (m: Msg, id: number): number[] | undefined => (m.riders as number[][]).find((r) => r[0] === id);

const ana = `${tag} Ana`;
const ben = `${tag} Ben`;

say(`(a) two people join: ${ana} and ${ben}, each with their own cookie`);
const A = await open(ana);
const B = await open(ben);
await until("both named", () => got(A, "hello").length >= 2 && got(B, "hello").length >= 2, 10_000);
const idA = (got(A, "hello").at(-1)!.you as { id: number }).id;
const idB = (got(B, "hello").at(-1)!.you as { id: number }).id;
check(idA !== idB, `the server tells them apart: ${ana}#${idA}, ${ben}#${idB}`);

say(`(c) simultaneous action: both queue for a race with people, then accept in the same millisecond`);
A.send({ t: "queue", mode: "human", level: 1, track: 0 });
B.send({ t: "queue", mode: "human", level: 1, track: 0 });
await until("a match found", () => got(A, "found").length > 0 && got(B, "found").length > 0, 30_000);
A.send({ t: "accept" });
B.send({ t: "accept" });
await until("both accepts counted", () => got(A, "check").some((m) => m.accepted === 2), 5000);
check(got(A, "check").some((m) => m.accepted === 2 && m.of === 2), "both accepts counted, neither lost to the other");
await until("the race starts", () => A.race !== null && B.race !== null, 30_000);
check(A.race === B.race, `one race for both: race ${A.race}, ${ana} on bike ${A.you}, ${ben} on bike ${B.you}`);
await until("the grid countdown", () => got(A, "snap").some((m) => (m.time as number) > 0.5), 15_000);

say(`(b) one person's action reaches the others: ${ana} rides, ${ben} stays still`);
const t0 = Date.now();
let seqA = 0;
const riding = setInterval(() => A.send({ t: "in", seq: ++seqA, keys: THROTTLE | (seqA % 40 < 5 ? LEFT : 0) }), 50);
await sleep(4000);
clearInterval(riding);
const seenByBen = got(B, "snap", t0).filter((m) => m.race === A.race);
const first = riderIn(seenByBen[0], A.you!);
const last = riderIn(seenByBen.at(-1)!, A.you!);
check(!!first && !!last && last[1] - first[1] > 5, `${ben}'s snapshots show ${ana}'s bike moving: z ${first?.[1]} to ${last?.[1]} m`);
const benSelf = [riderIn(seenByBen[0], B.you!), riderIn(seenByBen.at(-1)!, B.you!)];
check(!!benSelf[0] && !!benSelf[1] && Math.abs(benSelf[1][3]) < 1, `${ben}'s own bike is not moved by ${ana}'s keys: speed ${benSelf[1]?.[3]} m/s`);

say(`(rejected) ${ana} sends a stale key sequence, and a key for a race she is not in comes later`);
A.send({ t: "in", seq: 1, keys: THROTTLE });

say(`(d) a late joiner: ${tag} Cat arrives with the race already going`);
const C = await open(`${tag} Cat`);
await until("Cat's first snapshot", () => got(C, "live").length > 0, 5000);
const live = got(C, "live").at(-1)!.races as { race: number; humans: { name: string }[] }[];
const listed = live.find((r) => r.race === A.race);
check(!!listed, `Cat is sent the race list on arrival, and it holds race ${A.race} with ${listed?.humans.map((h) => h.name).join(", ")}`);
C.send({ t: "watch", race: A.race });
await until("Cat watching", () => got(C, "start").length > 0 && got(C, "snap").length > 0, 5000);
check(got(C, "start")[0]?.you === null, "Cat watches the race as it stands, without a bike of her own");

say(`(f) isolated rooms: ${tag} Dan races the NPC pool alone; nothing of his reaches Ana's race`);
const D = await open(`${tag} Dan`, undefined, true);
await sleep(500);
D.send({ t: "queue", mode: "ai", level: 1, track: 0, ai: 2 });
await until("Dan's race", () => D.race !== null, 30_000);
await sleep(1500);
check(D.race !== A.race, `two races on the road: ${A.race} and ${D.race}`);
check(!got(A, "snap").some((m) => m.race === D.race), `${ana} is sent nothing of race ${D.race}`);
// while queued Dan is shown the newest race on purpose (N5), so the check is
// from the moment his own race starts
// by order of arrival, not by clock: frames that land in the same millisecond
// as his start would otherwise count as after it
const dAfter = D.inbox.slice(D.inbox.findIndex((x) => x.m.t === "start" && x.m.you !== null)).map((x) => x.m);
const leaked = dAfter.filter((m) => m.t === "snap" && m.race === A.race).length;
check(dAfter.some((m) => m.t === "snap" && m.race === D.race), `Dan is sent his own race ${D.race}`);
check(leaked === 0, `once racing, Dan is sent nothing of race ${A.race} (${leaked} snapshots of it)`);

say(`(e) leave and return: ${ben} closes his tab mid-race and opens it again`);
// a closing handshake through Fly's proxy takes a few seconds; a tab that is
// closed outright is seen at once. Wait for it as a person reopening would
B.ws.close();
await until("Ben's socket closed", () => B.ws.readyState === WebSocket.CLOSED, 15_000);
await sleep(1000);
const B2 = await open(ben, B.cookie);
await until("Ben's hello", () => got(B2, "hello").length > 0, 5000);
const idB2 = (got(B2, "hello")[0].you as { id: number }).id;
check(idB2 === idB, `${ben} comes back as the same person, #${idB2}, from his cookie`);
await until("the live list", () => got(B2, "live").length > 0, 5000);
const again = (got(B2, "live").at(-1)!.races as { race: number; humans: { name: string; out: boolean }[] }[]).find((r) => r.race === A.race);
check(!!again?.humans.find((h) => h.name === ben)?.out, `his bike in race ${A.race} is out ("left"), and the race goes on for ${ana}`);

say(`(rejected) ${ben}, back but not racing, tries to steer and to quit`);
B2.send({ t: "in", seq: 99, keys: THROTTLE });
B2.send({ t: "quit" });
await sleep(1000);

for (const p of [A, C, D]) p.send({ t: "quit" });
await sleep(1000);
for (const p of [A, B2, C, D]) p.ws.close();
await sleep(500);
say(failures ? `${failures} check(s) failed` : "every check passed");
process.exit(failures ? 1 : 0);
