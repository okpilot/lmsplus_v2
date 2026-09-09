# Agent Rules — code-reviewer

> Model: sonnet | Trigger: post-commit | Blocking: on merge to main

## Purpose
Checks every commit diff against `.claude/rules/code-style.md`. Catches mechanical violations: naming, nesting depth, `any` types, barrel files, useEffect misuse, missing tests.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| BLOCKING | Hard rule violation (logic in page, barrel file) | Fix now. Create fix commit in same session. |
| WARNING | Soft violation (long function, deep nesting, naming) | Fix if under 10 lines. Otherwise triage via `agent-workflow.md § Apply-vs-Defer Discipline`: apply by default; DEFER with a filed issue only when all three defer conditions hold; else SKIP with a written reason. Asking the user is a STEP toward one of those three, never a terminal state. |

## Handling Results

### DO
- Read every finding, even warnings — they signal drift before it becomes blocking.
- Fix all BLOCKING findings before any other work continues.
- Group BLOCKING fixes into a single commit when they're in the same file.
- Note watch items in the summary to the user. File-size headroom is NOT the reviewer's to
  count — it no longer counts lines at all. For per-rule compliance run
  `node .claude/hooks/check-file-size-guard.mjs --stats`; for one file's headroom, `wc -l`
  against that rule's cap in `.claude/limits.json` — which agrees with the guard except on a
  file lacking a trailing newline, where the guard counts one MORE. `--stats` does NOT report
  headroom.

### NEVER
- Dismiss a BLOCKING finding. It must be fixed, no exceptions.
- Push with any unresolved BLOCKING finding.
- Argue that a file "needs" to be over the limit — split it.
- Suppress the reviewer by adding ignore comments to source code.
- Duplicate the reviewer's work — don't manually check style if the reviewer is running.
- Let the reviewer check files outside the commit diff (it's scoped to the diff only).
- Do not flag a commit for bloat it did not introduce: judge only what the diff adds or worsens. (For file SIZE specifically this is now mechanical — `check-file-size-guard.mjs` ratchets against `.claude/limits.json`, so the reviewer no longer counts lines at all. The principle still governs every other mechanical check the reviewer does make.)

## Known Suppressions
The agent definition (`.claude/agents/code-reviewer.md`) carries a `## DO NOT (explicit suppressions)` list. It is the authority and it grows; the summary below is a reading aid, not a census. These are intentional — do not flag them:
- Hydration guard `useEffect` (not data fetching)
- 4-param infrastructure utilities (documented JSDoc exception)
- Duplicate types under 3 instances
- React render/return bodies 30–35 lines (pure JSX composition — see code-style.md §3)

---

*Last updated: 2026-08-19*
