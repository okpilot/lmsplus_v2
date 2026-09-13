# Corpus Codification — Requirements

> Status: IN PROGRESS. Slice 1 landed with `7ca1f522`; the BRANCH then kept going, into BUILD
> ORDER work that is not Slice 1. The count and the end of the range are derived rather than
> stated, because the earlier form named five commits and `0cc1a4bb` and was outrun:
> `git log --oneline origin/master..HEAD` — which measures the branch, the outer bound, not the
> slice. This spec is the source of truth for the programme; chat history is not. Started
> 2026-09-07, scoped 2026-09-09.

## The problem, measured

The rules that govern how work happens in this repo are **prose**, restated by hand across
the surfaces below. A SNAPSHOT, re-measured 2026-09-13 against this commit's final tree — every
figure here moves on almost any commit, so re-derive rather than quote it:
```
wc -l CLAUDE.md .claude/rules/*.md   | tail -1   # row 1, the injected corpus
wc -l .claude/agents/*.md            | tail -1   # row 2
wc -l .claude/commands/*.md          | tail -1   # row 3
wc -l .coderabbit.yaml                           # row 4
cat CLAUDE.md .claude/rules/*.md .claude/agents/*.md .claude/commands/*.md .coderabbit.yaml | wc -l
```
One command per ROW, because the aggregate alone reproduces only the last line of the table and a
derivation that cannot rebuild what it sits under is not a derivation.

| Surface | Lines | Injected every request? |
|---|---|---|
| `CLAUDE.md` + `.claude/rules/*.md` | **3,410** | YES |
| `.claude/agents/*.md` | 1,421 | on agent dispatch |
| `.claude/commands/*.md` | 863 | on command |
| `.coderabbit.yaml` | 754 | external reviewer |
| **total hand-maintained rule prose** | **6,448** | |

Three independent whole-corpus audits (2026-09-07) converged on ~740 claims, ~50% duplicated
somewhere else, and **23 contradictions** — 11 hand-verified, 1 refuted.

**The root defect, one sentence:** every reviewer is DIFF-SCOPED, so a false claim in text
nobody edits is invisible forever. `CLAUDE.md` told people to run `/project:review` — an
invocation that does not exist — for months, and no gate could ever have caught it.

## The goal

Anything **mechanically checkable** becomes a check and its prose is DELETED. What remains is
genuinely judgment, and is short enough that it actually gets read. Today the judgment is
buried among thousands of lines a machine should be doing.

Estimated landing: **~1,550 injected lines** (from the measured total above). ESTIMATE, not a measurement —
re-derive per slice rather than quoting it.

## Requirements

R1. A rule that is mechanically checkable MUST be a check, not prose.
R2. When a rule becomes a check, every prose copy is DELETED — except where the consumer
    cannot dereference a pointer, in which case the copy is PINNED by a test (see design).
R3. A check MUST fail closed, MUST be mutation-tested, and MUST derive rather than enumerate.
R4. A check adopted onto an already-violating codebase MUST be a ratchet with a visible,
    shrink-only baseline — never a gate that fails on day one.
R5. Every check MUST have a co-located test, and that test MUST be wired into CI. A test
    nothing runs certifies its mechanism unconditionally.
R6. Archaeology (precedent narratives, dated incidents, superseded decisions) is DELETED to
    git history and `docs/decisions.md`, not carried in injected context.
R7. Judgment prose STAYS. The goal is not to enforce everything.

## Non-goals

- Enforcing judgment: PR-split calls, deferral honesty, whether a test is any GOOD.
  (Mutation testing is the closest proxy for the last one and is too slow per-commit.)
- Shrinking the corpus for its own sake. Codification barely shrinks it — see design.
