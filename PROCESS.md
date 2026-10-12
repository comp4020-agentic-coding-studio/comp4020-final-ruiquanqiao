# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (the 1996 Windows port I
played) as a race shared by everyone on the road at once. This is how it stands
at crit 10: a race several people find, join, ride and fight in together, told
apart on screen and in the server's logs, and what the agent was held to on the
way.

## The choice of game, and what "good" had to mean

I came in wanting to build a video-translation tool, a single-user batch job
that fails two of the brief's three fixed requirements, so I dropped it. A
motorbike race where you can hit the rider beside you won instead: being next
to another person is the whole point, and one person with two windows can
still see whether two bikes agree. That left a harder problem than the
network: what counts as a faithful remake. An agent asked to "remake Road
Rash" produces the median racing game, which is what I got at first.

## Moment 1: replacing my memory with a ledger

The first plan described the game from an impression and left out the police,
both weapons, and snatching a weapon mid-swing. Catching every omission by hand
would have made me the error detector for the whole project. So instead of
adding the police, I had the agent research the game from six manuals, five
GameFAQs guides and Chinese player accounts, and turn every mechanic into a row
of `docs/ledger.md` with a source and a treatment: copied, adapted with the
reason, or left out with the reason
([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)).
`spec/ledger.test.ts` holds the table to its own rules, and a row marked built
must name a spec test that exists; I broke two rows on purpose to see it bite.
The same gap came back as whole categories nobody had asked about, like what
happens when bikes touch, which became a Contact section sourced from frame
sheets of PC playthroughs
([`e5481b1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/e5481b1)).
Later the ledger overruled the agent's own design: an NPC picked a person to
fight 37 times as readily as another NPC, and the sources say riders fight
"over position", nothing singling out the player. That became row O5, held by
four specs that fail on the old rules
([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).

## Moment 2: the rules as numbers before any picture

`game/sim.ts` is the whole race as pure functions with one fixed 1/60 s step:
no window, no socket, no clock. The server runs it for real, the browser runs
the same `ride()` to predict its own rider, and `scripts/ride.ts` and
`scripts/lap.ts` run it with scripted keys and print what the bike did
([`3f79d37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/3f79d37)).
Feel is judged by riding, then settled by counting. Nitro read as cheating when
I rode it, and played twenty times over, 47 of 77 passes on a flat-out player
were an NPC burst 35 km/h over the bike's top speed. Rationing it and drawing a
flame were both dropped; the fair rule was that no one has it, and a spec holds
every rider on the same bike on all 25 road and level pairs
([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).

## Moment 3: real-time, measured from the live server

The race is server-authoritative over one WebSocket per tab
([`472172f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/472172f)),
and who is believed when two screens disagree is written down in
[`docs/decisions/0001-whose-word-counts.md`](docs/decisions/0001-whose-word-counts.md).
What made it work was measuring, not the design. Overtaking, the bike ahead
jerked. `scripts/netprobe.ts` recorded 400 snapshot arrivals on the live
server, 49 ms apart at the median but up to 111 ms, and `spec/netview.test.ts`
replays a race delivered exactly that late: 451 frames in 17,362 drew a bike
off its real movement, and none once snapshots were placed by the race time
they carry
([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)).
Later the whole field seemed to shake. Recorded frame by frame, the others
moved 2 cm a frame and my own bike 57 cm; drawn between its steps, it went to
0.4 cm
([`519f145`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/519f145)).
By the picture alone I would have smoothed the wrong bikes. The same habit
started races together: matches are now accepted, then loaded on one screen,
and each person's countdown is shortened by half their round trip. Averaged,
a browser on the same machine read 147 ms while it built its scene, the page
answering late rather than the network, so it takes the shortest round trip,
as NTP does; two browsers then showed GO 1 ms apart
([`4ccbb14`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/4ccbb14)).

## Moment 4: telling people apart, for the person reading the logs

The server had logged since the first deploy, and I had counted that as done
until I tailed the live app the way the crit makes me narrate it. A line read
`{"ev":"connect","rider":2}`, and blows were logged by each bike's number in
that race, with fifteen NPCs fighting each other burying the two people I
would be talking about. Now every line names a person as `Ana#60`, the start
of a race maps each bike to its person, events no person is part of are left
out, and every line is also kept in the database, because Fly's buffer empties
on a restart
([`d4259f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4259f3)).
A two-browser rehearsal read back as connect, rename, queue, two accepts, a
start naming both bikes, a crash and two quits. What each person may change was
already checked on the server, but only in the code; writing it down in
[`docs/decisions/0002-who-may-do-what.md`](docs/decisions/0002-who-may-do-what.md)
made me find what it leaves open, one person racing several bikes from several
tabs, and say so.

## Stack and trade-offs

One Node 24 process, no framework. Node runs the TypeScript server by stripping
types, so only the browser bundle is built, and `node:sqlite` on the Fly volume
means the image compiles nothing native. Real-time is WebSockets rather than
server-sent events because input flows the other way sixty times a second. The
renderer is WebGL with three.js, since a scanline road could only fake the
original's cliffs; riders are pre-rendered sprites, as the original's were,
from a puppet built in code, at the cost of an atlas built in the lobby a few
frames at a time. Nothing from EA's game ships.

## How the agent was directed

Research went to background subagents with a written brief and a file to fill,
read before anything was built from it. Every claim about look or feel is
checked on the real thing: probes for numbers, and the deployed game played in
headless Chrome at both marking viewports. When a measurement of mine turned
out wrong, the next commit says so.
