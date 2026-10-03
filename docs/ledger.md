adapted: a CC0 photograph of a bright sky with scattered cumulus, in place of the flat periwinkle and cartoon clouds, which looked like an unfinished backdrop beside photographic ground
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
| C5 | Two weapons, club and chain; one held at a time, swung with the punch key; some riders start with one | PCM | built | same | `spec/traffic.test.ts › the chain reaches a rider a fist cannot, and a weapon hits harder than a fist (C5)` |
| C6 | Snatching: press punch as an opponent winds up a weapon swing and it becomes yours | PCM, FADE, POSTER | built | same. The PC manual gives no timing, so the window is taken from the Mega Drive sources: the pause while the arm draws back. Here that pause is 0.45 s against a fist's 0.14 s. A draw-back reaches the screen up to 0.05 s (snapshot spacing) plus 0.05 s (interpolation) plus one way of the network after it starts, and the J press needs the other way back; at the 16 ms round trip measured to the Fly app that leaves about 0.33 s to react in the worst case, against a typical 0.2 to 0.25 s. Pressed after the blow lands, J is only a punch | `spec/traffic.test.ts › punching while an opponent draws a weapon back takes it off them (C6)` |
| C7 | Cops carry clubs and are the easiest place to get one | POSTER, SATM | built | same | `spec/traffic.test.ts › a cop's club can be snatched the same way, and the cop rides on without it (C7)` |
| C8 | Stamina at zero knocks the rider off; they run back to the bike | PCM | planned | same | C8 |
| C9 | A rider lying on the road can be run over | FADE | planned | same | C9 |
| C10 | Whether a stolen weapon carries into the next race | RR1FAQ | built | adapted: the PC is undocumented here; I follow the Mega Drive rule that it does not | `spec/traffic.test.ts › some AI riders start armed, and every human starts empty-handed (C5, C10)` |

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
| P1 | Stopping near a cop, by crashing or being pulled over, gets you Busted; the race is over for you | SATM, SCDM, ZHWP | built | same | `spec/traffic.test.ts › stopping beside a cop is Busted, and the race is over for that rider (P1)` |
| P2 | Motorcycle cops appear at fixed mile markers on each track and try to club you off or pull you over | ARGURO, FADE | built | same | `spec/traffic.test.ts › a cop waits on the shoulder until a human comes by, then gives chase (P2)` |
| P3 | Cops are slow at the low levels | FADE | planned | same | final |
| P4 | AI riders are never Busted | FADE | built | same. Kept after weighing it against O6: the cops are the road's hazard for the people racing, and an AI rider pulled over would only thin the field they race against | `spec/traffic.test.ts › never busts an AI rider (P4)` |
| P5 | Police roadblocks from level 4, passed on the centre line or over the sand mounds | FADE | planned | same | final |
| P6 | Cheat codes (XYZZY, then weapon, speed and police cheats) | CHEAT | omitted | omitted: in a shared race a cheat is a thing done to other people | — |

## Tracks and traffic

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| T1 | Five real Northern California roads, each with its own character | PCM | planned | adapted: fictional roads of my own, each given a character in the same spirit; one road for C8, five by the end | C8 |
| T2 | Course lengths per level, from about 5 miles at level 1 to about 17 at level 5 | JATIN | planned | same | C8 |
| T3 | No race timer and no progress bar: the course length is shown before the race and the odometer counts up | PCM | planned | same | C8 |
| T4 | Oncoming and same-direction traffic; drivers change lanes | FADE, 3DOM | built | same | `spec/traffic.test.ts › keeps every car in a lane of its own direction for a whole race (T4)` |
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

## Contact

