# Road Rash (PC, 1996) game feel, measured

How the original handles, fights and crashes, measured off one recorded race
so the remake can be tuned against numbers instead of memory. Ledger source
tag RRVID: <https://www.bilibili.com/video/BV1iK4y1W76t/>, the Chinese PC
release with a km/h dial. The video, the frame sheets and the CSV traces named
below stay in the workspace's `.scratch/rr-video/`, never in this repo.

Source: the recording, 1920x1080, 25 fps, 462 s, one full race won from 14th place. All times are video seconds. "f" means video frames at 25 fps (1 f = 0.04 s). Sheets used are in `t/` (tile.sh layout: left to right, then top to bottom). Speed comes from a needle reading at 10 Hz (`speed.csv`) and its per-second view (`sec.txt`). Dash meters come from `bars.csv` (5 Hz) and the screen position of the player's tail light comes from `tail.csv` (25 Hz).

## 1. Speed envelope

| Quantity | Value | Where |
|---|---|---|
| Countdown, then the race clock starts | 0–3.8 s | t=0–4 |
| Launch, 0 to 250 km/h | ~5.5 s (~45 km/h/s) | t=4.0–9.4 |
| Cruise | 280–290 km/h | most of 15–450 |
| Boosted peaks | 318, 320, 317 km/h | t=170, 382–383, 450 |
| Mean speed, start to finish | 233 km/h | 4–452 |
| Braking to fight | 293→58 km/h in 1.0 s (~235 km/h/s) | 351.0–352.0 |
| | 277→133 km/h in 0.4 s | 52.6–53.0 (dial crop `dial52.jpg` confirms) |
| | 287→132 km/h in 0.6 s | 88.8–89.4 |

**Fights happen at low speed in this video.** The player dumps speed on purpose and fights at 50–130 km/h:

- at 55–60 the speed was 50–100;
- at 352–357 it was 40–145;
- at 90–93 it was 66–118.

Speed drops at 269.6, 285, 289 and 387.6 (to 116–158 km/h) show no crash on the sheets (`e269`, `e284.5`), so they are the player easing off or braking.

### Boost lamps (nitro)

The dash carries a row of 9 red lamps directly above the health bar, centred near x=825…1090 and y=850. The lamps go out one at a time, and every loss coincides with a speed surge above the normal cruise speed:

| Lamps go out (s) | Speed after |
|---|---|
| 166.2 (9→8) | 266→306 by 168, then 318 at 170 |
| 202.2 (8→7) | 270→301 by 204 |
| 320.6 (7→6) | 44→226 in 2 s (321–322), out of a near-stop |
| 378.8 (6→5) | 289→313 by 381, then 320 at 382 |
| 392.0 (5→4) | 240→306 by 395 |
| 446.2 (4→3) | 286→306 by 448 |

- The race ends with 3 lamps unused.
- Short dips in the lamp count (e.g. 168–174, 207–210, 324–327) are lighting changes from tunnels and shade, not lamp losses.
- **For a remake:** treat the lamps as 9 boost charges. One charge gives roughly +20–35 km/h over the 285 km/h cruise, within about 2–4 s.

### Health bar

- The health bar sits below the lamps at x 877–1067, y 871–889. It is a fixed red | yellow | green gradient that is blacked out from the right as health is lost.
- It reads ≥0.96 full from 0 to 455 s. The only visible losses are a sliver at ~162 and a drop to 0.83 after the finish-line crash at 455.
- The player's two side-slides (213, 248) did not move it measurably.
- No rival health bar is shown on the dash. The bottom-right corner shows only the nearest rival's name and the time gap to them (e.g. "↓0.501" at 454).

## 2. Combat

Timings are at 25 fps (`k57`, `p351`, `p355`, `p413`).

