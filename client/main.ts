// The browser: lobby, race and result screens over one WebSocket. The server
// owns every race; this end predicts its own rider with the same ride() the
// server runs, so the bike answers the keys at once, and draws everyone else
// a tenth of a second in the past, between two snapshots.

import { type CarState, type Entry, type Mode, type RiderState, type Standing, type ToClient, type ToServer, applyRider } from "../game/protocol.ts";
import { drawDash } from "./dash.ts";
import { RaceScene } from "./scene.ts";
import { DT, type Input, MPH, NO_INPUT, type Race, type Rider, beginAttack, cap, nearest, separate, packInput, positionOf, ride, startRace, topSpeed, TUNE } from "../game/sim.ts";
import { MILE, makeTrack } from "../game/track.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const app = $("#app");

// ---- connection ----

let ws: WebSocket | null = null;
let me: { id: number; name: string } | null = null;
let qualified: { level: number; track: string }[] = [];

function send(msg: ToServer): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ToClient);
  ws.onclose = () => {
    setTimeout(connect, 1000);
    if (current?.you !== null && current) banner("Connection lost");
  };
}

// ---- a race as this tab sees it ----

type Snapshot = { at: number; time: number; riders: RiderState[]; cars: CarState[] };

type Current = {
  id: number;
  level: number;
  race: Race;
  you: number | null; // local rider id, or null when watching
  snaps: Snapshot[];
  history: Map<number, { z: number; x: number }>; // predicted pose by step
  steps: number;
  offset: number | null; // server time minus local time, seconds
  ended: boolean;
};

let current: Current | null = null;

function begin(msg: Extract<ToClient, { t: "start" }>): void {
  const track = makeTrack(msg.level);
  const race = startRace(track, msg.level, msg.entrants.map((e: Entry) => ({ ...e })), msg.seed);
  current = { id: msg.race, level: msg.level, race, you: msg.you, snaps: [], history: new Map(), steps: 0, offset: null, ended: false };
  if (msg.you !== null) {
    show("race");
    roadScene.setTrack(track);
    resize();
    banner(`Level ${msg.level} · ${(track.length / MILE).toFixed(1)} miles`, 2500);
    $("#touch").querySelectorAll("button").forEach((b) => b.classList.remove("down"));
  } else {
    $("#watch").hidden = false;
    watchScene.setTrack(track);
    watchScene.resize(watch.clientWidth || 480, watch.clientHeight || 270);
  }
}

function onSnap(msg: Extract<ToClient, { t: "snap" }>): void {
  const c = current;
  if (!c || c.id !== msg.race) return;
  const now = performance.now() / 1000;
  c.snaps.push({ at: now, time: msg.time, riders: msg.riders, cars: msg.cars });
  if (c.snaps.length > 30) c.snaps.shift();
  const localTime = c.steps * DT;
  const offset = msg.time - localTime;
  c.offset = c.offset === null ? offset : Math.min(c.offset + 0.002, offset); // track the least-delayed

  if (c.you === null) return;
  const mine = msg.riders.find((s) => s[0] === c.you);
  const r = c.race.riders.find((x) => x.id === c.you);
  if (!mine || !r) return;
  const before = r.phase;
  const predicted = c.history.get(Math.round(msg.time / DT));
  if (mine[8] !== "riding" || before !== "riding" || !predicted) {
    // off the bike, back on it, or no prediction to compare: the server's word
    applyRider(r, mine);
  } else {
    // steer the prediction towards the server by the error it had then
    const ez = mine[1] - predicted.z;
    const ex = mine[2] - predicted.x;
    if (Math.abs(ez) > 6 || Math.abs(ex) > 3) applyRider(r, mine);
    else {
      r.z += ez * 0.3;
      r.x += ex * 0.3;
      r.speed = mine[3];
      r.build = mine[5];
      r.stamina = mine[6];
      r.damage = mine[7];
      r.place = mine[13];
    }
  }
  for (const e of msg.events) {
    if (e.kind === "hit" && e.on === c.you) flash();
    if (e.kind === "crash" && e.rider === c.you) banner(e.cause === "knockdown" ? "Knocked off" : "Down!", 1200);
    if (e.kind === "wrecked" && e.rider === c.you) banner("Wrecked", 3000);
    // hitting a car flashes the screen white (K3)
    if (e.kind === "crash" && e.rider === c.you && (e.cause === "rearEnd" || e.cause === "headOn")) flash("#ffffff");
    if (e.kind === "busted" && e.rider === c.you) banner("Busted", 3000);
    if (e.kind === "finished" && e.rider === c.you) banner(e.place <= 3 ? `${ordinal(e.place)}: qualified` : ordinal(e.place), 3000);
  }
}

