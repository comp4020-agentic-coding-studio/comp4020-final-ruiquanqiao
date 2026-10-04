// Every sound in the game, made here with the Web Audio API: no files to fetch
// and nothing borrowed. The music is an original drop-D loop written for this
// game. A recorded race of the original was measured only for what any rock
// track of its kind shares: 105 BPM in four, cymbals on eighths, a loop of
// more than a minute in several equally loud sections, distorted guitar, bass
// and a kit, a bright mix. None of its notes, chords or audio are used.
//
// It shares the main thread with the renderer, so the graph is built once and
// each note is a handful of short-lived nodes that free themselves by stopping.

export type AudioFrame = { speed: number /* m/s */; top: number /* m/s, bike's top */; throttle: boolean; riding: boolean };

const BPM = 105;
const STEP = 60 / BPM / 4; // one sixteenth, s
const LOOKAHEAD = 0.25; // s of music queued ahead of the clock
const WAKE = 50; // ms between scheduler wake-ups; the timing itself is the context's clock
const MUSIC_LEVEL = 0.42; // under the engine and the hits
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
  guitar: GainNode; // into the one distortion
  bass: GainNode;
  drums: GainNode;
  hat: GainNode;
  snare: GainNode;
  cymbal: GainNode;
  lead: GainNode;
  noise: AudioBuffer;
  engine: Engine;
};

let A: Graph | null = null;
let unavailable = false; // no Web Audio here (jsdom, old browsers): final, never asked again
let musicOn = true;
let muted = false;
let timer: ReturnType<typeof setInterval> | null = null;
let next = 0; // context time of the next sixteenth
let pos = 0; // sixteenths since the song began

// ---- the song ----

// A riff bar is 16 sixteenths. A number is a power chord that many semitones
// above low D (drop D), "m" palm-mutes it, "~" holds the last chord, "-" rests.
const RIFF = {
  a: "0m 0m 0m 3 ~ 0m 0m 5 ~ 0m 0m 3 ~ 1 ~ 0m",
  b: "0m 0m 0m 3 ~ 0m 0m 7 ~ 6 ~ 5 ~ 3 ~ -",
  c: "0m 0m 0m 3 ~ 0m 0m 5 ~ 7 ~ 8 ~ 7 ~ 5",
  ch1: "0 ~ ~ 0m 0m ~ 0 ~ 8 ~ ~ 8m 8m ~ 8 ~",
  ch2: "3 ~ ~ 3m 3m ~ 3 ~ 10 ~ ~ 10m 10m ~ 10 ~",
  ch3: "0 ~ ~ 0m 0m ~ 0 ~ 5 ~ ~ 5m 7 ~ ~ ~",
  br1: "0m - - 0m - - 0m - 0m - - - 12 ~ ~ ~",
  br2: "0m - - 0m - - 0m - 0m - - - 13 ~ 12 ~",
  sus1: "0 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~",
  sus2: "8 ~ ~ ~ ~ ~ ~ ~ 10 ~ ~ ~ ~ ~ ~ ~",
};

// A kit bar: one 16-character line per voice, a digit is a hit's velocity.
type Kit = { k?: string; s?: string; h?: string; o?: string; c?: string; t?: string };

const KIT: Record<string, Kit> = {
  count: { h: "7---5---5---5---" },
  introFill: { k: "9-------", t: "--------9-8-7-66" },
  verse: { k: "9-----7-8-------", s: "----8-------8---", h: "6-4-6-4-6-4-6-4-" },
  verseFill: { k: "9-----7-8-------", s: "----8-------6789", h: "6-4-6-4-6-4-----" },
  chorus: { k: "9-7---7-9-7---7-", s: "----9-------9---", h: "7---7---7---7---", o: "--6---6---6---6-" },
  chorusCrash: { k: "9-7---7-9-7---7-", s: "----9-------9---", h: "----7---7---7---", o: "--6---6---6---6-", c: "9---------------" },
  chorusFill: { k: "9-7---7-9-------", s: "----9-------9999", h: "7---7---7-------", o: "--6---6---------" },
  half: { k: "9-------9-7-----", s: "--------9-------", h: "6---6---6---6---" },
  roll1: { k: "8---8---8---8---", s: "3-3-4-4-5-5-6-6-" },
  roll2: { k: "8---8---8---8---", s: "6666777788889999" },
};

