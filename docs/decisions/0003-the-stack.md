# 3. One Node process, WebSockets, SQLite on the volume, three.js in the browser

Accepted at crit 8, and revisited at each crit since.

## Context

The race is fifteen bikes stepped sixty times a second, and the people in it
send keys up to sixty times a second. The course gives one shared CPU with
256 MB, one volume at `/data`, and a machine that stops when nobody is using
it and starts again on the next request. The README promises that one's own
bike answers the keys (decision 1), that everyone in a room sees the same
race, and that a qualification is still there tomorrow.

The server and the browser both have to run the same simulation: the server
for real, the browser to predict its own rider. So both halves have to run
the same code.

## Options

**Server runtime.**

1. *Node, with no framework.* The same TypeScript runs in both halves.
   Node 24 strips the types itself, so only the browser bundle is built. The
   only routes are `/`, `/live`, `/leaderboard`, `/readme/` and one
   WebSocket, so a framework would add a dependency and nothing it does.
2. *A framework (Next.js, SvelteKit, Astro).* Pages, routing and builds that
   this app does not need, and a server process shaped for requests, not for a
   race loop that has to tick on time.
3. *Another language for the server (Go, Rust).* A faster tick, but the
   simulation would exist twice, and the two copies would have to agree to the
   bit for prediction to work.

**Getting changes to every browser.**

1. *WebSockets.* Both directions on one connection, which keys at sixty a
   second need.
2. *Server-sent events* carry the snapshots well but not the keys: those would
   each be a separate HTTP request.
3. *Polling* fast enough for a race (20 times a second, per person) is
   WebSockets with extra headers.

**What persists.**

1. *SQLite through `node:sqlite`, on the volume.* One file that survives a
   restart and a redeploy, nothing native to compile in the image, and no
   second machine to pay for or wake.
2. *Postgres on Fly.* Another machine, which also has to start before the
   first request after idle, for a few tables.
3. *JSON files.* No transactions, and a crash in the middle of a write loses
   the file.

**Drawing the race.**

1. *A scanline "pseudo-3D" road into a pixel array*, as the original's
   predecessors did. Built first (8c908b9): it could be rendered and measured
   in Node, but it could only fake the original's cliffs and street canyons.
2. *WebGL with three.js.* Real geometry for the road, land and cliffs, and the
   riders as pre-rendered sprites, as the original's were.
3. *A game engine (Phaser, Babylon).* More than the race needs, and its own
   loop and scene model on top of a simulation that already has both.

## Decision

Node 24 with no framework, `ws` for WebSockets, `node:sqlite` on `/data` in
WAL mode with `synchronous = NORMAL`, and three.js. The game itself is
`game/sim.ts`: pure functions with one fixed 1/60 s step and no window,
socket or clock, imported by the server, the browser and the scripts that
ride it as numbers (3f79d37).

## What it costs

- **One process, one machine.** Nothing is shared between machines.
  Scaled to two for the crit 10 test, two people queuing together were never
  matched, and one cookie became two riders, since each machine had its own
  database (f38c010). The app stays on one machine, and a room of eight is the
  scale it is built for.
- **`node:sqlite` is synchronous.** A write blocks the race tick. The first
  log write after a quiet spell once took 570 ms under SQLite's default
  `synchronous = FULL` and stalled every race; under `NORMAL` it takes 0 ms,
  at the cost of the last commits before a power cut (82ae6e7).
- **A machine that stops when idle.** Nothing a returning rider expects may
  live only in memory, and a restart ends every race in progress. It ends them
  as "stopped" for everyone in them, and says so on the page (cd00bef).
- **three.js is 580 KB of the 690 KB bundle**, and the riders' sprite atlas
  is drawn in the browser on arrival rather than shipped. That takes about 5 s
  with a GPU and 17 s without one, so it starts on the board, before anyone
  queues.
- **Type-stripping is not compiling.** The server runs whatever the files say,
  so `pnpm check` runs `tsc --noEmit` before every test, and CI runs the same.
