# Harness

The rules I hold the agent to in this repo. The brief is the course's
[final project](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/):
a multi-user, real-time website that's good. This one is a remake of the arcade
mode of Road Rash (EA, 1996 Windows port), raced by several people at once in
their own browsers.

## The ledger comes before the code

- **Nothing about the game is built from memory.** `docs/ledger.md` lists every
  mechanic of the original with a source and a decision. Before building or
  changing any gameplay, find its row. If it has no row, research it from the
  sources in the ledger (or new ones, added to its Sources table), add the row,
  and only then write code.
- **This rule exists because the first plan left out the police, the weapons
  and weapon snatching**. It described the game from a general impression, and
  every missing detail had to be caught by hand. The ledger makes the gaps
  visible in one table instead.
- **When a row is built, flip it to `built` and name its proof** as
  `spec/file.test.ts › test name`. `spec/ledger.test.ts` fails if the test
  named does not exist, if a planned row has no due crit, if a planned row is
  still planned after its crit's cutoff, or if a source tag does not resolve.
- **The due date is checked because the form alone was not enough.** On 20 Oct
  35 rows still read "planned" for C8 or C9 weeks after they were built, while
  the README said every mechanic had a decision; the test had checked that each
  row had a due crit, never that the crit had passed. A row that misses its
  date is built, omitted with the reason, or given a later date in a commit
  that says it was missed; never moved on silently.
- A Look row only a person can judge names the commit whose message records
  the frame-beside-frame comparison, as `judged: <sha>`. Nothing else may be
  judged rather than tested.
- **A deviation from the original is a decision, written in the row** as
  `adapted:` with the reason. Changing what a row says is fine; leaving the code
  and the row disagreeing is not.
- The PC version wins where versions disagree. Other versions fill in only where
  the PC manual is silent, and the row names the source it used.

## The look comes from the screenshots, not from memory

- **Nothing about how the game looks is drawn from an impression either.** The
  first renderer had a dusk sky, red-and-white kerbs and pixel riders, none of
  which the game has. The Look rows of `docs/ledger.md` are measured off 137
  captures, in `docs/road-rash-visuals.md`; a visual change starts from a row.
- **Compare frame beside frame.** `node scripts/shoot.ts` screenshots the real
  game in the installed Chrome at 1920x1080 and 390x844 while riding with real
  keys. Put a frame beside the matching original capture before calling a look
  done; the captures are EA's and stay in the workspace's `.scratch/rr-img/`,
  never in this repo.
- **When a picture looks wrong, measure it before changing anything.** A strip
  once seemed to show the road bending the wrong way; measured, the renderer
  was right and the reading was wrong. The flat, low mountains were the
  opposite: exporting the panorama texture showed a mesa and a 1.9x
  horizontal stretch, both real.
- World axes follow three.js: y is up and, facing +z, the rider's right is -x.
  `game/world.ts` turns road coordinates into world ones and
  `spec/world.test.ts` holds its directions. Three sign errors (lean, limbs,
  face winding) were made in the first version of the scene; check a new
  model's handedness against that file, not by eye.

## Feel is tuned by riding, not by reasoning

- **Every change to how the bike handles is ridden before it is committed**, in
  the real game in the browser, through the same keys a player uses. The agent
  plays it itself; a tuning value nobody has ridden is a guess.
- **Ride it as numbers as well as pictures.** The simulation is pure and
  deterministic, so a scripted ride (keys held for given times) can be replayed
  in Node (`scripts/ride.ts`, `scripts/lap.ts`) and printed as speed, lateral
  position, lean and build-up over time. The preview pane throttles
  `requestAnimationFrame` to about 1fps when it is not on screen, so timing is
  never measured through it.
- **Write a feel down as a number once it is right** (seconds from the grid to
  top speed, how far one second of full steer moves the bike across the road)
  and put it in `spec/`, so a later change that loses it goes red. The commit
  says what was ridden, what felt wrong, and the numbers before and after.

## Your bike answers your keys; the server answers everything else

- **The server owns the race.** It runs the one simulation that counts, takes
  each person's bike from their connection and never from what a message
  says, and decides every blow, crash and finish. A browser never decides
  anything about another rider. `docs/decisions/0001-whose-word-counts.md` and
  `0002-who-may-do-what.md` say why; `spec/lobby.test.ts` holds the second.
