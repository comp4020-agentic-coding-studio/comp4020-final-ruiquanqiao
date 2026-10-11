// Every sound in the game. The engine, the wind and most hits are made here
// with the Web Audio API. Two things are recordings, because a synthesised
// version of each fell short: the race music, one rock track per road by
// Kevin MacLeod (incompetech.com, CC BY 4.0), and the knock of a club on a
// helmet, from Kenney's Impact Sounds (CC0). Both are credited in
// client/public/assets/ASSETS.md.
//
// It shares the main thread with the renderer, so the graph is built once and
// each note is a handful of short-lived nodes that free themselves by stopping.

export type AudioFrame = { speed: number /* m/s */; top: number /* m/s, bike's top */; throttle: boolean; riding: boolean };

/** Each road's track, by its index in ROADS (ledger H5). Normalised to -16
 * LUFS, so the level below holds for all five. */
export const MUSIC = ["ridge", "seawall", "orchard", "goldtown", "canyon"].map((n) => `/assets/music/${n}.mp3`);
const MUSIC_LEVEL = 0.3; // under the engine and the hits
/** Short recorded hits: five takes of each, so a run of blows never repeats one */
const SAMPLES = { wood: 5, tin: 5 } as const;
const sampleUrl = (kind: keyof typeof SAMPLES, i: number): string => `/assets/sfx/${kind === "wood" ? "wood-light" : "tin-medium"}-${i}.wav`;
const NOISE_LEN = 3; // s of shared white noise
// The original's engine buzzes at 75-110 Hz and rises only ~1.3x with speed;
// this one is given a wider sweep so the revs read on small speakers.
const IDLE_HZ = 48;
const TOP_HZ = 118;

type Engine = {
  saw: OscillatorNode;
  sub: OscillatorNode;
  am: OscillatorNode;
  tone: BiquadFilterNode;
  out: GainNode;
  wind: GainNode;
  windTone: BiquadFilterNode;
};

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  duck: GainNode; // music only, dipped under big hits
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
  /** decoded recordings, filled in as they arrive */
  samples: Partial<Record<keyof typeof SAMPLES, AudioBuffer[]>>;
  engine: Engine;
};

let A: Graph | null = null;
let unavailable = false; // no Web Audio here (jsdom, old browsers): final, never asked again
let musicOn = true;
let muted = false;
/** the road whose track should be playing */
let road = 0;
let player: HTMLAudioElement | null = null;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// ---- the graph ----

/** One soft-knee clipping curve, for the engine. */
function driveCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const c = new Float32Array(n);
  const k = 18;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    // slightly asymmetric, as a valve stage is, so it adds even harmonics too
    const y = ((1 + k) * x) / (1 + k * Math.abs(x));
    c[i] = x < 0 ? y * 0.9 : y;
  }
  return c;
}

function build(ctx: AudioContext): Graph {
  const gain = (v: number, to: AudioNode | AudioParam): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(to as AudioNode);
    return g;
  };
  const filter = (type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(to);
    return b;
  };
  const osc = (type: OscillatorType, f: number, to: AudioNode): OscillatorNode => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.connect(to);
    o.start();
    return o;
  };

  // a limiter last, so a pile-up of hits over the chorus never clips
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -10;
  limit.knee.value = 4;
  limit.ratio.value = 20;
  limit.attack.value = 0.002;
  limit.release.value = 0.2;
  limit.connect(ctx.destination);
  const master = gain(muted ? 0 : 0.8, limit);
  const sfx = gain(1, master);
  const duck = gain(1, master);
  const music = gain(musicOn ? MUSIC_LEVEL : 0, duck);

  const curve = driveCurve();

  const noise = ctx.createBuffer(1, Math.round(NOISE_LEN * ctx.sampleRate), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // engine: a sawtooth and a square an octave down, lightly driven, through a
  // lowpass that opens with revs; a sine at half the firing rate pulses the
  // level, which is what makes it a twin rather than a buzzer
  const out = gain(0, sfx);
  const vca = gain(0.7, out);
  const tone = filter("lowpass", 600, 1.4, vca);
  const drive = ctx.createWaveShaper();
  drive.curve = curve;
  drive.connect(tone);
  const pre = gain(0.9, drive);
  const saw = osc("sawtooth", IDLE_HZ, gain(0.6, pre));
  const sub = osc("square", IDLE_HZ / 2, gain(0.35, pre));
  const am = osc("sine", IDLE_HZ / 2, gain(0.3, vca.gain));

  // wind: the noise looped through a band that rises with speed
  const wind = gain(0, sfx);
  const windTone = filter("bandpass", 400, 0.6, wind);
  const air = ctx.createBufferSource();
  air.buffer = noise;
  air.loop = true;
  air.connect(windTone);
  air.start();

  return { ctx, master, duck, music, sfx, noise, samples: {}, engine: { saw, sub, am, tone, out, wind, windTone } };
}