None of the research above asked what happens when a bike touches something,
and riding the first build through other bikes was how that showed. These rows
come from frame sheets of the PC playthroughs and the manuals and FAQs, in
[road-rash-collisions.md](road-rash-collisions.md). Where the PC footage could
not settle a question, the row says which source filled it.

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| K0 | Bikes are solid: no bike passes through another, on any screen | YT1 | built | same | `spec/contact.test.ts › never leaves two bikes overlapping, at any step of a full-field race` |
| K1 | Side contact between two riders shoves the other bike sideways without a crash, the same as a kick | RR3FAQ2, YT1 | built | same. Road Rash 3's FAQ states it; the PC footage agrees | `spec/traffic.test.ts › a gentle side rub shoves the other bike over without a crash (K1)` |
| K2 | A harder side rub, at a steeper angle or higher closing speed, puts the other rider down in a lean-and-slide knockdown, unlike the full throw off a car | YT1 | built | same | `spec/traffic.test.ts › a hard rub at speed puts the other rider down, and costs that bike nothing (K2, K6)` |
| K3 | Hitting a car or fixed obstacle head-on throws the rider clear of the bike in a spread-eagle tumble, with a flash on impact | YT1 | built | same | `spec/traffic.test.ts › meeting an oncoming car is a head-on crash (K3)` |
| K4 | After a crash the rider lies in the road while others ride past, then stands and jogs back to the bike | YT1, PCM | planned | same | C8 |
| K5 | Knocked off by another rider, the bike coasts on riderless, so the run back is longer than after a crash of your own | RR3FAQ2 | built | adapted: the PC footage does not show it; taken from Road Rash 3 because it makes a knockdown cost something different from a crash | `spec/traffic.test.ts › knocked off by another rider, the bike coasts on further than one its rider dropped (K5)` |
| K6 | A knockdown by an opponent costs no bike damage; only crashes do | RR3FAQ2 | built | adapted: from Road Rash 3, for the same reason as K5 | `spec/traffic.test.ts › a hard rub at speed puts the other rider down, and costs that bike nothing (K2, K6)` |
| K7 | Running into the back of slow traffic in your lane is nearly as damaging as a head-on crash | PCM | built | same, with T4 | `spec/traffic.test.ts › running into the back of a slower car is a crash, and costs about a head-on's damage (K7)` |
| K8 | The kick is for knocking a rival sideways into oncoming traffic | PCM | planned | same, once T4 puts traffic in the other lane | C9 |
| K9 | Each obstacle always does one of three things: nothing, a small jump, or a crash | RR3FAQ2, FADE | planned | same | final |
| K10 | Contact with a motorcycle cop or a blocking cop car is an instant bust; a parked roadblock car is not | RR3FAQ2 | built | adapted: touching a cop is not a bust, whichever way it goes; coming off the bike beside one is (P1). The PC footage never shows a cop collision, and from my own play of the PC version contact alone never got anyone busted, only a crash beside a cop did, so Road Rash 3's rule is not followed | `spec/traffic.test.ts › rubbing a cop is not a bust; coming off beside one is` |
| K11 | A downed rider and the separated bike stay in the lane as hazards for several seconds | YT1 | planned | same, with C9 | C9 |

## Look

The first renderer here was drawn from nothing: a dusk sky, red-and-white
kerbs, hand-drawn pixel riders, a web-page HUD. None of it came from the
game, because the research behind the rows above was text only. These rows
come from 137 screenshots of the PC and 3DO versions, measured in
[road-rash-visuals.md](road-rash-visuals.md). Fractions are of the screen.