// The chorus-two lead: [sixteenth from the section's start, MIDI note, length]
const LEAD: [number, number, number][] = [
  [0, 69, 6], [6, 67, 2], [8, 65, 8],
  [16, 67, 6], [22, 69, 2], [24, 72, 8],
  [32, 74, 6], [38, 72, 2], [40, 65, 8],
  [48, 69, 8], [56, 67, 4], [60, 69, 4],
  [64, 69, 6], [70, 67, 2], [72, 65, 8],
  [80, 67, 6], [86, 69, 2], [88, 72, 4], [92, 74, 4],
  [96, 77, 8], [104, 74, 4], [108, 72, 4],
  [112, 74, 8], [120, 69, 8],
];

type Section = { bars: number; riffs: string[]; kits: string[]; shift?: number[]; crash?: boolean; lead?: boolean };

const SECTIONS: Section[] = [
  { bars: 2, riffs: ["a", "b"], kits: ["count", "introFill"] }, // played once
  { bars: 8, riffs: ["a", "b", "a", "c"], kits: ["verse", "verse", "verse", "verse", "verse", "verse", "verse", "verseFill"], crash: true },
  { bars: 8, riffs: ["ch1", "ch2", "ch1", "ch3"], kits: ["chorusCrash", "chorus", "chorus", "chorus", "chorusCrash", "chorus", "chorus", "chorusFill"] },
  { bars: 4, riffs: ["br1", "br1", "br1", "br2"], kits: ["half"], crash: true },
  { bars: 2, riffs: ["sus1", "sus2"], kits: ["roll1", "roll2"] },
  { bars: 4, riffs: ["a", "b", "a", "c"], kits: ["verse", "verse", "verse", "verseFill"], shift: [5, 5, 0, 0], crash: true },
  { bars: 8, riffs: ["ch1", "ch2", "ch1", "ch3"], kits: ["chorusCrash", "chorus", "chorus", "chorus", "chorusCrash", "chorus", "chorus", "chorusFill"], lead: true },
];

type Note = { at: number; semis: number; len: number; muted: boolean };
type Bar = { notes: Note[]; kit: Kit; crash: boolean; lead: [number, number, number][] };

function parseRiff(s: string, shift: number): Note[] {
  const out: Note[] = [];
  s.split(" ").forEach((tok, i) => {
    const last = out.at(-1);
    if (tok === "~") {
      if (last && last.at + last.len === i) last.len++;
    } else if (tok !== "-") out.push({ at: i, semis: parseInt(tok, 10) + shift, len: 1, muted: tok.endsWith("m") });
  });
  return out;
}

/** The whole song as bars, compiled once; after the intro it loops forever. */
const SONG: Bar[] = SECTIONS.flatMap((sec) =>
  Array.from({ length: sec.bars }, (_, i): Bar => {
    const riff = RIFF[sec.riffs[i % sec.riffs.length] as keyof typeof RIFF];
    return {
      notes: parseRiff(riff, sec.shift?.[i % sec.shift.length] ?? 0),
      kit: KIT[sec.kits[i % sec.kits.length]],
      crash: i === 0 && sec.crash === true,
      lead: sec.lead ? LEAD.filter(([at]) => Math.floor(at / 16) === i).map(([at, m, l]) => [at % 16, m, l]) : [],
    };
  }),
);
const LOOP_FROM = SECTIONS[0].bars;