// ---- voices: each is a few nodes that stop themselves ----

/** An envelope on a fresh gain: a fast attack, then an exponential fall. */
function env(g: Graph, at: number, peak: number, dur: number, to: AudioNode): GainNode {
  const v = g.ctx.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  v.connect(to);
  return v;
}

/** One oscillator gliding from f0 to f1 under a percussive envelope. */
function blip(g: Graph, type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number, to: AudioNode = g.sfx): void {
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  o.connect(env(g, at, peak, dur, to));
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** A held tone with a short release: beeps, not plucks. */
function beep(g: Graph, type: OscillatorType, f: number, at: number, dur: number, peak: number): void {
  const o = g.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const v = g.ctx.createGain();
  v.gain.setValueAtTime(peak, at);
  v.gain.setValueAtTime(peak, at + dur - 0.03);
  v.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(v).connect(g.sfx);
  o.start(at);
  o.stop(at + dur + 0.01);
}

/** A slice of the shared noise, straight into a bus that already filters it. */
function burst(g: Graph, at: number, dur: number, peak: number, to: AudioNode): AudioBufferSourceNode {
  const s = g.ctx.createBufferSource();
  s.buffer = g.noise;
  s.connect(env(g, at, peak, dur, to));
  s.start(at, Math.random() * Math.max(0, NOISE_LEN - dur - 0.05));
  s.stop(at + dur + 0.02);
  return s;
}

/** Noise through its own filter, which can sweep: whooshes, scrapes, debris. */
function hiss(g: Graph, type: BiquadFilterType, f0: number, f1: number, q: number, at: number, dur: number, peak: number): void {
  const f = g.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, at + dur);
  f.connect(g.sfx);
  burst(g, at, dur, peak, f);
}

/** Fetch and decode the recorded hits; until they arrive, a hit is synthesised alone. */
function loadSamples(g: Graph): void {
  for (const kind of Object.keys(SAMPLES) as (keyof typeof SAMPLES)[]) {
    const takes: AudioBuffer[] = [];
    g.samples[kind] = takes;
    for (let i = 0; i < SAMPLES[kind]; i++)
      void fetch(sampleUrl(kind, i))
        .then((r) => r.arrayBuffer())
        .then((b) => g.ctx.decodeAudioData(b))
        .then((buf) => void takes.push(buf))
        .catch(() => {});
  }
}

/** One take of a recorded hit, picked at random and pitched a little either way. */
function sample(g: Graph, kind: keyof typeof SAMPLES, at: number, peak: number): void {
  const takes = g.samples[kind];
  if (!takes?.length) return;
  const s = g.ctx.createBufferSource();
  s.buffer = takes[Math.floor(Math.random() * takes.length)];
  s.playbackRate.value = 0.94 + Math.random() * 0.12;
  const v = g.ctx.createGain();
  v.gain.value = peak;
  s.connect(v).connect(g.sfx);
  s.start(at);
}

// ---- the music ----

/** Play the current road's track from the top, looping, into the music bus. */
function playTrack(g: Graph): void {
  if (!musicOn) return;
  if (!player) {
    player = new Audio();
    player.loop = true;
    player.preload = "auto";
    g.ctx.createMediaElementSource(player).connect(g.music);
  }
  const url = MUSIC[road] ?? MUSIC[0];
  if (!player.src.endsWith(url)) {
    player.src = url;
    player.currentTime = 0;
  }
  g.music.gain.cancelScheduledValues(g.ctx.currentTime);
  g.music.gain.setTargetAtTime(MUSIC_LEVEL, g.ctx.currentTime, 0.05);
  void player.play().catch(() => {});
}

// ---- the API ----

export function startAudio(): void {
  if (A) {
    if (A.ctx.state === "suspended") void A.ctx.resume();
    return;
  }
  if (unavailable) return;
  if (typeof globalThis.AudioContext !== "function") {
    unavailable = true;
    return;
  }
  try {
    A = build(new AudioContext({ latencyHint: "interactive" }));
  } catch {
    unavailable = true;
    return;
  }
  loadSamples(A);
  if (musicOn) playTrack(A);
}

/** What is playing, for the debugging handle: the track, whether it runs, and how many takes of each hit are decoded. */
export function soundState(): { track: string; playing: boolean; at: number; samples: Record<string, number> } {
  return {
    track: player?.src ?? "",
    playing: !!player && !player.paused,
    at: player?.currentTime ?? 0,
    samples: Object.fromEntries(Object.entries(A?.samples ?? {}).map(([k, v]) => [k, v?.length ?? 0])),
  };
}

