# Agent Rules — code-reviewer

> Model: haiku | Trigger: post-commit | Blocking: on merge to main

## Purpose
Checks every commit diff against `.claude/rules/code-style.md`. Catches mechanical violations: file sizes, naming, nesting depth, `any` types, barrel files, useEffect misuse, missing tests.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| BLOCKING | Hard rule violation (file size, logic in page, barrel file) | Fix now. Create fix commit in same session. |
| WARNING | Soft violation (long function, deep nesting, naming) | Fix if under 10 lines. Otherwise mention to user — let them decide. |

## Handling Results

### DO
- Read every finding, even warnings — they signal drift before it becomes blocking.
- Fix all BLOCKING findings before any other work continues.
- Group BLOCKING fixes into a single commit when they're in the same file.
- Trust the reviewer's line counts — don't second-guess file size measurements.
- Check if a WARNING is close to becoming BLOCKING (e.g., file at 145/150 lines) and fix proactively.
- Note watch items (files approaching limits) in the summary to the user.

### NEVER
- Dismiss a BLOCKING finding. It must be fixed, no exceptions.
- Push with any unresolved BLOCKING finding.
- Argue that a file "needs" to be over the limit — split it.
- Suppress the reviewer by adding ignore comments to source code.
- Duplicate the reviewer's work — don't manually check style if the reviewer is running.
- Let the reviewer check files outside the commit diff (it's scoped to the diff only).
- Flag file size violations where all over-limit lines are pre-existing (no `+` lines in the diff hunk). Only flag size violations introduced or worsened by the commit.

## Known Suppressions
The agent definition (`.claude/agents/code-reviewer.md`) has 7 built-in suppressions. These are intentional — do not flag them:
- Hydration guard `useEffect` (not data fetching)
- 4-param infrastructure utilities (documented JSDoc exception)
- Duplicate types under 3 instances
- Test file line limits (relaxed)
- Config file line limits (relaxed)
- Agent memory file formatting
- `scripts/` directory exclusion

---

*Last updated: 2026-03-12*
