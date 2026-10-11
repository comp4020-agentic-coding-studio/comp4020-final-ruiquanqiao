# 1. The server owns the race; each browser predicts only its own rider

Accepted at crit 9.

## Context

Up to fifteen bikes on one road at up to 275 km/h, any number of them people,
and the game is hitting the rider beside you. Two people's screens will
disagree about where a bike is. The server sends 20 snapshots a second, and
measured on the live app by `scripts/netprobe.ts` they arrive 49 ms apart at
the median but up to 111 ms, and now and then two within 10 ms. At 275 km/h a
bike covers 7.6 m in a tenth of a second, which is more than three bike
lengths.

So the decision is whose word counts when two screens disagree: who was where
when a fist landed, who rubbed whom, who crashed beside a cop. Two lines of the
[README](../../README.md) decide it: *your bike answers your keys, not the
network*, and a person and an AI rider are treated alike, which needs one
referee for every fight.

## Options

1. **The server decides everything, and browsers draw only what they are
   sent.** Nobody ever disagrees, and it is the least code. But every key waits
   a round trip, then up to 50 ms for the next snapshot, then the
   interpolation delay, before the bike moves. From campus the first input was
   acknowledged in 44 ms, so steering would lag something like 0.15 s, at a
   speed where that is 11 m of road. The bike would answer the network.
2. **Each browser is the authority for its own bike, and the server relays.**
   Steering is instant, but contact has no referee: both browsers can see their
   own punch land first, a rub shoves whichever bike the other browser says it
   does, and an edited page can put its bike anywhere on the road.
3. **Lockstep**: every browser waits for every rider's input for a step before
   any of them takes it, as real-time strategy games do. Every screen agrees
   exactly, but the slowest connection sets the pace for the whole race, and
   one phone that stalls freezes it for everyone.
4. **Chosen: the server owns the race, each browser predicts its own rider, and
   everyone else is interpolated.** The server runs `game/sim.ts` at 60 steps a
   second and is the only one that decides blows, snatches, crashes, busts and
   the finish. Each browser runs the same `ride()` for its own bike the moment a
   key is pressed, and eases towards the server's position when a snapshot
   disagrees. Everyone else is drawn 0.1 s back between two real snapshots,
   placed by the race time each carries, and carried forward to the present by
   how they were moving (`client/netview.ts`), as Gabriel Gambetta describes.

## Why

It is the only option that keeps both lines of the README: the keys are
answered at once, and every fight has one referee, which treats a person and an
AI rider by the same rules because both are just riders in the server's race.

## What it costs

- **The rider you punch is where the server says, not quite where you see
  them.** Most of the time the two are centimetres apart. A bike stopped dead
  by a collision loses 50 m/s in two steps, which nothing drawn from the past
  can foresee; it is drawn up to 3.5 m off for a moment, and
  `spec/netview.test.ts` holds that under 4 m rather than pretending it is
  zero.
- **Two copies of the rules have to agree.** The browser's prediction is only
  right if it runs exactly the server's rules, so `game/sim.ts` is pure and
  deterministic, with no clock, no window and no socket, and every random draw
  comes from the race's seed. A rule that touched the DOM or `Math.random()`
  would quietly break prediction.
- **Your own bike gets corrected.** When the server disagrees, one's own bike
  is pulled back to it. The first version did that 30% of the way in one
  frame, against a history that still held the uncorrected path, so one error
  was corrected over and over: a 0.94 m jolt of the whole picture. The
  correction is now spread over the next steps, and at worst moves 0.06 m in a
  frame.
- **Anything decided by timing has to allow for the network.** A weapon can be
  snatched in the last 0.12 s of its 0.36 s draw-back. The window had to be
  worked back from how late a draw-back reaches someone's screen (snapshot
  spacing plus interpolation plus half a round trip) and how late their key
  then reaches the server, not picked by feel.
- **Contact you cause is felt twice over.** One's own rubs, shunts and
  run-overs are felt as they are predicted, so they land on the keypress, and
  the server then confirms them; the client has to recognise the confirmation
  and not play it again.

## Held by

- `spec/netview.test.ts` replays a 40 s race with snapshots delivered exactly
  as late as the live server's arrived (`spec/fixtures/arrivals.json`), drawn
  at 60 fps, and counts frames where a bike is drawn off its real movement.
- `spec/ram.test.ts` rams bikes through the whole server-to-browser path, with
  a server that hears keys 40 ms late, and fails if a bike is ever drawn inside
  another.

## The strongest case against it

From campus, round trips to the Fly app were 16-44 ms, small enough that option
1's lag might not be felt. I have not measured from off campus or from a phone
on mobile data, where it would be larger, and those are exactly the players a
public game gets.
