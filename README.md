# Knuckle Road

Knuckle Road remakes the arcade mode of *Road Rash* (EA, 1996 Windows port,
known in China as 暴力摩托 and the version I played) as one race shared by whoever
is on the road right now. It is a racing game in which you can also punch and
kick whoever is riding beside you. W rides, A and D steer, J punches and K
kicks; on a phone the left thumb rides a stick and the right thumb fights.

To race another person, each of you presses the gold **Humans only** button,
then **Accept**. The room leaves ten seconds after the last of you joins, time
enough to reach a second window. **Race with NPCs** is for riding alone and
leaves five seconds after the first press.

## What good means here

A good race is a few friends in one room on one road. It races like a race,
the road and the riders look right, a punch lands with weight, each road's
music sets its mood, and nothing strange pulls anyone out of it.

Right means the game I played. Remakes usually keep a game's story and replace
its mechanics (Neill Hoch, 2020); I kept the mechanics, because the original is
no longer sold (Video Game History Foundation, 2023). My first plan, written
from memory, left out the police and both weapons, so every mechanic now has a
sourced row in [the ledger](docs/ledger.md) saying whether I copied, adapted or
left it out. The look is matched against 137 screenshots, the speed against
the original's dial.

A punch has weight only if it starts on the keypress. Bernier (2001) calls
deciding whose screen is believed "a game design decision", and I made Valve's
choice, as Gambetta describes: your browser runs the server's simulation for
your own rider and draws everyone else slightly behind. The cost, in
[decision 1](docs/decisions/0001-whose-word-counts.md), is that you punch where
the server says a rider is, a little off from where you saw them. Every frame
of a blow is checked for how it moves, and a club cracks on a helmet with a
recorded sound. Each road plays its own recorded rock track; the synthesised
loop it replaced sounded thin and made the five roads blur together.

Strange means what a player would notice: two bikes inside each other, a rider
stuttering as you pass, a race lost to a slow network. The first two are tests
now, and the netcode is ridden at 300 ms with 3% loss before it ships.

Wilson (2012) makes games "confrontational" because that makes play in a room
festive, and Shirky (2004) and Sloan (2020) argue for software made for a few
people. So a room holds eight, each in leathers nobody else there wears, NPCs
fill only the empty seats, and your browser is your rider, with no account
([decision 2](docs/decisions/0002-who-may-do-what.md)). Everyone starts on one
GO, anyone can watch at `/live`, whoever knocks you off is named the next time
you meet, and `/leaderboard` keeps everyone who has raced.

## Enforced, and judged

A test in `spec/` or a script on the deployed app holds every claim above
except the look and the music, which are judged: the look frame beside frame
against 137 screenshots, the music by ear. [The checks](docs/checks.md) list
which test or script holds which claim.

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
