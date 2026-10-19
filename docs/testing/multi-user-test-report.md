# Multi-user test report

Run on 19 October 2026 (crit 10) against the deployed app,
`https://comp4020-final-ruiquanqiao.fly.dev`, deploy of commit `69507cb`.
All times are UTC, as the log's own are.

## How it was run

Each scenario was driven by scripted people, each holding a cookie of its own,
so that to the server each is a separate browser. They connect with `?probe=1`,
which keeps them off the leaderboard (N12). While they ran, the server's log
was tailed with `flyctl logs -a comp4020-final-ruiquanqiao`. The quoted lines
below come from that tail, with the date and the `at` field cut down to the
time.

| Scenarios | Script |
|---|---|
| a–f | `node scripts/multiuser.ts <url> <tag>` |
| g | `flyctl scale count 2`, then `node scripts/scale.ts <tag>` |
| h | `FLY=… MACHINE=… node scripts/restart.ts <tag>` |

The tag goes in front of every name, so one run's people can be found in the
log. The a–f run quoted here is tag `T4`. Its script printed `every check passed`.

## What the log has to say

Every line names a person as `Name#rider`. The name is the one they chose and
the number is their row in the database, so two people with the same name are
still two different people.

| Event | Log lines |
|---|---|
| User connects / disconnects | `connect`, `disconnect` |
| User joins / leaves a room | `queue`, `unqueue`, `match_found`, `accept`, `decline`, `race_start` (maps every bike number to a person), `quit`, `watch`, `unwatch`, `race_end` |
| Server receives an action | every action that changes something is logged as itself: `rename`, `queue`, `accept`, `quit`, `watch` |
| Server broadcasts an update | the race events that involve a person: `hit`, `crash`, `busted` and so on, each naming everyone in it |
| Server rejects an action | `reject`, with `who`, `action` and `why` (added for this test) |
| Server sends one user a snapshot of the state | `snapshot`, with `kind` `hello` on connecting or `race` when they start watching (added for this test) |

Two things are deliberately not logged, and both are written down here so that
nobody mistakes the gap for an oversight:

- **Each key press (`in`) and each 20 Hz snapshot of a race.** Every racer sends
  `in` at least four times a second, and every race sends snapshots twenty
  times a second, to everyone in it. Logging either would bury the lines that
  say who did what. Only an `in` that is *refused* is logged, as a `reject`.
- **Events in which no person takes part.** An NPC hitting another NPC is an
  example. Fifteen NPCs produced a line every few tenths of a second
  (crit 10 reflection).

The same reject repeated is logged once per person, action and reason every
five seconds. A page that sends a stale sequence number every frame writes one
line, not hundreds.

## Scenarios

### a) Two users join

**Expected:** two browsers get two different riders, and the log tells them
apart.

**Observed:** passed. The script saw `T4 Ana#69` and `T4 Ben#70`.

```
03:28:17.022 {"ev":"rename","who":"T4 Ana#69","was":"Rider 3859#69"}
03:28:17.075 {"ev":"rename","who":"T4 Ben#70","was":"Rider 4212#70"}
```

A first connect is logged under the name the server gives a new rider
(`Rider 3859`). The `rename` line ties that name to the one the person chose.

### b) One user's action reaches the users it concerns

**Expected:** Ana rides and Ben holds still. Ben's snapshots show Ana's bike
moving and his own bike standing.

**Observed:** passed. Over four seconds, Ben's snapshots showed Ana's bike go
from z 16 m to 119.32 m, while his own speed stayed at 0 m/s. Ana's keys only
ever move her own bike: the server takes the bike from the connection, never
from the message (decision 0002).

```
03:28:29.311 {"ev":"race_start","race":119,"match":7,"mode":"human","level":1,"road":"Ridge Road","riders":{"0":"T4 Ben#70","1":"T4 Ana#69"},"npcs":0,…}
03:28:44.493 {"ev":"crash","race":119,"t":12.2,"rider":"T4 Ana#69","cause":"tree"}
```

### c) Simultaneous action, within the same second

**Expected:** both people queue in the same millisecond and accept the match in
the same millisecond. Both accepts are counted, and one race starts with both
of them in it.

**Observed:** passed. The two `queue` lines are 1 ms apart and the two `accept`
lines are 43 ms apart. The second accept reads `accepted 2 of 2`, so neither
was lost to the other. The server runs on a single Node thread, so two
messages are always handled one after the other, never interleaved.

