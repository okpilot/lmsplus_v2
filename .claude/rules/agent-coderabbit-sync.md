# Agent Rules — coderabbit-sync

> Model: haiku | Trigger: when rules change | Non-blocking

## Purpose
Ensures `.coderabbit.yaml` stays aligned with local rules so that CodeRabbit enforces the same standards we enforce locally. Only runs when source-of-truth files change.

## Trigger Conditions
Run this agent only when one or more of these files change:
- `.claude/rules/code-style.md`
- `.claude/rules/security.md`
- `docs/security.md`
- `biome.json`
- `CLAUDE.md`

Do NOT run on every commit — only when the above files are in the diff.

## Handling Results

### DO
- Run after the learner, since the learner may update rules that trigger a sync.
- Review the agent's report before applying any changes to `.coderabbit.yaml`.
- Verify that the proposed `.coderabbit.yaml` changes match the actual rule changes.
- Commit `.coderabbit.yaml` updates alongside rule changes when possible.

### NEVER
- Run on every commit — it's wasteful when rules haven't changed.
- Let the agent edit `.coderabbit.yaml` without review — it reports diffs, the orchestrator applies.
- Let the agent add rules to `.coderabbit.yaml` that don't exist in local rules (no CodeRabbit-only rules).
- Let the agent remove rules from `.coderabbit.yaml` that still exist in local rules.
- Ignore drift — if the agent reports a mismatch, fix it in the same session.

---

*Last updated: 2026-03-12*