function barAt(n: number): Bar {
  return n < SONG.length ? SONG[n] : SONG[LOOP_FROM + ((n - LOOP_FROM) % (SONG.length - LOOP_FROM))];
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const LOW_D = 38; // D2, the drop-D bottom string

// ---- the graph ----

/** One soft-knee clipping curve, shared by the guitar amp and the engine. */
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

  // guitar: every note sums into one drive, one shaper and a cabinet (cut the
  // fizz above 4 kHz and the mud below 90 Hz, scoop the low mids)
  const cab = filter("lowpass", 4200, 0.8, gain(0.55, music));
  const scoop = ctx.createBiquadFilter();
  scoop.type = "peaking";
  scoop.frequency.value = 550;
  scoop.Q.value = 0.9;
  scoop.gain.value = -5;
  scoop.connect(cab);
  const amp = ctx.createWaveShaper();
  amp.curve = curve;
  amp.oversample = "2x";
  amp.connect(filter("highpass", 90, 0.7, scoop));
  const guitar = gain(5, amp);

  const bass = gain(1, filter("lowpass", 700, 0.9, gain(0.6, music)));
  const drums = gain(0.9, music);
  const hat = gain(1, filter("highpass", 7000, 0.7, drums));
  const snare = gain(1, filter("highpass", 1400, 0.7, drums));
  const cymbal = gain(1, filter("highpass", 4500, 0.5, drums));

  // lead: a dry path and a dotted-eighth echo
  const leadOut = filter("lowpass", 2800, 0.7, gain(0.5, music));
  const echo = ctx.createDelay(1);
  echo.delayTime.value = STEP * 3;
  echo.connect(gain(0.35, echo));
  echo.connect(gain(0.4, leadOut));
  const lead = gain(1, leadOut);
  lead.connect(echo);

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

  return { ctx, master, duck, music, sfx, guitar, bass, drums, hat, snare, cymbal, lead, noise, engine: { saw, sub, am, tone, out, wind, windTone } };
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

function powerChord(g: Graph, n: Note, at: number): void {
  const root = hz(LOW_D + n.semis);
  const dur = n.muted ? Math.min(0.13, n.len * STEP) : n.len * STEP;
  const v = g.ctx.createGain();
  const peak = n.muted ? 0.16 : 0.22;
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  if (n.muted) v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  else {
    v.gain.exponentialRampToValueAtTime(peak * 0.6, at + dur * 0.8);
    v.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.06);
  }
  // a palm on the strings takes the top off before the amp does
  const damp = g.ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = n.muted ? 750 : 3200;
  damp.connect(v).connect(g.guitar);
  for (const [ratio, type, detune] of [[1, "sawtooth", -6], [1.4983, "square", 4], [2, "sawtooth", 7]] as const) {
    const o = g.ctx.createOscillator();
    o.type = type;
    o.frequency.value = root * ratio;
    o.detune.value = detune;
    o.connect(damp);
    o.start(at);
    o.stop(at + dur + 0.08);
  }
}

function bassNote(g: Graph, n: Note, at: number): void {
  const dur = n.muted ? 0.16 : n.len * STEP;
  const o = g.ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = hz(LOW_D - 12 + n.semis);
  const v = g.ctx.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(0.5, at + 0.006);
  v.gain.exponentialRampToValueAtTime(0.3, at + dur * 0.7);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.04);
  o.connect(v).connect(g.bass);
  o.start(at);
  o.stop(at + dur + 0.06);
}

function leadNote(g: Graph, midi: number, len: number, at: number): void {
  const dur = len * STEP;
  const v = g.ctx.createGain();
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
  v.gain.setValueAtTime(0.12, at + dur - 0.05);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.08);
  v.connect(g.lead);
  for (const [type, detune] of [["sawtooth", 0], ["square", 7]] as const) {
    const o = g.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi);
    // every note bends up into pitch from a little flat
    o.detune.setValueAtTime(detune - 35, at);
    o.detune.linearRampToValueAtTime(detune, at + 0.07);
    o.connect(v);
    o.start(at);
    o.stop(at + dur + 0.1);
  }
}

function kick(g: Graph, at: number, vel: number): void {
  const o = g.ctx.createOscillator();
  o.frequency.setValueAtTime(150, at);
  o.frequency.exponentialRampToValueAtTime(44, at + 0.07);
  o.connect(env(g, at, vel, 0.32, g.drums));
  o.start(at);
  o.stop(at + 0.34);
}

function snareHit(g: Graph, at: number, vel: number): void {
  burst(g, at, 0.17, 0.55 * vel, g.snare);
  blip(g, "triangle", 195, 165, at, 0.08, 0.45 * vel, g.drums);
}

// ---- the scheduler ----