| Event | Wind-up / chamber | Extended | Next swing | Result |
|---|---|---|---|---|
| Kick at 托马斯 (black touring bike, on the right) | 57.00–57.20, 6 f, leg cocked | 57.24–57.40, 5 f | 2nd kick extended 57.64–57.80, 5 f, so 10 f (0.40 s) between kicks | Rival's bike tilts at 57.28 and has left the frame by 57.44. **Knocked off within 0.16 s (4 f) of contact.** Speed ~67–80 km/h. |
| Club swing, player (right-hand strike) | overhead 355.24–355.44, 6 f, then 2 f lowering (355.48–355.52) | 355.56–355.72, 5 f | next wind-up at 356.04 (12 f after the strike ends) | After the strike the player's bike leans/wobbles 355.80–355.92 (4 f) |
| Club swing, player (left-hand strike, three riders abreast) | overhead 413.46–413.62 | 413.78–413.90, 4 f | after the strike, the arm is overhead again by 414.06 | Yellow (杰斐逊) and red rival both down by 413.75–414.25. Position 2→3 because the player slowed. |
| Club held out | already out at 351.60 | 351.60–351.88, ≥8 f; back in at 351.92 | | The touring rival drops out of view as the player brakes |
| Rival weapon (托马斯, chain/club, swinging at the player) | | 355.00–355.28, ≥8 f | again 355.96–356.20, 7 f, so the rival repeats every ~0.96 s | Player health did not visibly drop |

Overall cycle:

- About 6 f of wind-up and 4–5 f extended per blow.
- A player can swing again roughly every 0.4–0.5 s (10–12 f).
- AI rivals swing about every 0.96 s (24 f).
- Contact sits in the first 1–2 frames of the extended pose.

The player's weapon is a white/grey stick (club). It is already held at 351.6. At 57 the player is still unarmed and kicking. Where the club was picked up was not captured, and no snatch animation was seen in the sheets reviewed.

### Rivals knocked down or crashing

| Time | Rival | What is seen |
|---|---|---|
| 53.6–54.6 | 史蒂芬, red | Rider and bike are thrown apart and tumble past the camera; the bike lies on the left at ~55.5. |
| 57.28 | 托马斯 | Kicked off; gone in 4 f. |
| 248 | 露西娅, yellow | Down beside the player. |
| 311.75 | 塞利娜, green | Crashes; her bike slides along the road 313.0–315.0. |
| 317.6–318.4 | 塞利娜 (on foot) | Walking back to her bike. She is run over at ~20 km/h at 318.0: thrown spread-eagled through the air toward the camera, passing under it at 318.4 (0.4 s, with a ground shadow). The player's bike hops (in the air ~318.08–318.24) and the player does not crash. Position 2→1. |
| 413.75–414.25 | 杰斐逊 (yellow) and the red rival | Both down; a fallen bike lies on the left shoulder at 413.75 (`e413`). |

**Knock-off rule observed:** a single kick at 57.24 ended a fight in which the rival had already traded blows (seen at 4 fps from ~56). Blow counts per knock-off could not be isolated, because rival health is not shown on the dash.

### Poses

Read off single full-resolution frames with a 40 px grid laid over them, all
seen from straight behind. Every joint is measured from the centre of the
striking rider's helmet, in **helmet widths** (45–55 px in these frames), with
x out towards the blow and y up. The tail lamp is the one point of the bike the
recording always shows, so it gives the rider's height on the bike.
`spec/sprites.test.ts` ("every pose against the recording") projects the
sprite puppet the same way and holds each frame to these, to half a helmet
width.

| Frame | Time | Measured |
|---|---|---|
| Riding | 56.90 | Hunched: helmet 2.1 over the tail lamp; elbows out at x 1.1, y −1.35 |
| Fist drawn back (chain in hand) | 247.44 | Sitting up: helmet 2.85 over the lamp. Fist beside the helmet at x 1.45, y −0.4; elbow out below it at x 1.8, y −0.9 |
| Fist or chain out | 247.64 | Arm dead straight at shoulder height: fist at x 3.4, y −0.6. The body leans *away* from the blow: the lamp sits 0.4 out towards it |
| Club overhead | 355.32 | Fist beside the helmet at x 1.4, level with it; the club points up and back over the head. Helmet 2.4 over the lamp |
| Kick chambered | 57.08 | Not a riding pose: the leg is already out, bent. Knee at x 2.2, y −2.2; foot back by the tail at x 3.2, level with the lamp |
| Kick out | 57.32 | Leg straight, nearly level, foot at x 4.2 and just above the lamp; the body leans off it, the lamp 0.45 out towards the kick |