```
03:28:17.140 {"ev":"queue","who":"T4 Ben#70","mode":"human",…,"pool":1}
03:28:17.141 {"ev":"queue","who":"T4 Ana#69","mode":"human",…,"pool":2}
03:28:27.264 {"ev":"accept","who":"T4 Ana#69","match":7,"accepted":1,"of":2}
03:28:27.307 {"ev":"accept","who":"T4 Ben#70","match":7,"accepted":2,"of":2}
```

### Rejected actions

**Expected:** an action the server refuses changes nothing and is logged with
the reason. The script tried three: Ana sends a key with an old sequence
number, Ben steers and quits after his race has gone on without him, and Cat
quits a race she was only watching.

**Observed:** passed. Each refusal is one line.

```
03:28:36.952 {"ev":"reject","who":"T4 Ana#69","action":"input","why":"stale sequence","seq":1,"last":74}
03:28:52.711 {"ev":"reject","who":"T4 Ben#70","action":"input","why":"not racing"}
03:28:52.711 {"ev":"reject","who":"T4 Ben#70","action":"quit","why":"not racing"}
03:28:53.720 {"ev":"reject","who":"T4 Cat#71","action":"quit","why":"not racing"}
```

### d) A late user joins

**Expected:** someone who arrives with a race already running is sent the list
of races, can watch one as it stands, and is given no bike.

**Observed:** passed. Cat's first message listed race 119 with both riders. Her
`watch` came back with the race 4.9 s in, and `you: null`.

```
03:28:37.175 {"ev":"watch","who":"T4 Cat#71","race":119}
03:28:37.175 {"ev":"snapshot","who":"T4 Cat#71","kind":"race","race":119,"riders":3,"raceT":4.9}
```

### e) Leave and return (tab closed)

**Expected:** Ben closes his tab in the middle of the race. His bike stands as
"left" and the race goes on for Ana. When he opens the page again he is the
same person, because his cookie is.

**Observed:** passed. He came back as `#70` and the room list showed his bike
as out.

```
03:28:51.433 {"ev":"quit","who":"T4 Ben#70","race":119}
03:28:51.434 {"ev":"disconnect","who":"T4 Ben#70"}
03:28:52.647 {"ev":"connect","who":"T4 Ben#70","probe":true}
03:28:52.648 {"ev":"snapshot","who":"T4 Ben#70","kind":"hello","races":2}
```

A tab that is closed outright is seen at once: a killed process was logged as
`disconnect` 1.5 s after it connected. A clean close handshake through Fly's
proxy took about 5 s to reach the server. The first run of the script
reopened Ben within that window and wrongly reported a failure. The script now
waits for the socket to close, as a person reopening a tab would.

### f) Isolated rooms

**Expected:** Dan races the NPC pool alone while Ana and Ben race each other.
Each race is sent only to the people in it.

**Observed:** passed. Two races ran, 119 and 120. Ana received nothing of race
120. Once his own race had started, Dan received nothing of race 119.

```
03:28:44.855 {"ev":"race_start","race":120,"match":8,"mode":"ai",…,"riders":{"0":"T4 Dan#72"},"npcs":2,…}
03:28:53.732 {"ev":"race_end","race":119,"secs":21,"standings":[["T4 Ana#69",1,"quit"],["T4 Ben#70",2,"quit"]]}
03:28:53.734 {"ev":"race_end","race":120,"secs":6,"standings":[["T4 Dan#72",3,"quit"]]}
```

Two earlier runs reported Dan receiving race 119. Both were the test's fault,
not a leak. While he waits in the queue, Dan is shown the newest race on
purpose (N5), so the check has to start at his own race. The second run
measured from the clock time of his `start` message, which counted a snapshot
that arrived in the same millisecond. The check now goes by the order of
arrival.

### g) Two machines, two users on different machines

**Expected, from the code before running it:** this fails. The lobby, the
pools and every race live in one machine's memory, and the database is a
SQLite file on that machine's own volume.

**Observed:** it fails, in two ways. I scaled with
`flyctl scale count 2 --region syd`, which also created a second 1 GB volume,
and started the second machine. Eight new people then connected. Fly's proxy
spread them four and four, and each machine numbered its riders from its own
database (`#1`–`#4` against `#73`–`#76`).

1. **People on different machines cannot meet.** `G1 P0#1` and `G1 P2#73`
   queued for a race with people at the same moment. Each saw a pool of 1, and
   in 15 s neither was matched. Each machine logged only its own person:

   ```
   0807d7df99d178 {"ev":"queue","who":"G1 P0#1","mode":"human",…,"pool":1}
   080556db992698 {"ev":"queue","who":"G1 P2#73","mode":"human",…,"pool":1}
   ```

