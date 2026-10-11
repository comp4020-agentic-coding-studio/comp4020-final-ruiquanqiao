# Crit 9 reflection

## What was the breakthrough that moved the work forward?

Learning not to trust which thing on the screen looked wrong. Twice this week
the race looked broken in a way that pointed at other people's bikes: the
rider I was passing jerked and flickered, and later the whole field seemed to
shake along the road. The obvious fix both times was to smooth the other
riders; I measured instead. A probe on the live server showed snapshots
arriving anywhere from under 10 ms to 111 ms apart, and a test that replays
exactly those arrivals turned the stutter into a count: 451 bad frames, then
none. Then, recorded frame by frame, the other riders
moved 2 cm from one frame to the next, and my own bike jumped 57 cm, with the
camera carrying the jump onto everything around it. The fault was in the one
bike I was not looking at. Once the real-time behaviour could be read as
numbers, the network stopped being a mystery and became something a test
holds.

## What did this work change about who I want to be as a software developer?

It changed what I think fairness means in software. At the start of the week
the AI riders picked on a person 37 times as readily as on each other, and
could burst past on nitro with nothing on screen to say why. Both felt like cheating,
and both were rules I had let the agent write without asking who they
favoured. I want to be the developer who notices when a system treats
people differently, can say by exactly how much, and writes the fair rule down
where a test holds it: the same bike for everyone, a person and an AI rider
picked alike. With several people in one race, fairness is not polish; it is
the product.
