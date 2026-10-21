// The browser: lobby, race and result screens over one WebSocket. The server
// owns every race; this end predicts its own rider with the same ride() the
// server runs, so the bike answers the keys at once, and draws everyone else
// a tenth of a second in the past, between two snapshots.

import { type CarState, type Entry, type Feud, type Leader, type Mode, type RiderState, type Room, SAYINGS, SAY_GAP, type Standing, type ToClient, type ToServer, applyRider } from "../game/protocol.ts";
import { drawDash, revs } from "./dash.ts";
import { MUSIC, setMusic, setRoad, sfx, soundState, startAudio, updateAudio } from "./audio.ts";
import { LIVERIES } from "../game/liveries.ts";
import { react, startShade } from "./feel.ts";
import { addFeud, feudLine, moodOf, peopleRows } from "./people.ts";
import { schmooze } from "./schmooze.ts";
import { ACTIONS, type Action, DEFAULT_KEYS, actionOf, keyName, loadKeys, rebind } from "./keys.ts";
import { RaceScene } from "./scene.ts";
import { BIKE, DT, type Input, KMH, MPH, NO_INPUT, TUNE, type Race, type Rider, beginAttack, cap, kicked, nearest, onFoot, separate, packInput, positionOf, ride, shuntOf, startRace, topSpeed, walkInto, windingAt, windupOf } from "../game/sim.ts";
import { Handover, Prediction, Timeline } from "./netview.ts";
import { walkerAt } from "../game/walkers.ts";
import { NetWatch, pingLabel } from "./netwatch.ts";
import { NET, type NetReport } from "../game/net.ts";
import { ROADS, type Track, makeTrack } from "../game/track.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const app = $("#app");

// ---- connection ----

let ws: WebSocket | null = null;
let me: { id: number; name: string } | null = null;
let qualified: { level: number; track: string }[] = [];

function send(msg: ToServer): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// a page opened by a script (scripts/shoot.ts, scripts/badnet.ts) says so, and
// its rider stays off the leaderboard; read once, since going between pages
// rewrites the address and a reconnect must still say it
const probe = new URLSearchParams(location.search).get("probe") === "1" ? "?probe=1" : "";
// ?delay=fixed draws the others a fixed tenth of a second back, as before N14,
// so scripts/feel.ts can ride the two side by side in the same browser
const adaptiveDelay = new URLSearchParams(location.search).get("delay") !== "fixed";
// ?handover=off puts one's own bike where the server says in one frame, as
// before N14, to ride the two side by side (scripts/feel.ts --handover off)
const easeHandover = new URLSearchParams(location.search).get("handover") !== "off";

function connect(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws${probe}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ToClient);
  ws.onclose = () => {
    setTimeout(connect, 1000);
    // the server has dropped any match this tab was in; so does the page
    if (found) closeFound();
    if (app.dataset.screen === "loading") show("lobby");
    clearQueue();
    if (current?.you !== null && current) banner("Connection lost");
  };
}

// ---- a race as this tab sees it ----

type Current = {
  id: number;
  level: number;
  race: Race;
  you: number | null; // local rider id, or null when watching
  timeline: Timeline; // everyone the server owns
  prediction: Prediction; // one's own rider
  steps: number;
  ended: boolean;
  /** this tab's clock when the countdown runs out and the race goes (V16) */
  go: number;
  /** the last number of the countdown shown */
  counted: number;
  /** one's own bike before the latest step, to draw between the two */
  drawFrom: { z: number; x: number } | null;
  /** what this tab sees of the network, reported to the server (N14) */
  net: NetWatch;
  /** one's own bike drawn easing over to where the server put it (N14) */
  handover: Handover;
  /** this tab's clock when the last snapshot arrived */
  lastSnap: number;
  /** who is in it, and the grudges between its people, kept up as knockdowns happen (N6, O3) */
  entrants: Entry[];
  feuds: Feud[];
};

let current: Current | null = null;
/** when this tab last felt its own predicted bike touch another */
let localBump = -9;
/** riders on foot this tab has felt its own bike ride over, and when */
const ranOver = new Map<number, number>();
/** the race events this tab has been sent lately, for the debugging handle */
const heard: unknown[] = [];

function begin(msg: Extract<ToClient, { t: "start" }>): void {
  // built while loading, if this is the race that was loaded (N10)
  const ready = msg.you !== null && prepared?.seed === msg.seed ? prepared : null;
  const track = ready?.track ?? makeTrack(msg.level, msg.track ?? 0);
  const race = startRace(track, msg.level, msg.entrants.map((e: Entry) => ({ ...e })), msg.seed, msg.countdown ?? 0);
  const go = performance.now() / 1000 + (msg.countdown ?? 0);
  current = { id: msg.race, level: msg.level, race, you: msg.you, timeline: new Timeline(adaptiveDelay), prediction: new Prediction(), steps: 0, ended: false, go, counted: -1, drawFrom: null, net: new NetWatch(), handover: new Handover(), lastSnap: performance.now() / 1000, entrants: msg.entrants, feuds: (msg.feuds ?? []).map((f) => ({ ...f })) };
  peopleShown = "";
  showPing(null);
  $("#chat").replaceChildren();
  if (msg.you !== null) {
    show("race");
    askQuit(false);
    loadingMatch = -1;
    if (!ready) {
      roadScene.setTrack(track);
      roadScene.setLooks(msg.entrants);
    }
    prepared = null;
    resize();
    banner(`${track.name} · level ${msg.level} · ${(track.length / 1000).toFixed(1)} km`, 2500);
    // each road has its own track, from the top at every start; chosen before
    // the audio starts, or the first road's track is fetched on every road
    setRoad(msg.track ?? 0);
    startAudio();
    $("#touch").querySelectorAll("button").forEach((b) => b.classList.remove("down"));
  } else if (msg.race === spectating) {
    show("watch");
    roadScene.setTrack(track);
    roadScene.setLooks(msg.entrants);
    roadScene.prepare();
    resize();
    follow = msg.entrants.find((e) => e.human)?.id ?? 0;
    spectateLabel();
    banner(`${track.name} · level ${msg.level}`, 2500);
    setRoad(msg.track ?? 0);
  } else {
    $("#watch").hidden = false;
    watchScene.setTrack(track);
    watchScene.setLooks(msg.entrants);
    watchScene.resize(watch.clientWidth || 480, watch.clientHeight || 270);
  }
}

