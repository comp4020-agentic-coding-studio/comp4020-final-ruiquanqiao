# Road Rash: how it looks

The visual half of [road-rash-research.md](road-rash-research.md), and the
source for the Look section of [the ledger](ledger.md). The screenshots it was
measured from are EA's and are not redistributed here; each is named by the
file it was saved as locally and by the page or video it came from, listed
under Sources.

- File names start with `pc-` or `3do-`, then `race`, `menu`, `end` or `fmv`, then the track.
- Fractions are measured on the frame. For example, x .50 / y .75 means half-way across and three-quarters of the way down.
- Hex colours were sampled from 3x3-pixel averages. They are approximate, because the sources are YouTube and JPEG captures.
- Measurements are taken on the 960x720 PC frames (4:3, cropped from 1280x720) unless noted.

## Sources

| Key | URL | Files |
|---|---|---|
| YT1 | https://www.youtube.com/watch?v=sJ0U2BYjDGQ ("Road Rash (1994) All Five Levels 1080p60 PC Full Gameplay") | Every `pc-*.jpg` whose HUD reads **UnbiasedPlayer**. Frames extracted with ffmpeg from the 720p stream and cropped to 4:3. |
| YT2 | https://www.youtube.com/watch?v=O0F7q3j33Zc ("Road Rash for Windows 95 (Papyrus Design Group, 1996)") | Every `pc-*.jpg` whose HUD reads **Player1**: city-07, city-cop-02, sierra-03/04/05, sierra-town-01, peninsula-pedestrian-01, peninsula-03, napa-03/04, pacific-04, pacific-tunnel-02, pacific-tunnel-mouth-01, pacific-town-02, the fmv-* stills, end-winner-02, end-winner-logo-01, end-winner-three-bikers-02, menu-bulletin-city-03. 360p, so these are softer. |
| OGD | https://oldgamesdownload.com/road-rash/ | pc-race-city-01/02/03.png (PC captures upscaled to 1433x1080) |
| AFIX | https://archive.org/details/road_rash_pc_fixed | pc-race-city-f10-minimal-hud-01.png |
| A2023 | https://archive.org/details/road-rash_202307 | pc-race-city-cop-bike-01, pc-race-city-pedestrian-crosswalk-01, pc-race-city-start-grid-01, pc-menu-bulletin-board-city-01, pc-menu-title-screen-01 (.png, 640x480 except the title at 1280x800) |
| ADEMO | https://archive.org/details/rashdemo | pc-race-sierra-demo-01.jpg (400x300) |
| APOST | https://archive.org/details/road_rash_1996_pc_manual (Poster_back_text.pdf) | pc-poster-full-100dpi, pc-race-city-hud-annotated-poster, pc-race-sierra-chain-fight-poster, pc-menu-street-hub-poster, pc-menu-bulletin-postcards-poster, pc-menu-schmooze-poster |
| AMAN | https://oldgamesdownload.com/wp-content/uploads/manuals/road-rash_win_manual_en_m4x.pdf | pc-manual-p12-instrument-panel.png |
| ABOX | https://archive.org/details/road-rash-us-1997-win-1.0a-unknown-release | pc-box-CD.jpg (official disc art); pc-box-Jewel_Case_Front.jpg, pc-box-Instructions*.jpg (a homemade repack insert, not EA art, so do not use it as a style reference) |
| A3DO | https://archive.org/details/road-rash-panasonic-3-do-pal-60-gameplay-full-game-longplay | Every `3do-*.jpg` with a "YouTube 3DOnerd" watermark top-right (640x480, the rider is Axle at Level 5) |
| TE | https://www.timeextension.com/games/3do/road_rash | 3do-race-city-02/03/04, 3do-race-rural-hills-guardrail-01, 3do-race-pacific-crash-runback-01, 3do-race-napa-town-01 (1835x1435) |
| WP | https://en.wikipedia.org/wiki/File:3DOIM_Road_Rash.png | 3do-race-city-minidash-01.png |

The 3DO and PC versions share the same track art, sprites and FMV. The differences are the HUD and the resolution. **The PC version is described first below.**

---

## 1. Resolution and aspect

