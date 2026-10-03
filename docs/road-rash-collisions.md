# Road Rash: collisions

What happens when a bike touches something, gathered after riding through other
bikes showed the earlier research had never asked. Frame-sheet and text-dump
names refer to local captures of the sources listed in [the ledger](ledger.md);
the captures themselves are EA's and are not redistributed.

Companion to `road-rash-research.md` (mechanics) and `road-rash-visuals.md` (look).
This file covers only what those two leave out: what happens, frame to frame, when
the player's bike touches something, and how the game shows it.

Evidence base: the three gameplay videos in `rr-img/_video/` (`pc-all-levels.mp4` =
1280x720 "UnbiasedPlayer" HUD, cited here as **PC1**, same source as `YT1` in
visuals.md; `pc-win95-papyrus.mp4` = 640x360 "Player1" HUD, cited as **PC2** /
`YT2`; `3do-longplay.mp4` = 640x480, cited as **3DO**), reviewed as contact sheets
in `rr-collide/` (file + grid position given per fact, e.g. `pc1_D_crash_napa.jpg
r3c3`), plus `pc_manual.txt`, `3do_text.txt`/`3do_djvu.txt`, the three GameFAQs
text dumps (one for the Genesis original, one for Genesis Road Rash 3, cited as
**RR3 FAQ**), and `rv_all.txt` (cached GameFAQs/review pages, cited **rv**). A
Chinese web search for 撞车/撞人/追尾/被撞飞 (4 Oct 2026) turned up only the
Chinese Wikipedia plot/mechanics summary and gamersky's listing page — nothing
with crash-specific detail beyond what the English sources already give; it is
not cited further below.

A provenance note on the frame set: `rr-collide/scan/d3_s*.jpg` and
`d3_K_ped.jpg` were unexplained in the handover (no matching resolution/HUD among
the three known videos). Viewing `d3_s01.jpg` resolved it: the sheet opens on a
3DO console being powered on and a disc inserted, then the EA/3DO boot splash and
the Road Rash menu (Restroom → Axle select → Pacific Highway/The City/Napa
Valley/Der Panzer Klub) — i.e. this is the start of `3do-longplay.mp4`, extracted
at a different crop/scale than the `f3do/` frames used elsewhere, not a different
or later game. It is cited below as **3DO** like the rest of that file.

---

## 1. Rider vs rider — side contact ("rubbing")

- Riding alongside an opponent and leaning into them pushes the other bike
  sideways without either rider going down; this is also what the kick move does
  on purpose ("the kick shoves the target's bike sideways", already in
  road-rash-research.md §3.4). The RR3 FAQ confirms the shove-only outcome is the
  general rule for lateral contact, not just the kick: "Will push a biker aside.
  Not very useful. You can get the same effect by bumping into another biker."
  (RR3 FAQ, `_text/gf_genesis_586427-road-rash-3_faqs_29823.txt` L150-151)
- At a steeper angle or higher closing speed, a side rub does put the other rider
  down rather than just shoving them: in PC1, the player closes on a pink/purple
  rival on a bend in the city; the rival goes into a sideways lean/slide (still
  half-mounted, not a full ragdoll throw) immediately next to the player, while
  the player rides on unaffected and the HUD lap digit ticks over. (observed in
  video — `pc1_A_detail.jpg` rows 4-5; corroborated by the wider sequence in
  `pc1_A_crash_city.jpg` and `pc1_A_after.jpg`, where the downed rival is passed
  by several more racers over the following seconds before the sheet ends,
  i.e. getting up is not shown within ~6 s)
- So there appear to be two distinct rider-down animations depending on how the
  contact happened: a lean/slide for a side-angle knockdown next to another
  rider, versus the full spread-eagle "thrown clear" ragdoll seen after hitting a
  car or fixed obstacle head-on (§3 below). (observed in video, inferred from
  comparing `pc1_A_detail.jpg` to `pc1_D_detail.jpg`)
