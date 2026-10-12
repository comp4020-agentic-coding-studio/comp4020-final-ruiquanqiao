# Crit 10 reflection

## What was the breakthrough that moved the work forward?

Reading my own logs as the person who has to narrate from them. The server
had logged since the first deploy, and I had treated that as done. Then I
tailed the live app the way the crit will make me, and a line read
`{"ev":"connect","rider":2}`: a number, and nothing to say which classmate it
was. Inside a race it was worse. Blows were logged by each bike's number in
that race, nothing tied those numbers to people, and fifteen NPCs fighting each
other wrote a line every few tenths of a second, burying the two people I
would be talking about. Now every line names a person as `Ana#60`, the start
of a race says which bike is whose, an event no person is part of is left out,
and each line is also kept in the database, because Fly's own buffer empties
on a restart. A rehearsal with two browsers read back as a story: connect,
rename, queue, accept, start, crash, quit.

## What did this work change about who I want to be as a software developer?

It changed who I think a system is written for. A log written for the machine
was easy and told me nothing. The same was true of the rules about who may
change what: the server already refused to let one person steer another's
bike, but that decision lived only in the code, where nobody could check it.
Writing it down as a decision record made me look for what it leaves open,
and it leaves open one person racing several bikes from several tabs. I want
to be the developer who writes for whoever has to read the system later,
whether that is a marker, a teammate or me at 2 a.m. with the app misbehaving,
and who says plainly what the system does not yet prevent.
