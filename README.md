# Knuckle Road

Fifteen motorbikes on one ridge road, and you can punch and kick whoever is
riding beside you. Knuckle Road remakes the arcade mode of *Road Rash* (EA,
1996 Windows port, known in China as 暴力摩托 and the version I played) as one
race shared by whoever is on the road right now. W rides, A and D steer, J
punches and K kicks; on a phone the left thumb rides a stick and the right
thumb fights.

To race another person, each of you presses the gold **Humans only** button
and then **Accept**. The room waits ten seconds after the last of you joins, so
there is time to get to the second window. **Race with NPCs** is for riding on
your own: it leaves five seconds after the first press and takes only whoever
joined in that time.

## What good means here

I wanted the game as its manuals describe it, because my first plan, written
from memory, left out the police, both weapons and weapon snatching. Neill Hoch
(2020) finds that remakes usually keep a game's story and replace its
mechanics, so I kept the mechanics. Every
mechanic has a row in [the ledger](docs/ledger.md) with a source and a
decision (copied, adapted or left out) and its reason. Like most games of its
age, the original is no longer sold (Video Game History Foundation, 2023).

Your bike should answer your keys at once. Bernier (2001) says who gets
believed when two screens disagree "is a game design decision", and I made
Valve's choice: each browser runs the server's simulation for its own rider,
so a steer or a swing happens on the keypress, and everyone else is drawn
slightly behind, as Gambetta describes. [Decision 1](docs/decisions/0001-whose-word-counts.md)
records the price: you punch where the server says a rider is, which is not
quite where you saw them.

It should be more fun with a person in the next chair. Wilson (2012) makes
games "confrontational" on purpose, because that makes play in a room festive,
and Road Rash was already that kind of game. A room holds eight people, each in leathers
nobody else there wears. NPCs fill only the empty seats, so one visitor still
gets a full grid. Everyone starts on the same GO, anyone can watch at `/live`,
and whoever knocks you off is named the next time you share a road.

It is small on purpose, like Shirky's (2004) software for "dozens of users"
and Sloan's (2020) app that nobody else will use; this one is for a room of
friends. Your browser is your rider
([decision 2](docs/decisions/0002-who-may-do-what.md)). A top-three finish
flags that road on your Qualified board until you wreck or get busted on that
level, and `/leaderboard` lists everyone who has raced, however it went, so
whoever you raced is still there the next day.

## Enforced, and judged

| Claim | How it is held |
|---|---|
| Every mechanic has a sourced decision, none overdue | `spec/ledger.test.ts` |
| A steer in one browser shows in another within a second | `spec/realtime.test.ts` |
| Other bikes are drawn as they moved, however late snapshots come | `spec/netview.test.ts`, on arrivals recorded live |
| No one can steer another person's bike; a room holds eight | `spec/lobby.test.ts` |
| Everyone who raced is on the leaderboard, and it, the qualifications and the log survive a restart | `spec/persistence.test.ts` |
| Every page passes axe, and every link here opens | `spec/a11y.test.ts`, `spec/readme.test.ts` |
| A blow moves like one on every frame, between its key poses as well | `spec/motion.test.ts`, and a contact sheet of every frame before it ships |
| Every helmet goes with its leathers | `spec/liveries.test.ts` |
| It looks like the original | Judged frame beside frame against 137 screenshots, each judgement in a commit |
| It handles like the original | Judged by riding, then pinned as numbers in `spec/feel.test.ts` |
| It holds up over a bad network | Ridden at 300 ms with 3% loss, and with 8 scripted people |
| It works from the keyboard alone, and survives a resize mid-race | `scripts/rough.ts` on the deployed app |

## What I left out

- The career mode's money, shop and repair bills, because a five-minute race
  should not leave you in debt the next day.
- Accounts. The cost is that if you clear your browser, your qualifications go
  with it.
- Free-text chat, because a public site would need someone to moderate it.
- EA's names, music and art.

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