function onSnap(msg: Extract<ToClient, { t: "snap" }>): void {
  const c = current;
  if (!c || c.id !== msg.race) return;
  const now = performance.now() / 1000;
  c.timeline.push(now, { time: msg.time, riders: msg.riders, cars: msg.cars });
  // when the race goes, by this tab's clock: every snapshot arrives late, so
  // the least delayed one says it best
  c.go = Math.min(c.go, now - msg.time);
  // every touch is seen and heard (K13): tilts, a knocked car, a rider launched
  for (const e of msg.events) {
    if (e.kind === "crash" && e.by !== undefined) addFeud(c.feuds, c.entrants, e.rider, e.by);
    heard.push(e);
    if (heard.length > 300) heard.shift();
    // a rub of one's own was already felt as it was predicted
    if (e.kind === "bump" && e.with === "rider" && (e.rider === c.you || e.other === c.you) && now - localBump < 0.5) continue;
    // someone on foot knocked flying (T6): the server's word on when, for everyone
    if (e.kind === "runOver" && e.what === "walker") {
      const w = c.race.walkers.find((x) => x.id === e.on);
      const by = c.race.riders.find((x) => x.id === e.by);
      if (w && by && (w.down < 0 || Math.abs(w.down - e.t) > 0.5)) {
        w.down = -1;
        const p = walkerAt(w, e.t);
        Object.assign(w, { down: e.t, hit: { z: p.z, x: p.x }, hitSpeed: Math.min(by.speed * 1.1, by.speed + 6), side: p.x >= by.x ? 1 : -1 });
      }
    }
    if (e.kind === "runOver" && e.by === c.you && ranOver.has(e.what === "bike" ? -1 - e.on : e.on)) continue;
    const felt = react(e, c.race.riders, c.you);
    (c.you === null && c.id !== spectating ? watchScene : roadScene).feel(felt);
    if (felt.sound && c.you !== null) sfx(felt.sound.kind, felt.sound.gain);
  }

  const lastSnap = c.lastSnap;
  c.lastSnap = now;
  if (c.you === null) return;
  c.net.snap(msg.ack, now);
  const mine = msg.riders.find((s) => s[0] === c.you);
  const r = c.race.riders.find((x) => x.id === c.you);
  if (!mine || !r) return;
  const before = r.phase;
  // far from where the server had it: written down whole, as it happened (N14).
  // A bike that has only just been put on the road (new race, back on the
  // bike) is not compared: there is nothing predicted to be far from
  const gap = Math.hypot(mine[1] - r.z, mine[2] - r.x);
  if (gap > NET.jumpM && now >= c.go && before !== "running" && mine[8] !== "running") {
    const own = msg.events.filter((e) => Object.entries(e).some(([k, v]) => ["rider", "on", "by", "other", "from"].includes(k) && v === c.you));
    send({
      t: "jump",
      gap,
      time: msg.time,
      was: before,
      now: mine[8],
      mine: [r.z, r.x, r.speed],
      server: [mine[1], mine[2], mine[3]],
      sinceFrame: (now - last) * 1000,
      sinceSnap: (now - lastSnap) * 1000,
      events: own.map((e) => [e.kind, (e as { cause?: string }).cause ?? (e as { move?: string }).move ?? (e as { with?: string }).with].filter(Boolean).join(":")),
      steps: c.steps,
    });
  }
  const eased = mine[8] === "riding" && before === "riding" && c.prediction.heard(c.steps, msg.time, mine[1], mine[2]);
  if (!eased) {
    // off the bike, back on it, or no prediction to compare: the server's word,
    // except a swing begun here that the server has not heard of yet - taking
    // its word for that wiped the player's own punch within 80 ms
    const swing = r.attack;
    // a jump the rider sees, if it was riding on a prediction that far out
    if (mine[8] === "riding" && before === "riding" && Math.hypot(mine[1] - r.z, mine[2] - r.x) > 1) c.net.snappedBack();
    const was = { z: r.z, x: r.x };
    applyRider(r, mine);
    c.prediction.reset();
    // drawn where it was, and let go over the next steps (Handover)
    if (easeHandover) c.handover.take(was.z, was.x, r.z, r.x);
    if (!r.attack && swing && mine[8] === "riding" && swing.t < windupOf(r, swing) + 0.2) r.attack = swing;
  } else {
    // the error it had then is eased out over the next steps (Prediction)
    {
      r.speed = mine[3];
      r.build = mine[5];
      r.stamina = mine[6];
      r.damage = mine[7];
      r.place = mine[13];
      r.weapon = mine[14] || null;
    }
  }
  for (const e of msg.events) {
    sound(c, e);
    // kicked: the predicted bike is thrown as the server threw it, not dragged
    // there by corrections afterwards (C4)
    if (e.kind === "hit" && e.move === "kick" && e.on === c.you && r.phase === "riding") {
      const by = c.race.riders.find((x) => x.id === e.by);
      if (by) kicked(r, by.x);
    }
    if (e.kind === "crash" && e.rider === c.you) {
      const by = e.by === undefined ? undefined : c.entrants.find((x) => x.id === e.by);
      banner(e.cause !== "knockdown" ? "Down!" : by?.human ? `Knocked off by ${by.name}` : "Knocked off", by?.human ? 2200 : 1200);
    }
    if (e.kind === "wrecked" && e.rider === c.you) banner("Wrecked", 3000);
    // hitting a car flashes the screen white (K3)
    if (e.kind === "crash" && e.rider === c.you && (e.cause === "rearEnd" || e.cause === "headOn" || e.cause === "broadside")) flash("#ffffff");
    if (e.kind === "busted" && e.rider === c.you) banner("Busted", 3000);
    // a weapon taken, or lost (C6)
    if (e.kind === "snatch" && e.by === c.you) banner(`Got the ${e.weapon}`, 1500);
    if (e.kind === "snatch" && e.from === c.you) banner(`Lost the ${e.weapon}`, 1500);
    if (e.kind === "finished" && e.rider === c.you) banner(e.place <= 3 ? `${ordinal(e.place)}: qualified` : ordinal(e.place), 3000);
  }
}

/** What this rider hears of a race event: their own blows and spills, and
 * anything happening within earshot. */
function sound(c: Current, e: Extract<ToClient, { t: "snap" }>["events"][number]): void {
  const r = c.race.riders.find((x) => x.id === c.you);
  if (!r) return;
  const near = (id: number): boolean => {
    const o = c.race.riders.find((x) => x.id === id);
    return !!o && Math.abs(o.z - r.z) < 40;
  };
  if (e.kind === "hit" && (e.by === c.you || e.on === c.you || near(e.on))) {
    const by = c.race.riders.find((x) => x.id === e.by);
    const weapon = e.move === "kick" ? "kick" : (by?.weapon ?? "punch");
    // a club on one's own helmet cracks as loud as one landed on anyone else's
    if (e.on === c.you) {
      sfx("hitTaken");
      if (weapon === "club") sfx("club");
    } else sfx(weapon);
  }
  if (e.kind === "crash" && (e.rider === c.you || near(e.rider))) sfx(e.cause === "rearEnd" || e.cause === "headOn" || e.cause === "broadside" ? "carCrash" : "crash");
  if (e.kind === "snatch" && (e.by === c.you || e.from === c.you)) sfx("snatch");
  if (e.kind === "busted" && e.rider === c.you) sfx("busted");
  if (e.kind === "finished" && e.rider === c.you) sfx("finish");
}

function onMessage(msg: ToClient): void {
  if (msg.t === "hello") {
    me = msg.you;
    qualified = msg.qualified;
    const name = $<HTMLInputElement>("#name");
    if (document.activeElement !== name) name.value = me.name;
    board();
    // the leaderboard may have loaded before this tab knew which row is its own
    if (app.dataset.screen === "leaders") void leaderboard();
  } else if (msg.t === "pool") pool(msg);
  else if (msg.t === "found") onFound(msg);
  else if (msg.t === "check") {
    if (found && found.match === msg.match) {
      found.accepted = msg.accepted;
      foundBoxes();
    }
  } else if (msg.t === "dropped") {
    closeFound();
    clearQueue(msg.why === "declined" ? "You declined the match and left the queue." : "You didn't accept in time, so you've left the queue.");
  } else if (msg.t === "requeued") {
    closeFound();
    $("#pool").textContent = "Someone didn't accept. You're back at the front of the queue.";
  } else if (msg.t === "loading") onLoading(msg);
  else if (msg.t === "loads") onLoads(msg);
  else if (msg.t === "ping") {
    send({ t: "pong", at: msg.at });
    if (current && current.you !== null && msg.rtt !== undefined) {
      current.net.rtt = msg.rtt;
      showPing(msg.rtt);
    }
  }
  else if (msg.t === "live") onLive(msg);
  else if (msg.t === "chat") onChat(msg);
  else if (msg.t === "start") begin(msg);
  else if (msg.t === "snap") onSnap(msg);
  else if (msg.t === "end") {
    if (current && current.id === msg.race) {
      if (current.you !== null) result(msg.standings, msg.qualified);
      else if (current.id === spectating) {
        spectating = null;
        watched(msg.standings, msg.aborted);
      } else $("#watch").hidden = true;
      current = null;
    }
  }
}

