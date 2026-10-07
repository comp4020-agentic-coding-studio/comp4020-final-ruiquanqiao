// The browser: lobby, race and result screens over one WebSocket. The server
// owns every race; this end predicts its own rider with the same ride() the
// server runs, so the bike answers the keys at once, and draws everyone else
// a tenth of a second in the past, between two snapshots.

import { type CarState, type Entry, type Mode, type RiderState, type Standing, type ToClient, type ToServer, applyRider } from "../game/protocol.ts";
import { drawDash } from "./dash.ts";
import { setMusic, sfx, startAudio, updateAudio } from "./audio.ts";
import { react } from "./feel.ts";
import { RaceScene } from "./scene.ts";
import { BIKE, DT, type Input, KMH, MPH, NO_INPUT, TUNE, type Race, type Rider, beginAttack, cap, nearest, onFoot, separate, packInput, positionOf, ride, startRace, topSpeed, windingAt, windupOf } from "../game/sim.ts";
import { Prediction, Timeline } from "./netview.ts";
import { ROADS, makeTrack } from "../game/track.ts";

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

type Current = {
  id: number;
  level: number;
  race: Race;
  you: number | null; // local rider id, or null when watching
  timeline: Timeline; // everyone the server owns
  prediction: Prediction; // one's own rider
  steps: number;
  ended: boolean;
};

let current: Current | null = null;
/** when this tab last felt its own predicted bike touch another */
let localBump = -9;
/** riders on foot this tab has felt its own bike ride over, and when */
const ranOver = new Map<number, number>();
/** the race events this tab has been sent lately, for the debugging handle */
const heard: unknown[] = [];

