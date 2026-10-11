# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (the 1996 Windows port I
played) as a race shared by everyone on the road at once. This is how it stands
at crit 9, now a race several people ride and fight in together, and what the
agent was held to on the way.

## The choice of game, and what "good" had to mean

I came in wanting to build a video-translation tool, a single-user batch job
that fails two of the brief's three fixed requirements, so I dropped it. A
motorbike race where you can hit the rider beside you won instead: being next
to another person is the whole point, the network problem is mostly
one-dimensional, and one person with two windows can still see whether two
bikes agree.

That left a harder problem than the network: what counts as a faithful remake.
An agent asked to "remake Road Rash" produces the median racing game, which
is what I got at first.

## Moment 1: replacing my memory with a ledger

The first plan described the game from an impression and left out the police,
both weapons, and snatching a weapon mid-swing. I caught that by hand, and saw
that catching every other omission the same way would make me the error
detector for the whole project. So instead of adding the police, I had the
agent research the game from six manuals, five GameFAQs guides and Chinese
player accounts, and turn every mechanic into a row of `docs/ledger.md` with a source and a
treatment: copied, adapted with the reason, or left out with the reason
([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)).
`spec/ledger.test.ts` holds the table to its own rules, and a row marked built
must name a spec test that exists; I checked that it bites by breaking two
rows on purpose. `CLAUDE.md` says a mechanic without a row is researched
before it is built.

The same gap came back as whole categories nobody had asked about: the look,
now measured off 137 screenshots, and what happens when bikes touch, which no
manual chapter covers and which became a Contact section sourced from frame
sheets of PC playthroughs
([`e5481b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/e5481b1)).
This week the ledger overruled the agent's own design. Riding against the
field, the riders seemed not to care whether they won, only that I lost, and
the code agreed: an AI rider picked a person 37 times as readily as another AI
rider. The sources say riders fight "over position, and they take cheap shots
if they hold a grudge", and nothing singles out the player. That became row
O5: a person and an AI rider level with a rider are now picked 0.8-1.25 times
alike, held by four specs that fail on the old rules
([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).

## Moment 2: the rules as numbers before any picture

`game/sim.ts` is the whole race as pure functions with one fixed 1/60 s step:
no window, no socket, no clock. The server runs it for real, the browser runs
the same `ride()` to predict its own rider, and `scripts/ride.ts` and
`scripts/lap.ts` run it with scripted keys and print what the bike did
([`3f79d37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/3f79d37)).

Feel is judged by riding, then settled by counting. Nitro read as cheating
when I rode it: a rider I had just passed came straight back past me with
nothing on screen to say why. Played twenty times over with a flat-out player,
47 of 77 passes on that player were an AI burst 35 km/h over the bike's top
speed. Rationing the AI's nitro and drawing a flame were both considered and
dropped; the fair rule was that no one has it, and a spec now holds every
rider on the same bike on all 25 road and level pairs
([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).

## Moment 3: real-time, measured from the live server

The race is server-authoritative over one WebSocket per tab
([`472172f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/472172f)).
An AI pool fills the grid to fifteen, so a lone visitor still gets a full
race. Two windows of one browser share a cookie, so bikes are
numbered per connection and a marker testing side by side is two riders.

Who is believed when two screens disagree is written down in
[`docs/decisions/0001-whose-word-counts.md`](docs/decisions/0001-whose-word-counts.md):
the server alone decides blows, crashes and busts, each browser predicts only
its own rider, and everyone else is interpolated. What made it work was
measuring, not the design. Overtaking, the bike ahead jerked and flickered.
`scripts/netprobe.ts` joined a race on the live server and recorded 400
snapshot arrivals: 49 ms apart at the median but up to 111 ms. `spec/netview.test.ts` replays a race delivered exactly that late
and counts frames where a bike is drawn off its real movement: 451 in 17,362
with the first renderer, the worst 3.9 m, and none once snapshots were placed
by the race time they carry
([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)).
Later the whole field seemed to shake along the road. Recorded frame by frame
in Chrome, the others were smooth at 2 cm a frame; my own bike was jumping
57 cm, because it was drawn where its last fixed step left it while the camera
followed it. Drawn between its steps, the lurch went to 0.4 cm
([`519f145`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/519f145)).
Going by the picture alone, I would have smoothed the wrong bikes.

## Stack and trade-offs

One Node 24 process, no framework. Node runs the TypeScript server by
stripping types, so only the browser bundle is built, and `node:sqlite` on the
Fly volume means the image compiles nothing native. Real-time is WebSockets
rather than server-sent events because input flows the other way sixty times a
second.

The renderer is WebGL with three.js, since a scanline road could only fake the
original's cliffs and street canyons. Riders are pre-rendered sprites, as the
original's were, from a puppet built in code and posed against frames of a
recorded PC race. The cost is a 760-tile atlas built in the lobby a few frames at
a time, so the page never stalls for more than about 210 ms.
Scenery uses CC0 photographs and the music is CC BY, each file listed in
`client/public/assets/ASSETS.md`. Nothing from EA's game ships.

## How the agent was directed

Research went to background subagents with a written brief and a file to
fill, read before anything was built from it. Every claim about look or feel is
checked on the real thing: probes for numbers, and the deployed game played in
headless Chrome at both marking viewports beside frames of the original. When a
measurement of mine turned out wrong, the next commit says so.