// ---- lobby ----

type Screen = "lobby" | "live" | "leaders" | "race" | "watch" | "result" | "loading";
/** the pages one can browse to, each at a URL of its own; everything else is a state of the game */
const PAGES: Partial<Record<Screen, string>> = { lobby: "/", live: "/live", leaders: "/leaderboard" };
const lobbyish = (s = app.dataset.screen): boolean => s !== undefined && s in PAGES;

function show(screen: Screen): void {
  app.dataset.screen = screen;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("#nav a")) a.toggleAttribute("aria-current", a.dataset.route === screen);
  if (screen === "live") rooms();
  if (screen === "leaders") void leaderboard();
  queueBar();
}

/** Go to one of the pages, and put it in the address bar so it can be shared and gone back to. */
function go(screen: Screen, push = true): void {
  const path = PAGES[screen];
  if (!path) return;
  if (push && location.pathname !== path) history.pushState(null, "", path);
  show(screen);
}

const routeOf = (path: string): Screen => (Object.entries(PAGES).find(([, p]) => p === path)?.[0] as Screen) ?? "lobby";
for (const a of document.querySelectorAll<HTMLAnchorElement>("#nav a")) {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    go(a.dataset.route as Screen);
  });
}
addEventListener("popstate", () => {
  if (lobbyish()) show(routeOf(location.pathname));
});

// ---- the leaderboard (N12) ----

async function leaderboard(): Promise<void> {
  let rows: Leader[] = [];
  try {
    rows = (await (await fetch("/api/leaderboard")).json()) as Leader[];
  } catch {
    return;
  }
  const body = $("#leaderboard").querySelector("tbody")!;
  body.innerHTML = "";
  $("#leaders-none").hidden = rows.length > 0;
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.id === me?.id) tr.className = "me";
    for (const text of [String(r.rank), r.name, String(r.points), String(r.races), String(r.wins), String(r.podiums), String(r.boards)]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
}

// ---- live rooms and spectating (N11) ----

let live: Room[] = [];
/** the race this tab asked to watch, full screen */
let spectating: number | null = null;
/** the rider the spectator's camera follows */
let follow = 0;

function onLive(msg: Extract<ToClient, { t: "live" }>): void {
  live = msg.races;
  const people = live.reduce((n, r) => n + r.humans.filter((h) => !h.out).length, 0);
  $("#nav-live").textContent = live.length > 0 ? `${live.length}` : "";
  $("#nav-live").title = `${live.length} races, ${people} people`;
  if (app.dataset.screen === "live") rooms();
}

function rooms(): void {
  const list = $("#rooms");
  $("#rooms-none").hidden = live.length > 0;
  // rebuilt only when the set of races or anyone in them changes, so a Watch button is not replaced under the pointer
  // (not on anyone's ping, which changes every second and is updated in place)
  const key = JSON.stringify(live.map((r) => [r.race, r.humans.map((h) => [h.name, h.look, h.out]), r.watchers]));
  if (list.dataset.key === key) {
    for (const r of live) {
      const t = list.querySelector(`li[data-race="${r.race}"] .time`);
      if (t) t.textContent = raceClock(r.time);
      // the pings change every second; updated in place, like the clock
      const pings = list.querySelectorAll(`li[data-race="${r.race}"] .who li:not(.out) .ping`);
      r.humans.filter((h) => !h.out).forEach((h, i) => {
        if (pings[i]) pings[i].textContent = h.ping == null ? "" : `${h.ping} ms`;
      });
    }
    return;
  }
  list.dataset.key = key;
  list.innerHTML = "";
  for (const r of live) {
    const li = document.createElement("li");
    li.dataset.race = String(r.race);
    const head = document.createElement("div");
    head.className = "room-head";
    const name = document.createElement("b");
    name.textContent = ROADS[r.track]?.name ?? "";
    const meta = document.createElement("span");
    meta.textContent = ` · level ${r.level} · ${r.mode === "ai" ? `with ${r.npcs} NPCs` : "humans only"}`;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = raceClock(r.time);
    head.append(name, meta, time);
    const who = document.createElement("ul");
    who.className = "who";
    for (const h of r.humans) {
      const p = document.createElement("li");
      if (h.out) p.className = "out";
      const n = document.createElement("span");
      n.textContent = h.name + (h.out ? " (left)" : "");
      p.append(swatch(h.look), n);
      if (!h.out) {
        const ms = document.createElement("span");
        ms.className = "ping";
        ms.textContent = h.ping == null ? "" : `${h.ping} ms`;
        p.append(ms);
      }
      who.append(p);
    }
    const foot = document.createElement("div");
    foot.className = "room-foot";
    const eyes = document.createElement("span");
    eyes.textContent = r.watchers === 0 ? "No one watching" : `${r.watchers} watching`;
    const btn = document.createElement("button");
    btn.textContent = "Watch";
    btn.addEventListener("click", () => {
      spectating = r.race;
      startAudio();
      send({ t: "watch", race: r.race });
    });
    foot.append(eyes, btn);
    li.append(head, who, foot);
    list.append(li);
  }
}

const raceClock = (t: number): string => (t < 0 ? "on the grid" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);

/** The riders a spectator can follow: the people first, then the leader of the rest. */
function followable(c: Current): Rider[] {
  const field = c.race.riders.filter((r) => !r.cop);
  const people = field.filter((r) => r.human);
  const leader = field.filter((r) => !r.human).sort((p, q) => q.z - p.z)[0];
  return leader ? [...people, leader] : people;
}

function cycle(by: number): void {
  const c = current;
  if (!c || spectating === null) return;
  const list = followable(c);
  if (list.length === 0) return;
  const i = list.findIndex((r) => r.id === follow);
  follow = list[(i + by + list.length) % list.length].id;
  spectateLabel();
}

function spectateLabel(): void {
  const c = current;
  const r = c?.race.riders.find((x) => x.id === follow);
  $("#spec-who").textContent = r ? r.name + (r.human ? "" : " (NPC)") : "";
}

function stopWatching(): void {
  send({ t: "unwatch" });
  spectating = null;
  current = null;
  updateAudio({ speed: 0, top: 1, throttle: false, riding: false });
  $("#count").hidden = true;
  $("#banner").textContent = "";
  go("live");
}

$("#spec-prev").addEventListener("click", () => cycle(-1));
$("#spec-next").addEventListener("click", () => cycle(1));
$("#spec-stop").addEventListener("click", stopWatching);
$("#again-live").addEventListener("click", () => go("live"));

// ---- the queue, a match found, and loading (N9, N10) ----

let queued: Mode | null = null;
/** this tab's clock when the queue was joined, kept through a requeue */
let queuedAt = 0;
let poolTimer: { count: number; until: number | null; waiting: boolean } | null = null;
const modeName = (m: Mode): string => (m === "ai" ? "With NPCs" : "Humans only");