- Player speed in the PC1 side-rub sequence does not visibly drop on the HUD
  dial across the contact (needle position unchanged frame to frame); the cost of
  this kind of contact lands on the other rider, not the player. (observed in
  video — `pc1_A_hud.jpg`)
- **Being knocked off yourself works differently from crashing yourself.** The
  RR3 FAQ is explicit that inertia differs: "When an enemy biker hits you off
  your bike, your bike keeps moving forward but you fall off. Unlike a normal
  crash — where both you and the bike have the same inertia — the trip back to
  your bike is twice as long... It's actually safer to crash into stuff
  sometimes [than to be knocked off by another biker]." (RR3 FAQ, L347-352)
- The same FAQ also states knockdown-by-opponent costs no damage-gauge hit by
  itself: "When you are knocked down by an opponent you take no damage." (RR3
  FAQ, L101) — this sits alongside, not against, road-rash-research.md's "yours
  drains as you take hits" (stamina, not the bike-damage gauge, is what punches/
  kicks drain; losing the bike to a knockdown is a time cost, not a gauge cost).
  Marked (FAQ, RR3) since this text dump is for the Genesis Road Rash 3, not the
  PC original — treat it as evidence the knockdown/crash split exists in the
  series, not as a confirmed PC-exact number.

## 2. Player rear-ends a rider / is rear-ended

- No frame set captures a clean rear-end between two bikes specifically (as
  opposed to a bike overtaking and rubbing alongside, §1). (clearly
  unanswerable from the current frame set — would need a fresh extraction
  targeting a moment where the player is directly behind a slower rival on a
  straight, which was not found in the batches reviewed)
- The manual's closest analogue is for rear-ending slow car traffic, not another
  rider, and it explicitly treats rear strikes as just as damaging as head-on:
  "rear-ending grandpa can be almost as damaging as a head-on collision" (Napa
  Valley track blurb, `pc_manual.txt` L515-516, manual). Lacking a rider-specific
  source, this is carried over as the best available evidence that the game does
  not treat a rear hit as "free" the way a glancing side rub can be.

## 3. Hitting a car — same direction

- Confirmed, high-confidence sequence: PC1's Napa Valley run shows the player
  closing on a blue pickup truck and white sedan sharing the player's lane, then
  impact — two frames show a pixelation/glitch-style effect consistent with
  the engine's impact flash — immediately followed by the rider shown airborne
  in a spread-eagle "thrown clear" ragdoll pose above the road surface.
  (observed in video — `pc1_D_crash_napa.jpg`, `pc1_D_detail.jpg`)
- Speedometer: the paired HUD-only sheet for this run shows the lap/position
  digit cycling 13→12→11→12→13 through the sequence and the small directional
  counter moving 00.3→00.4, i.e. a real but not dramatic change in that counter;
  the main MPH needle itself is not legible at contact-sheet resolution in this
  set, so an exact before/after MPH cannot be read off (observed in video —
  `pc1_D_hud.jpg` — but marked **unresolved**: needs a fresh higher-res
  extraction of just the needle if an exact number is required).
- After the ragdoll lands, the rider lies on the road while the field passes,
  then gets up and runs (`pc1_D_after.jpg`: rider upright and jogging, HUD rival
  name cycling Satish→Sven→Ikira→Jorg→Axle over the following seconds) — this
  matches road-rash-research.md §4.2's "the rider runs back to the bike" almost
  exactly, now confirmed on video rather than only from text. (observed in
  video)
- This is the clearest evidence for "hitting a car throws the rider off and
  separates them from the bike", already stated in road-rash-research.md from
  text sources; video adds the ragdoll pose and the lie-down-then-stand-and-run
  beat, plus that nearby racers do not stop or swerve for the downed rider —
  they ride straight past. (observed in video)

## 4. Hitting a car — oncoming

- Not captured cleanly in the reviewed batches: every car seen in a crash
  sequence (pc1_D, pc1_F, pc1_G) is travelling the same direction as the player
  in the player's lane, not oncoming in the opposing lane. (clearly unanswerable
  from the current frame set without a new targeted extraction)