### Contact

What a touch looks like when no one comes off, read at 25 fps:

- **The struck bike is over on the next frame.** The kick lands at 57.24; at
  57.28 the rival's bike is visibly tilted away, and it has left the frame by
  57.44. A chain landing at 247.64 tilts 露西娅's bike away on the next frame,
  and it is sliding by 247.76.
- **The striker's bike rocks** for about four frames after a blow lands
  (355.80–355.92).
- **A rock or car taken square at speed throws the rider high**: in the air
  1.25 s at 454.25–455.50, rising to the top of the frame, while the bike lies
  in the road. A crate clipped at 212.92 put bike and rider down together
  instead.
- **A rider on foot ridden into** (塞利娜, 317.56-318.80, at about 20 km/h):
  thrown up spread-eagled on the frame of contact (318.04), up *ahead* of
  the bike and off to its right, a metre or more off the road with a shadow
  under them, and lands lying beside it at 318.16, still level with the bike
  for the next half second before falling behind. The bike that hit them is
  off the road 318.04-318.24, its shadow clear of the wheels by about a
  wheel's height, then over hard and rocking back 318.52-318.76; the rider
  stays on. The horizon does not move: the camera does not hop with it.
- Nothing shakes or flashes the screen (section 4).

## 3. Player crashes

| Start | Cause | Phases | Speed | Back to ~250 km/h |
|---|---|---|---|---|
| 212.92 | Clipped a roadside object (crate/tree) on the right shoulder | Bike and rider go down together (no ejection) and slide on their side 213.56–214.20 (~16 f). Upright from 214.28, riding slowly. The camera yaws to a new heading. **No flash, shake or roll.** | 283 (212.8) → 86 (213.8) → 22–35 (214–216) | ~205 at 224; cruise by ~245 (~11 s to 205) |
| 248.32 | Contact while punching 露西娅 (yellow) at 247.6–247.76; a boulder sits on the right edge at 248.32 | Side-slide 248.32–248.80 (12 f); upright at 248.88 | 281 → 20 in ~0.8 s (248.4–249.6) | 240 at 258 (8.5 s); 275 at ~268 |
| 454.0 (after crossing the start of the finish zone) | Hit a roadside rock on the right | Rider ejected: airborne 454.25–455.50 (~1.25 s, rising to the top of the frame) while the bike lies on the road. Lands sliding over the checkered line at 455.75. The camera keeps moving down the road without the rider (456–458.75); fade to black 458.75–459.25; victory screen ~460. | — | — (race over; health 0.96→0.83) |

Other slowdowns, from the speed trace only:

- 15 km/h at 318 to 279 at 324.4 (~6 s, boosted by a lamp at 320.6).
- 34 at 353.4 to 250 at 363.2 (~10 s).

At 351–353 the player stays upright, so this slowdown is braking for a fight.

**Post-crash re-acceleration:** about 26 km/h/s, against about 45 km/h/s at launch.

## 4. Steering and camera

These numbers come from the screen position of the player's tail light in `tail.csv`. Rival tail lights add noise to it.

| Quantity | Value |
|---|---|
| Rider x on screen, median | 1000 px (0.52 W) |
| Rider x on screen, IQR | 904–1088 (±5% W) |
| Rider x on screen, 5–95% | 760–1254 (0.40–0.65 W) |
| Rider y on screen (tail light), median | 632 (0.585 H) |
| Rider y on screen, 5–95% | 516–754 |
| Rider sprite at cruise | helmet y≈495 to tyre y≈785, ~290 px = 0.27 H; ~160 px wide (352.6, `r352.png`) |
| Dash | bottom ~0.20 H |
| Horizon | ~0.22–0.33 H |

**The camera trails the rider laterally.** In a sustained lateral move the rider drifts 300–400 px (0.16–0.21 W) off centre, and the camera re-centres in 0.5–1.5 s:

- 57.9–61.0: +403 px, moving onto the right dirt shoulder;
- 108.3–111.6: +370 px;
- 148.6–151.8: −545 px.

**Steering rate:** at ~75 km/h the move from the right lane to the dirt shoulder (about 1 lane) took ~0.7 s (57.24–57.96, `k57`). Lean is visible in the rider sprite, but the camera itself never rolls: the horizon stays level in every sheet reviewed, including the crashes (212.6–215, 247.6–249.5).

**Front wheel lift:** at t≈189 on the dirt shoulder, speed 266→190.

The camera does not shake or flash on hits, crashes or knock-offs; feedback is carried by the sprites (tumbling riders, sliding bikes, shadows).

## 5. Traffic and police

- **Cars:** a white van in the player's lane at 248.4–249.6 (closing and passing on the right); a red car in the left lane at 416.25; a car at ~413 on the right (`e413`).
- **Density:** sparse, about one car per 30–60 s in the sheets reviewed.
- **Police:** no police bike or car identified anywhere in the sheets reviewed. The black/white touring bike is a named rival (托马斯), not police.
- **Finish:** a flagman stands at the finish line at 454.5–455.75 (`e453.5`).

## 6. Track

**Road:**

- Normally 2 lanes with a double yellow centre line and white edge lines, plus wide drivable dirt shoulders. The player rode the shoulder at ~190 km/h at 188–191 without crashing.
- 4 lanes with white dashed lines through the western town (~86–100) and parts of the valley (~274).
- Intersections with crosswalk bars at ~53, ~74, 352.5–353.5 and 387.5–388.

**Odometer:**

- Readings: 00.0 at 8 s, 02.7 at 48, 08.2 at 150, 11.2 at 198, 25.4 at 450.
- Integrating the needle speed over the same span gives 3.0 / 9.15 / 12.6 / 28.7 km, i.e. 1.11–1.14 needle-km per odometer unit.
- So the unit is km (not miles, which would give 1.61). The needle reading is about 12% high, or the game's speed and distance scales differ by that much.
- Race length is about 25.5 km in about 446 s.

**Biomes:**

| Time (s) | Odometer | Biome |
|---|---|---|
| 0–50 | 0–2.8 | Coast: rock cliff on the left, sea and guardrail on the right. Tunnels ~30, ~36, 38–50 (roof lamps, railings). |
| 52–86 | | Dry grass and farmland valley, white fences |
| 86–100 | 4.3–5.3 | Western town, false-front buildings, 4 lanes |
| 100–162 | | Rolling farmland: barns, hay, "San Francisco" billboard at ~152 |
| 164–202 | | Palm coast; tunnel at ~168 |
| 204–252 | 11.6–14.0 | Canyon: rock walls close on both sides |
| 256–298 | | Green pine valley, 4 lanes at ~274 |
| 300–348 | | Coast: cliff left, sea right |
| 350–388 | | Green farmland and pines |
| 390–454 | | Coast to the finish; tunnels ~424 (odometer 23.7) and ~438 (24.6) |

Terrain beside the road is texture-mapped walls or slopes. Scenery sprites (trees, signs, crates, boulders, posts) sit on the shoulder and are solid: the crashes at 212.9 and 454.0 came from hitting them. Near sprites pop in pixelated at 14, 416 and ~430.

**Race:** position 14 → 1. Gap to the nearest rival behind at the finish was 0.50 s (454).

## 7. Other feel notes

- A fallen rider gets up and walks back to the bike, and is a hazard that can be run over (317.6–318.4).
- The player's own spills are short (0.5–0.65 s on the side, no ejection) except the high-speed rock hit at the finish, which ejects the rider for ~1.25 s.
- Combat is low-speed and side-by-side: three riders abreast at 413, with the player striking alternately right (413.10) and left (413.78).

## Not measured

- Snatching a weapon.
- Blows per knock-off.
- Rival health.
- Crest behaviour of the horizon.
- Exact steering rate at cruise speed.
