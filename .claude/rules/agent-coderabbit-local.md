# Agent Rules — coderabbit-local (external CLI)

> External LLM reviewer (`coderabbit review --plain --base master --type committed`) | Trigger: pre-push, mid-development | Non-blocking

## Purpose
CodeRabbit local CLI runs the same review engine that comments on PRs, against the local branch diff before push. Catches things our internal agents systematically miss — observability gaps on `.select('id')` chains, runtime guard omissions on RPC casts, cleanup ordering, helper hoisting, error-path consistency. Cheaper to run pre-push than to triage on the PR after CI.

The runtime command is `/crlocal`. This file is the binding policy.

## Trigger Conditions
- **Pre-push:** every multi-commit branch (2+ commits) before pushing. Required step in `/fullpush`.
- **Mid-development:** when a single commit added 200+ LOC of new code, or when the orchestrator wants early signal before continuing.
- **Skip if:** `which coderabbit` returns nothing — tell the user to install via `https://docs.coderabbit.ai/cli/`.

Do NOT run after every commit — too slow (2-5 min per round), no value on small fix commits.

## Apply-vs-Defer

The triage table below decides class; the apply/skip/defer **verdict** is bound by `agent-workflow.md § Apply-vs-Defer Discipline`. **Default to APPLY.** DEFER requires ≥30 LOC, separate concern, and a design decision the PR doesn't establish — all three. Defer-budget per PR is 0-2; 3+ is a red flag.

## Finding Classification (read source, do not trust labels)

Every CR finding falls into exactly one of these classes. Severity labels (`trivial`, `minor`, `major`, `critical`, `nitpick`, `potential_issue`) are advisory — verify against the actual code.

| Class | What it looks like | Verdict |
|---|---|---|
| **Real safety** | Missing error path, missing runtime guard on `as unknown as T` cast, unhandled rejection, race condition, leak, silent zero-row no-op | **APPLY** |
| **Project rule alignment** | Violates a rule in `code-style.md` or `security.md` (e.g. §5 mutation `{ error }` destructure, §5 cast guard pairing, §10 audit-event subquery soft-delete filter) | **APPLY** |
| **Readability that aids a future reader** | Helper hoisted out of a loop, name clarifies a non-obvious branch, comment explains a hidden invariant | **APPLY if < 10 lines** |
| **Aesthetic preference** | Pure style choice with no observable behaviour change; prefers a different but equivalent shape | **SKIP with reason** |
| **Contradicts the codebase pattern** | Suggestion would diverge from how 5+ similar files do the same thing (codebase consistency wins) | **SKIP with reason** |
| **Scope expansion** | "While you're here, also rewrite X" — outside the PR's purpose | **DEFER to GitHub Issue** |

## Stop Conditions for the Loop

CodeRabbit is an LLM. It does not converge — it can find a new nit on every round. The loop ends when ANY of these is true:

1. Round comes back with **0 findings**.
2. **≥ 75% of a round's findings** are `Aesthetic preference` or `Contradicts codebase pattern`.
3. **Two consecutive rounds** produce only stylistic findings with zero APPLY verdicts.
4. **4 fix commits driven by CR local** on the current branch — escalate to user judgment beyond that.

## Handling Results

### DO
- Run via `/crlocal` slash command — never call `coderabbit review` ad hoc; the command embeds the protocol.
- Read the source for every finding before triaging — CR's labels are LLM-generated, not authoritative.
- Apply each APPLY-verdict finding in a focused commit (one subject per commit). Don't batch unrelated fixes.
- Report a per-round summary table (file:line / severity / class / verdict / why) to the user before re-running.
- Re-run the review after each fix commit — fixes can surface new findings that weren't visible before.
- For DEFER verdicts, file a GitHub Issue with the CR comment context (severity, file, line, suggestion).
- Stop the loop the moment a stop condition trips. Tell the user which condition tripped.
- Treat findings labeled `nitpick / trivial` with the same source-reading rigour as `potential_issue / major`. Severity labels are unreliable.
- When SKIPPING, give a concrete reason (cite the codebase pattern, point to a code-style rule, or explain the trade-off).

### NEVER
- Trust CodeRabbit's severity label as a triage shortcut — read the code.
- Apply every finding to make CodeRabbit silent. Refactor-induced bugs creep in this way.
- Skip a finding because "it's just a nit" — past PRs had `nitpick / trivial` findings that were genuine project-rule violations (PR #108 round 1: 3 such findings on `.select('id')` observability; round 2 caught a missing error path on `full_name` restore labelled trivial).
- Run more than 4 fix-driven loops without escalating to the user.
- Bypass the skip-with-reason requirement. Silent skips are forbidden — every skip needs a one-line rationale in the round summary.
- Run CR local as a pre-push git hook. The wall-clock is too long, the protocol needs orchestrator judgment, and `--no-verify` would be the natural workaround. The orchestrator runs it via `/fullpush`.
- Defer something that's < 10 lines. The "<10 lines = fix now" rule from `agent-workflow.md` overrides DEFER for tiny fixes.

## Common Pitfalls Observed (PR #108, 2026-05-07)

These are the patterns CR local caught that our internal agents missed. Update this list as new ones surface.

1. **Service-role cleanup discarding `.select('id')` result.** code-style.md §5 explicitly requires logging on `data?.length > 0` even for cleanup-context where zero rows is valid. Internal agents read `.select('id')` is present and stop there.
2. **Cast `as unknown as T` without runtime guard.** code-style.md §5 requires pairing the cast with `Array.isArray`/`typeof` checks. Internal agents accept the cast as type assertion.
3. **Silent failure paths on cleanup.** `await admin.from(...).update(...).eq(...)` without `{ error }` destructure in afterEach blocks. Same pattern as the §5 mutation rule but in test infrastructure.
4. **`.clear()` of in-memory ID set unreachable on cleanup throw.** Need try/finally so state resets on both success and error paths, otherwise next afterEach masks its own state.
5. **Helper functions defined inside `for`-loop iteration.** Closures over loop-scoped vars + harder to scan. Move out, accept as parameter.

---

*Last updated: 2026-05-07 (created during PR #108 OWASP coverage cycle)*
