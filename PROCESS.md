# Process overview

Knuckle Road remakes *Road Rash*'s arcade mode as one race shared by
everyone on the road. I wrote down what good meant as standards
the agent could check its own work against.

## What good means for this game

[The README](README.md) describes a good race: friends in one room, a game
like the one I played, and nothing strange happening. Each part became a check the agent runs itself, from how the
bike rides (`spec/feel.test.ts`) to how other bikes move over a bad
connection (`spec/netview.test.ts`). No test can say how it looks, so I
judged that frame beside frame against 137 screenshots.

## Researching the original's mechanics

My first plan, written from memory, left out the police, both weapons and
weapon snatching. Rather than catch each gap myself, I had the agent research
five versions' manuals and the GameFAQs guides into
[`docs/ledger.md`](docs/ledger.md): every mechanic with a source and a decision, held by `spec/ledger.test.ts`. I checked the test by breaking two
rows on purpose, and it failed on exactly those two ([`8d029d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8d029d5)). The
ledger then overruled the agent: an NPC picked a person to fight 37
times as readily as another NPC, where the sources say riders fight "over
position" ([`d21f170`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d21f170)).

Then the ledger went stale: on 20 October 56 rows still read "planned", 22
of them built weeks before, because the test checked each row's form and
never its date. I changed the check first, and fourteen built rows got the
tests they had been missing
([`c83a137`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/c83a137)). That failure became the subject of my research note.

## Tuning how the bike handles

`game/sim.ts` is the race as pure functions on a fixed 1/60 s step, so the
agent rides the game with scripted keys and reports numbers. I decide what
they should be, from one recorded race of the original
([`9aa3259`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/9aa3259)).

Riding showed where copying was wrong: 47 of 77 passes on a flat-out player
were an NPC bursting past on nitro. I took nitro out for everyone rather than
ration it ([`bc121fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bc121fa)).

## Animating the punch and the chain

Every version of the punch I tuned by eye passed the check on its key poses
and still looked wrong: the movement is in the frames between them. So the agent wrote `spec/motion.test.ts`, a coach's rules
measured in 3D on every frame (the fist drives, the elbow trails below it).
On the old frames 10 of 15 failed ([`ca9385e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/ca9385e)). The chain then passed
and still swung like a crank handle, so I worded the correction as a coach
would, "the forearm turning about the elbow", and its new rules failed on
the old frames first ([`f640d80`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f640d80)). In play
it still cranked on a backhand, a swing missing from the hand-written list of
frames, so the test now finds its frames by stepping the game through every
move ([`46677c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/46677c1)). Playing it
then showed a flicker no frame could: my browser ended its own punch before
the server did. One function now ends a swing for both, and a test fails on
the hand-timed end ([`d7ea7c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d7ea7c6)).

I wrote every rule in `spec/motion.test.ts` after naming a fault I had seen,
so it catches a blow that moves wrongly but cannot say whether a punch has
weight. The README lists that as judged.

## Fixing what looked wrong in a race

I accepted no fix until a test had failed on the old code. The bike ahead
jerked as I overtook; replaying the timing of real server updates showed 451 of 17,362
frames drawn off its real movement, and none once each update was placed by
the race time it carries ([`d4e2ab2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/d4e2ab2)). Other riders are drawn a little in
the past ([decision 1](docs/decisions/0001-whose-word-counts.md)), and a fixed
tenth of a second was not far enough: through a 300 ms,
3%-loss proxy, 44 to 78% of frames were guesses. Drawing as far back as the
connection needs left 4 to 6% ([`cb5b158`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cb5b158)).
`spec/ram.test.ts` caught rammed bikes drawn inside mine on 5 frames, then
none ([`bf12eb7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/bf12eb7)). It also caught
struck bikes tipping the wrong way, so `CLAUDE.md` now checks handedness
against `spec/world.test.ts`.

## Designing for friends, with rules for strangers

Shirky and Sloan, cited in the README, argue that software made for a few
people can assume they know each other. I agree only partly: a public URL at
a showcase brings strangers, so I designed for friends and wrote rules for
everyone else. A room holds eight, the size of the original's network game,
which also lets no two people in a room share leathers
([`df43706`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/df43706)). Wilson argues that confrontation makes play in a room festive,
so a person who knocks you off is named when you meet again
([`5d9a973`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/5d9a973)). The
risk from strangers is someone spoiling the race, and three rules deal with it: a rider who gets nowhere in 45 s is
taken out, a flood of messages is dropped, and a race with nobody to beat
scores nothing. 4 of their 7 checks failed on the old server ([`68667a8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/68667a8)).

## Testing with several people

I ran crit 10's eight multi-user scenarios on the deployed app
([`f38c010`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/f38c010)). Scaled to two machines, two people queueing together were
never matched, so the app stays on one machine. A restart mid-race now ends the race as
"stopped" for everyone in it ([`cd00bef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/cd00bef)). At the crit, two
classmates raced from the URL while I read the log.

Loaded for the showcase, 48 scripted people reached 642 ms round trips at
p95, because each snapshot was turned into text once per person. Serialised once, the same 48 had 24 ms ([`8977c44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/8977c44), measured in
[`b85dd57`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/b85dd57)). Rerun on 7 November, 120 people in 15 races all got in, with
114 ms at worst and no stalls ([`11d50a9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/11d50a9)).

## Choosing the stack

One Node 24 process, WebSockets, SQLite on the Fly volume and three.js, with
the options in [decision 3](docs/decisions/0003-the-stack.md). The simulation
has to run identically on the server and in the browser, which rules out a
second language, and keys go up sixty times a second, which rules out
server-sent events. `node:sqlite` blocks the tick, and a 570 ms write stall
went away only with `synchronous = NORMAL` ([`82ae6e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-ruiquanqiao/commit/82ae6e7)). What one machine
leaves open is in [decision 2](docs/decisions/0002-who-may-do-what.md).

## How I worked with the agent

Research went to background agents with a brief and a file to fill, read
before anything was built on it. The agent rides every handling change and
shoots every screen change at both marking viewports. Corrections went into `CLAUDE.md` or `spec/`,
where the next session meets them. When a measurement of mine was wrong, the
next commit says so.
