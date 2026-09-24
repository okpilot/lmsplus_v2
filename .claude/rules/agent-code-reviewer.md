# Agent Rules — code-reviewer
> Model: sonnet | Trigger: pre-push review gate — round 1 and every later round | Blocking: on merge to main

## Purpose
Checks the branch diff (`git diff origin/master...HEAD`) against `.claude/rules/code-style.md`. Catches mechanical violations: naming, nesting depth, `any` types, barrel files, useEffect misuse, missing tests.

## Severity Levels
| Level | Meaning | Action |
|-------|---------|--------|
| BLOCKING | Hard rule violation (logic in page, barrel file) | Fix now, in the round's pooled fixup commit. |
| WARNING | Soft violation (long function, deep nesting, naming) | Fix if under 10 lines. Otherwise triage via `agent-workflow.md § Apply-vs-Defer Discipline`: apply by default; DEFER with a filed issue only when all three defer conditions hold; else SKIP with a written reason. Asking the user is a STEP toward one of those three, never a terminal state. |

## Handling Results
### DO
- Read every finding, even warnings — they signal drift before it becomes blocking.
- Fix all BLOCKING findings before any other work continues.
- Group every round's fixes — BLOCKING and otherwise — into that round's ONE pooled fixup commit.
- Measure a function-length finding on the BODY — its first `{` to the matching `}` — never
  declaration-to-next-declaration, which sweeps the FOLLOWING JSDoc into the count and reports a
  compliant function as over.
- Count a function already over the cap at `origin/master` that the diff makes longer (`code-style.md` §8).
- Note watch items in the summary. File-size headroom is NOT the reviewer's to count — it no longer counts lines. For per-rule compliance run `node .claude/hooks/check-file-size-guard.mjs --stats`; for one file's headroom, `wc -l` against that rule's cap in `.claude/limits.json` (agrees with the guard except on a file lacking a trailing newline, where the guard counts one MORE). `--stats` does NOT report headroom.

### NEVER
- Dismiss a BLOCKING finding. It must be fixed, no exceptions.
- Push with any unresolved BLOCKING finding.
- Argue that a file "needs" to be over the limit — split it.
- Suppress the reviewer by adding ignore comments to source code.
- Duplicate the reviewer's work — don't manually check style if the reviewer is running.
- Let the reviewer check files outside the branch diff (scoped to that range only).
- Flag the branch for bloat it did not introduce: judge only what the diff adds or worsens. File SIZE is now mechanical — `check-file-size-guard.mjs` ratchets against `.claude/limits.json`, so the reviewer no longer counts lines. The principle still governs every other mechanical check.

## Known Suppressions
The agent definition (`.claude/agents/code-reviewer.md`) carries a `## DO NOT (explicit suppressions)` list — the authority; the summary below is a reading aid, not a census. Intentional, do not flag:
- Hydration guard `useEffect` (not data fetching)
- 4-param infrastructure utilities (documented JSDoc exception)
- Duplicate types under 3 instances
- React render/return bodies 30–35 lines (pure JSX composition — see code-style.md §3)