function pool(msg: Extract<ToClient, { t: "pool" }>): void {
  if (!msg.mode) return;
  if (queued === null) queuedAt = performance.now() / 1000;
  queued = msg.mode;
  poolTimer = { count: msg.count, until: msg.startsIn === null ? null : performance.now() / 1000 + msg.startsIn, waiting: msg.waitingForMore };
  queueButtons();
}

/** Out of the queue, with a line saying why (or nothing). */
function clearQueue(why = ""): void {
  queued = null;
  poolTimer = null;
  $("#pool").textContent = why;
  queueButtons();
}

function queueButtons(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".queue button")) b.setAttribute("aria-pressed", String(b.dataset.mode === queued));
  queueBar();
}

/** The bar across the top: shown on the lobby pages while queued and no match is up. */
function queueBar(): void {
  const bar = $("#qbar");
  bar.hidden = queued === null || app.dataset.screen !== "lobby" || found !== null;
  if (bar.hidden || !queued) return;
  const now = performance.now() / 1000;
  const secs = Math.floor(now - queuedAt);
  $("#qbar-mode").textContent = `In queue · ${modeName(queued)}`;
  $("#qbar-time").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const t = poolTimer;
  const who = !t ? "" : t.count === 1 ? "just you" : `${t.count} riders`;
  $("#qbar-note").textContent = !t ? "" : t.waiting ? `${who}, waiting for one more` : t.until !== null ? `${who}, room forms in ${Math.max(0, Math.ceil(t.until - now))}s` : who;
}

$("#qbar-x").addEventListener("click", () => {
  send({ t: "leave" });
  clearQueue();
});

/** the match on screen, while it is being accepted */
let found: { match: number; of: number; accepted: number; until: number; answer: number; mine: boolean } | null = null;

function onFound(msg: Extract<ToClient, { t: "found" }>): void {
  found = { match: msg.match, of: msg.of, accepted: 0, until: performance.now() / 1000 + msg.answer, answer: msg.answer, mine: false };
  $("#found-line").textContent = `${modeName(msg.mode)} · ${msg.of === 1 ? "just you" : `${msg.of} riders`}`;
  $("#found-wait").hidden = true;
  $<HTMLButtonElement>("#found-yes").disabled = false;
  $<HTMLButtonElement>("#found-no").disabled = false;
  $("#found").hidden = false;
  foundBoxes();
  queueBar();
  $<HTMLButtonElement>("#found-yes").focus();
  startAudio();
  sfx("found");
  // a tab in the background is told in its title, as a game client flashes
  if (document.hidden) document.title = "Match found! · Knuckle Road";
}

function foundBoxes(): void {
  const f = found;
  if (!f) return;
  const list = $("#found-boxes");
  list.innerHTML = "";
  for (let i = 0; i < f.of; i++) {
    const li = document.createElement("li");
    li.className = i < f.accepted ? "yes" : "";
    list.append(li);
  }
}

function closeFound(): void {
  found = null;
  $("#found").hidden = true;
  document.title = "Knuckle Road";
  queueBar();
}

$("#found-yes").addEventListener("click", () => {
  if (!found || found.mine) return;
  found.mine = true;
  send({ t: "accept" });
  $<HTMLButtonElement>("#found-yes").disabled = true;
  $<HTMLButtonElement>("#found-no").disabled = true;
  $("#found-wait").hidden = false;
});
$("#found-no").addEventListener("click", () => {
  if (found) send({ t: "decline" });
});

/** The ring counts the ten seconds down, and the queue clock ticks on. On a
 * timer, not a frame: someone waiting in a queue has often put the tab behind
 * another, and a hidden tab gets no frames. */
setInterval(() => tickQueue(), 200);
function tickQueue(): void {
  queueBar();
  const f = found;
  if (!f) return;
  const left = Math.max(0, f.until - performance.now() / 1000);
  $("#found-secs").textContent = String(Math.ceil(left));
  $("#found-ring").style.setProperty("--left", String(left / f.answer));
}

/** What this tab built while loading, so the start does not build it twice. */
let prepared: { seed: number; track: Track } | null = null;
let loadingMatch = -1;

function onLoading(msg: Extract<ToClient, { t: "loading" }>): void {
  closeFound();
  clearQueue();
  loadingMatch = msg.match;
  const npcs = msg.entrants.filter((e) => !e.human).length;
  $("#loading-mode").textContent = npcs > 0 ? `With NPCs · ${npcs} of them` : "Humans only";
  $("#loading-head").textContent = ROADS[msg.track]?.name ?? "";
  $("#loading-line").textContent = `Level ${msg.level}`;
  const list = $("#loading-cards");
  list.innerHTML = "";
  for (const e of msg.entrants.filter((x) => x.human)) {
    const li = document.createElement("li");
    li.dataset.id = String(e.id);
    if (e.id === msg.you) li.className = "me";
    const name = document.createElement("span");
    name.className = "who";
    name.textContent = e.name;
    const ping = document.createElement("span");
    ping.className = "ping";
    ping.textContent = "connecting…";
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.append(document.createElement("i"));
    li.append(swatch(e.look), name, ping, bar);
    // a grudge from an earlier race between this person and the one loading (O3)
    const tally = (h: number, a: number): number => msg.feuds?.find((f) => f.holder === h && f.against === a)?.n ?? 0;
    const feud = e.id === msg.you ? "" : feudLine(tally(msg.you, e.id), tally(e.id, msg.you));
    if (feud) {
      const p = document.createElement("span");
      p.className = "feud";
      p.textContent = feud;
      li.classList.add("grudge");
      li.insertBefore(p, bar);
    }
    list.append(li);
  }
  // the field talks while it loads (O7)
  const talk = $("#schmooze");
  talk.replaceChildren();
  for (const l of schmooze(makeTrack(msg.level, msg.track), msg.level, msg.entrants, msg.you, msg.feuds ?? [], msg.seed)) {
    const li = document.createElement("li");
    if (l.cold) li.className = "cold";
    const who = document.createElement("b");
    who.textContent = l.from;
    li.append(who, ` ${l.text}`);
    talk.append(li);
  }
  show("loading");
  void prepare(msg);
}

/** The real work of loading, reported as it goes: the road, the scene, the riders' frames, the music. */
async function prepare(msg: Extract<ToClient, { t: "loading" }>): Promise<void> {
  const step = async (p: number): Promise<void> => {
    send({ t: "progress", p });
    // give the page a moment to paint the bar (a timer, not a frame: a hidden tab gets no frames)
    await new Promise((r) => setTimeout(r, 0));
  };
  await step(0.05);
  const track = makeTrack(msg.level, msg.track);
  await step(0.25);
  roadScene.setTrack(track);
  roadScene.setLooks(msg.entrants);
  prepared = { seed: msg.seed, track };
  await step(0.5);
  roadScene.prepare();
  for (let i = 0; i < 400 && !roadScene.ready; i++) await new Promise((r) => setTimeout(r, 25));
  await step(0.8);
  setRoad(msg.track);
  try {
    await fetch(MUSIC[msg.track]);
  } catch {
    // the race goes on without its music
  }
  if (loadingMatch === msg.match) await step(1);
}

function onLoads(msg: Extract<ToClient, { t: "loads" }>): void {
  if (msg.match !== loadingMatch) return;
  for (const r of msg.riders) {
    const li = $("#loading-cards").querySelector<HTMLElement>(`li[data-id="${r.id}"]`);
    if (!li) continue;
    li.querySelector<HTMLElement>(".bar i")!.style.width = `${Math.round(r.p * 100)}%`;
    li.querySelector(".ping")!.textContent = r.p >= 1 ? `ready · ${r.ping} ms` : `${r.ping} ms`;
    li.classList.toggle("ready", r.p >= 1);
  }
}

