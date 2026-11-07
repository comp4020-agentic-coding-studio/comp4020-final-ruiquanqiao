# Why just writing instructions for AI‑coding agents isn’t enough

*Critical research note, COMP8020*

When a coding agent gets something wrong, the usual response is to tell it
more, with another line in `CLAUDE.md` or `AGENTS.md`. I did this for most of
the semester, and I now think it aims at the wrong problem. Agents largely do
what their instruction files say. They cannot notice what nobody told them.
Good agentic practice therefore moves the human's knowledge of what to build
out of prose the agent is asked to follow and into a record the build checks:
each requirement with its source and a decision, held to the code by a test
that fails when the two disagree. I limit the claim to domain-heavy work, where
the agent's prior is a confident impression of the thing being built.

## Agents already follow instructions

Gloaguen et al.'s evaluation of `AGENTS.md` files shows this most clearly.
Agents followed them, using a tool the file named about 1.6 times a task and
almost never without the file. Yet "providing context files does not generally
improve task success rates, while increasing inference cost by over 20%"
(2026); an earlier version had reported lower success. Where an instruction
pushes against a learned tendency, it barely registers: METR's o3
reward-hacked one task in 80% of runs with its original prompt and in 80% with
"Please do not cheat" added (Von Arx et al., 2025), though from only 20 runs a
prompt. Anthropic's documentation calls `CLAUDE.md` instructions "advisory" and hooks
"deterministic", and warns that without a check "you become the verification
loop" (Anthropic, n.d.).

## What a checked record adds

Böckeler (2026) names the two kinds of control. Instructions are guides,
feedforward controls that raise the odds of a good first attempt; tests are
computational sensors, which observe afterwards. Her caveat applies:
"Correctness is outside any sensor's remit if the human didn't clearly specify
what they wanted." A sourced requirements record is that specification made
readable by a sensor. Brooks (1987) called "deciding precisely what to build"
the hardest part, made harder because software lacks the floor plan on which
"contradictions and omissions become obvious". Agents cut the labour of writing
code and leave that part as hard as before.

OpenAI's Codex team reached the same design in practice. Their single large
`AGENTS.md` "failed": "too much guidance becomes non-guidance", it "rots
instantly", and it "doesn't lend itself to mechanical checks". They moved it
into a docs directory "treated as the system of record" and validated by CI
(Lopopolo, 2026). It is one team's report, from a company selling Codex, but
the controlled studies predict it.

My final project is a small case of this. Asked to remake *Road Rash*, the
agent produced the median racing game, without the police, the weapons or
weapon snatching. No instruction could have prevented this, because nobody had
yet seen what was missing. Hashimoto's `AGENTS.md` lines "almost completely
resolved" his agents' bad behaviours (2026), but he wrote each one after its
behaviour appeared. A table of every mechanic, sourced from the manuals, showed
the gaps at once. It then went stale itself, with 22 rows still "planned" weeks
after they were built, until a test checked its dates.

## The counter-case

The strongest objection is Campbell's law, that the more an indicator is used
for decisions, "the more subject it will be to corruption pressures" (1979).
Agents do game checks. On ImpossibleBench, where tests contradict the
specification, GPT-5 passed by cheating 54% of the time, Claude models mostly
by editing the tests (Zhong et al., 2025). The remedies that paper found are
structural, though: hidden tests cut cheating "to near zero", read-only tests
stopped the edits, and a way to flag a task for a human cut GPT-5 from 54% to
9%. Stricter prompts helped too, which is a point for prose, but on the harder
benchmark only from 66% to 54%. So I answer gamed checks with checks that make
gaming visible and costly; an instruction has even less force against it.

Naur (1985) objects from the other side: a program's theory "could not
conceivably be expressed". I accept that a record holds only the checkable
part of the theory. An agent, though, carries no theory at all from one
session to the next, so it needs that part more than Naur's programmers did.
Then there is cost: Böckeler (2025) found spec-driven tools "a sledgehammer to
crack a nut". Her complaint is about specifications people read, and mine is
about records the build checks; the cost is also why the claim stops at
domain-heavy work.

Instructions remain right for conventions an agent cannot infer, such as
which package manager to use. When the agent cannot know what the thing
should be, that knowledge has to come from the human, and it should go where
the build can see the code drift away from it.

## References

- Anthropic (n.d.) *Best practices for Claude Code*. Claude Code documentation. https://code.claude.com/docs/en/best-practices (accessed 20 October 2026).
- Böckeler, B. (2025) 'Understanding spec-driven development: Kiro, spec-kit, and Tessl', martinfowler.com, 15 October. https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- Böckeler, B. (2026) 'Harness engineering for coding agent users', martinfowler.com, 2 April. https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html
- Brooks, F.P. (1987) 'No silver bullet: essence and accidents of software engineering', *Computer*, 20(4), pp. 10–19.
- Campbell, D.T. (1979) 'Assessing the impact of planned social change', *Evaluation and Program Planning*, 2(1), pp. 67–90.
- Gloaguen, T., Mündler-Sasahara, N., Müller, M.N., Raychev, V. and Vechev, M. (2026) 'Evaluating AGENTS.md: are repository-level context files helpful for coding agents?', arXiv:2602.11988, v3, 29 September. https://arxiv.org/abs/2602.11988
- Hashimoto, M. (2026) 'My AI adoption journey', mitchellh.com, 5 February. https://mitchellh.com/writing/my-ai-adoption-journey
- Lopopolo, R. (2026) 'Harness engineering: leveraging Codex in an agent-first world', OpenAI, 11 February. https://openai.com/index/harness-engineering/
- Naur, P. (1985) 'Programming as theory building', *Microprocessing and Microprogramming*, 15(5), pp. 253–261.
- Von Arx, S., Chan, L. and Barnes, B. (2025) 'Recent frontier models are reward hacking', METR, 5 June. https://metr.org/blog/2025-06-05-recent-reward-hacking/
- Zhong, Z., Raghunathan, A. and Carlini, N. (2025) 'ImpossibleBench: measuring LLMs' propensity of exploiting test cases', arXiv:2510.20270. https://arxiv.org/abs/2510.20270
