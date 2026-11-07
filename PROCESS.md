# Process overview

Knuckle Road remakes the arcade mode of *Road Rash* (1996, Windows) as one
race shared by everyone on the road. I wrote down what good meant as
standards the agent could check its own work against, so I was not the one
finding each fault by hand.

## What good means for this game

Good here is the race I remember, played against people in the same room, as
[the README](README.md) argues. Each part became a check the agent runs
itself: how the bike rides (`spec/feel.test.ts`), how the field fights (`spec/fights.test.ts`), that a
room of people gets into one race together (`spec/lobby.test.ts`), and that
the network does not show (`spec/netview.test.ts`). No test can say how it
looks, so that is judged frame beside frame against 137 screenshots of the
original.

## Mechanics from a ledger

My first plan, written from memory, left out the police, both weapons and
weapon snatching. Rather than catch each gap myself, I had the agent research
the manuals of five versions and the GameFAQs guides into
[`docs/ledger.md`](docs/ledger.md): every mechanic with a source and a decision, held by `spec/ledger.test.ts`. I checked the test by breaking two
rows on purpose, and it failed on exactly those two ([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)). The
ledger then overruled the agent's design: an NPC picked a person to fight 37
times as readily as another NPC, where the sources say riders fight "over
position" ([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).

Then the ledger went stale and I did not notice. On 20 October 56 rows still
read "planned", 22 of them built weeks before, because the test checked each
row's form and never its date. I changed the check first. It failed on 9
rows, and fourteen built rows got the tests they had been missing
([`c83a137`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c83a137)). That failure became the subject of my research note.

## Riding feel as numbers

`game/sim.ts` is the race as pure functions on a fixed 1/60 s step, run by the
server, the browser and scripts with timed keys, so the agent rides the game
itself and reports numbers. I decide what they should be, from one recorded
race of the original
([`9aa3259`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/9aa3259)).

Riding showed where copying was wrong. Nitro felt like cheating: 47 of 77
passes on a flat-out player were an NPC bursting past top speed. I considered
rationing it and drawing a flame, then took it out for everyone ([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).

## A blow judged by its movement

The punch had been tuned by eye more than once, and every version passed the
check that held its key poses to the recording, because the movement is in
the frames between. So the agent wrote `spec/motion.test.ts`, a coach's rules
measured in 3D on every frame (the fist drives, the elbow trails below it).
On the old frames 10 of 15 failed ([`ca9385e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/ca9385e)). The chain then passed
and still looked cranked, so I worded the correction as a coach would, "the
upper arm level, the forearm turning about the elbow", and its new rules
failed on the old frames before any pose changed ([`f640d80`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f640d80)). In play
it cranked anyway, through a backhand that no hand-written list of frames
included, so the frames checked are now found by stepping the game through
every move ([`46677c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/46677c1)). In the end fewer frames looked better: a fist
goes out and back through one frame halfway ([`b102d7d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/b102d7d)). Playing it
then showed a flicker no frame could: my browser ended its own punch before
the server did. One function now ends a swing for both, and a test fails on
the hand-timed end ([`d7ea7c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d7ea7c6)).

The checks never made the rider good. I wrote every rule in
`spec/motion.test.ts` after naming a fault I had seen, so the suite holds a
blow at "not wrong" and no further; nothing it measures says a punch has
weight. Where the judgement is by eye, the limit was how precisely I could
name what was wrong.

## A detector for each fault before its fix

I accepted no fix until a test had failed on the old code. The bike ahead
jerked as I overtook. Replaying live snapshot arrivals showed 451 of 17,362
frames drawn off its real movement, and none once each snapshot was placed by
the race time it carries ([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)). Everyone else is drawn a little
behind ([decision 1](docs/decisions/0001-whose-word-counts.md)). Through a 300 ms, 3%-loss proxy, a
fixed tenth of a second of delay left 44 to 78% of frames drawn by guesswork;
a delay that follows the connection's lateness left 4 to 6% ([`cb5b158`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cb5b158)).
Rammed bikes passed through mine, and `spec/ram.test.ts` caught them drawn
inside each other on 5 frames, then none ([`bf12eb7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bf12eb7)). It also caught
struck bikes tipping the wrong way, which an older test passed on the same
misread axis; `CLAUDE.md` now checks handedness against `spec/world.test.ts`.

## Testing with several people

I ran crit 10's eight multi-user scenarios against the deployed app
([`f38c010`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f38c010)). Two machines failed as the code predicted: two people
queueing together were never matched, and one person reconnecting became two
riders. The app stays on one machine. A restart mid-race left pages with no
ending, and now the race ends as "stopped" ([`cd00bef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cd00bef)). At the crit, two
classmates raced from the URL while I read the log.

In a load test for the showcase, 48 scripted people reached 642 ms round
trips at p95, and a profile showed each snapshot turned into text once per
person. Serialised once, the same 48 had 24 ms ([`8977c44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8977c44), measured in
[`b85dd57`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/b85dd57)). Rerun on 7 November, 120 people in 15 races all got in, with
114 ms at worst and no stalls ([`11d50a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/11d50a9)).

## The stack and its costs

One Node 24 process, WebSockets, SQLite on the Fly volume and three.js, with
the options in [decision 3](docs/decisions/0003-the-stack.md). The simulation
has to run identically on the server and in the browser, which rules out a
second language, and keys go up sixty times a second, which rules out
server-sent events. `node:sqlite` blocks the tick, and a 570 ms write stall
went away only with `synchronous = NORMAL` ([`82ae6e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/82ae6e7)). One machine is a
limit I accept; what it leaves open is in
[decision 2](docs/decisions/0002-who-may-do-what.md).

## How I worked with the agent

My attention went on the standards, the checking to the agent. Research went
to background agents with a brief and a file to fill, read before anything was
built on it. The agent rides every handling change through a player's keys and shoots every screen change at both marking
viewports beside the original. Corrections went into `CLAUDE.md` or `spec/`,
where the next session meets them. When one of my own measurements turned out
wrong, the next commit says so.