/** Queue one sixteenth of the song at context time t. */
function playStep(g: Graph, p: number, t: number): void {
  const bar = barAt(Math.floor(p / 16));
  const s = p % 16;
  for (const n of bar.notes) {
    if (n.at !== s) continue;
    powerChord(g, n, t);
    bassNote(g, n, t);
  }
  for (const [at, midi, len] of bar.lead) if (at === s) leadNote(g, midi, len, t);
  const hit = (line: string | undefined): number => {
    const c = line?.[s];
    // a little looseness in time and force, so the kit is played, not printed
    return c && c !== "-" ? (Number(c) / 9) * (0.92 + Math.random() * 0.16) : 0;
  };
  const human = t + (Math.random() - 0.5) * 0.006;
  const k = bar.kit;
  let v: number;
  if ((v = hit(k.k))) kick(g, t, v);
  if ((v = hit(k.s))) snareHit(g, human, v);
  if ((v = hit(k.h))) burst(g, human, 0.035, 0.28 * v, g.hat);
  if ((v = hit(k.o))) burst(g, human, 0.22, 0.22 * v, g.hat);
  if ((v = hit(k.t))) blip(g, "sine", 210 - s * 8, (210 - s * 8) * 0.7, human, 0.25, 0.8 * v, g.drums);
  if ((v = hit(k.c)) || (s === 0 && bar.crash && (v = 1))) burst(g, t, 1.6, 0.35 * v, g.cymbal);
}

function tick(): void {
  const g = A;
  if (!g || !musicOn) return;
  const now = g.ctx.currentTime;
  // woken late (a hidden tab wakes once a second): skip what was missed rather
  // than play it all at once, keeping the place in the song
  if (next < now - 0.05) {
    const missed = Math.ceil((now - next) / STEP);
    next += missed * STEP;
    pos += missed;
  }
  while (next < now + LOOKAHEAD) {
    playStep(g, pos, next);
    pos++;
    next += STEP;
  }
}

function beginMusic(g: Graph): void {
  g.music.gain.cancelScheduledValues(g.ctx.currentTime);
  g.music.gain.setTargetAtTime(MUSIC_LEVEL, g.ctx.currentTime, 0.05);
  if (timer !== null) return; // already playing: re-queuing would double what is queued
  pos = Math.ceil(pos / 16) * 16; // come back in on a downbeat
  next = g.ctx.currentTime + 0.1;
  timer = setInterval(tick, WAKE);
  tick();
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
  if (musicOn) beginMusic(A);
}

export function setMusic(on: boolean): void {
  musicOn = on;
  const g = A;
  if (!g) return;
  if (on) beginMusic(g);
  else {
    if (timer !== null) clearInterval(timer);
    timer = null;
    // what is already queued plays out under a quick fade
    g.music.gain.cancelScheduledValues(g.ctx.currentTime);
    g.music.gain.setTargetAtTime(0, g.ctx.currentTime, 0.08);
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

export type Sfx = "punch" | "kick" | "club" | "chain" | "hitTaken" | "crash" | "carCrash" | "snatch" | "busted" | "countdown" | "go" | "finish" | "bump" | "carBump" | "scrape";

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
    case "club": // a thud with a wooden knock in it
      blip(g, "sine", 160, 70, t, 0.12, 0.8);
      blip(g, "triangle", 420, 380, t, 0.09, 0.35);
      hiss(g, "bandpass", 1200, 1200, 2, t, 0.05, 0.6);
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
  if (kind === "punch" || kind === "kick" || kind === "club" || kind === "chain" || kind === "hitTaken") duck(g, 0.8);
}

/** Dip the music under a big sound and let it back up over 0.4 s. */
function duck(g: Graph, to: number): void {
  const t = g.ctx.currentTime;
  g.duck.gain.cancelScheduledValues(t);
  g.duck.gain.setTargetAtTime(to, t, 0.01);
  g.duck.gain.setTargetAtTime(1, t + 0.08, 0.15);
}

/** The music's shape, for spec/audio.test.ts: tempo, how long the loop runs
 * before it repeats, and how many sections it is built from. */
export const SONG_SHAPE = { bpm: BPM, loopSeconds: (SONG.length - LOOP_FROM) * 16 * STEP, sections: SECTIONS.length };