function begin(msg: Extract<ToClient, { t: "start" }>): void {
  const track = makeTrack(msg.level, msg.track ?? 0);
  const race = startRace(track, msg.level, msg.entrants.map((e: Entry) => ({ ...e })), msg.seed);
  current = { id: msg.race, level: msg.level, race, you: msg.you, timeline: new Timeline(), prediction: new Prediction(), steps: 0, ended: false };
  if (msg.you !== null) {
    show("race");
    roadScene.setTrack(track);
    resize();
    banner(`${track.name} · level ${msg.level} · ${(track.length / 1000).toFixed(1)} km`, 2500);
    startAudio();
    sfx("go");
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
  c.timeline.push(now, { time: msg.time, riders: msg.riders, cars: msg.cars });
  // every touch is seen and heard (K13): tilts, a knocked car, a rider launched
  for (const e of msg.events) {
    heard.push(e);
    if (heard.length > 300) heard.shift();
    // a rub of one's own was already felt as it was predicted
    if (e.kind === "bump" && e.with === "rider" && (e.rider === c.you || e.other === c.you) && now - localBump < 0.5) continue;
    if (e.kind === "runOver" && e.by === c.you && ranOver.has(e.what === "bike" ? -1 - e.on : e.on)) continue;
    const felt = react(e, c.race.riders, c.you);
    (c.you === null ? watchScene : roadScene).feel(felt);
    if (felt.sound && c.you !== null) sfx(felt.sound.kind, felt.sound.gain);
  }

  if (c.you === null) return;
  const mine = msg.riders.find((s) => s[0] === c.you);
  const r = c.race.riders.find((x) => x.id === c.you);
  if (!mine || !r) return;
  const before = r.phase;
  const eased = mine[8] === "riding" && before === "riding" && c.prediction.heard(c.steps, msg.time, mine[1], mine[2]);
  if (!eased) {
    // off the bike, back on it, or no prediction to compare: the server's word,
    // except a swing begun here that the server has not heard of yet - taking
    // its word for that wiped the player's own punch within 80 ms
    const swing = r.attack;
    applyRider(r, mine);
    c.prediction.reset();
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
    if (e.kind === "hit" && e.on === c.you) flash();
    if (e.kind === "crash" && e.rider === c.you) banner(e.cause === "knockdown" ? "Knocked off" : "Down!", 1200);
    if (e.kind === "wrecked" && e.rider === c.you) banner("Wrecked", 3000);
    // hitting a car flashes the screen white (K3)
    if (e.kind === "crash" && e.rider === c.you && (e.cause === "rearEnd" || e.cause === "headOn")) flash("#ffffff");
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
    if (e.on === c.you) sfx("hitTaken");
    else sfx(e.move === "kick" ? "kick" : by?.weapon ?? "punch");
  }
  if (e.kind === "crash" && (e.rider === c.you || near(e.rider))) sfx(e.cause === "rearEnd" || e.cause === "headOn" ? "carCrash" : "crash");
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

// how many AI riders to race (N2), remembered by this browser
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
    // the click is the gesture a browser wants before it will play sound
    startAudio();
    send({ t: "queue", mode: b.dataset.mode as Mode, level, track, ai: Number(aiCount.value) });
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
    qualified: ["Qualified", `${ordinal(mine!.place)} across the line. ${c.race.track.name}, level ${c.level}, goes on your board.`],
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
  KeyL: "nitro",
  Space: "nitro",
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

let musicOn = true;

addEventListener("keydown", (e) => {
  if (e.code === "KeyM" && document.activeElement?.tagName !== "INPUT") {
    musicOn = !musicOn;
    setMusic(musicOn);
    banner(musicOn ? "Music on" : "Music off", 900);
    return;
  }
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
  for (const [id, at] of ranOver) if (now - at > 1) ranOver.delete(id);
  for (const o of c.race.riders) {
    if (o === r || o.phase !== "riding") continue;
    const closing = r.speed - o.speed;
    const touch = separate(r, o, 1);
    if (!touch || now - localBump < 0.25) continue;
    localBump = now;
    const hard = touch === "rear" && o.z > r.z ? closing / TUNE.shuntKnock : Math.abs(r.vx) / TUNE.rubKnock;
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
          const fix = c.prediction.ease();
          r.z += fix.z;
          r.x += fix.x;
          if (r.boost > TUNE.nitroTime - DT * 1.5) flash("#fff0b0");
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
    if (c.you !== null) sendKeys(now);
    interpolate(c, now);
    // and again once the others have moved this frame: the screen refreshes
    // faster than the race steps, and between steps a bike moved up to where
    // it is now was drawn into the player's, up to half a bike deep
    // (.cache/ramlive.ts, 9 frames in 30 s of riding at the field)
    const own = c.you === null ? null : c.race.riders.find((x) => x.id === c.you);
    if (own) keepOff(c, own, now);
    if (c.you !== null) {
      roadScene.draw(c.race.riders, c.you, dashCover / Math.max(1, dash.height), c.race.cars);
      hud(c);
      const r = c.race.riders.find((x) => x.id === c.you);
      if (r) updateAudio({ speed: r.speed, top: topSpeed(r), throttle: keys.throttle || r.boost > 0, riding: r.phase === "riding" });
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
    kmh: r.speed / KMH,
    // no gears (R4): the needle climbs with speed and the build-up (R17)
    rpm: 0.15 + 0.8 * Math.min(1, (r.speed / cap(r)) * (0.8 + 0.2 * r.build)),
    position,
    km: Math.max(0, r.z) / 1000, // an odometer, never a progress bar (T3); km, as the dial is
    nitro: r.nitro,
    nitroMax: TUNE.nitroCharges,
    boosting: r.boost > 0,
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
      ? { race: c.id, you: c.you, t: c.race.t, kmh: r.speed / KMH, mph: r.speed / MPH, nitro: r.nitro, boost: r.boost, x: r.x, z: r.z, lean: r.lean, build: r.build, phase: r.phase, stamina: r.stamina, damage: r.damage, weapon: r.weapon, threat: windingAt(c.race, r)?.id ?? null }
      : { screen: app.dataset.screen, queued };
  },
  press: (k: keyof Input, down: boolean) => setKey(k, down),
  scene: () => roadScene,
  heard: () => heard,
  /** everyone as drawn this frame, unrounded */
  drawn: () => current?.race.riders.map((r) => ({ id: r.id, z: r.z, x: r.x, phase: r.phase, cop: r.cop })),
  riders: () => current?.race.riders.map((r) => ({ id: r.id, cop: r.cop, z: Math.round(r.z), x: r.x.toFixed(1), phase: r.phase, weapon: r.weapon, attack: r.attack && `${r.attack.kind}${r.attack.t.toFixed(2)}${r.attack.landed ? "L" : ""}` })),
};

connect();
requestAnimationFrame(frame);