/** Change to road `n`'s track (an index in ROADS); it starts from the top. */
export function setRoad(n: number): void {
  road = n;
  if (player) player.currentTime = 0;
  if (A) playTrack(A);
}

export function setMusic(on: boolean): void {
  musicOn = on;
  const g = A;
  if (!g) return;
  if (on) playTrack(g);
  else {
    // a quick fade, then the track stops where it is
    g.music.gain.cancelScheduledValues(g.ctx.currentTime);
    g.music.gain.setTargetAtTime(0, g.ctx.currentTime, 0.08);
    const p = player;
    setTimeout(() => !musicOn && p?.pause(), 400);
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  if (A) A.master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.03);
}

export function updateAudio(f: AudioFrame): void {
  const g = A;
  if (!g) return;
  const t = g.ctx.currentTime;
  const e = g.engine;
  const r = Math.max(0, Math.min(1, f.speed / Math.max(1, f.top)));
  // gearless: the revs leap as it pulls away, then creep up with speed; off
  // the throttle they sag a little, and with nobody aboard it only ticks over
  const revs = f.riding ? r ** 0.6 * (f.throttle ? 1 : 0.88) : 0;
  const f0 = IDLE_HZ + (TOP_HZ - IDLE_HZ) * revs;
  const lag = f.throttle ? 0.06 : 0.2;
  e.saw.frequency.setTargetAtTime(f0, t, lag);
  e.sub.frequency.setTargetAtTime(f0 / 2, t, lag);
  e.am.frequency.setTargetAtTime(f0 / 2, t, lag);
  e.tone.frequency.setTargetAtTime(300 + 2600 * revs + (f.throttle ? 700 : 0), t, 0.08);
  e.out.gain.setTargetAtTime(f.riding ? 0.16 + 0.14 * revs + (f.throttle ? 0.12 : 0) : 0.04, t, 0.08);
  // wind goes with how fast you are going, not how hard the bike is working
  const w = Math.min(1, f.speed / 75);
  e.wind.gain.setTargetAtTime(0.22 * w * w, t, 0.15);
  e.windTone.frequency.setTargetAtTime(350 + 2400 * w, t, 0.15);
}

export type Sfx = "punch" | "kick" | "club" | "chain" | "hitTaken" | "crash" | "carCrash" | "snatch" | "busted" | "countdown" | "go" | "finish" | "bump" | "carBump" | "scrape" | "runOver" | "rideOver";