2. **One person becomes two.** One cookie, reconnecting eight times, was
   `Rider 3162#5` on one machine and `Rider 8516#77` on the other, alternating
   from one connection to the next. This is the worse failure. The rule that
   the app tells people apart breaks in the other direction: it splits one
   person in two, with two names and two records.

**Decision:** the app runs on exactly one machine. CI deploys with
`--ha=false` for that reason. After this test I destroyed the second machine
and its volume, and checked that one machine and one volume were left. Running
on more than one machine would need every connection sent to one primary, for
example with Fly's `fly-replay` header, so that all state stays in one
process. It is not worth it at this app's size: one process carried a full room,
8 scripted racers and 21 NPCs, in the load test of `ec670b8`.

### h) Machine restarted mid-session

**Expected:** a race in progress is lost, because it lives in memory. The
people in it are dropped and the page reconnects. Their identity and the log
survive, because both are in the database on the volume.

**Observed:** as expected. Ana and Ben were 5.1 s into race 121 when I ran
`flyctl machine restart 080556db992698`. The server got SIGINT and exited
cleanly, and the new process was listening 3.3 s later:

```
03:31:49 INFO Sending signal SIGINT to main child process w/ PID 646
03:31:53.212 {"ev":"listening","port":8080,"data":"/data"}
03:31:55.310 {"ev":"connect","who":"H1 Ben#79","probe":true}
03:31:55.315 {"ev":"snapshot","who":"H1 Ben#79","kind":"hello","races":0}
03:32:03.210 {"ev":"connect","who":"H1 Ana#78","probe":true}
03:32:03.320 {"ev":"reject","who":"H1 Ana#78","action":"input","why":"not racing"}
```

- Both came back as themselves (`#78`, `#79`) from their cookies.
- Race 121 was gone: no snapshot of it after the restart, the room list was
  empty, and **no `end` message ever reached either browser**. A page in the
  middle of a race shows "Connection lost" and nothing more. Ana kept sending
  keys and was refused as `not racing`.
- **Race 121 has no `race_end` line.** The kept log ends at its `race_start`.
  Reading the log after a restart, a race with a start and no end is one the
  restart took.
- Ben was back 1.1 s after his socket dropped. Ana took 11.4 s. Her first
  attempt landed while the proxy logged
  `instance refused connection … 0.0.0.0:8080`, in the two seconds before the
  new process was listening, and most likely waited out a proxy retry.
- The kept log survived. After the restart, `node server/readlog.ts --about H1`,
  run on the machine, printed every line from 03:31:27 onward, including the
  ones written before the restart.

**Fixed, and run again** (`cd00bef`, ledger N15). On SIGINT or SIGTERM the
server now ends every race on the road before it exits. Each person's outcome
is `aborted`, an `end` carrying the reason goes to everyone racing or
watching, `race_end` is logged with `aborted`, and the sockets close with
1012 (service restart). The page shows "Race stopped" and reconnects by
itself. An aborted race is not written to the leaderboard. A restart 5.0 s
into race 126:

```
03:47:11.804 H3 Ana is sent the end of race 126: aborted, aborted: server restarting
03:47:11.807 H3 Ben is sent the end of race 126: aborted, aborted: server restarting
03:47:16.967 H3 Ben's socket closed, code 1012 (server restarting)
03:47:19.551 H3 Ben back as H3 Ben#88
```

The server's own line for the previous run, race 125, shows the log now
closes the race:

```
03:46:00.195 {"ev":"race_end","race":125,"secs":6,"aborted":"server restarting","standings":[["H2 Ana#85",1,"aborted"],["H2 Ben#86",2,"aborted"]]}
```

That run's script reported no end message, and it was wrong. It only looked
at messages that arrived after the socket closed, and the end arrives before
the close. The script now looks at everything from the moment of the restart.
Both people were back 2.6 s after the close, against 1.1 s and 11.4 s before.
These numbers depend on when the reconnect lands relative to the new process
starting to listen, not on this change.

## Summary

| | Scenario | Result |
|---|---|---|
| a | two users join | passed |
| b | an action reaches the users it concerns | passed |
| c | simultaneous action | passed |
| – | rejected actions are logged | passed (the logging was added for this test) |
| d | a late user joins | passed |
| e | leave and return | passed |
| f | isolated rooms | passed |
| g | two machines | **fails, as predicted**: people cannot meet, and one person becomes two. The app stays on one machine. |
| h | restart mid-session | the race is lost, and identity and the log survive. At first the race was left with no ending, in the page and in the log. **Fixed:** it now ends as `aborted` for everyone in it. |

The pod's own run at the crit, with two people in two Chrome profiles and me
narrating from `flyctl logs`, is recorded in `reflections/crit-10.md`.