- Indirect manual evidence that oncoming impact is modelled as more severe than
  a same-direction rear hit, by the explicit comparison already quoted above:
  "safer riding in the left-hand lane than in the right... rear-ending grandpa
  can be almost as damaging as a head-on collision" (manual, `pc_manual.txt`
  L514-516) — implies head-on is the worse end of the scale, with rear-ending
  slow traffic deliberately called out as surprisingly close to it rather than
  obviously milder.
- The kick move is explicitly designed to knock a rival into the opposing lane:
  "one well-timed kick can knock 'em into the oncoming traffic" (already quoted
  in road-rash-research.md §3.4, manual) — i.e. being knocked into oncoming
  traffic is a named, intended hazard, but neither the manual nor the reviewed
  frames show what then happens to the oncoming car or the knocked rider at the
  moment of that second impact. (unverified)

## 5. Pedestrians

- 3DO: the track-select blurb for The City (seen on the menu screens at the
  start of `3do-longplay.mp4`) names pedestrians as a track hazard directly:
  "Dodge nasty traffic and zombie pedestrians in the urban jungle." (observed in
  video — `scan/d3_s01.jpg`, menu screen; the word "zombie" here reads as the
  game's own slang/flavour text for jaywalking pedestrians, not a literal
  enemy type — no undead pedestrian is seen in any reviewed gameplay frame)
- 3DO gameplay: later in the same run (`scan/d3_s15.jpg`), at mph in the 130s
  with HUD rival "Cydney", a pedestrian figure in white appears directly in the
  player's path with a raised-arm pose consistent with flinching or being
  struck, immediately followed a few frames later by another rider (rival
  "Slash") going down nearby — but the sheet's low frame rate does not let me
  confirm whether the pedestrian or the rival crash caused the other, so this is
  marked (observed in video, ambiguous) rather than a clean causal fact.
- PC1 coastal/cliff sequence: a pedestrian stands beside the nearly-stopped
  player bike (speed reading near 15/00.0) and changes pose across frames in a
  way consistent with a punch/kick exchange rather than a vehicle strike — i.e.
  this reads as the player fighting a pedestrian on foot after already being
  stopped, not a moving-bike-vs-pedestrian impact. (observed in video —
  `pc1_C_ped.jpg`)