- **PC:** 640x480, 4:3. The AFIX/A2023 captures are exactly 640x480. The manual lets race resolution and biker-sprite resolution be set separately (see the research file).
- **3DO:** a 320x240-class image. A3DO captures it doubled to 640x480, with a black border of about 4% around the picture in some shots (for example 3do-race-sierra-01).
- **Texture magnification:** textures are low-resolution everywhere.
  - Anything close to the camera magnifies into large visible texel blocks.
  - A car passing the camera on the left becomes blocks about 1/20 of the screen wide (pc-race-city-side-by-side-03.jpg, lower left).
  - A rider sprite beside the camera becomes chunky pixels (pc-race-sierra-01.jpg, red helmet at lower left).
  - This blockiness is part of the look.

## 2. Camera

- **Low chase camera** directly behind the player at about head height. It sits roughly 3 to 4 bike lengths back, far enough that the whole bike and rider are visible above the dash (pc-race-napa-01.jpg, pc-race-peninsula-hills-01.jpg).
- **Horizon:**
  - Flat ground: about **y .33 to .38** (Napa y .36, Sierra mountain bases y .35, Pacific sea line y .37: pc-race-napa-01, pc-race-sierra-01, pc-race-pacific-01).
  - Crests: the horizon drops to about y .23 (pc-race-peninsula-hills-01.jpg, where the road climbs over a hill).
  - Dips: the road rises steeply up the screen (pc-race-city-orange-blocks-01.jpg).
- **Field of view** is fairly wide (roughly 60 to 70 degrees horizontal).
  - The road at the bottom of the view runs off both edges of the frame.
  - City buildings fill each side from x 0 to .25 and x .75 to 1 (pc-race-city-06.jpg).
- **The camera does not roll** with the lean. The horizon stays level in every frame; only the sprite leans.
- **Hills and bends** are real 3D geometry.
  - The road visibly curves off left or right, and its crest hides what lies beyond (pc-race-peninsula-hills-01, pc-race-pacific-cliff-bend-01).
  - Draw distance runs to the horizon, with no fog. The 3D world is flat-shaded and texture-mapped polygons; the backdrop is a painted panorama.

## 3. Player bike and rider

- **Pre-rendered 3D sprites** with a slightly digitised, noisy shading. They are not pixel art and not photographs.
- **Size with the PC dashboard on:**
  - Width: x .47 to .55 of the screen, so **about 8 to 9% of screen width**.
  - Height: from helmet top at y .43 to .50 down to rear tyre at y .67 to .70, so **about 20 to 24% of screen height**.
  - The sprite is centred at x .51, and the rear tyre touches the road just above the dash fairing, which starts at y .77 (pc-race-napa-01, pc-race-peninsula-hills-01, pc-race-pacific-01).
  - With the dash off (F10) the sprite sits in the same place (pc-race-city-f10-minimal-hud-01.png).
