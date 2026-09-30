# The Road Rash ledger

This game is a remake of the arcade half ("Thrash") of **Road Rash**, EA's 1994
3DO game in its 1996 Windows port — the version Chinese players know as 暴力摩托
and the one I played. Every mechanic of that game has a row here, sourced, with
a decision against it. A mechanic that is not in this table has not been
considered yet, and nothing gets built from memory: a new mechanic is
researched and added here before any code is written for it.

`spec/ledger.test.ts` holds the table to its own rules:

- every row has a status of `built`, `planned` or `omitted`
- a `planned` row names the crit it is due by: `C8`, `C9`, `C10` or `final`
- a `built` row names the spec test that proves it, as `file › test name`, and
  that test exists
- an `omitted` row says why
- every source tag resolves to a URL in [Sources](#sources)

**Treatment** is `same` when the row is copied as the original has it, or
`adapted:` followed by what changes and why. Where versions of the game disagree,
the PC version wins; the others are only used where the PC manual is silent,
and the row says so.

A row whose source is `—` is a rule the original never needed — matchmaking, for
one — and must be `adapted:`, saying what it answers instead.

The research behind this table is in
[road-rash-research.md](road-rash-research.md), gathered on 30 Sep 2026 from the
manuals and FAQs listed at the end. It has the numbers, the differences between
versions and the conflicts between sources that the table only summarises.

## Structure

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| S1 | Big Game career: money, a bike shop, repair bills and fines, game over when broke | PCM, SATM | omitted | omitted: I chose the arcade mode alone. A career is a single-player economy, and it would make a race you join for five minutes carry a debt into tomorrow | — |
| S2 | Thrash: pick a level (1–5) and a track, race on a preset bike for that level; no money, no shop | PCM, SATM, FADE | planned | same | C8 |
| S3 | Thrash preset bikes per level: L1 Swallow, L2 Sport 450, L3 ZYX 750, L4 Raven N, L5 Assassino N | FADE | planned | adapted: five bikes of my own naming, with the originals' horsepower, weight and top speed | C8 |
| S4 | Finishing 1st–3rd qualifies you on that track; all five tracks qualified completes the level | PCM, ZHWP | built | same; qualifications are kept against the rider and survive across days | `spec/persistence.test.ts › keeps a rider and a qualification across a restart` |
| S5 | In Thrash, being Wrecked or Busted revokes your qualifications on the current level | SATM | planned | same | C9 |
| S6 | Five levels; each lengthens the courses, adds traffic and cops, toughens opponents | PCM, ZHWP | planned | same | final |
| S7 | Higher levels extend the same road rather than replacing it | ARGURO | planned | same | final |
| S8 | Street hub between races: sign-up board, shop, schmooze, restroom | PCM, 3DOM | planned | adapted: one lobby page with the matchmaking buttons, the rider's qualification board and the grudge list (O3); no shop, because there is no money | C8 |
| S9 | Named save files through Load / Save / Save As | PCM | built | adapted: nothing to manage — the rider is remembered by the browser, and everything saves as it happens | `spec/persistence.test.ts › keeps a rider and a qualification across a restart` |

## Multiplayer

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| N1 | Mano a Mano: up to 8 players over a network; the host picks the level and sets traffic on or off | PCM | planned | adapted: no host and no player cap. Matchmaking pools replace the host (N2, N3) | C8 |
| N2 | Host option LIMITED AI BIKERS | PCM | built | adapted: an AI pool. It gathers for 5 seconds, takes everyone who joins in that window, and fills the grid to 15 with AI riders | `spec/lobby.test.ts › takes everyone who joins in the five seconds after the first, and fills the grid to fifteen` |
| N3 | Host option HUMANS ONLY | PCM | built | adapted: a human pool. It gathers for 10 seconds and starts if two or more people are in it; alone, it keeps waiting, and each newcomer restarts the 10 seconds | `spec/lobby.test.ts › restarts the ten seconds for each newcomer, then races only the humans` |
| N4 | The track is chosen by majority vote of the players | PCM | built | same, and the level is voted the same way; a tie is broken at random. No balancing by level — a level-1 rider may race level 5 | `spec/lobby.test.ts › is run at the level most riders voted for` |
| N5 | Once a race starts, its riders leave matchmaking | — | built | adapted: added by me, since the original had no pool. People still waiting in a pool can watch a race in progress | `spec/lobby.test.ts › lets someone who joins after the start watch the race instead` |
| N6 | Upper-left indicator of every human's position, scrollable | PCM | planned | same | C9 |
| N7 | Chat: canned messages on F1–F8, free typing on F9; status events (busted, wrecked, quit) posted to it | PCM | planned | adapted: canned taunts and the status events only. Free text on an open public site would need moderation this game has no one to do | C9 |

## Riding

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| R1 | Steer left / right; accelerate; brake | PCM | planned | same | C8 |
| R2 | Separate lean input: turns more slowly but loses less speed | FADE, PCM | omitted | omitted: I played without ever touching a lean key, and the lean I remember came from the bike itself (R17). A second steering input would make the game I am remaking harder to recognise, not easier | — |
| R3 | Steer and lean together is a power slide: fastest turn, risks a crash | FADE, SATM | planned | adapted: no lean key. The bike leans on its own when it is steered hard at or near top speed, and that lean is where the sharper turn and the crash risk live | C8 |
| R4 | No gears; the rev counter is feedback only | FADE | planned | same | C8 |
| R5 | Races at 100+ mph; the fastest bikes reach about 180 | SATM | planned | same | C8 |
| R6 | Lighter riders are faster; heavier riders hit harder | 3DOM, SCDM | planned | same | C9 |
| R7 | A faster rider hitting you from behind pushes your speed up by as much as about 7 mph | ARGURO | planned | same | C9 |
| R8 | Nitrous on "N" bikes only: ten charges a race, one burst per press | PCM, SATM | omitted | omitted: Thrash hands out nitro bikes only at levels 4 and 5 (S3), and the speed build-up of R17 rewards clean riding instead. The level 4 and 5 bikes keep their top speeds without the burst | — |
| R9 | Oil, mud and ice patches make you skid | FADE | planned | same | final |
| R10 | Hills throw the bike into the air | FADE | planned | same | C9 |
| R11 | Pedestrians and traffic cones act as ramps; each obstacle always does the same thing | FADE | planned | same | final |
| R12 | Leaving the asphalt slows you; off-road trees crash you | FADE, PCM | planned | same | C8 |
| R13 | Falling off an unfenced cliff into the ocean wrecks you instantly | FADE, ARGURO | planned | same, on the tracks that have a coast | final |
| R14 | Roads fork; the shorter branch is the harder one | FADE | planned | same | final |
| R15 | Default keys: arrows ride, Home/PgUp lean, N nitro, D dismount, Ins punch or grab, Space backhand, Enter kick | PCM | planned | adapted: W throttle, S brake, A and D steer; J is the hand (punch, weapon swing, grab), K is the foot (kick). Backhand has no key of its own (C3). The phone layout carries the same actions | C8 |
| R16 | Configure Input remaps every control | PCM | planned | same | final |
| R17 | Speed builds towards the bike's top speed the longer you ride without being hit, crashing or stopping | — | planned | adapted: from the game as I played it, not from a manual. A hit, a crash or a stop knocks the build-up back, and it is felt as the road getting faster rather than read from a meter | C8 |

## Combat

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| C1 | Attacks aim automatically at the nearest opponent, shown in the Closest Opponent box | PCM, RR1M | planned | same | C8 |
| C2 | Punch drains the target's stamina; it takes several blows to put a rider down | PCM, SATM | planned | same | C8 |
| C3 | Backhand hits a rider behind or beside you, with or without a weapon | PCM, 3DOM | planned | adapted: J becomes a backhand by itself when the nearest opponent is beside or behind you, so the move survives without a third attack key | C9 |
| C4 | Kick shoves the target's bike sideways, into traffic or roadside objects | PCM, SATM, FADE | planned | same | C8 |
| C5 | Two weapons, club and chain; one held at a time, swung with the punch key; some riders start with one | PCM | planned | same | C9 |
| C6 | Snatching: press punch as an opponent winds up a weapon swing and it becomes yours | PCM, FADE, POSTER | planned | same. The PC manual gives no timing, so the window is taken from the Mega Drive sources: the short pause while the arm draws back | C9 |
| C7 | Cops carry clubs and are the easiest place to get one | POSTER, SATM | planned | same | C9 |
| C8 | Stamina at zero knocks the rider off; they run back to the bike | PCM | planned | same | C8 |
| C9 | A rider lying on the road can be run over | FADE | planned | same | C9 |
| C10 | Whether a stolen weapon carries into the next race | RR1FAQ | planned | adapted: the PC is undocumented here; I follow the Mega Drive rule that it does not | C9 |

## Meters and crashes

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| M1 | Stamina meter drains with each blow and slowly recharges when you avoid more | PCM, SATM | planned | same | C8 |
| M2 | A crash (car, obstacle, tree, knockdown) throws the rider; the bike lies where it fell; you steer the run back | PCM, SCDM | planned | same | C8 |
| M3 | D dismounts deliberately | PCM | planned | adapted: D steers now (R15), so dismounting needs another key, chosen once the controls have been played | final |
| M4 | Bike damage gauge drains with each crash, cannot be repaired in a race; empty means Wrecked and out of the race | PCM, SCDM | planned | same | C8 |

## Police

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| P1 | Stopping near a cop, by crashing or being pulled over, gets you Busted; the race is over for you | SATM, SCDM, ZHWP | planned | same | C9 |
| P2 | Motorcycle cops appear at fixed mile markers on each track and try to club you off or pull you over | ARGURO, FADE | planned | same | C9 |
| P3 | Cops are slow at the low levels | FADE | planned | same | final |
| P4 | AI riders are never Busted | FADE | planned | adapted: to decide by C9 alongside the AI's other advantages (O6). A rule that exempts only some riders reads differently once the riders beside you are people | C9 |
| P5 | Police roadblocks from level 4, passed on the centre line or over the sand mounds | FADE | planned | same | final |
| P6 | Cheat codes (XYZZY, then weapon, speed and police cheats) | CHEAT | omitted | omitted: in a shared race a cheat is a thing done to other people | — |

## Tracks and traffic

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| T1 | Five real Northern California roads, each with its own character | PCM | planned | adapted: fictional roads of my own, each given a character in the same spirit; one road for C8, five by the end | C8 |
| T2 | Course lengths per level, from about 5 miles at level 1 to about 17 at level 5 | JATIN | planned | same | C8 |
| T3 | No race timer and no progress bar: the course length is shown before the race and the odometer counts up | PCM | planned | same | C8 |
| T4 | Oncoming and same-direction traffic; drivers change lanes | FADE, 3DOM | planned | same | C9 |
| T5 | Cross traffic from side roads at intersections | CJH, PCM | planned | same | final |
| T6 | Pedestrians on and beside the road, and a flagger at the start who can be run over | 3DOM, CJH | planned | same | final |
| T7 | Host can turn traffic off | PCM | omitted | omitted: there is no host, and traffic is half of what the road does to you | — |

## Opponents

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| O1 | Fifteen riders; you start at the back of the pack | PCM, SATM | planned | adapted: humans and AI riders make up the fifteen in the AI pool (N2); humans are placed on the grid behind the AI | C8 |
| O2 | Eight named riders, each with a build, a starting bike and a blurb | JATIN, ARGURO | planned | adapted: my own characters, with the originals' spread of builds | C9 |
| O3 | Riders have friends and enemies; hit someone and they hold it against you | PCM, ARGURO | planned | adapted: grudges are kept between real people across races and days. Whoever knocked you off is remembered, and you are told when they are in the same race | C9 |
| O4 | The closest opponent's meter shows their mood: green won't start it, yellow neutral, red coming after you | SCDM | planned | adapted: the colour shows the grudge between you and that rider (O3). The PC manual is silent here; the Sega CD manual is the source | C9 |
| O5 | Opponents start fights over position and take cheap shots when they hold a grudge | PCM, GSKY | planned | same, for the AI riders | C9 |
| O6 | Rubber-banding: while you lead, the AI stays about 300 m behind; AI nitro is unlimited | FADE | planned | adapted: to decide by C9. Rubber-banding was built for one human against fourteen machines, and it is unclear what it should do with several humans on the road | C9 |
| O7 | Schmooze: talk to riders between races for tips and gossip | PCM | planned | adapted: the AI riders' pre-race lines, written by me | final |

## HUD and presentation

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| H1 | Instrument panel: damage gauge, stamina, position, distance to the closest opponent, speedometer, rev counter, odometer, closest opponent's name and stamina | PCM | planned | same | C8 |
| H2 | F10 toggles the dashboard | PCM | planned | same | final |
| H3 | A flag girl starts the race | 3DOM | planned | adapted: a flagger who waves the grid off | final |
| H4 | Four ways a race ends — qualified, placed, Wrecked, Busted — each with its own FMV clip | 3DOM, WP-3DO | planned | adapted: four ending screens drawn in the game's own style; there is no video | C8 |
| H5 | Licensed grunge soundtrack (14 A&M songs) in the menus, synthesised music during races | PCM, ZHWP | omitted | omitted: the songs are licensed to EA and cannot be republished | — |
| H6 | Resolution and detail-level options | PCM | omitted | omitted: the road is drawn at one fixed low resolution and scaled up, so there is nothing to trade | — |
| H7 | The name Road Rash, the riders, bike brands and track names | PCM | omitted | omitted: they are EA's. Mechanics are copied; names are my own, and the README credits the original | — |

## Sources

| Tag | Source | URL |
|---|---|---|
| PCM | Road Rash, Windows 95 manual (EA, 1996) | https://oldgamesdownload.com/wp-content/uploads/manuals/road-rash_win_manual_en_m4x.pdf |
| POSTER | Road Rash, 1996 PC manual and poster scan | https://archive.org/details/road_rash_1996_pc_manual |
| 3DOM | Road Rash, 3DO manual (1994) | https://archive.org/details/Road_Rash_1994_Electronic_Arts_US |
| SCDM | Road Rash, Sega CD manual (1995) | https://archive.org/details/Road_Rash_1995_Electronic_Arts_US |
| SATM | Road Rash, Saturn manual (1996), whose text is near-identical to the PC manual | https://archive.org/details/Road_Rash_1996_U |
| RR1M | Road Rash, Mega Drive manual (1991) | https://segaretro.org/images/9/99/Road_Rash_MD_US_Manual.pdf |
| RR1FAQ | snazzyhoppy, Road Rash Mega Drive FAQ | https://gamefaqs.gamespot.com/genesis/586425-road-rash/faqs/55386 |
| JATIN | Jatin Bhatia, Road Rash PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/30821 |
| ARGURO | Arguro, Road Rash 3DO/Saturn/PS/PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/76468 |
| FADE | fade84, Road Rash PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/31818 |
| WP-3DO | Wikipedia, Road Rash (1994 video game) | https://en.wikipedia.org/wiki/Road_Rash_(1994_video_game) |
| ZHWP | 中文维基百科,暴力摩托 | https://zh.wikipedia.org/zh-hans/暴力摩托 |
| CJH | 车家号,a player's memoir of the PC game | https://chejiahao.autohome.com.cn/info/7721200/ |
| GSKY | 游民星空,Road Rash game page | https://ku.gamersky.com/1996/Road-Rash/ |
| CHEAT | Cheatbook, Road Rash PC cheat list | https://www.cheatbook.de |
