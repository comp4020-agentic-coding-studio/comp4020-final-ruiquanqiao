# Knuckle Road

Fifteen motorbikes on one ridge road, and you can punch and kick whoever is
riding beside you. Knuckle Road remakes the arcade mode of *Road Rash* — EA's
1994 3DO game in its 1996 Windows port, the version known in China as 暴力摩托
and the one I played — as a race you share with whoever else is on the road
right now.

## What good means here

**It plays like the game I remember, and the record says so, not my memory.**
My first plan left out the police, both weapons and weapon snatching: it
described the game from an impression. So every mechanic of the original now
has a row in [the ledger](docs/ledger.md), with a source from the manuals and
player guides and a decision: copied, adapted with a reason, or left out with
a reason.

**Your bike answers your keys, not the network.** The server owns the race,
but each browser runs the same simulation for its own rider, so steering and
swings happen on the keypress; everyone else is interpolated, as Gabriel
Gambetta describes. The cost: the rider you punch is where the server says,
not quite where you see them ([decision 1](docs/decisions/0001-whose-word-counts.md)).

**There is always someone to hit.** A race with NPCs (scripted riders) fills
the grid to fifteen, so one visitor gets a full race; a humans-only race waits
for a second person. A room holds eight people, each in leathers no one else
there wears.

**Matched like a modern game.** You accept a match, everyone loads on one
screen showing each person's ping, and GO lands at the same moment in every
browser. Every race on the road can be watched at `/live`, and
`/leaderboard` ranks everyone who has raced.

**The road remembers you, and so does the server.** No accounts: your browser
is your rider ([decision 2](docs/decisions/0002-who-may-do-what.md)), a
top-three finish qualifies you on that road for good, and the server logs who
did what by name.

## Enforced, and judged

| Claim | How it is held |
|---|---|
| Every mechanic of the original has a sourced decision | `spec/ledger.test.ts` |
| The pools start, wait and take people in as described | `spec/lobby.test.ts` |
| A qualification, and the log, survive a restart | `spec/persistence.test.ts` |
| No one can steer another person's bike | `spec/lobby.test.ts` |
| It looks like the original | Judged frame beside frame against 137 screenshots |
| Handling feels right | Judged by riding it: every handling change is ridden in the browser, then the result is pinned as a number in `spec/` |
| It plays like the original | Judged against the ledger, row by row |

## What I left out

- **The career**: money, the bike shop, repair bills. A five-minute race
  should not leave you in debt tomorrow.
- **Free-text chat**: a public site would need a moderator.
- **Names, music and art from the original**: they are EA's.

## Sources

- The *Road Rash* manuals (Windows, 3DO, Saturn, Sega CD, Mega Drive) and
  GameFAQs guides by Jatin Bhatia, Arguro and fade84, cited per mechanic in
  [the ledger](docs/ledger.md); 137 screenshots measured in
  [the visuals file](docs/road-rash-visuals.md).
- Race music: "Exhilarate", "Riptide", "Cool Rock", "Hotrock" and "Neolith"
  Kevin MacLeod (incompetech.com), licensed under Creative Commons: By
  Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/. The
  club's crack: Kenney's Impact Sounds (CC0). All assets:
  [the inventory](client/public/assets/ASSETS.md).
- Gabriel Gambetta, [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html),
  for prediction and interpolation.
- Robin Sloan, [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020): why a game rebuilt for the people I play with is worth making.