- **PC default player (UnbiasedPlayer / Player1):**
  - Hot-pink/magenta leathers (sampled #f0c0d0 highlights to #d040a0).
  - Yellow-green shoulders and back panel.
  - Yellow full-face helmet.
  - Dark bike with a red tail light (all YT1 frames).
- **3DO player (Axle):**
  - Yellow and black with a yellow helmet (3do-race-city-05, 3do-race-sierra-01).
  - In other shots, white leathers with a dark helmet (3do-race-city-02, 3do-race-city-minidash-01).
  - Colours vary with the bike bought.
- **Lean:** sprite frames tilt the whole bike and rider up to about 30 to 40 degrees (pc-race-sierra-canyon-01.jpg, hard left; 3do-race-city-05.jpg). The rider tucks low over the tank at speed.
- **Finish celebration:** the rider sits up with both arms raised as the bike crosses the line (pc-race-city-finish-arms-up-01.jpg).
- **Crash:** the bike and the rider separate.
  - The bike tumbles or slides on its side across the road or pavement (pc-race-city-crash-02.jpg).
  - The rider is thrown, lands, then stands up as a full-body upright sprite and walks or runs back to the bike (pc-race-city-runback-02.jpg: pink rider standing mid-road, about 6% of width by 20% of height).
  - Opponents do the same (pc-race-city-opponent-runback-01.jpg: a rider stepping over a bike lying on the pavement; 3do-race-pacific-crash-runback-01.jpg: a rider running back beside a cliff with the bike lying in a bush).
  - The crash itself is shown in-engine, with no cut-away.
- **Attacks:** see section 4.

## 4. Opponents

- Same sprite system as the player: same scale at the same distance, and each rider has distinct leather colours. Seen:
  - red/white (Mike, pc-race-city-opponent-crash-01)
  - red/black (pc-race-city-opponent-close-02)
  - green (Jon, pc-race-city-side-by-side-02/03)
  - blue/red/white (pc-race-city-pack-01)
  - yellow with a blue helmet (pc-race-pacific-cliff-bend-01)
  - purple (pc-race-city-04)
- Packs of 3 to 6 riders are visible ahead at the start and in the city (pc-race-city-start-countdown-01, pc-race-city-pack-01).
- **No names float over riders.** No frame shows any label above a rider. The only name shown is the **closest opponent's name**, in the HUD at bottom-right. It changes as riders pass (Slash, Mike, Pearl, Axle, Bose, Jon, Rhonda, and so on).
- **Swings:**
  - pc-race-city-opponent-crash-01.jpg shows the red/white rider with his left arm extended straight out sideways, about 0.05 of screen width, just after a strike. The rider he hit is going down, with his bike on its side.
  - The poster shot (pc-race-sierra-chain-fight-poster.png, APOST) shows an opponent swinging a chain with the arm raised above the helmet.
  - The disc art (pc-box-CD.jpg) shows the iconic pose: a rider swinging a club back-handed.
  - No clean in-game frame of a kick was captured; see the gaps list.
- **Close-ups:** a rider alongside the camera appears large, about 18% of width, and pixelated (pc-race-sierra-01.jpg; pc-race-city-opponent-close-02.jpg).

## 5. HUD / dashboard (PC default)

Source frames: pc-race-city-06.jpg, pc-race-peninsula-hills-01.jpg (YT1), pc-race-city-hud-annotated-poster.png (APOST), and pc-manual-p12-instrument-panel.png (AMAN, the labelled diagram).

- **Fairing**
  - A black glossy motorcycle fairing and instrument cowl fills the bottom of the screen as a wide arch.
  - The top of the arch is at **y .77** at the centre. It curves down to about y .95 at x .02 and x .98, and the black strip beneath reaches the bottom edge.
  - Colour is near-black (#0d0000) with faint grey specular highlights along the rim.
  - The road shows through on both sides of the arch.
- **Speedometer** (left, large)
  - Cream face (#ece0be), black numerals.
  - Centred at about x .38 / y .93; about 0.16 of screen width across.
  - The bottom third is hidden by the frame edge.
  - Marked 0, 50, 100, 150, 200 MPH with a red needle. The km/h variant reads to 320 (pc-race-city-cop-bike-01.png, pc-race-city-01.png).
- **Rev counter** (right of centre, smaller)
  - Cream face, about 0.13 of width, centred at about x .60 / y .93.
  - Marked 3, 6, 9, 12, "RPM x 1000", with a red needle.
- **Position**
  - A white condensed digit, about 0.04 of screen height, at x .51 / y .86.
  - It sits in a small black rounded box between the dials (reads 1 to 15).
- **Odometer**
  - White "03.4" (miles or km, one decimal, zero-padded) at x .49 to .54, y .96 to .99, directly below the position box.
- **Damage and stamina bar**
  - A short horizontal bar at x .45 to .55, y .81, above the position box.
  - Segments run red, then yellow, then green (red at the left end). Colours: red #d02020, yellow #c0b040, green #40c040.
- **Nitro LEDs**
  - On nitro bikes, a row of about 10 small red LED dots arcs across the top of the cowl above the bar (pc-race-city-hud-annotated-poster.png).
- **Distance to closest opponent**
  - At x .70 to .74 / y .85: an arrow plus digits in a thin condensed seven-segment-like style.
  - **Red with ↑** means they are ahead ("↑0.002").
  - **Green with ↓** means they are behind ("↓0.094").
- **Player name**
  - Bottom-left, x .08 to .26 / y .94 to .99.
  - White tall condensed sans (a narrow grotesque close to "Bureau Grotesque Compressed" / "Impact Condensed") with a dark edge.
  - Directly above-right of the name sits a **curved wedge meter**, a quarter-arc about 0.03 wide at x .24 to .27, y .89 to .92. It is graded green at the top, then yellow, then red. This is the player's stamina.
- **Closest opponent**
  - Bottom-right, x .74 to .80 / y .94: the opponent's name, same font.
  - It has a mirror-image wedge meter at x .72 to .78 / y .88 to .92, showing the opponent's stamina.
- **Multiplayer only:** top-left "Mano-a-Mano" standings and top-right chat, in a small courier-style typewriter font. Standings are in white with the local player in red, e.g. "+0.006 Big Kahuna" (pc-race-city-hud-annotated-poster.png).
- **No mirrors, no minimap, no lap counter, no timer.**
- **Start countdown:** a large white "2" and "1" drawn as a tall white bar in the middle of the road ahead (pc-race-city-start-countdown-01.jpg, x .50 / y .35). Before the race the picture is darkened to about 60% brightness.

### F10 variant (dash off)

pc-race-city-f10-minimal-hud-01.png (AFIX); the manual says "press F10 … see more of the road while still displaying all vital information" (pc-manual-p12-instrument-panel.png).

- The fairing and dials disappear and the road fills the frame to the bottom edge.
- A single row of text sits at about y .92 to .96:
  - "Axle" plus a small red/yellow/green bar at x .1 to .25
  - speed "0" at x .37
  - position "14" with a bar beneath at x .5
  - odometer "00.0" at x .63
  - opponent "Eric" plus a bar at x .77
  - red "↑0.005" at x .9
- This is the same layout as the 3DO HUD.

### 3DO HUD

3do-race-city-02/05, 3do-race-sierra-01, 3do-race-napa-02.

- There is no dashboard graphic at all. Only text sits over the road, in a clean white sans (Helvetica-like, not condensed) with a slight shadow.
- Bottom-left: the rider's name, with a small bar (red, yellow, green) below it.
- Then the speed number (e.g. "141").
- Centre: the position number, with a longer stamina/damage bar under it. The bar is striped with small tick marks above.
- Then the odometer ("06.4").
- Bottom-right: the opponent's name plus a bar.
- The whole row sits at y .85 to .95.
- **Mini-Dash** (3do-race-city-minidash-01.png, WP): the same row with slightly larger digits.

## 6. The road

- **Asphalt:** a flat, very slightly noisy **purple-grey**, not neutral grey. Sampled #56505e, #595361 and #4f4955 on every track, and 3DO #404050 to #505050.
  - The purple cast is characteristic.
  - There is no visible aggregate texture and almost no lighting gradient.
- **Width:** a two-lane road (one lane each way) plus shoulders on the rural tracks. In the city it is wider, 4 lanes.
  - At the bottom of the view the road spans the full width of the screen and beyond.
  - At mid-screen (y .5) it is about 0.5 of the screen wide on rural tracks (pc-race-napa-01).
- **Markings:**
  - **A double solid yellow centre line**, #c0b04c, on every track. Each stripe is about 1% of width at the bottom of the view.
  - **White dashed lane lines**, #d0d0d0, long dashes with long gaps.
  - **A solid white edge line** on rural roads.
  - **White stop bars** across the road at intersections; the start line is a full-width white bar (pc-race-city-start-countdown-01, pc-race-napa-02, pc-race-city-opponent-close-01).
  - **No rumble strips, no kerbs painted red and white, no road-side distance markers.**
- **Shoulders:** grey pavement or sidewalk in towns (#59525f to #737080). Flat brown dirt on rural roads (#63452c), about 0.1 of the screen wide at the bottom of the view (pc-race-sierra-01, pc-race-napa-05).
- **Finish:** a black-and-white checkered band painted across the road (3do-race-sierra-finish-01.jpg), plus the arms-up celebration.
- **Traffic lights and signs:**
  - Green traffic lights on poles at rural intersections (pc-race-napa-02).
  - Yellow diamond chevron curve signs, "<", about 0.04 of the screen (pc-race-peninsula-hills-01, pc-race-sierra-03).
  - A white "SPEED LIMIT 35" sign (pc-race-city-speed-sign-01).
  - A deer-crossing sign on the Pacific Highway (poster postcard).

## 7. Roadside, sky and mood, per track

**Sky, all tracks:** a flat periwinkle blue, **#94aefa** (identical on every PC track and #a0b0f0 on 3DO), with a paler strip at the horizon (#c5d0f2). There are sparse, flat, cartoon-like white cumulus clouds with hard edges on the blue, about 0.05 to 0.1 of the width each, scattered across the top quarter. There are no sunsets and no night races.

### The City (San Francisco)

pc-race-city-04/05/06, orange-blocks-01, pack-01, police-car-01, crash-01/02; 3do-race-city-02/05.

- **Buildings:** a continuous wall of 3 to 5 storey blocks on both sides, each block a textured box.
  - Colours:
    - saturated blue-violet (#5050a0)
    - brick red/brown
    - teal (#407070)
    - ochre/orange (#d08030)
    - cream Victorian
    - dark grey
  - Details include many window rows, garage doors, bay windows and arcaded ground floors.
  - The blocks occupy x 0 to .25 and x .75 to 1, from y .0 to .5.
  - The textures look hand-painted and dithered.
- **Street trees:** round, green, billboarded (#408030), spaced along the pavement.
- **Street furniture:** lamp posts, a blue mailbox, fire hydrants.
- **People:** pedestrians and skateboarders on the road and at the start, plus a cop standing on foot at the start (pc-race-city-start-grid-01.png, pc-race-city-04.jpg, pc-race-city-01.png).
- **Terrain:** steep hills reveal distant blocks stacked up the slope (pc-race-city-orange-blocks-01).
- **Distance:** hazy blue-grey hills and a bay show beyond the street end (3do-race-city-02).
- **Mood:** bright, saturated, dense and toy-like.

### The Peninsula

pc-race-peninsula-01/02/03, peninsula-hills-01, peninsula-traffic-01, peninsula-pedestrian-01; 3do-race-peninsula-02/skyline-01.

- **First half:** suburban town streets with the same box buildings, but lower and sparser, with gaps showing hills behind.
- **Second half:** open **bright green rolling hills** (#719a4d), a few lone round trees, fences, cows on a hillside (pc-race-peninsula-03), and a billboard.
- **Backdrop:** low green-grey hills.
- **Mood:** sunny, open and suburban.
- **Cops:** the poster notes this track is cop-heavy.

### Pacific Highway

pc-race-pacific-01/03/04, cliff-bend-01, tunnel-interior-01, tunnel-02, tunnel-mouth-01, town-01/02; 3do-race-pacific-02/cliff-01, crash-runback-01.

- **Inland side:** a **tan sandstone cliff face** (#b0987d) on one side, filling up to 0.35 of the width and rising above the top of the screen. Its diagonal strata streaks are clearly texture-mapped.
- **Sea side:** a metal guardrail (#897764 against light) with **deep blue ocean** (#2b6496) and white surf lines beyond, plus grey-green headlands across the water.
- **Trees:** lone wind-bent cypress or umbrella pines.
- **Tunnels:** tunnel mouths cut into the cliff. Inside is a dark grey rock vault with a row of white ceiling lights down the centre and concrete balustrade walls (pc-race-pacific-tunnel-interior-01).
- **Later stretches:** dry khaki hills (#8d8d7b), and an **Old West false-front wooden town** (pc-race-pacific-town-02).
- **Mood:** bright, coastal and exposed.

### Sierra Nevada

pc-race-sierra-01/02/03/04/05, canyon-01, town-01, finish-fade-01; 3do-race-sierra-01/02/rockcut-01.

- **Backdrop:** a **jagged snow-capped mountain range** (lavender-grey rock #9593ab with white snow), about 0.08 of the screen tall, running along the horizon across the full width. It is the most distinctive backdrop in the game.
- **Terrain:** dark conifer pines (#58655c) in clumps, and green meadows with a coarse grassy texture (#496542).
- **Roadside:** brown dirt shoulders, and a **steel guardrail** along the outside of bends (pc-race-sierra-04).
- **Rock cut:** high grey-beige stratified rock walls (#6f6c5e to #a8a99f) close in on both sides (pc-race-sierra-canyon-01).
- **Town:** a mountain town of shopfronts with red awnings (pc-race-sierra-town-01).
- **Mood:** alpine, green and cool.

### Napa Valley

pc-race-napa-01/02/03/04/05, pickup-01; 3do-race-napa-02/03/04, town-01/02/03.

- **Backdrop:** a long, **pale hazy blue-grey mountain range** (#898b98) across the full horizon. It is washed out compared with the Sierra peaks.
- **Terrain:** green vineyard hills with a striped texture (#496e3a), and dry tan fields.
- **Roadside:** lone round oaks, a Joshua-tree-like cactus, telephone poles, traffic lights at crossroads, and wooden billboards.
- **Towns:** small Western wooden towns (3do-race-napa-town-03: two-storey false fronts with balconies).
- **Mood:** the hottest and haziest track, and the most open.

## 8. Traffic and cops

- **Civilian traffic:** texture-mapped box models.
  - Silver/grey sedans and hatchbacks (pc-race-city-crash-02, opponent-close-01).
  - A yellow taxi (pc-race-city-05), a white van (pc-race-sierra-03), and a blue pickup (pc-race-napa-pickup-01, YT1 at 1100 s).
  - A red convertible (pc-race-peninsula-pedestrian-01).
  - Cars travel in both directions.
- **Police car:** a black-and-white 1980s sedan with a star badge on the door and a light bar on the roof (pc-race-city-police-car-01.jpg, entering from a side street).
- **Police bike:** a white/black police motorcycle whose rider wears a dark uniform and white helmet. It rides beside the player (pc-race-city-cop-bike-01.png, pc-race-city-cop-02.jpg).
- **Busted cutscene:** the bust is a purple-tinted FMV cutscene of a real cop in a patrol car (pc-fmv-busted-cop-01/02.jpg, YT2). No in-game handcuff screen was captured.

## 9. Menus and screens

The house style has three layers:

- **Claymation caricature art**, used on the title, credits, winner and Restroom screens. Grotesque sculpted biker faces with big teeth, lit in saturated purple/blue.
- **Collage bulletin boards**: a cork board covered in newspaper clippings with a **pinned photo-postcard**.
- **Tall condensed type.**
  - Titles are orange-red, **#f05030**, with a dark drop shadow.
  - Taglines are white condensed.
  - Menu items are white bold condensed with a **yellow → arrow** cursor. The selected item turns yellow.

Screens seen:

- **Title:** a red "ROAD RASH" logo split by a black-and-red **spiked star burst**, over a crowd of claymation rashers (pc-menu-title-screen-01.png, A2023).
- **Credits:** the same claymation crowd with orange-and-white credit text, e.g. "Sam Black (The Fire-Breathing Penguin)" (pc-menu-credits-01.jpg).
- **Bulletin Board / race sign-up:** this is the track selection (pc-menu-bulletin-city-02.jpg, pc-menu-bulletin-board-city-01.png, pc-menu-bulletin-pacific-02.jpg).
  - The track name is top-left in large orange condensed type ("The City", "Pacific Highway").
  - A two-line white tagline follows ("Dodge nasty traffic and zombie pedestrians in the urban jungle.", "Face dead man curves and sheer cliff walls along the narrow coastal highway.").
  - "Length: 5.3 miles" at the lower left.
  - A player-name / "Level 1" plate.
  - A 3x2 grid of track names across the bottom black band (y .88 to 1): The City, The Peninsula, Pacific Highway / Sierra Nevada, Napa Valley, Restroom.
  - A rotated photo postcard is pinned with a red pushpin at top-right, taking about 0.45 of the width.
  - The postcards (all five: pc-menu-bulletin-postcards-poster.png):
    - City: a rider leaning under a night skyline.
    - Peninsula: a rider and a car with motion blur.
    - Pacific: a deer and a camper van on a cliff.
    - Sierra: a bear holding a "WILL HUNT FOR FOOD" sign.
    - Napa: a cow and a winding road.
  - After a win, a **checkered "QUALIFIED" flag** is stamped over the track (pc-menu-bulletin-city-qualified-01.jpg).
- **Restroom** (options/save): the same board with a claymation character on a toilet (pc-menu-bulletin-restroom-01.jpg). The 3DO version is a menu list over the image: Load Game … Exit, in white/yellow condensed type, with a save-slot column "Axle 1..5" (3do-menu-restroom-01.jpg).
- **Street hub:** a painted night street with neon (APOST only): Der Panzer Klub, Olley's Skoot-A-Rama, and a CAFE sign, in blue/purple with red and pink neon (pc-menu-street-hub-poster.png). A schmooze bar scene of the caricature cast also appears (pc-menu-schmooze-poster.png).
- **Race end:**
  1. A "WINNER" logo, cream-lettered on an orange spiked star, on black (pc-end-winner-logo-01.jpg).
  2. Then a purple-tinted FMV clip (crowds, bars, crashes: pc-fmv-crowd-01, pc-fmv-bar-01, pc-fmv-second-place-01).
  3. Then a still of claymation or photo-caricature art, with **"WINNER!" in orange condensed type** and "UnbiasedPlayer finished in First Place." in white condensed on a translucent dark band (pc-end-winner-01/02/05, pc-end-winner-three-bikers-01).
- **Level up:** "LEVEL PROGRESSION!" over a trophy and champagne, with "Whoa, you've qualified on every track in the level." (pc-end-level-progression-01.jpg).
- **3DO game end:** "YOU REIGN SUPREME!" in large orange type over the claymation crowd (3do-end-reign-supreme-01.jpg).

---

## The ten things most characteristic of how this game looks (ranked)

1. **The chase view.** A low camera sits dead behind a pre-rendered rider sprite, about 9% of screen width by 22% of height, centred at x .51. The rear tyre sits just above the dashboard at y .70, and the horizon stays level at y .33 to .38 while the sprite leans.
2. **The black fairing dashboard.** A glossy black cowl arch fills the bottom quarter of the screen (top at y .77). It holds two cream analogue dials (MPH and RPM), a position digit in a black box, the odometer, a red→yellow→green bar, and curved stamina wedges beside the player's and opponent's names.
3. **Purple-grey asphalt with a double solid yellow centre line** (#56505e, #c0b04c), white dashed lanes and solid white edges. There are no rumble strips, and the palette is the same on every track.
4. **A flat periwinkle sky (#94aefa) with hard-edged white cartoon cumulus**, identical on all five tracks.
5. **Tall condensed white type** for every name and number in the HUD, and orange-red condensed titles (#f05030) on menus and results.
6. **One track, one silhouette.**
   - City: canyon walls of blue-violet and brick blocks.
   - Pacific: a tan striated cliff against blue ocean and a guardrail.
   - Sierra: jagged snow peaks with pines.
   - Napa: pale hazy ranges over green vineyard hills.
   - Peninsula: bright green rolling hills after the suburbs.
7. **Low-resolution, hand-painted textures on simple box geometry.** They magnify into big square texels near the camera: a car or a rider alongside turns into blocks.
8. **Only the closest opponent is identified: by name, bottom-right, with a red ↑ / green ↓ distance.** No labels float over riders.
9. **Claymation caricature bikers and collage bulletin boards with pinned postcards.** Menus and end screens look nothing like the race: grotesque, purple-lit and sculpted.
10. **In-engine crashes followed by running back.** The bike tumbles free, then the rider appears as an upright full-body sprite walking back to it. Winning is marked by a spiked "WINNER" star and a "WINNER!" still, and busts by purple-tinted FMV.

## Gaps

- **Olley's shop interior / bike purchase screen:** no PC or 3DO image found. The poster has only the exterior sign. MobyGames (403) and Sega Retro (bot wall) were unreachable.
- **In-game Street hub on PC:** poster crop only, with no clean screenshot.
- **Punch and kick:** no clean mid-swing in-game frame. There is an extended-arm frame (pc-race-city-opponent-crash-01), the poster chain swing and the disc art.
- **Busted screen / cop arrest:** FMV only; no "Busted" text screen captured. There is also no Wrecked screen.
- **Race results table** ("Race Results" list with times) was seen in the video thumbnails but not saved as a full frame. The winner still is saved.
- **Night racing:** none exists in the footage checked; all tracks are daylight.
