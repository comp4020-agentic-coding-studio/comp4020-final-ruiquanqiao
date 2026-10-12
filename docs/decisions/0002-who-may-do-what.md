# 2. A person is a browser; they change only their own rider, and see the whole race

Accepted at crit 10.

## Context

The game is several people on one road, hitting each other. Each of them
needs to be someone the server can tell apart from everyone else, and the
server needs a rule for what each of them may change. The brief leaves both
calls to me: what counts as a person, and what each may see and change. They
have to hold on the server, because a page can be edited and a WebSocket can
be written to by hand.

## Options

1. **Accounts with a password.** The firmest way to tell people apart, and
   the only one that follows a person to another device. But every newcomer
   meets a sign-up form before a race, the server keeps passwords it has to
   protect, and two classmates handed the URL at a crit spend their minute
   registering.
2. **Sign in with someone else's account** (GitHub, Google). No passwords
   kept here, but it needs an app registered with each provider and a
   redirect that works on the Fly URL, and it asks a stranger who only wants
   to race for an identity they may not want to give a game.
3. **A name typed at the door, nothing else.** No form beyond one field, but
   nothing makes the second visit the same person as the first, so a
   qualification or a place on the leaderboard could be claimed by anyone who
   typed the same name.
4. **Chosen: an anonymous browser.** A cookie the server sets on the first
   visit is the person; the name on it is theirs to change.

## What counts as a person

**A browser.** The first visit to `/` sets an `HttpOnly` cookie holding 18
random bytes, good for a year (`server/main.ts`), and the server makes a
rider for it in the database. A WebSocket without that cookie is closed
before it can do anything. There is no sign-up: anyone with the URL can race
straight away, which is what a crit (two classmates, the URL alone, two Chrome
profiles) and a public game both need.

Names are not unique: two people can both call themselves Ana. In a race they
are still told apart by their leathers, which no two people in a room share
([ledger N13](../ledger.md)), and the logs name everyone as `Ana#11`, the name
and the rider number behind it, so two Anas are two lines.

## What each person may change

The server never takes a rider from what a browser sends. It takes it from
which connection sent the message, and that connection was given its rider by
the cookie.

| A person may | Checked by |
|---|---|
| Steer, brake and fight with **their own bike** | `in` carries keys and a sequence number, and nothing that names a rider. The server applies them to the bike it gave that connection when the race started (`conn.local`), and drops them from anyone not in a race |
| Rename **themselves** | `name` changes the rider behind the connection's cookie: trimmed, spaces collapsed, at most 20 characters |
| Join and leave **their own** queue; accept or decline **their own** match; leave **their own** race | each acts on `conn.pool`, `conn.match` and `conn.race`, which only the server sets. An answer from someone not in a match, or a quit from someone not in a race, does nothing |
| Vote on the road, the level and how many NPCs to race | a vote, not a choice: the road and level go to the majority, a tie at random, and the NPC count is the median of what the room asked, clamped to 0–29, so no one person decides for the others ([ledger N2, N4](../ledger.md)) |
| Watch any race | only while not racing or being matched |

| No one may | Because |
|---|---|
| Move, slow or stop anyone else's bike | there is nothing in any message to point at another rider |
| Decide a blow, a crash, a bust or the finish | the server's race decides them all ([0001](0001-whose-word-counts.md)), and a browser only predicts its own bike |
| Pick their leathers | the room deals them, so the same pair cannot be picked twice; a `look` in a message is ignored |
| Write a result, a qualification or a point | only the server's own end of a race writes to the database |

## What each person may see

**The whole race, and every race.** Where every bike is, its speed, stamina
and damage, and every rider's name and leathers go to everyone in the race and
everyone watching it. It is a race: hiding a rival's position would be hiding
the game. The rooms on the road (`/live`) and the leaderboard
(`/leaderboard`) are public for the same reason.

**Not the log.** The log ties every name to a rider number and to what they
did, second by second. It is printed for `flyctl logs` and kept in the
database, and it is read on the server (`node server/readlog.ts` over
`flyctl ssh console`). There is no URL for it.

## Why

It is the least anyone has to do to play, and it still gives every message
exactly one owner. An account system would tell people apart more firmly, but
no part of this game is worth protecting with a password: no one has anything
to lose but a place on a board, and an anonymous browser is what the brief
already allows.

## Held by

- `spec/lobby.test.ts › lets a person's keys move only their own bike, whatever else the message carries`
- `spec/lobby.test.ts › lets a person leave only their own race, and answer only their own match`
- `spec/lobby.test.ts › lets no one spectate while they are racing or being matched`
- `spec/lobby.test.ts › are not taken from the queue message, whatever it says` (leathers)
- `spec/lobby.test.ts › takes the median of what the pool asked for, up to the most allowed`
- `spec/lobby.test.ts › names every person in matchmaking and at the start, so two people can be told apart`

## What it costs

- **A person is only as lasting as their cookie.** Clearing it, or opening
  another browser or device, is a new rider, with none of the old one's
  qualifications or points, and there is no way to get them back.
- **Nothing proves a name.** Anyone can ride as anyone; the rider number in
  the log is the only thing that tells two of them apart.

## The strongest case against it

A cookie is easy to throw away, so anyone can start again with a clean name
and nothing on the leaderboard, and anyone can make many riders. Nothing here
stops one person from queuing in several tabs and racing several bikes. The
server already names those bikes `Ana (2)` and the log keeps them apart, but
it does not refuse them.