/** A person's leathers as a little badge: the main colour, the second across its top, and the helmet's dot. */
function swatch(look: number | undefined): HTMLElement {
  const el = document.createElement("span");
  el.className = "swatch";
  const l = look === undefined ? undefined : LIVERIES[look];
  if (l) el.style.background = `radial-gradient(circle at 50% 24%, ${l.helmet} 0 17%, transparent 18%), linear-gradient(${l.trim} 0 42%, ${l.main} 42%)`;
  return el;
}

function board(): void {
  const body = $("#quals").querySelector("tbody")!;
  const tracks = ROADS.map((r) => r.name);
  body.innerHTML = "";
  for (const t of tracks) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = t;
    tr.append(th);
    for (let l = 1; l <= 5; l++) {
      const td = document.createElement("td");
      const yes = qualified.some((q) => q.level === l && q.track === t);
      td.className = yes ? "yes" : "";
      td.setAttribute("aria-label", yes ? `level ${l}: qualified` : `level ${l}: not yet`);
      tr.append(td);
    }
    body.append(tr);
  }
}

// how many NPC riders to race (N2), remembered by this browser
const aiCount = $<HTMLInputElement>("#ai-count");
const showAi = (): void => {
  $("#ai-count-out").textContent = aiCount.value;
};
aiCount.value = localStorage.getItem("aiRiders") ?? aiCount.value;
showAi();
aiCount.addEventListener("input", () => {
  showAi();
  localStorage.setItem("aiRiders", aiCount.value);
});

for (const b of document.querySelectorAll<HTMLButtonElement>(".queue button")) {
  b.addEventListener("click", () => {
    const level = Number(document.querySelector<HTMLInputElement>('input[name="level"]:checked')?.value ?? 1);
    const track = Number(document.querySelector<HTMLInputElement>('input[name="road"]:checked')?.value ?? 0);
    // the click is the gesture a browser wants before it will play sound;
    // the road asked for plays while the pool fills
    setRoad(track);
    startAudio();
    send({ t: "queue", mode: b.dataset.mode as Mode, level, track, ai: Number(aiCount.value) });
  });
}
$<HTMLInputElement>("#name").addEventListener("change", (e) => send({ t: "name", name: (e.target as HTMLInputElement).value }));
$("#again").addEventListener("click", () => {
  go("lobby");
  board();
});

// ---- leaving a race (H8) ----

// Esc asks, as the original's pause does, and Esc again leaves. Nothing
// pauses: the race is everyone's, so the bike still answers the keys while
// the question is up, and it is the server that takes the rider out.
const quitAsk = $("#quit-ask");

function askQuit(open: boolean): void {
  quitAsk.hidden = !open;
  if (open) $<HTMLButtonElement>("#quit-no").focus();
  else $<HTMLButtonElement>("#quit-no").blur();
}

function quitRace(): void {
  const c = current;
  if (!c || c.you === null) return;
  send({ t: "quit" });
  current = null;
  askQuit(false);
  for (const k of Object.keys(keys) as (keyof Input)[]) keys[k] = false;
  // nobody aboard: the engine only ticks over and the wind drops
  updateAudio({ speed: 0, top: 1, throttle: false, riding: false });
  $("#count").hidden = true;
  $("#banner").textContent = "";
  clearQueue();
  go("lobby");
  board();
}

$("#quit").addEventListener("click", () => askQuit(true));
$("#quit-no").addEventListener("click", () => askQuit(false));
$("#quit-yes").addEventListener("click", quitRace);

// ---- result (H4: four endings, each its own screen) ----

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

function result(standings: Standing[], quals: { level: number; track: string }[]): void {
  // what a wreck or a bust took off the board (S5)
  const lost = qualified.filter((q) => !quals.some((x) => x.level === q.level && x.track === q.track));
  qualified = quals;
  askQuit(false);
  clearQueue();
  const c = current!;
  const mine = standings.find((s, i) => s.human && c.race.riders.find((r) => r.id === c.you)?.name === s.name && i >= 0);
  const outcome = mine?.outcome ?? "unfinished";
  const lines: Record<Standing["outcome"], [string, string]> = {
    qualified: ["Qualified", `${ordinal(mine!.place)} across the line. ${c.race.track.name}, level ${c.level}, goes on your board.`],
    placed: ["Placed", `${ordinal(mine?.place ?? 0)}. You finished, but only the top three qualify.`],
    wrecked: ["Wrecked", "The bike gave out before the line."],
    busted: ["Busted", "You came off with a cop beside you. The race is over for you."],
    unfinished: ["Out of time", "The race closed before you reached the line."],
    quit: ["Left the race", ""],
    aborted: ["Race stopped", "The server restarted mid-race. It counts for nobody; the page reconnects by itself."],
  };
  const [head, line] = lines[outcome];
  const revoked = lost.length === 0 ? "" : ` It costs you every qualification on level ${c.level}: ${lost.map((q) => q.track).join(", ")}.`;
  $("#ending").textContent = head;
  $("#ending-line").textContent = line + revoked;
  $("#result").dataset.outcome = outcome;
  $("#again").hidden = false;
  $("#again-live").hidden = true;
  standingsTable(standings, mine);
  show("result");
  $<HTMLButtonElement>("#again").focus();
}

/** The end of a race one only watched: who won, and the table. */
function watched(standings: Standing[], aborted?: string): void {
  const first = standings.find((s) => s.outcome === "qualified");
  $("#ending").textContent = aborted ? "Race stopped" : "Race over";
  $("#ending-line").textContent = aborted
    ? "The server restarted mid-race. The page reconnects by itself."
    : first
      ? `${first.name}${first.human ? "" : " (NPC)"} took it.`
      : "Nobody reached the line.";
  $("#result").dataset.outcome = "watched";
  $("#again").hidden = true;
  $("#again-live").hidden = false;
  standingsTable(standings, undefined);
  show("result");
  $<HTMLButtonElement>("#again-live").focus();
}

