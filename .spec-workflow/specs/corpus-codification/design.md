# Corpus Codification — Design

## The enforcement ladder

Every rule sits somewhere between "someone must remember it" and "it cannot be expressed".
The higher you push it, the less it costs forever.

| Level | Enforcement | Ongoing cost |
|---|---|---|
| 1 Convention | none | dies with the person |
| 2 **Documentation** | none — drifts silently | **attention, forever** |
| 3 Code review | a human, inconsistently | slow, diff-scoped |
| 4 Linter | a program reads source | ~free once written |
| 5 Type system | the build refuses | free — a wall, not a warning |
| 6 Tests / fitness functions | run it, assert | cheap |
| 7 DB constraints | the data layer refuses | holds even if all app code is wrong |
| 8 Structurally impossible | cannot be expressed | free, permanent |

The corpus is almost entirely **level 2** — the worst square: zero enforcement, maximum cost.

Most rules here are about the SHAPE OF THE REPOSITORY, not a line of code, so the target is
usually level 6: a **fitness function** — an ordinary test that reads the filesystem and
asserts a structural property. `.claude/pipeline.test.mjs` was already one.

## Two moves, not one — DELETE or PIN

A copy is deletable only when its consumer can follow a pointer.

- **DELETE** — the consumer can dereference: the orchestrator, agents, docs, specs.
- **PIN** — the consumer CANNOT: `.coderabbit.yaml` sees the diff plus its own literal text
  (`agent-workflow.md § Rule-Mirror Sync`). A pointer there does not sync the rule, it
  DELETES the enforcement. Keep the literal and add a test asserting it matches the source.

A pinned copy is still strictly better than prose: machine-verified rather than hand-kept.

## The ratchet

A hard "fail if anything violates" check fails on day one and gets switched off. Instead:
freeze current violations in a visible baseline; fail on a NEW violation, or on a baselined
entry whose recorded size CHANGES IN EITHER DIRECTION.

The shrink half is load-bearing: the baseline is keyed on PATH, so a "grew only" check lets a
baselined file's contents be replaced in place by unrelated still-violating content and
reports nothing. Exact-match turns silent absorption into a visible edit.

**Escape valve is mandatory.** Exact-match means every legitimate shrink fails CI until the
number is updated. Without an explicit `--update-baseline` flag (human-invoked, human commits
the diff — never a silent self-rewrite, which is laundering) the check becomes annoying and
gets disabled. This is the single biggest risk to the whole programme.

## Convergence — one harness, not N programs

Slice 1 predicted the shared abstraction would surface at slice 3. It surfaced at slice 2:
R1/R2/R3 of that slice are all *"for each X matching a pattern, assert the corresponding Y
exists"*. Build `check-companion-file.mjs` + a config, not three more 250-line guards.

Do NOT retrofit slice 1's guard into the harness yet — two examples is not enough to see the
right abstraction. Rule of three.

## What codification does NOT buy

**It barely shrinks the corpus.** Slice 1 replaced a 45-line section and the injected corpus
did not get smaller (derive: `wc -l CLAUDE.md .claude/rules/*.md`). You delete a table and write a paragraph explaining the mechanism.
The size win is in DELETING ARCHAEOLOGY (R6), which is a different activity with different
economics: large size win, no correctness win, low cost.

| | Deleting archaeology | Codifying |
|---|---|---|
| Size win | large (~1,800 lines) | ~10 lines per rule |
| Correctness win | none | large — drift becomes impossible |
| Cost | low | ~a day per rule family |

**Ordering follows from this:** enforcement-of-maintenance compounds, deletion does not.
Archaeology is not decaying; an unenforced "ship tests with new code" rule is.

## Lessons that must not be relearned

1. **Measure the baseline BEFORE designing the check.** Slice 1's naive check reported 74
   violations; 37 were the check being wrong. Wired as-is, it would have been disabled in a day.
2. **Mutation-test, or it is decoration.** Slice 1's first pass: 11 caught, 3 survived — two
   were tests asserting against a FIXTURE rather than the live config, so deleting an entire
   exclusion left the suite green.
3. **Do not measure a state your own commit then changes.** Three separate counts shipped
   wrong in slice 1, all from this. The fix is not a fourth correction: a ratio over a growing
   set is an OPEN set, so state the derivation, never the number (`code-style.md` §10 cl.2).
4. **A guard's own artifacts are subject to it.** Slice 1's test file crossed the cap it
   enforces. Split it — do not grandfather a file written minutes earlier.