function onMessage(msg: ToClient): void {
  if (msg.t === "hello") {
    me = msg.you;
    qualified = msg.qualified;
    const name = $<HTMLInputElement>("#name");
    if (document.activeElement !== name) name.value = me.name;
    board();
  } else if (msg.t === "pool") pool(msg);
  else if (msg.t === "start") begin(msg);
  else if (msg.t === "snap") onSnap(msg);
  else if (msg.t === "end") {
    if (current && current.id === msg.race) {
      if (current.you !== null) result(msg.standings, msg.qualified);
      else $("#watch").hidden = true;
      current = null;
    }
  }
}

// ---- lobby ----

function show(screen: "lobby" | "race" | "result"): void {
  app.dataset.screen = screen;
}

let queued: Mode | null = null;

function pool(msg: Extract<ToClient, { t: "pool" }>): void {
  const line = $("#pool");
  if (!msg.mode) return;
  queued = msg.mode;
  const who = msg.count === 1 ? "just you" : `${msg.count} riders`;
  if (msg.waitingForMore) line.textContent = `Humans only: ${who}. Waiting for one more rider…`;
  else if (msg.startsIn !== null) line.textContent = `${msg.mode === "ai" ? "With AI" : "Humans only"}: ${who}. Starting in ${Math.ceil(msg.startsIn)}s.`;
  poolTimer = msg.startsIn === null ? null : { mode: msg.mode, count: msg.count, until: performance.now() / 1000 + msg.startsIn };
  queueButtons();
}

let poolTimer: { mode: Mode; count: number; until: number } | null = null;

function tickPool(): void {
  if (!poolTimer || app.dataset.screen !== "lobby") return;
  const left = Math.max(0, poolTimer.until - performance.now() / 1000);
  const who = poolTimer.count === 1 ? "just you" : `${poolTimer.count} riders`;
  $("#pool").textContent = `${poolTimer.mode === "ai" ? "With AI" : "Humans only"}: ${who}. Starting in ${Math.ceil(left)}s.`;
}

function queueButtons(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".queue button")) b.setAttribute("aria-pressed", String(b.dataset.mode === queued));
  $("#leave").hidden = queued === null;
}