function standingsTable(standings: Standing[], mine: Standing | undefined): void {
  const body = $("#standings").querySelector("tbody")!;
  body.innerHTML = "";
  for (const s of standings) {
    const tr = document.createElement("tr");
    if (s === mine) tr.className = "me";
    const time = s.time === null ? "" : `${Math.floor(s.time / 60)}:${(s.time % 60).toFixed(1).padStart(4, "0")}`;
    const note = s.outcome === "wrecked" ? "wrecked" : s.outcome === "unfinished" ? "—" : s.outcome === "quit" ? "left" : s.outcome === "aborted" ? "stopped" : "";
    for (const text of [String(s.place), s.name + (s.human ? "" : " (NPC)"), time, note]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
}

// ---- input ----

const keys: Input = { ...NO_INPUT };
let seq = 0;
let lastSent = -1;
let lastSentAt = 0;

// every control remapped by the rider (R16), kept by this browser
let bindings = loadKeys(localStorage.getItem("keys"));
/** the action whose new key is being waited for, if any */
let choosing: Action | null = null;

function showKeys(): void {
  const list = $("#keymap");
  list.replaceChildren();
  for (const { action, label } of ACTIONS) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = label;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.action = action;
    b.setAttribute("aria-pressed", String(choosing === action));
    b.textContent = choosing === action ? "Press a key…" : keyName(bindings[action]);
    b.setAttribute("aria-label", `${label}: ${choosing === action ? "press the new key" : keyName(bindings[action])}`);
    b.addEventListener("click", () => {
      choosing = choosing === action ? null : action;
      showKeys();
      list.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.focus();
    });
    li.append(span, b);
    list.append(li);
  }
  const k = (a: Action): string => keyName(bindings[a]);
  $("#keys-line").textContent = `${k("throttle")} ride · ${k("brake")} brake · ${k("left")} ${k("right")} steer · ${k("hand")} hand · ${k("foot")} foot · ${k("off")} off`;
  // the touch buttons carry the keyboard letter too
  for (const b of document.querySelectorAll<HTMLElement>("#touch button[data-key]")) {
    const a = b.dataset.key as Action;
    const letter = b.firstChild;
    if ((a === "hand" || a === "foot" || a === "brake" || a === "throttle" || a === "off") && letter?.nodeType === Node.TEXT_NODE) letter.textContent = keyName(bindings[a]);
  }
}
$("#keys-reset").addEventListener("click", () => {
  bindings = { ...DEFAULT_KEYS };
  choosing = null;
  localStorage.setItem("keys", JSON.stringify(bindings));
  showKeys();
});
showKeys();

function setKey(k: keyof Input, down: boolean): void {
  const c = current;
  if (down && !keys[k] && c && c.you !== null && (k === "hand" || k === "foot")) {
    const r = c.race.riders.find((x) => x.id === c.you);
    if (r) beginAttack(c.race, r, k); // the arm moves now; the server decides the hit
  }
  keys[k] = down;
}

let musicOn = true;

addEventListener("keydown", (e) => {
  // waiting for a new key for one action (R16): the next key is it, Esc cancels
  if (choosing) {
    e.preventDefault();
    if (e.code !== "Escape") {
      bindings = rebind(bindings, choosing, e.code);
      localStorage.setItem("keys", JSON.stringify(bindings));
    }
    const was = choosing;
    choosing = null;
    showKeys();
    $<HTMLButtonElement>(`#keymap button[data-action="${was}"]`).focus();
    return;
  }
  // F1 to F8 say one of the canned lines (N7), as in the original
  const f = /^F([1-8])$/.exec(e.code);
  if (f && app.dataset.screen === "race") {
    e.preventDefault();
    if (!e.repeat) say(Number(f[1]) - 1);
    return;
  }
  if (e.code === "Escape" && !sayings.hasAttribute("hidden")) {
    e.preventDefault();
    openSayings(false);
    return;
  }
  // F10 puts the dashboard away and brings it back (H2), as in the original
  if (e.code === "F10" && (app.dataset.screen === "race" || app.dataset.screen === "watch")) {
    e.preventDefault();
    if (!e.repeat) toggleDash();
    return;
  }
  if (e.code === "KeyM" && document.activeElement?.tagName !== "INPUT") {
    musicOn = !musicOn;
    setMusic(musicOn);
    banner(musicOn ? "Music on" : "Music off", 900);
    return;
  }
  if (app.dataset.screen === "watch" && !e.repeat) {
    if (e.code === "Escape") stopWatching();
    else if (e.code === "ArrowLeft" || e.code === "KeyA") cycle(-1);
    else if (e.code === "ArrowRight" || e.code === "KeyD") cycle(1);
    else return;
    e.preventDefault();
    return;
  }
  if (e.code === "Escape" && app.dataset.screen === "race" && !e.repeat) {
    e.preventDefault();
    if (quitAsk.hidden) askQuit(true);
    else quitRace();
    return;
  }
  const k = actionOf(bindings, e.code);
  if (!k || app.dataset.screen !== "race") return;
  e.preventDefault();
  setKey(k, true);
});
addEventListener("keyup", (e) => {
  const k = actionOf(bindings, e.code);
  if (!k) return;
  setKey(k, false);
});
addEventListener("blur", () => {
  for (const k of Object.keys(keys) as (keyof Input)[]) keys[k] = false;
});

for (const b of document.querySelectorAll<HTMLButtonElement>("#touch button")) {
  const k = b.dataset.key as keyof Input;
  const down = (e: PointerEvent): void => {
    e.preventDefault();
    b.classList.add("down");
    setKey(k, true);
  };
  const up = (e: PointerEvent): void => {
    e.preventDefault();
    b.classList.remove("down");
    setKey(k, false);
  };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("pointerleave", up);
}

function sendKeys(now: number): void {
  const bits = packInput(keys);
  if (bits !== lastSent || now - lastSentAt > 0.25) {
    send({ t: "in", seq: ++seq, keys: bits });
    current?.net.keys(seq, now);
    lastSent = bits;
    lastSentAt = now;
  }
}

// ---- drawing ----

const road = $<HTMLCanvasElement>("#road");
const dash = $<HTMLCanvasElement>("#dash");
const dashCtx = dash.getContext("2d")!;
const watch = $<HTMLCanvasElement>("#watch-canvas");
const roadScene = new RaceScene(road);
const watchScene = new RaceScene(watch);
// the riders' frames are drawn in the lobby, once the page is up, not on the grid
setTimeout(() => roadScene.prepare(), 200);
let dashCover = 0;
/** the dashboard put away with F10 or its button (H2), kept by this browser */
let dashHidden = localStorage.getItem("dash") === "off";
function toggleDash(): void {
  dashHidden = !dashHidden;
  localStorage.setItem("dash", dashHidden ? "off" : "on");
  $("#dash-toggle").setAttribute("aria-pressed", String(dashHidden));
  banner(dashHidden ? "Dashboard off" : "Dashboard on", 900);
}
$("#dash-toggle").setAttribute("aria-pressed", String(dashHidden));
$("#dash-toggle").addEventListener("click", toggleDash);

function resize(): void {
  const stage = $("#stage").getBoundingClientRect();
  const w = Math.max(1, Math.round(stage.width));
  const h = Math.max(1, Math.round(stage.height));
  roadScene.resize(w, h);
  const dpr = Math.min(2, devicePixelRatio);
  dash.width = Math.round(w * dpr);
  dash.height = Math.round(h * dpr);
}
addEventListener("resize", resize);

/**
 * The predicted bike stops at other bikes instead of passing through them
 * until the server's correction arrives, and the touch is felt at once, not a
 * round trip later (K13).
 */
function keepOff(c: Current, r: Rider, now: number): void {
  if (r.phase !== "riding") return;
  // riding over someone on foot is felt as it happens, too (C9); the server
  // throws them
  for (const o of c.race.riders) {
    if (o === r || !onFoot(o) || r.speed < 3 || ranOver.has(o.id)) continue;
    if (Math.abs(o.z - r.z) > (BIKE.length + TUNE.walkerSize) / 2 || Math.abs(o.x - r.x) > (BIKE.width + TUNE.walkerSize) / 2) continue;
    ranOver.set(o.id, now);
    const felt = react({ t: c.race.t, kind: "runOver", by: r.id, on: o.id, what: "rider" }, c.race.riders, c.you);
    roadScene.feel(felt);
    if (felt.sound) sfx(felt.sound.kind, felt.sound.gain);
  }
  // and over a fallen bike
  for (const o of c.race.riders) {
    if (o === r || (o.phase !== "thrown" && o.phase !== "running") || r.speed < 3 || ranOver.has(-1 - o.id)) continue;
    if (Math.abs(o.bikeZ - r.z) > BIKE.length || Math.abs(o.bikeX - r.x) > BIKE.width) continue;
    ranOver.set(-1 - o.id, now);
    const felt = react({ t: c.race.t, kind: "runOver", by: r.id, on: o.id, what: "bike" }, c.race.riders, c.you);
    roadScene.feel(felt);
    if (felt.sound) sfx(felt.sound.kind, felt.sound.gain);
  }
  // and over someone on foot (T6): they go flying and the bike goes up, here at once
  const hit = now >= c.go ? walkInto({ walkers: c.race.walkers, t: now - c.go, events: [] }, r) : null;
  if (hit) {
    ranOver.set(hit.id, now);
    const felt = react({ t: now - c.go, kind: "runOver", by: r.id, on: hit.id, what: "walker" }, c.race.riders, c.you);
    roadScene.feel(felt);
    if (felt.sound) sfx(felt.sound.kind, felt.sound.gain);
  }
  for (const [id, at] of ranOver) if (now - at > 1) ranOver.delete(id);
  for (const o of c.race.riders) {
    if (o === r || o.phase !== "riding") continue;
    const closing = r.speed - o.speed;
    const touch = separate(r, o, 1);
    if (!touch || now - localBump < 0.25) continue;
    localBump = now;
    // a shunt parts the two at once here too, as the server will (K14),
    // rather than holding the predicted bike on the other's tail. Once a
    // touch: applied every frame they overlapped, it threw the bike sideways
    // at 14 m/s against a drawn bike whose speed it never changed
    if (touch === "rear" && Math.abs(closing) > 1 && (o.z > r.z ? closing > 0 : closing < 0)) {
      const s = o.z > r.z ? shuntOf(r, o).back : shuntOf(o, r).front;
      r.speed = s.speed;
      r.shove = s.shove;
    }
    const hard = touch === "rear" ? Math.abs(closing) / 14 : Math.abs(r.vx) / TUNE.rubKnock;
    const felt = react({ t: c.race.t, kind: "bump", rider: r.id, other: o.id, with: "rider", hard: Math.min(1, Math.max(0.3, hard)), from: o.x }, c.race.riders, c.you);
    roadScene.feel(felt);
    if (felt.sound) sfx(felt.sound.kind, felt.sound.gain);
  }
}

/** Everyone but the predicted rider, where the snapshots say they are now (client/netview.ts). */
function interpolate(c: Current, now: number): void {
  const tl = c.timeline;
  if (tl.snaps.length === 0) return;
  const t = tl.now(now);
  for (const car of c.race.cars) {
    const p = tl.car(car.id, t);
    // a car the server stopped sending is nowhere near anyone: hide it
    car.z = p ? p.z : -1e6;
    if (p) car.x = p.x;
  }
  for (const r of c.race.riders) {
    if (r.id === c.you) continue;
    const p = tl.rider(r.id, t);
    if (!p) continue;
    applyRider(r, p.s);
    r.z = p.z;
    r.x = p.x;
    r.lean = p.lean;
  }
}

/** the network reports this tab has sent, for the debugging handle */
const netSent: NetReport[] = [];
/** where one's own bike was last drawn, for the debugging handle */
let drawnSelf = { z: 0, x: 0 };
let last = performance.now() / 1000;
let acc = 0;
let hitFlash = 0;

function frame(): void {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  // the frame's real length, unclamped, for the network report (N14)
  const last0 = last;
  last = now;
  const c = current;
  if (c) {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      c.steps++;
      if (c.you !== null) {
        const r = c.race.riders.find((x) => x.id === c.you);
        // on the grid nothing moves; keys held now are sent, and go with everyone's
        if (r && now >= c.go) {
          c.drawFrom = { z: r.z, x: r.x };
          c.handover.step();
          ride(r, keys, c.race.track);
          const fix = c.prediction.ease();
          r.z += fix.z;
          r.x += fix.x;
          // the predicted bike stops at other bikes too, instead of passing
          // through them until the server's correction arrives
          keepOff(c, r, now);
          if (r.attack) {
            r.attack.t += DT;
            if (r.attack.t >= windupOf(r, r.attack) + 0.2) r.attack = null;
          }
          c.prediction.record(c.steps, r.z, r.x);
        }
      }
    }
    if (c.you !== null) {
      sendKeys(now);
      c.net.drew(now - last0);
      const report = c.net.report(now);
      if (report) {
        send({ t: "net", ...report });
        netSent.push(report);
      }
    }
    if (c.you !== null || c.id === spectating) countdown(c, now);
    interpolate(c, now);
    // and again once the others have moved this frame: the screen refreshes
    // faster than the race steps, and between steps a bike moved up to where
    // it is now was drawn into the player's, up to half a bike deep
    // (.cache/ramlive.ts, 9 frames in 30 s of riding at the field)
    const own = c.you === null ? null : c.race.riders.find((x) => x.id === c.you);
    if (own) keepOff(c, own, now);
    if (c.you !== null) {
      // one's own bike drawn between its last two steps, as far along as the
      // clock is towards the next. Drawn where the last step left it, it moved
      // only on frames that ran a step: at 120 fps it stood still one frame
      // and jumped 1.25 m the next, and the camera with it, so every bike
      // round it seemed to lurch back and forth (.cache/jitter.mjs: 57 cm a
      // frame off a straight line, the others 2 cm on the road)
      const held = own && c.drawFrom && Math.abs(own.z - c.drawFrom.z) < 5 ? { z: own.z, x: own.x } : null;
      const real = own ? { z: own.z, x: own.x } : null;
      if (own && held) {
        const f = acc / DT;
        own.z = c.drawFrom!.z + (held.z - c.drawFrom!.z) * f;
        own.x = c.drawFrom!.x + (held.x - c.drawFrom!.x) * f;
      }
      if (own) {
        own.z += c.handover.off.z;
        own.x += c.handover.off.x;
      }
      roadScene.draw(c.race.riders, c.you, dashCover / Math.max(1, dash.height), c.race.cars, c.race.walkers, now - c.go);
      if (own) drawnSelf = { z: own.z, x: own.x };
      if (own && real) {
        own.z = real.z;
        own.x = real.x;
      }
      hud(c);
      const r = c.race.riders.find((x) => x.id === c.you);
      if (r) updateAudio({ speed: r.speed, top: topSpeed(r), throttle: keys.throttle, riding: r.phase === "riding" });
    } else if (c.id === spectating) {
      // spectating, full screen, behind whoever was picked, with their dash
      const r = c.race.riders.find((x) => x.id === follow);
      if (r) {
        roadScene.draw(c.race.riders, follow, dashCover / Math.max(1, dash.height), c.race.cars, c.race.walkers, now - c.go);
        hud(c, follow);
        updateAudio({ speed: r.speed, top: topSpeed(r), throttle: false, riding: r.phase === "riding" });
      }
    } else if (!$("#watch").hidden) {
      // watching: ride along behind whoever is leading
      const lead = c.race.riders.filter((r) => !r.cop).sort((p, q) => q.z - p.z)[0];
      watchScene.draw(c.race.riders, lead.id, 0, c.race.cars, c.race.walkers, now - c.go);
    }
    // the picture darkened over the count, and back at the go (V16)
    if (c.you !== null || c.id === spectating) $("#veil").style.opacity = String(startShade(c.go - now));
    if (hitFlash > 0) {
      hitFlash = Math.max(0, hitFlash - dt * 4);
      $("#flash").style.opacity = String(hitFlash * 0.45);
    }
  }
  requestAnimationFrame(frame);
}