/** Play a sound effect; `gain` (0-1) for the touches, which come in sizes. */
export function sfx(kind: Sfx, gain = 1): void {
  const g = A;
  if (!g) return;
  const t = g.ctx.currentTime + 0.005;
  const v = Math.max(0, Math.min(1, gain));
  // hits in the original are dull thumps: ~50 ms long, nearly all below 250 Hz
  switch (kind) {
    case "punch":
      blip(g, "sine", 140, 55, t, 0.14, 0.9);
      hiss(g, "lowpass", 1500, 1500, 0.7, t, 0.05, 0.5);
      break;
    case "kick":
      blip(g, "sine", 110, 40, t, 0.22, 1);
      blip(g, "triangle", 70, 45, t, 0.2, 0.4);
      hiss(g, "lowpass", 800, 300, 0.7, t, 0.09, 0.5);
      break;
    case "club": // a club on a helmet: a hard wooden crack, the shell ringing hollow under it
      sample(g, "wood", t, 1.1);
      sample(g, "tin", t, 0.45);
      blip(g, "sine", 160, 70, t, 0.1, 0.5);
      break;
    case "chain": // a thud and three rattles of inharmonic links
      blip(g, "sine", 120, 50, t, 0.1, 0.6);
      for (const d of [0, 0.03, 0.065]) {
        for (const p of [2310, 3170, 4430, 5890]) blip(g, "square", p * (1 + Math.random() * 0.03), p, t + d, 0.12, 0.05);
        hiss(g, "highpass", 6000, 6000, 0.7, t + d, 0.08, 0.25);
      }
      break;
    case "hitTaken": // lower and longer than a hit given, with a grunt of saw
      blip(g, "sine", 100, 42, t, 0.2, 1);
      blip(g, "sawtooth", 220, 90, t, 0.18, 0.1);
      hiss(g, "lowpass", 600, 600, 0.7, t, 0.12, 0.5);
      break;
    case "crash": // the thud, a bounce, and the bike scraping off down the road
      duck(g, 0.5);
      blip(g, "sine", 90, 35, t, 0.5, 1);
      hiss(g, "lowpass", 3500, 250, 0.7, t, 1.2, 0.8);
      hiss(g, "bandpass", 2500, 1200, 3, t + 0.1, 0.9, 0.35);
      blip(g, "sine", 80, 40, t + 0.25, 0.3, 0.7);
      break;
    case "carCrash": // heavier, with metal and glass
      duck(g, 0.45);
      blip(g, "sine", 70, 30, t, 0.6, 1);
      hiss(g, "lowpass", 5000, 300, 0.7, t, 1.4, 0.9);
      hiss(g, "highpass", 4000, 4000, 0.7, t, 0.5, 0.4);
      for (const p of [347, 529, 811]) blip(g, "triangle", p, p * 0.98, t, 0.7, 0.12);
      for (let i = 0; i < 6; i++) blip(g, "sine", 3000 + Math.random() * 4000, 2500, t + Math.random() * 0.4, 0.08 + Math.random() * 0.12, 0.08);
      break;
    case "bump": // fairing on fairing: a hollow knock and a short grind
      blip(g, "sine", 190, 85, t, 0.11, 0.75 * v);
      blip(g, "triangle", 640, 560, t, 0.07, 0.22 * v);
      hiss(g, "bandpass", 2400, 1500, 2.5, t, 0.16, 0.4 * v);
      break;
    case "carBump": // a bike glancing off a car's flank: a deeper thump and sheet metal
      blip(g, "sine", 120, 60, t, 0.16, 0.9 * v);
      for (const p of [431, 673, 1009]) blip(g, "triangle", p, p * 0.97, t, 0.22, 0.09 * v);
      hiss(g, "bandpass", 1800, 900, 2, t, 0.3, 0.45 * v);
      break;
    case "runOver": // a body under the front wheel: a heavy thud, a grunt, the bike landing
      blip(g, "sine", 95, 40, t, 0.25, 1 * v);
      blip(g, "sawtooth", 200, 80, t + 0.02, 0.16, 0.12 * v);
      hiss(g, "lowpass", 900, 300, 0.7, t, 0.15, 0.6 * v);
      blip(g, "sine", 120, 50, t + 0.17, 0.14, 0.7 * v);
      break;
    case "rideOver": // over a fallen bike: the wheels bang up and down on metal
      blip(g, "sine", 110, 50, t, 0.12, 0.8 * v);
      for (const p of [523, 811, 1187]) blip(g, "triangle", p, p * 0.95, t, 0.18, 0.08 * v);
      hiss(g, "bandpass", 2600, 1200, 2, t, 0.12, 0.5 * v);
      blip(g, "sine", 130, 55, t + 0.22, 0.12, 0.8 * v);
      break;
    case "scrape": // along a wall or rail: the grind the recording holds for about a second
      blip(g, "sine", 150, 70, t, 0.08, 0.5 * v);
      hiss(g, "bandpass", 3200, 1600, 3, t, 0.5, 0.45 * v);
      hiss(g, "highpass", 5000, 5000, 0.7, t, 0.35, 0.15 * v);
      break;
    case "snatch": // a whoosh up and a blip: something changed hands
      hiss(g, "bandpass", 500, 3500, 4, t, 0.22, 0.6);
      blip(g, "square", 600, 1200, t + 0.08, 0.12, 0.08);
      break;
    case "busted": // two-tone siren
      duck(g, 0.6);
      for (let i = 0; i < 4; i++) beep(g, "square", i % 2 ? 720 : 960, t + i * 0.22, 0.22, 0.07);
      break;
    case "countdown":
      beep(g, "square", 880, t, 0.18, 0.12);
      break;
    case "go":
      beep(g, "square", 1760, t, 0.45, 0.1);
      beep(g, "triangle", 880, t, 0.45, 0.15);
      break;
    case "finish": // a major arpeggio up from D
      [74, 78, 81, 86].forEach((m, i) => {
        const at = t + i * 0.11;
        const len = i === 3 ? 0.55 : 0.12;
        beep(g, "square", hz(m), at, len, 0.07);
        beep(g, "triangle", hz(m), at, len, 0.12);
      });
      break;
  }
  if (kind === "punch" || kind === "kick" || kind === "club" || kind === "chain" || kind === "hitTaken") {
    // the impact itself: a slap of bright noise over in 20 ms and a sub-bass
    // thump under it, felt in the chest on speakers as a pad's rumble would be
    // felt in the hands. The thump alone, as first written, read as a muffled
    // bump; the music now dips harder under it as well
    hiss(g, "highpass", 2500, 2500, 0.7, t, 0.02, 0.9);
    hiss(g, "bandpass", 900, 500, 1.5, t, 0.04, 0.6);
    blip(g, "sine", 62, 38, t, 0.16, 1);
    duck(g, 0.5);
  }
}

/** Dip the music under a big sound and let it back up over 0.4 s. */
function duck(g: Graph, to: number): void {
  const t = g.ctx.currentTime;
  g.duck.gain.cancelScheduledValues(t);
  g.duck.gain.setTargetAtTime(to, t, 0.01);
  g.duck.gain.setTargetAtTime(1, t + 0.08, 0.15);
}
