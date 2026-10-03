# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (the 1996 Windows port I
played) as a race shared by everyone on the road at once. This is how it got
from the brief to crit 8, and what the agent was held to.

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

The first plan described the game from an impression, and it left out the
police, both weapons, and snatching a weapon from an opponent mid-swing — the
mechanics that make the game what it is. I caught that by hand, and saw that
catching every other omission the same way would make me the error detector
for the whole project.

So instead of adding the police, I had the agent research the game properly —
the PC, 3DO, Saturn and Sega CD manuals, the Mega Drive manuals, five GameFAQs
guides and Chinese player accounts — and turn every mechanic into a row of
`docs/ledger.md` with a source, a status and a treatment: copied as the
original has it, adapted with the reason, or left out with the reason
([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)).
`spec/ledger.test.ts` holds the table to its own rules: every planned row has
a due crit, every omission a reason, every source tag a URL, and a row marked
built must name a spec test that exists. I verified that the check bites by
breaking two rows on purpose; it failed exactly those two and named them.
`CLAUDE.md` now says nothing about the game is built from memory: a mechanic
without a row is researched first.

The ledger also records my judgement against the manual: it lists a lean key
and nitro, which I never used, so those rows say `adapted` with that reason
rather than being silently different.

The same failure came back twice, which is why I count the ledger as a rule
rather than a document. The look was drawn from nothing, because the research
had been text only; it is now measured off 137 screenshots in
`docs/road-rash-visuals.md`. And when I rode the first build, bikes passed
through each other, because no chapter of any manual is about contact. That
became a Contact section of the ledger, sourced from frame sheets of PC
playthroughs
([`e5481b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/e5481b1)).
Each time, the fix was to widen what gets researched, not to patch the one
thing I had noticed.

## Moment 2: the rules as numbers before any picture

`game/sim.ts` is the whole race as pure functions with one fixed 1/60 s step:
no window, no socket, no clock. The server runs it for real, the browser runs
the same `ride()` to predict its own rider, and `scripts/ride.ts` and
`scripts/lap.ts` run it with scripted keys and print what the bike did
([`3f79d37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/3f79d37)).
The first scripted ride found a bug no screenshot would have: after a tree
crash the rider remounted a bike lying inside the tree and crashed three times
in 2.2 seconds. A full scripted race measured the pacing (5.3 miles in 183
seconds) and showed no bend ever made the bike lean, so the bends were
tightened until one did.

## Moment 3: the server, and the two windows a marker will open

The race is server-authoritative over one WebSocket per tab
([`472172f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/472172f)).
Matchmaking follows how online games work rather than a lobby of rooms: an AI
pool starts five seconds after its first rider and fills the grid to fifteen,
so a lone visitor gets a full race; a humans-only pool waits ten seconds,
restarting for each newcomer, and never starts with one person. Riders still
queueing watch the race on the road. `spec/lobby.test.ts` drives all of it
with a fake clock.

Two windows of one browser share a cookie, so a marker testing side by side
would have raced themselves as one rider; bikes are numbered per connection
instead. The tests also caught a rider who left mid-race being stored as
anonymous. Measured against the deployed app from outside: the socket
opens in 49 ms, a fifteen-bike race starts five seconds after queueing,
snapshots arrive at exactly 20 per second, and the first input is
acknowledged in 44 ms.

Riding it showed the prediction was too selfish: each browser moved its own
bike through everyone else's until the server pulled it back, and the server
itself let bodies overlap in 7.5% of steps. One shared bike size and a
separation along the shorter overlap, iterated four times a step, took that to
none in 5400 steps, and the browser now runs the same function on its own
rider
([`066a676`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/066a676)).

## Stack and trade-offs

One Node 24 process, no framework. Node runs the TypeScript server by
stripping types, so only the browser bundle is built, and `node:sqlite` on the
Fly volume means the image compiles nothing native. Real-time is WebSockets rather than server-sent
events because input flows the other way sixty times a second. The trade-off I
accepted is that rivals are drawn a tenth of a second in the past, between two
real positions, as Gabriel Gambetta describes: the bike you punch is where the
server says, not quite where you see it.

The renderer has changed most. A scanline road could only fake the original's
cliffs and street canyons, so it became WebGL with three.js; a code-built
version of the riders and scenery was nowhere near the original, so the art is
moving to CC0 models and textures, each source and licence listed in
`client/public/assets/ASSETS.md`. Nothing from EA's game ships.

## How the agent was directed

Research went to background subagents with a written brief and a file to
fill, read before anything was built from it. Handling and visual claims are
checked on the real thing: scripted rides for numbers, and headless-Chrome
screenshots at both marking viewports set beside the original. A picture that
looked wrong was measured before anything changed — once the renderer was
right and my reading wrong; once the mountain texture really was a stretched
mesa.
