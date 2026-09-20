# Agent Memory — doc-updater

> Recipe library for keeping `docs/*.md` and `MEMORY.md` in sync with code changes.
> Index only — see `.claude/rules/agent-memory.md` for the governance format.

## Durable knowledge

- No tracker table yet — doc-updater adds one only once a doc-drift pattern recurs ≥2× (per `.claude/rules/agent-memory.md`).
- The binding scope rules (cross-reference audit, steering drift, severity escalation) live in `.claude/rules/agent-doc-updater.md` — this file holds only the doc-sync recipes.
- When a rules file POINTS to an agent file for content, verify the SPECIFIC content exists at the target after movement/refactor (instance 2026-09-07: pointer became a lie when target was deleted).
- **Prose-paths guard mirror scope (2026-09-16):** When the guard's detection pattern widens, `.coderabbit.yaml` false-positive description must match. Commit 4714a817 widened pattern; 3846352f updated mirror at `.coderabbit.yaml:314`.
- **Section name changes in agent-workflow.md (2026-09-17):** "## Post-Implementation Pipeline Order" → "## Pre-Push Review Gate". Cross-reference audit for dangling refs.
- **SATURATED state and RULE EXISTS retirement (2026-09-20):** Learner tracker adds `SATURATED` (rule text exists, recurrence is behavioral). `RULE EXISTS` token retires to `SATURATED`. Four docs updated terminal-state lists. No steering drift. Spec commands verified (headroom OK at 166L/24KB, RULE CANDIDATE count 219, bash-bypass confirmed). Stop-hook 4 locations fixed; no 5th surface found.

## Recipes (abbreviated — full versions in comments above or .claude/rules/agent-doc-updater.md)

- Migration reveals constraint → add to `docs/database.md` § Migration Rules
- RPC superseded → mark old `(DEPRECATED)`, add new section, record Decision
- Playwright E2E → mark phase complete in `docs/plan.md`, update test counts
- Commit corrects false comment rationale → search docs for same false claim (instance: mc-content gate, 2026-08-18)
- Doc says issue deferred but branch closes it → grep docs for that issue #, update prose
- Claim re-typed unchanged in reflowed block → re-derive from source, not re-read (instance: generate-agent-files.js byte-for-byte claim, 2026-09-02)
- CI gate added → audit `CLAUDE.md` §QA-pipeline for ambiguity (instance: unit test clarity, 2026-09-06)
- Async pipeline clarified → verify `docs/plan.md` diagram and `CLAUDE.md` state async clearly, check steering docs
- Rule concept renamed → grep for old term across `.claude/rules/*.md`, `.claude/agents/*.md`, `.claude/commands/*.md`; old term survives ONLY in historical passages
- Rule file changed → bump footer to commit date; widen footer sweep beyond single-commit scope
- Memory-only commits → audit binding docs for stale COUNT citations via grep

*Last updated: 2026-09-20*
