# Agent Rules — coderabbit-sync
> Model: haiku | Trigger: when rules change | Non-blocking

## Purpose
Ensures `.coderabbit.yaml` stays aligned with local rules so CodeRabbit enforces the same standards. Only runs when source-of-truth files change.

## Trigger Conditions
Run only when one or more of these files change:
- `.claude/rules/code-style.md`
- `.claude/rules/security.md`
- `docs/security.md`
- `biome.json`
- `CLAUDE.md`
- A new **or changed** `.claude/hooks/*.mjs` mechanical guard wired into `lefthook.yml` (pattern-matches source for a rule CodeRabbit also enforces) — edits to an existing guard's detection pattern also require re-mirroring. Mirror into `.coderabbit.yaml` `path_instructions` **in the same commit that adds or changes the guard** — not deferred.

Do NOT run on every commit — only when the above files are in the diff.

## Handling Results
### DO
- Run after the learner — its rule proposals, once applied, can trigger a sync.
- Review the agent's report before applying any changes to `.coderabbit.yaml`.
- Verify proposed `.coderabbit.yaml` changes match the actual rule changes.
- Commit `.coderabbit.yaml` updates alongside rule changes when possible.

### NEVER
- Run on every commit.
- Let the agent edit `.coderabbit.yaml` without review — it reports diffs, the orchestrator applies.
- Let the agent add rules to `.coderabbit.yaml` that don't exist in local rules (no CodeRabbit-only rules).
- Let the agent remove rules from `.coderabbit.yaml` that still exist in local rules.
- Ignore drift — if the agent reports a mismatch, fix it in the same session.
