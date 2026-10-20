# Knuckle Road

Fifteen motorbikes on one ridge road, and you can punch and kick whoever is
riding beside you. Knuckle Road remakes the arcade mode of *Road Rash*, EA's
1994 game in its 1996 Windows port, the version known in China as 暴力摩托 and
the one I played, as a race shared by whoever is on the road right now. Press
**Race with NPCs** and accept the match. W rides, A and D steer, J punches, K
kicks; a phone has the same keys on screen.

## What good means here

**The game as recorded, not as remembered.** Remakes usually keep a game's
story and replace its mechanics; Neill Hoch (2020) calls that nostalgia
rather than reproduction. I keep the mechanics. My first plan, written from
memory, left out the police, both weapons and weapon snatching, so every
mechanic of the original now has a row in [the ledger](docs/ledger.md), with
a source from the manuals and guides and a decision: copied, adapted with a
reason, or left out with one. The original is sold nowhere today, like most
games of its age (Video Game History Foundation, 2023).

**Your bike answers your keys.** Bernier (2001) put it plainly: who is
believed when two screens disagree "is a game design decision". Mine is
Valve's. Each browser runs the server's simulation for its own rider, so a
steer or a swing happens on the keypress, and everyone else is drawn behind,
as Gambetta describes. The cost is written down in
[decision 1](docs/decisions/0001-whose-word-counts.md): you punch where the
server says a rider is, not quite where you saw them.

**More fun with the person in the next chair.** Wilson (2012) designs games
that are "confrontational" on purpose, because they make play festive in a
room. Road Rash already is one. A room holds eight people, each in leathers no
one else there wears; NPCs fill only the empty seats, so one visitor
still gets the original's full grid, and each person who joins takes an NPC's
place. Everyone starts on one GO, anyone can watch at `/live`, and whoever
knocks you off is named the next time you share a road.

**Small on purpose.** Shirky (2004) wrote software for "dozens of users", and
Sloan (2020) an app nobody else will use. This is for a room of friends: your
browser is your rider ([decision 2](docs/decisions/0002-who-may-do-what.md)),
a top-three finish qualifies you on that road for good, and `/leaderboard`
ranks everyone who has raced.

## Enforced, and judged

| Claim | How it is held |
|---|---|
| Every mechanic has a sourced decision, none left overdue | `spec/ledger.test.ts` |
| A steer in one browser shows in another within a second | `spec/realtime.test.ts` |
| Other bikes are drawn as they really moved, however late snapshots come | `spec/netview.test.ts`, replaying arrivals recorded from the live server |
| No one can steer another person's bike; a room holds eight | `spec/lobby.test.ts` |
| A qualification, the leaderboard and the log survive a restart | `spec/persistence.test.ts` |
| Every page passes axe, and every link here opens | `spec/a11y.test.ts`, `spec/readme.test.ts` |
| It looks like the original | Judged frame beside frame against 137 screenshots; each Look row names the commit that records it |
| It handles like the original | Judged by riding it, then pinned as numbers measured off a recorded race in `spec/feel.test.ts` |
| It holds up over a bad network | Ridden through 300 ms with 3% loss and 8 scripted people at once; the numbers are in the commits |

## What I left out

- **The career** of money, a shop and repair bills: a five-minute race should
  not leave you in debt tomorrow.
- **Accounts.** The cost: clear your browser and your qualifications go with it.
- **Free-text chat**: a public site would need a moderator.
- **EA's names, music and art.**

## Sources

- The *Road Rash* manuals and GameFAQs guides, cited per mechanic in
  [the ledger](docs/ledger.md); 137 screenshots measured in
  [the visuals file](docs/road-rash-visuals.md).
- Y. Bernier (2001), [Latency Compensating Methods in Client/Server In-game Protocol Design and Optimization](http://web.cs.wpi.edu/~claypool/courses/4513-B03/papers/games/bernier.pdf), Game Developers Conference.
- G. Gambetta, [Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html).
- I. Neill Hoch (2020), [Nostalgia for the New: Video Game "Remakes" and the Limits of Reflection](https://spir.aoir.org/ojs/index.php/spir/article/view/11286), AoIR Selected Papers.
- C. Shirky (2004), [Situated Software](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html).
- R. Sloan (2020), [An app can be a home-cooked meal](https://www.robinsloan.com/notes/home-cooked-app/).
- Video Game History Foundation (2023), [87% Missing](https://gamehistory.org/87percent/).
- D. Wilson (2012), [Designing for the Pleasures of Disputation](https://worrydream.com/refs/Wilson_D_2012_-_Designing_for_the_Pleasures_of_Disputation.pdf), PhD thesis, IT University of Copenhagen.
- Music: "Exhilarate", "Riptide", "Cool Rock", "Hotrock" and "Neolith", Kevin
  MacLeod (incompetech.com), licensed under Creative Commons: By Attribution
  4.0 License, http://creativecommons.org/licenses/by/4.0/. The club's crack:
  Kenney's Impact Sounds (CC0). All assets:
  [the inventory](client/public/assets/ASSETS.md).