- Manual: pedestrians are listed as a named hazard of The City course alongside
  traffic and buildings ("Commuters, pedestrians, and buildings... make this one
  of the most challenging courses", `pc_manual.txt` L487-489, manual) but the
  manual does not give a damage number for hitting one.
- RR3 FAQ gives a hazard-tier breakdown that is the single most concrete thing
  found on contact severity, albeit for animals rather than pedestrians and for
  a different game in the series: "stuff such as the chickens in Italy or the
  kangaroos in Australia can be ran over without damage, but stuff like cows and
  zebras will cause damage and crash you." (RR3 FAQ L99-101) This supports
  road-rash-research.md §2.5's point that obstacles are sorted into harmless/
  jump/crash tiers, now with the concrete rule that tier depends on the specific
  object, not just size — extending it to say the same is plausible for
  pedestrians vs. larger traffic, but this is not itself a pedestrian-specific
  source, so marked (FAQ, RR3, extrapolated).

## 6. Cops

- No clean on-bike cop collision was found in the PC1/PC2 batches reviewed (cop
  rider "Mike" appears as a HUD name/approaching figure in `pc1_J_oppcrash.jpg`
  and `pc1_J2_guardrail.jpg` but no impact resolves within those sheets).
  (clearly unanswerable from the current frame set without further extraction)
- RR3 FAQ gives a detailed, if Genesis-RR3-specific, breakdown of cop contact
  that is the best source found on this:
  - Static "road block" cop cars that just idle in the road do **not** bust you
    on contact: "If you hit them, they won't arrest you." (RR3 FAQ L104-106)
  - Motorcycle cops, cop cars, and cop helicopters are the three kinds that do
    arrest on contact/proximity; hitting a blocking cop car is "an instant
    bust... Probably the most lethal cops", and the helicopter "will hover
    above you, then smash down on you. Instant bust." (RR3 FAQ L108-126)
  - So, in this game's design at least, cop contact severity is binary
    (bust/no bust) rather than a graded damage event like hitting a car or
    rider. Marked (FAQ, RR3) — not confirmed for the PC original, where
    road-rash-research.md documents the "Busted" state (stamina/time-out via
    stopping) but not a contact-triggered bust specifically.

## 7. Fallen rider / fallen bike as an obstacle

- A downed rival and a separated, lying bike are themselves visible as static
  hazards in the lane for the following several seconds, not instantly cleared:
  confirmed across `pc1_A_after.jpg` (downed rival passed by three more HUD-named
  racers in turn — Bose, then Jim — before the sheet ends) and `pc1_I_fallenbike.jpg`
  (a fallen motorcycle with a red-helmeted rider beside it, stationary at the
  roadside). (observed in video)
- Whether riding into a fallen rider/bike causes a crash of your own, as opposed
  to merely being a visual hazard to dodge, was not resolved in the reviewed
  frames — no sheet shows the player actually making contact with one.
  (clearly unanswerable from the current frame set without a targeted
  extraction aimed at a near-miss/hit on a downed rider)

## 8. Roadside objects (tree, pole, sign, building, guardrail, cliff)

- road-rash-research.md §2.5 already documents the general rule from text
  sources: fixed obstacles are sorted per track into things that launch you
  (jump ramps) and things that crash you, and the RR3 FAQ's animal-tier
  breakdown (§5 above) shows the same sliding/small-jump/crash three-way split
  applies to small objects as well as animals.
  Video does not add a new fact beyond this for named roadside objects
  specifically: `pc1_J2_guardrail.jpg` shows the player riding alongside a
  guardrail-lined road without a confirmed direct impact in the frames
  reviewed, and trees/signs/buildings appear only as background scenery or as
  jump jumps described already in road-rash-research.md, not as a resolved
  impact in any sheet reviewed here. (clearly unanswerable for a video-sourced
  impact on this particular batch; the text-sourced general rule stands as the
  best current answer)
- Cliffs specifically: not captured — the coastal/cliff track (`pc1_C_ped.jpg`)
  only shows the player stopped near a pedestrian, not a cliff-edge departure.
  (clearly unanswerable from the current frame set)

## 9. Landing a jump

- Not resolved: no sheet in the reviewed batch shows a clear ramp-style launch
  and landing from current height/shadow cues; `pc1_E_sierra_punch.jpg` and
  `pc1_F_oppcrash.jpg` end on approach to hazards without a confirmed airborne
  moment. (clearly unanswerable from the current frame set without a fresh
  extraction aimed specifically at one of the named small-jump obstacles from
  road-rash-research.md §2.5, e.g. a bush/rock/pedestrian on a track known to use
  them as ramps)

## 10. Supplementary questions

- **Can bikes ever pass through each other?** No instance of visual clipping/
  pass-through was seen in any reviewed sheet; every rider-rider approach either
  resolves into one bike shoving the other sideways (§1) or a crash. Marked
  (observed in video, negative result) rather than a confirmed "never", since
  the reviewed sample is a few dozen seconds out of over an hour of footage.
- **Knocked into oncoming traffic:** see §4 — the manual confirms this is an
  intended hazard reachable via the kick move, but neither manual nor reviewed
  video frames show the resulting second impact. (unverified)
- **How cars react when hit:** no reviewed frame shows a hit car swerving,
  stopping, or spinning out — the truck in the Napa sequence (§3) continues in
  its lane in the frames immediately after the player's crash, suggesting
  traffic is not knocked around by the player the way riders are, but the
  sample is small. (observed in video, low confidence)
- **What the AI does when blocked:** road-rash-research.md §8.4 already covers
  the rubber-banding distance-keeping behaviour; no reviewed frame shows an AI
  rider specifically blocked by wreckage and rerouting, so nothing further to
  add here. (clearly unanswerable from the current frame set)

---

## Ledger

| id | mechanic | source |
|---|---|---|
| K1 | Side contact between two riders normally just shoves the other bike sideways, without a crash, same effect as the kick move | (FAQ, RR3) `_text/gf_genesis_586427-road-rash-3_faqs_29823.txt` L150-151; road-rash-research.md §3.4 (manual) |
| K2 | A steeper-angle/higher-speed side rub puts the other rider into a lean/slide knockdown next to the player, distinct from a full ragdoll throw | (observed in video) `pc1_A_detail.jpg` rows 4-5 |
| K3 | Hitting a car or fixed obstacle head-on throws the rider into a spread-eagle ragdoll, separate from the bike, with an impact-flash/pixelation effect on the contact frames | (observed in video) `pc1_D_crash_napa.jpg`, `pc1_D_detail.jpg` |
| K4 | After a crash the rider lies on the road, other racers ride past without stopping, then the rider stands and runs/jogs back toward the bike | (observed in video) `pc1_A_after.jpg`, `pc1_D_after.jpg`; road-rash-research.md §4.2 (manual) |
| K5 | Being knocked off *by another rider* leaves the bike coasting forward riderless, doubling the run-back distance versus a self-inflicted crash where rider and bike share the same stopping point | (FAQ, RR3) L347-352 |
| K6 | A knockdown by an opponent costs no bike-damage-gauge hit by itself (distinct from the stamina cost of the blow that caused it) | (FAQ, RR3) L101 |
| K7 | Rear-ending slow in-lane traffic is called out as nearly as damaging as a head-on hit with oncoming traffic | (manual) `pc_manual.txt` L514-516 |
| K8 | The kick move is explicitly designed to knock a rival sideways into the oncoming lane | road-rash-research.md §3.4 (manual) |
| K9 | Obstacles/hazards are sorted per-object into harmless/small-jump/crash tiers; confirmed concretely for animals (chickens, kangaroos = harmless; cows, zebras = crash) and extrapolated by the game's own design logic to objects generally | (FAQ, RR3) L99-101; road-rash-research.md §2.5 (FAQ) |
| K10 | Static "roadblock" cop cars do not bust you on contact; motorcycle cops, blocking cop cars, and cop helicopters do, with contact-bust treated as a binary outcome rather than a graded damage event | (FAQ, RR3) L104-126 |
| K11 | A downed rider and separated bike remain as hazards in the lane for several seconds (multiple following racers pass one downed rider in sequence) | (observed in video) `pc1_A_after.jpg` |
| K12 | No bike-through-bike clipping observed in any reviewed contact sequence | (observed in video, negative result, small sample) |
| K13 | The 3DO "zombie pedestrians" line in The City's track blurb is flavour text for jaywalking hazards, not a literal enemy type — no undead pedestrian appears in any reviewed gameplay frame | (observed in video) `scan/d3_s01.jpg` menu text vs. gameplay frames |

## Open / unanswerable with current evidence

- Exact MPH before/after a car-crash impact (needle not legible at current
  contact-sheet resolution; would need a fresh crop-and-zoom extraction on the
  Napa truck-crash seconds specifically).
- Player-rear-ends-rider and player-is-rear-ended-by-rider as clean, isolated
  events (only side-rub and car-rear-end were found).
- Oncoming-car impact, cliff departure, named roadside object (tree/pole/sign/
  building/guardrail) direct impact, jump landing, and contact with a fallen
  rider/bike — none were captured in the batches reviewed; each would need a
  fresh, targeted ffmpeg extraction rather than further review of the existing
  `rr-collide/` set, which has been exhausted for these kinds.
- What happens to the car itself and to the knocked rider at the oncoming-lane
  impact point (both halves of the "knocked into oncoming traffic" chain).
- Whether cop contact in the PC original (not RR3/Genesis) is a binary bust or
  graded, and whether a stationary roadblock-type cop exists on PC at all.
