# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (the 1996 Windows port I
played) as a race shared by everyone on the road at once. This is how the
project stands at submission, and how the harness behind it was built: which
corrections landed as rules and checks, and how I knew each result was right
before accepting it.

## What "good" had to mean

I first wanted a video-translation tool, which fails two of the three fixed
requirements. A race where you can hit the rider beside you won instead,
because being next to another person is the whole game: Wilson's
confrontational games for a room describe what Road Rash already was. The
harder question was fidelity. An agent asked to "remake Road Rash" builds the
median racing game, and Neill Hoch's point about remakes keeping the story
while replacing the mechanics names the trap. I took the opposite position,
keeping the mechanics and rebuilding the rest, and that position runs through
the README, `CLAUDE.md` and `spec/`.

## Moment 1: a record instead of my memory

The first plan left out the police, both weapons and weapon snatching. Adding
them by hand would have made me the error detector for every mechanic. So
I had the agent research six manuals and five guides into
[`docs/ledger.md`](docs/ledger.md): every mechanic with a source and a
decision, held by `spec/ledger.test.ts`, which I checked by breaking two rows
on purpose ([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)). The ledger later overruled the agent's
own design: an NPC picked a person to fight 37 times as readily as another
NPC, against sources saying riders fight "over position" ([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).
Then the ledger itself went stale. On 20 October, 35 rows still read
"planned" for crits long past, while the README said every mechanic had a
decision, because the test checked each row's form but not its date. An
audit against the code found 22 built and 21 never started. I changed the
check before touching a row: the test now fails on any planned row past its cutoff.
It failed on 9, and fourteen built rows gained the tests they had lacked
([`c83a137`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c83a137)). That failure is the subject of my research note.

## Moment 2: the rules as numbers before any picture

`game/sim.ts` is the race as pure functions with one fixed 1/60 s step.
The server runs it, the browser runs the same `ride()` for its own rider, and
scripts replay it with scripted keys ([`3f79d37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/3f79d37)). Feel is judged
by riding and then settled by counting. Nitro read as cheating when I rode
it, and over twenty races 47 of 77 passes on a flat-out player were an NPC
burst past the bike's top speed. Rationing it and drawing a flame were both
dropped. The fair rule was that no one has it, held by a spec across all 25
road and level pairs ([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).
Counting settled the start as well. One of the ledger's sources remembers
knocking the flagger down "every start", but my first flagger walked off
the road at the go, and in the spec no bike off the front row at full
throttle ever reached him. He now stands a second past the go, and over 30
level 3 races on five roads he went flying in all 30 ([`468ae1b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/468ae1b)).
Riding into people cost nobody a finish: 425 of 450 riders finished, against
407 with nobody on foot.

## Moment 3: real-time, by measurement

The server owns the race over one WebSocket per tab
([decision 1](docs/decisions/0001-whose-word-counts.md)). Getting it smooth
took measurement. When I overtook, the bike ahead jerked. Snapshot arrivals
recorded on the live server, replayed in `spec/netview.test.ts`, showed 451
frames in 17,362 drawn off a bike's real movement, and none once snapshots
were placed by the race time they carry ([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)). Through a
300 ms, 3%-loss proxy, a fixed tenth of a second left 44–78% of frames
drawn by guesswork, against 4–6% once the delay followed the connection
([`cb5b158`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cb5b158)). The crit 10 test ran eight multi-user scenarios
against the deployed app. A restart mid-race left both pages with no ending
and the log with no `race_end` ([`f38c010`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f38c010)); every race now ends
as "stopped" for everyone in it ([`cd00bef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cd00bef)).

The showcase puts a room of people on one shared CPU, so I raced scripted
people against the deployed app until it broke. Twenty-four in
three races ran clean. Forty-eight in six full races did not: round trips
reached 642 ms at p95, with 813 gaps of over a quarter of a second between
snapshots. A CPU profile of the same load on my machine showed why. Every
snapshot was turned into text again for each person in its race, though only the acknowledgement number differs. Serialised once,
the same 48 on the live machine had no gaps and 24 ms round trips
([`8977c44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8977c44)). Eighty then exposed a queueing fault, each
full room waiting five seconds behind the last. With that fixed, 120 people
in fifteen races all got a race, still without a gap ([`b85dd57`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/b85dd57)).

## Moment 4: checking what a marker meets

Before submitting I tested the app as a marker arrives at it. Four of the
README's five links downloaded files instead of opening pages, and the fifth
was a 404; a spec now crawls every link from `/readme/` ([`c7d4fa2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c7d4fa2)).
axe found empty headings and a mislabelled button, failing three of five
pages and ten checks in Chrome ([`5e0e632`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/5e0e632)). In a browser with no GPU, loading froze for
64 s. A CPU profile put 85% of it in one canvas fill under a 4,096-point clip,
not in the sprite atlas I had suspected. Fixed and diffed against the old
canvas pixel by pixel, loading took 3 s ([`51f6986`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/51f6986)).

## The stack, and what it costs

One Node 24 process with no framework, WebSockets, SQLite on the Fly volume
and three.js. The options and costs are in
[decision 3](docs/decisions/0003-the-stack.md). The deciding fact was that the
simulation must run identically on the server and in the browser, which rules
out a second language. WebSockets beat server-sent events because keys flow
upward sixty times a second. `node:sqlite` blocks the
tick, and a 570 ms write stall was cured only by `synchronous = NORMAL`
([`82ae6e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/82ae6e7)). Two machines split one person into two riders, so
the app stays on one; and what it still leaves open, one person racing from
several tabs, is written down in [decision 2](docs/decisions/0002-who-may-do-what.md).

## How the agent was directed

Research went to background agents with a written brief and a file to fill,
and I read that file before anything was built from it. Every claim about
look or feel is checked on the running game: probes for numbers, and the
deployed game played in Chrome at both marking viewports. A correction goes
into `CLAUDE.md` or `spec/`, where the next session will meet it, and when one of
my measurements turned out wrong, the next commit says so.