function flash(colour = "#ff2010"): void {
  $("#flash").style.background = colour;
  hitFlash = 1;
}

/** The count on the grid, big and white in the road ahead, and the beeps (V16). */
function countdown(c: Current, now: number): void {
  const left = Math.ceil(c.go - now);
  if (left === c.counted) return;
  c.counted = left;
  const el = $("#count");
  if (left > 0) {
    el.textContent = String(left);
    el.hidden = false;
    sfx("countdown");
  } else if (left === 0) {
    el.textContent = "GO";
    sfx("go");
    window.setTimeout(() => (el.hidden = true), 700);
  }
}

/** The round trip in the corner of the race (N14); null hides it until the first is measured. */
function showPing(rtt: number | null): void {
  const el = $("#ping");
  const p = pingLabel(rtt);
  el.hidden = p === null;
  if (!p) return;
  el.textContent = p.text;
  el.className = p.tone;
}

let bannerTimer = 0;
function banner(text: string, ms = 1500): void {
  const el = $("#banner");
  el.textContent = text;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (el.textContent = ""), ms);
}

// ---- HUD (H1) ----

let lastSaid = "";

function hud(c: Current, id = c.you): void {
  const r = c.race.riders.find((x) => x.id === id) as Rider;
  const o = nearest(c.race, r);
  const position = r.place || positionOf(c.race, r.id);
  dashCover = drawDash(dashCtx, dash.width, dash.height, {
    name: r.name,
    kmh: r.speed / KMH,
    rpm: revs(r.speed, cap(r), r.build),
    position,
    km: Math.max(0, r.z) / 1000, // an odometer, never a progress bar (T3); km, as the dial is
    damage: r.damage / 100,
    stamina: r.stamina / 100,
    opponent: o ? { name: o.name, stamina: o.stamina / 100, gap: o.z - r.z, mood: moodOf(o, r.id, c.feuds) } : null,
    hidden: dashHidden,
  });
  people(c, id);
  // the same facts for a screen reader, spoken only when they change
  const said = `Position ${position} of ${c.race.riders.filter((x) => !x.cop).length}${o && moodOf(o, r.id, c.feuds) === "after" ? `, ${o.name} is after you` : ""}`;
  if (said !== lastSaid) {
    $("#position").textContent = said;
    lastSaid = said;
  }
  void topSpeed;
}

