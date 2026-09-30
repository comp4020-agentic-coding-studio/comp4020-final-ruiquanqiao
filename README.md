# Knuckle Road

Fifteen motorbikes on one ridge road, and you can punch and kick whoever is
riding beside you. Knuckle Road remakes the arcade mode of *Road Rash* — EA's
1994 3DO game in its 1996 Windows port, the version known in China as 暴力摩托
and the one I played — as a race you share with whoever else is on the road
right now.

## What good means here

**It plays like the game I remember, and the record says so, not my memory.**
My first plan for this remake left out the police, both weapons and weapon
snatching: it described the game from an impression. So every mechanic of the
original now has a row in [the ledger](docs/ledger.md), with a source from the
manuals and player guides and a decision — copied, adapted with a reason, or
left out with a reason. Where my hands remember it differently from the
manual, my hands win and the row says so: there is no lean key and no nitro,
because I never used either; the bike leans when you steer hard at speed, and
it gets faster the longer you ride clean.

**Your bike answers your keys, not the network.** The server owns the race,
but each browser runs the same simulation for its own rider, so steering and
swings happen on the keypress. Everyone else is drawn a tenth of a second in
the past, between two real positions, as Gabriel Gambetta describes. That
costs something real: the rider you punch is where the server says, not
quite where you see them.

**There is always someone to hit.** A race with AI starts five seconds after
the first rider queues and fills the grid to fifteen, so one visitor gets a
full race. A humans-only race waits for a second person. People waiting watch
the race already on the road.

**The road remembers you.** No accounts: your browser keeps your rider, and a
top-three finish qualifies you on that road at that level for good.

## Enforced, and judged

| Claim | How it is held |
|---|---|
| Every mechanic of the original has a sourced decision | `spec/ledger.test.ts` |
| The pools start, wait and take people in as described | `spec/lobby.test.ts` |
| A qualification survives a restart | `spec/persistence.test.ts` |
| The road is where the simulation says: a right-hand bend turns right, a metre is a metre | `spec/world.test.ts` |
| It looks like the original | Judged against 137 screenshots of it, frame beside frame |
| Handling feels right | Judged by riding it: every handling change is ridden in the browser, then the result is pinned as a number in `spec/` |
| It plays like the original | Judged against the ledger, row by row |

## What I left out

- **The career**: money, the bike shop, repair bills, going broke. A race you
  join for five minutes should not leave you in debt tomorrow.
- **Free-text chat**: a public site would need someone to moderate it.
- **Names, music and art from the original**: they are EA's. The mechanics
  are copied; the riders, bikes and roads are mine.

## Sources

- The *Road Rash* manuals for Windows (1996), 3DO (1994), Saturn and Sega CD,
  the Mega Drive manuals, and GameFAQs guides by Jatin Bhatia, Arguro and
  fade84. Each is cited per mechanic in [the ledger](docs/ledger.md), and my
  notes on them are in [the research file](docs/road-rash-research.md). How it
  looks is measured off 137 screenshots of the PC and 3DO versions in
  [the visuals file](docs/road-rash-visuals.md).
- Gabriel Gambetta, [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html),
  for predicting your own rider and interpolating everyone else.
- Robin Sloan, [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020), for why a game rebuilt for the people I would play it with is worth
  making at all.