function board(): void {
  const body = $("#quals").querySelector("tbody")!;
  const tracks = ["Ridge Road"];
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

for (const b of document.querySelectorAll<HTMLButtonElement>(".queue button")) {
  b.addEventListener("click", () => {
    const level = Number(document.querySelector<HTMLInputElement>('input[name="level"]:checked')?.value ?? 1);
    send({ t: "queue", mode: b.dataset.mode as Mode, level });
  });
}
$("#leave").addEventListener("click", () => {
  send({ t: "leave" });
  queued = null;
  poolTimer = null;
  $("#pool").textContent = "";
  queueButtons();
});
$<HTMLInputElement>("#name").addEventListener("change", (e) => send({ t: "name", name: (e.target as HTMLInputElement).value }));
$("#again").addEventListener("click", () => {
  show("lobby");
  board();
});

// ---- result (H4: four endings, each its own screen) ----

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

function result(standings: Standing[], quals: { level: number; track: string }[]): void {
  qualified = quals;
  queued = null;
  poolTimer = null;
  $("#pool").textContent = "";
  queueButtons();
  const c = current!;
  const mine = standings.find((s, i) => s.human && c.race.riders.find((r) => r.id === c.you)?.name === s.name && i >= 0);
  const outcome = mine?.outcome ?? "unfinished";
  const lines: Record<Standing["outcome"], [string, string]> = {
    qualified: ["Qualified", `${ordinal(mine!.place)} across the line. Ridge Road, level ${c.level}, goes on your board.`],
    placed: ["Placed", `${ordinal(mine?.place ?? 0)}. You finished, but only the top three qualify.`],
    wrecked: ["Wrecked", "The bike gave out before the line."],
    busted: ["Busted", "You came off with a cop beside you. The race is over for you."],
    unfinished: ["Out of time", "The race closed before you reached the line."],
    quit: ["Left the race", ""],
  };
  const [head, line] = lines[outcome];
  $("#ending").textContent = head;
  $("#ending-line").textContent = line;
  $("#result").dataset.outcome = outcome;
  const body = $("#standings").querySelector("tbody")!;
  body.innerHTML = "";
  for (const s of standings) {
    const tr = document.createElement("tr");
    if (s === mine) tr.className = "me";
    const time = s.time === null ? "" : `${Math.floor(s.time / 60)}:${(s.time % 60).toFixed(1).padStart(4, "0")}`;
    const note = s.outcome === "wrecked" ? "wrecked" : s.outcome === "unfinished" ? "—" : s.outcome === "quit" ? "left" : "";
    for (const text of [String(s.place), s.name + (s.human ? "" : " (AI)"), time, note]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  }
  show("result");
  $<HTMLButtonElement>("#again").focus();
}

// ---- input ----

const keys: Input = { ...NO_INPUT };
let seq = 0;
let lastSent = -1;
let lastSentAt = 0;

const KEYMAP: Record<string, keyof Input> = {
  KeyW: "throttle",
  KeyS: "brake",
  KeyA: "left",
  KeyD: "right",
  KeyJ: "hand",
  KeyK: "foot",
  ArrowUp: "throttle",
  ArrowDown: "brake",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function setKey(k: keyof Input, down: boolean): void {
  const c = current;
  if (down && !keys[k] && c && c.you !== null && (k === "hand" || k === "foot")) {
    const r = c.race.riders.find((x) => x.id === c.you);
    if (r) beginAttack(c.race, r, k); // the arm moves now; the server decides the hit
  }
  keys[k] = down;
}

addEventListener("keydown", (e) => {
  const k = KEYMAP[e.code];
  if (!k || app.dataset.screen !== "race") return;
  e.preventDefault();
  setKey(k, true);
});
addEventListener("keyup", (e) => {
  const k = KEYMAP[e.code];
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
let dashCover = 0;

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

const RENDER_DELAY = 0.1; // others are drawn this far in the past

/** Everyone but the predicted rider, placed between the two snapshots around the render time. */
function interpolate(c: Current, now: number): void {
  if (c.snaps.length === 0) return;
  const t = now - RENDER_DELAY;
  let a = c.snaps[0];
  let b = c.snaps[c.snaps.length - 1];
  for (let i = c.snaps.length - 1; i > 0; i--) {
    if (c.snaps[i - 1].at <= t) {
      a = c.snaps[i - 1];
      b = c.snaps[i];
      break;
    }
  }
  const span = b.at - a.at;
  const f = span > 0 ? Math.min(1, Math.max(0, (t - a.at) / span)) : 1;
  // a car the server stopped sending is nowhere near anyone: hide it
  for (const car of c.race.cars) if (!b.cars.some((x) => x[0] === car.id)) car.z = -1e6;
  for (const cb of b.cars) {
    const ca = a.cars.find((x) => x[0] === cb[0]);
    const car = c.race.cars.find((x) => x.id === cb[0]);
    if (!car) continue;
    // a car that wrapped round the road between snapshots jumps, not slides
    const near = ca && Math.abs(cb[1] - ca[1]) < 50;
    car.z = near ? ca[1] + (cb[1] - ca[1]) * f : cb[1];
    car.x = near ? ca[2] + (cb[2] - ca[2]) * f : cb[2];
  }
  for (const r of c.race.riders) {
    if (r.id === c.you) continue;
    const sa = a.riders.find((s) => s[0] === r.id);
    const sb = b.riders.find((s) => s[0] === r.id);
    if (!sa || !sb) continue;
    applyRider(r, sb);
    r.z = sa[1] + (sb[1] - sa[1]) * f;
    r.x = sa[2] + (sb[2] - sa[2]) * f;
    r.lean = sa[4] + (sb[4] - sa[4]) * f;
  }
}

let last = performance.now() / 1000;
let acc = 0;
let hitFlash = 0;

function frame(): void {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  last = now;
  tickPool();
  const c = current;
  if (c) {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      c.steps++;
      if (c.you !== null) {
        const r = c.race.riders.find((x) => x.id === c.you);
        if (r) {
          ride(r, keys, c.race.track);
          // the predicted bike stops at other bikes too, instead of passing
          // through them until the server's correction arrives
          if (r.phase === "riding") for (const o of c.race.riders) if (o !== r && o.phase === "riding") separate(r, o, 1);
          if (r.attack) {
            r.attack.t += DT;
            if (r.attack.t >= TUNE.windup + 0.2) r.attack = null;
          }
          c.history.set(c.steps + Math.round((c.offset ?? 0) / DT), { z: r.z, x: r.x });
          c.history.delete(c.steps + Math.round((c.offset ?? 0) / DT) - 240);
        }
      }
    }
    if (c.you !== null) sendKeys(now);
    interpolate(c, now);
    if (c.you !== null) {
      roadScene.draw(c.race.riders, c.you, dashCover / Math.max(1, dash.height), c.race.cars);
      hud(c);
    } else if (!$("#watch").hidden) {
      // watching: ride along behind whoever is leading
      const lead = c.race.riders.filter((r) => !r.cop).sort((p, q) => q.z - p.z)[0];
      watchScene.draw(c.race.riders, lead.id, 0, c.race.cars);
    }
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

let bannerTimer = 0;
function banner(text: string, ms = 1500): void {
  const el = $("#banner");
  el.textContent = text;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => (el.textContent = ""), ms);
}

// ---- HUD (H1) ----

let lastSaid = "";

function hud(c: Current): void {
  const r = c.race.riders.find((x) => x.id === c.you) as Rider;
  const o = nearest(c.race, r);
  const position = r.place || positionOf(c.race, r.id);
  dashCover = drawDash(dashCtx, dash.width, dash.height, {
    name: r.name,
    mph: r.speed / MPH,
    // no gears (R4): the needle climbs with speed and the build-up (R17)
    rpm: 0.15 + 0.8 * Math.min(1, (r.speed / cap(r)) * (0.8 + 0.2 * r.build)),
    position,
    miles: Math.max(0, r.z) / MILE, // an odometer, never a progress bar (T3)
    damage: r.damage / 100,
    stamina: r.stamina / 100,
    opponent: o ? { name: o.name, stamina: o.stamina / 100, gap: o.z - r.z } : null,
  });
  // the same facts for a screen reader, spoken only when they change
  const said = `Position ${position} of ${c.race.riders.filter((x) => !x.cop).length}`;
  if (said !== lastSaid) {
    $("#position").textContent = said;
    lastSaid = said;
  }
  void topSpeed;
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
      ? { race: c.id, you: c.you, t: c.race.t, mph: r.speed / MPH, x: r.x, z: r.z, lean: r.lean, build: r.build, phase: r.phase, stamina: r.stamina, damage: r.damage }
      : { screen: app.dataset.screen, queued };
  },
  press: (k: keyof Input, down: boolean) => setKey(k, down),
};

connect();
requestAnimationFrame(frame);