/** Every person's place in the upper left (N6), with the grudges against the bike the screen is behind (O3); redrawn only when it changes. */
let peopleShown = "";
function people(c: Current, id: number | null): void {
  const rows = peopleRows(c.race, c.entrants, id, c.feuds);
  const el = $("#people");
  // one person alone has the place on the dash already
  const key = rows.length < 2 ? "" : JSON.stringify(rows);
  if (key === peopleShown) return;
  peopleShown = key;
  el.hidden = key === "";
  el.innerHTML = "";
  for (const r of rows) {
    const li = document.createElement("li");
    li.classList.toggle("me", r.me);
    li.classList.toggle("out", r.out);
    li.classList.toggle("grudge", r.onYou > 0);
    const place = document.createElement("b");
    place.textContent = String(r.place);
    const name = document.createElement("span");
    name.className = "who";
    name.textContent = r.name;
    li.append(place, swatch(r.look), name);
    const feud = feudLine(r.onYou, r.byYou);
    if (feud) {
      const mark = document.createElement("span");
      mark.className = "feud";
      // a head-to-head score, theirs first: the words are on the loading screen and in the label
      mark.textContent = `${r.onYou}–${r.byYou}`;
      mark.title = feud;
      mark.setAttribute("aria-label", feud);
      li.append(mark);
    }
    el.append(li);
  }
}

// ---- the race's chat (N7) ----

const sayings = $("#sayings");
SAYINGS.forEach((line, i) => {
  const li = document.createElement("li");
  const b = document.createElement("button");
  const k = document.createElement("kbd");
  k.textContent = `F${i + 1}`;
  b.append(k, line);
  b.addEventListener("click", () => {
    say(i);
    openSayings(false);
  });
  li.append(b);
  sayings.append(li);
});
function openSayings(open: boolean): void {
  sayings.hidden = !open;
  $("#say").setAttribute("aria-expanded", String(open));
  if (open) sayings.querySelector("button")?.focus();
}
$("#say").addEventListener("click", () => openSayings(sayings.hasAttribute("hidden")));

let saidAt = -Infinity;
function say(line: number): void {
  const now = performance.now() / 1000;
  // the server takes one line every SAY_GAP s; a quicker one is not sent
  if (now - saidAt < SAY_GAP || !current || current.you === null) return;
  saidAt = now;
  send({ t: "say", line });
}

const STATUS: Record<"wrecked" | "busted" | "left", string> = { wrecked: "is wrecked", busted: "is busted", left: "left the race" };

/** A line in the chat box: the newest four are kept, and each fades after eight seconds. */
function onChat(msg: Extract<ToClient, { t: "chat" }>): void {
  const c = current;
  if (!c || c.id !== msg.race) return;
  const name = c.entrants.find((e) => e.id === msg.from)?.name ?? "Someone";
  const li = document.createElement("li");
  const who = document.createElement("b");
  who.textContent = name;
  if (msg.status) {
    li.className = "status";
    li.append(who, ` ${STATUS[msg.status]}`);
  } else if (msg.say !== undefined && SAYINGS[msg.say]) {
    li.append(who, `: ${SAYINGS[msg.say]}`);
  } else return;
  const box = $("#chat");
  box.append(li);
  while (box.children.length > 4) box.firstElementChild!.remove();
  window.setTimeout(() => li.classList.add("old"), 8000);
  window.setTimeout(() => li.remove(), 8700);
}

// ---- debugging and tuning handle (CLAUDE.md: read state, don't screenshot it) ----

declare global {
  interface Window {
    __rash: unknown;
  }
}
window.__rash = {
  state: () => {
    const c = current;
    const r = c?.race.riders.find((x) => x.id === c.you);
    return c && r
      ? { race: c.id, you: c.you, t: c.race.t, kmh: r.speed / KMH, mph: r.speed / MPH, x: r.x, z: r.z, lean: r.lean, build: r.build, phase: r.phase, air: r.air, stamina: r.stamina, damage: r.damage, weapon: r.weapon, threat: windingAt(c.race, r)?.id ?? null }
      : { screen: app.dataset.screen, queued };
  },
  press: (k: keyof Input, down: boolean) => setKey(k, down),
  scene: () => roadScene,
  heard: () => heard,
  /** the music and the recorded hits: what is loaded and playing */
  sound: () => soundState(),
  /** one's own bike as drawn this frame, between its last two steps */
  self: () => drawnSelf,
  /** every report this tab has sent of its network (N14), for scripts/feel.ts */
  net: () => netSent,
  /** everyone as drawn this frame, unrounded */
  /** how far back the others are drawn now, s, and whether this frame was past the newest snapshot (N14) */
  /** the people list and grudges as this tab has them (N6, O3) */
  people: () => (current ? { rows: peopleRows(current.race, current.entrants, current.you, current.feuds), feuds: current.feuds } : null),
  delay: () => (current ? { delay: current.timeline.delay, starved: current.timeline.starved() } : null),
  drawn: () => current?.race.riders.map((r) => ({ id: r.id, z: r.z, x: r.x, phase: r.phase, cop: r.cop })),
  riders: () => current?.race.riders.map((r) => ({ id: r.id, cop: r.cop, z: Math.round(r.z), x: r.x.toFixed(1), phase: r.phase, weapon: r.weapon, attack: r.attack && `${r.attack.kind}${r.attack.t.toFixed(2)}${r.attack.landed ? "L" : ""}` })),
};

// the page the address bar names
show(routeOf(location.pathname));
connect();
requestAnimationFrame(frame);
