# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (the 1996 Windows port I
played) as one race shared by everyone on the road at once. This is how the
project stands at submission, and how its harness came to be: which of the
agent's mistakes, and mine, ended up as rules and checks, and how I knew a
result was right before I accepted it.

## What "good" had to mean

My first idea was a video-translation tool, until I saw it failed two of the
three fixed requirements. I chose a race where you can hit the rider beside
you, because there being next to another person is the whole game; Wilson's
confrontational games for a room describe what Road Rash already was. The
harder question was fidelity. An agent asked to "remake Road Rash" builds the
median racing game, and Neill Hoch's point, that remakes keep the story and
replace the mechanics, names exactly that trap. So I kept the mechanics and
rebuilt everything else, and that position runs through the README,
`CLAUDE.md` and `spec/`.

## Moment 1: a record instead of my memory

The first plan left out the police, both weapons and weapon snatching. If I
had added them by hand, I would have become the error detector for every
mechanic in the game, so I had the agent research six manuals and five guides
into [`docs/ledger.md`](docs/ledger.md): every mechanic with a source and a
decision, held by `spec/ledger.test.ts`, which I checked by breaking two rows
on purpose ([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)). The ledger later overruled the agent's
own design: an NPC picked a person to fight 37 times as readily as it picked
another NPC, while the sources say riders fight "over position" ([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).

Then the ledger itself went stale, and I did not notice for weeks. On 20
October, 35 rows still read "planned" for crits long past while the README
said every mechanic had a decision, because the test checked each row's form
and never its date. An audit against the code found 22 of them built and 21
never started. Before touching a single row I changed the check, so it now
fails on any planned row past its cutoff; it failed on 9, and fourteen built
rows gained the tests they had been missing ([`c83a137`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c83a137)). That failure
became the subject of my research note.

## Moment 2: the rules as numbers before any picture

`game/sim.ts` is the race as pure functions with one fixed 1/60 s step. The
server runs it, the browser runs the same `ride()` for its own rider, and
scripts replay it with scripted keys ([`3f79d37`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/3f79d37)). That means a feel can
be judged by riding and then settled by counting. Nitro felt like cheating
when I rode against it, and over twenty races 47 of 77 passes on a flat-out
player turned out to be an NPC bursting past the bike's top speed. I tried
rationing it and drawing a flame, and dropped both; the only fair rule was
that nobody has it, held by a spec across all 25 road and level pairs ([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).

Counting settled the start too. One of the ledger's sources remembers knocking
the flagger down "every start", but my first flagger walked off the road at
the go, and in the spec no bike leaving the front row at full throttle ever
reached him. He now stands there a second past the go, and over 30 level 3
races on five roads he went flying in all 30 ([`468ae1b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/468ae1b)), while riders
still finished: 425 of 450, against 407 with nobody on foot.

## Moment 3: real-time, by measurement

The server owns the race over one WebSocket per tab
([decision 1](docs/decisions/0001-whose-word-counts.md)), but making it look
smooth took measurement rather than reasoning. When I overtook, the bike
ahead jerked. Replaying snapshot arrivals recorded on the live server through
`spec/netview.test.ts` showed 451 of 17,362 frames drawn off a bike's real
movement, and none once each snapshot was placed by the race time it carries
([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)). Through a 300 ms, 3%-loss proxy, a fixed tenth of a second of
delay left 44–78% of frames drawn by guesswork, against 4–6% once the delay
followed the connection ([`cb5b158`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cb5b158)). In the crit 10 test, a restart
mid-race left both pages with no ending and the log with no `race_end`
([`f38c010`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f38c010)); now every race ends as "stopped" for everyone in it ([`cd00bef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cd00bef)).

The showcase puts a room of people on one shared CPU, so I raced scripted
people against the deployed app until it broke. Twenty-four ran clean; 48 in
six races reached 642 ms round trips at p95. A CPU profile showed why: every
snapshot was turned into text again for each person in its race, although
only the acknowledgement number differs. Serialised once, the same 48 had
24 ms round trips and no gaps ([`8977c44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8977c44)), and after a queueing fix 120
people in fifteen races all got a race ([`b85dd57`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/b85dd57)).

## Moment 4: checking what a marker meets

Before submitting I tested the app the way a marker arrives at it, and it was
worse than I had assumed. Four of the README's five links downloaded files
instead of opening pages and the fifth was a 404, so a spec now crawls every
link from `/readme/` ([`c7d4fa2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c7d4fa2)). axe failed three of five pages
in Chrome ([`5e0e632`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/5e0e632)). In a browser with no GPU, loading froze for 64 s;
I suspected the sprite atlas, but a CPU profile put 85% of it in one canvas
fill under a 4,096-point clip. Fixed and diffed against the old canvas pixel
by pixel, loading took 3 s ([`51f6986`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/51f6986)).

## The stack, and what it costs

One Node 24 process with no framework, WebSockets, SQLite on the Fly volume
and three.js; the options and costs are in
[decision 3](docs/decisions/0003-the-stack.md). What decided it was that the
simulation has to run identically on the server and in the browser, which
rules out a second language. I chose WebSockets over server-sent events
because keys flow upward sixty times a second. `node:sqlite` blocks the tick,
and a 570 ms write stall went away only with `synchronous = NORMAL`
([`82ae6e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/82ae6e7)). Two machines would split one person into two riders, so the
app stays on one, and what that still leaves open, one person racing from
several tabs, is in [decision 2](docs/decisions/0002-who-may-do-what.md).

## How I directed the agent

Research went to background agents with a written brief and a file to fill,
and I read that file before anything was built from it. Every claim about
look or feel is checked on the running game, with probes for numbers and the
deployed game played in Chrome at both marking viewports. When the agent got
something wrong, the correction went into `CLAUDE.md` or `spec/`, where the
next session would meet it; and when one of my own measurements turned out
wrong, the next commit says so.
