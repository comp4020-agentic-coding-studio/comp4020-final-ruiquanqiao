# Which claims are tested, and which are judged

What the [README](../README.md) claims, and what holds each claim. A test is run by `pnpm check`; a script is run against the deployed app.

| Claim | How it is held |
|---|---|
| Every mechanic has a sourced decision, none overdue | `spec/ledger.test.ts` |
| A steer in one browser shows in another within a second | `spec/realtime.test.ts` |
| Other bikes move smoothly however late snapshots arrive | `spec/netview.test.ts`, on arrivals recorded live |
| No one can steer another person's bike; a room holds eight | `spec/lobby.test.ts` |
| The leaderboard, qualifications and log survive a restart | `spec/persistence.test.ts` |
| Every page passes axe, and every link here opens | `spec/a11y.test.ts`, `spec/readme.test.ts` |
| A blow moves like one on every frame, not only its key poses | `spec/motion.test.ts`, and a contact sheet before it ships |
| A punch lands with weight | Judged by playing it and reading the contact sheet; the tests reach only "not wrong" |
| Every helmet goes with its leathers | `spec/liveries.test.ts` |
| It looks like the original | Judged frame beside frame against 137 screenshots, each in a commit |
| It handles like the original | Ridden, then pinned as numbers in `spec/feel.test.ts` |
| It holds up over a bad network | Ridden at 300 ms with 3% loss, and with 8 scripted people |
| It works from the keyboard alone and survives a mid-race resize | `scripts/rough.ts` on the deployed app |
| Two people who follow this page race each other and reach the leaderboard | `scripts/marker.ts` on the deployed app, two browsers without shared cookies, one per marking viewport |
