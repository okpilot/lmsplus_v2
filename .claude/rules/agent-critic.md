# Agent Rules — critic (plan-critic + implementation-critic)

> Model: sonnet | Trigger: pre-commit (plan + implementation) | Blocking: on CRITICAL/ISSUE

## Purpose
Pre-commit quality gates that catch plan-level and implementation-level errors before they reach `git commit`. Plan-critic reviews validated plans against the codebase. Implementation-critic reviews staged changes against the approved plan. Together they reduce the volume of post-commit findings by catching mistakes earlier.

## Severity Levels

Uses the same severity levels as semantic-reviewer (see `agent-semantic-reviewer.md`): CRITICAL, ISSUE, SUGGESTION, GOOD. No new levels introduced.

## Handling Results

### DO
- Run plan-critic on every multi-file plan, after validation and before user approval.
- Fix all ISSUE and CRITICAL findings before proceeding to execution (plan-critic) or commit (implementation-critic).
- Respect the 1-round revision cap for plan-critic. If the revised plan still has ISSUE/CRITICAL findings after one revision, the orchestrator resolves directly.
- Respect the 2-round revision cap for implementation-critic. After 2 rounds between critic and implementer without convergence, the orchestrator takes over.
- Treat SUGGESTION findings as non-blocking — note them in the summary but do not gate on them.
- Validate critic findings before acting on them, same as with semantic-reviewer (see Finding Validation in `agent-workflow.md`).
- For plan-critic CRITICAL findings, the orchestrator resolves directly — do not send back for a revision round.
- Log critic findings in the session summary table alongside post-commit agent results.
- Run implementation-critic on staged changes even for small single-file edits — only plan-critic is skipped for trivial changes.

### NEVER
- Skip implementation-critic, even for small changes. Plan-critic may be skipped for single-file changes under 10 lines, but implementation-critic always runs.
- Loop more than the revision cap (1 round for plan-critic, 2 rounds for implementation-critic). Infinite loops waste time and context.
- Let critics modify code or plans directly. Critics report findings; the orchestrator or implementing agent makes changes.
- Replace post-commit agents with pre-commit critics. Critics are additive — they reduce but do not eliminate the need for post-commit review.
- Dismiss a critic finding because "the post-commit agents will catch it." Fix it now; post-commit agents are the safety net, not the primary gate.
- Let a CRITICAL finding from implementation-critic be handled by the implementing agent. CRITICAL triggers orchestrator intervention directly.
- Run plan-critic on single-file changes under 10 lines — the overhead exceeds the value.

---

*Last updated: 2026-04-03*