| ID | Mechanic (PC 1996) | Source | Status | Treatment | Due / proof |
|---|---|---|---|---|---|
| V1 | Real 3D world: texture-mapped polygons for road, hills, buildings, cliffs and tunnels, drawn to the horizon with no fog | YT1, A2023 | planned | adapted: WebGL, with every texture generated in code rather than painted, since the originals are EA's | C8 |
| V2 | Low chase camera dead behind the rider; rider about 9% of screen width and 22% of height, centred; horizon at .33–.38; the camera never rolls | YT1 | planned | same | C8 |
| V3 | 640×480, 4:3 | A2023 | planned | adapted: the window's own shape, since both marking viewports are 16:9 or taller; the camera keeps the rider's size and the horizon's height | C8 |
| V4 | Low-resolution textures that break into big square texels near the camera | YT1 | planned | same, with nearest-neighbour filtering on small generated textures | C8 |
| V5 | Riders are pre-rendered 3D sprites in bright two-colour leathers and full-face helmets; the whole bike leans up to 30–40° | YT1, TE | planned | adapted: low-poly models built in code and lit in real time, in the same bright leathers; the same lean | C8 |
| V6 | Only the closest opponent is named, in the HUD; no names float over riders | YT1 | planned | same | C8 |
| V7 | A black glossy fairing arch over the bottom quarter: cream MPH and RPM dials, the position in a black box, the odometer beneath, a red-yellow-green bar, and both riders' names with curved stamina wedges; the closest opponent's distance in red ↑ or green ↓ | YT1, PCM | planned | same, laid out across a wider screen; the phone gets the same instruments over its touch controls | C8 |
| V8 | Tall condensed white type for every name and number in the HUD | YT1 | planned | same, in Oswald (SIL Open Font Licence), self-hosted | C8 |
| V9 | Purple-grey asphalt (#56505e), a double solid yellow centre line, white dashed lane lines, solid white edges, no kerbs or rumble strips | YT1 | planned | same | C8 |
| V10 | Brown dirt shoulders on rural roads, grey pavement in towns | YT1 | planned | same | C8 |
| V11 | A flat periwinkle sky (#94aefa) with hard-edged white cartoon clouds, the same on every track | YT1 | planned | same | C8 |
| V12 | One silhouette per track: city canyons, coastal cliff and sea, snow peaks and pines, hazy vineyard hills, green rolling hills | YT1, TE | planned | adapted: Ridge Road takes the alpine silhouette — jagged snow peaks, pine clumps, meadows, a guardrail on the outside of bends — without copying the Sierra Nevada's art | C8 |
| V13 | Crashes play in the game view: the bike tumbles free, the rider lands, stands and walks back to it | YT1, TE | planned | same | C8 |
| V14 | The winner crosses the line sitting up with both arms raised | YT1 | planned | same | C9 |
| V15 | A swing throws an arm straight out sideways; a chain is raised above the helmet | YT1, APOST | planned | same | C9 |
| V16 | Start: the picture darkened, a big white countdown in the road ahead; the finish is a chequered band across the road | YT1, A3DO | planned | same | C9 |
| V17 | Traffic and police are texture-mapped box models: grey sedans, a yellow taxi, a black-and-white patrol car, a white police bike | YT1, A2023 | planned | same, alongside T4 and P2 | C9 |
| V18 | Menus in claymation caricature and a corkboard with a pinned photo postcard per track; orange-red condensed titles (#f05030), a yellow arrow cursor | A2023, APOST | planned | adapted: the corkboard and postcards drawn by me, in the same type and colours; no claymation, which I cannot make | final |
| V19 | Race end: a spiked "WINNER" star, then a still with the finishing place | YT2 | planned | adapted: with H4, drawn rather than filmed | C9 |

## Sources

| Tag | Source | URL |
|---|---|---|
| YT1 | "Road Rash (1994) All Five Levels 1080p60 PC Full Gameplay", YouTube | https://www.youtube.com/watch?v=sJ0U2BYjDGQ |
| YT2 | "Road Rash for Windows 95", YouTube | https://www.youtube.com/watch?v=O0F7q3j33Zc |
| A2023 | Road Rash PC captures, archive.org | https://archive.org/details/road-rash_202307 |
| APOST | Road Rash 1996 PC poster, archive.org | https://archive.org/details/road_rash_1996_pc_manual |
| A3DO | Road Rash 3DO longplay, archive.org | https://archive.org/details/road-rash-panasonic-3-do-pal-60-gameplay-full-game-longplay |
| TE | Time Extension, Road Rash (3DO) | https://www.timeextension.com/games/3do/road_rash |
| PCM | Road Rash, Windows 95 manual (EA, 1996) | https://oldgamesdownload.com/wp-content/uploads/manuals/road-rash_win_manual_en_m4x.pdf |
| POSTER | Road Rash, 1996 PC manual and poster scan | https://archive.org/details/road_rash_1996_pc_manual |
| 3DOM | Road Rash, 3DO manual (1994) | https://archive.org/details/Road_Rash_1994_Electronic_Arts_US |
| SCDM | Road Rash, Sega CD manual (1995) | https://archive.org/details/Road_Rash_1995_Electronic_Arts_US |
| SATM | Road Rash, Saturn manual (1996), whose text is near-identical to the PC manual | https://archive.org/details/Road_Rash_1996_U |
| RR1M | Road Rash, Mega Drive manual (1991) | https://segaretro.org/images/9/99/Road_Rash_MD_US_Manual.pdf |
| RR3FAQ2 | Road Rash 3 (Mega Drive) FAQ, GameFAQs | https://gamefaqs.gamespot.com/genesis/586427-road-rash-3/faqs/29823 |
| RR1FAQ | snazzyhoppy, Road Rash Mega Drive FAQ | https://gamefaqs.gamespot.com/genesis/586425-road-rash/faqs/55386 |
| JATIN | Jatin Bhatia, Road Rash PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/30821 |
| ARGURO | Arguro, Road Rash 3DO/Saturn/PS/PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/76468 |
| FADE | fade84, Road Rash PC FAQ | https://gamefaqs.gamespot.com/pc/198492-road-rash/faqs/31818 |
| WP-3DO | Wikipedia, Road Rash (1994 video game) | https://en.wikipedia.org/wiki/Road_Rash_(1994_video_game) |
| ZHWP | 中文维基百科,暴力摩托 | https://zh.wikipedia.org/zh-hans/暴力摩托 |
| CJH | 车家号,a player's memoir of the PC game | https://chejiahao.autohome.com.cn/info/7721200/ |
| GSKY | 游民星空,Road Rash game page | https://ku.gamersky.com/1996/Road-Rash/ |
| CHEAT | Cheatbook, Road Rash PC cheat list | https://www.cheatbook.de |