- **One's own bike moves on the keypress.** The browser runs the same `ride()`
  on its own rider, and when the server disagrees the drawn bike eases over,
  never jumps back a round trip. Nothing may make a key wait for the network.
- **Network behaviour is measured, not reasoned about.** A change to how
  others are drawn is replayed through `spec/netview.test.ts` against snapshot
  arrivals recorded from the live server, and ridden through
  `scripts/badnet.ts` at 300 ms and 3% loss before it ships.

## A room of people comes first

- A room holds eight people. Unless the room asks for another number, NPCs
  fill the grid to fifteen, so each person who joins takes an NPC's seat;
  nothing gives a person a different bike, weight or rule from an NPC (ledger
  N2, O5, R6, R8).
- Everyone in a room is told apart at a glance: no two people in a room wear
  the same leathers, and every log line names a person, never a bike number.
- Every person sees where every other person is placed (N6), and a person who
  knocked another off is remembered between them for good (O3). What one
  person did to another is between people: an NPC's grudge lasts its race.
- What a person did is kept on `/data` and survives a restart and a redeploy;
  a race the server stops ends for everyone in it, and says so.

## Every page, for everyone who arrives

- Markers and visitors start at `/readme/`. Every link on it opens a page
  (`spec/readme.test.ts`), and every page passes axe in jsdom
  (`spec/a11y.test.ts`). A change to a screen is run through
  `node scripts/a11y.ts <url>`, which runs axe in Chrome on every screen of a
  race at both marking viewports, contrast included, and must report none.
- Both marking viewports, 1920x1080 and 390x844, are checked with
  `scripts/shoot.ts` before a visual change ships. A phone gets every action
  as a button.
- A change to a screen or to the keys is run through
  `node scripts/rough.ts <url>`: a race reached and ridden with the keyboard
  alone, and resized mid-race between both marking viewports and back. The
  marking band asks for both, and neither had been tried until 21 Oct.
- Loading is timed in Chrome without a GPU as well as with one: a 64 s
  freeze on the loading screen was invisible on this machine's GPU.

## Names

- Mechanics are copied; names are not. No EA title, rider, bike brand, track
  name, song or artwork appears in the app. The README credits the original.

## Machine and deploy

- Git Bash on Windows. Every shell starts with
  `export PATH="/e/ANU/COMP8020/.tools/node-v24.18.1-win-x64:/e/ANU/COMP8020/.tools:$PATH"`
  and `export pnpm_config_store_dir="E:/ANU/COMP8020/.pnpm-store"`. Before any
  `pnpm install`, `pnpm store path` must print `E:\ANU\COMP8020\.pnpm-store\v11`.
- `git config core.hooksPath .githooks` after a fresh clone: `prepare` fails
  silently on Windows.
- Fly app `comp4020-final-ruiquanqiao`. Every flyctl call first sets
  `FLY_CONFIG_DIR="E:/ANU/COMP8020/.fly-config"` (otherwise it writes to
  `~/.fly`) and reads `FLY_API_TOKEN` from this repo's `mise.local.toml`, then
  `flyctl deploy --remote-only --ha=false -a comp4020-final-ruiquanqiao`.
- The machine is one shared CPU with 256 MB, and `/data` is the only storage
  that survives a restart. It stops when idle, so nothing may live only in
  memory that a returning rider expects to find.

## When the deployed app misbehaves, read the log first

- Every line names a person as `Name#rider`. Live:
  `flyctl logs -a comp4020-final-ruiquanqiao`. Fly keeps only a short buffer
  and a restart empties it, so every line is also kept in the database; read
  it on the machine with
  `flyctl ssh console -a comp4020-final-ruiquanqiao -C "node server/readlog.ts --since <UTC time> --about <name>"`.
- A race's `race_start` line maps each bike number to a person. An event no
  person is part of is not logged; anything new a person does is logged with
  `who`, and `spec/lobby.test.ts` checks the names are there.

## Checks

- `pnpm check` runs against the running app. It must be green before a commit.

## Writing

- Commit messages are the process record: say what was tried and discarded,
  and put the measured numbers in.
- Everything in this repo is written in English, in my voice.
