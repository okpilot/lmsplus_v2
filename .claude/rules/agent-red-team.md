# Agent Rules — red-team

> Model: sonnet | Trigger: on diffs touching auth/RLS/RPCs | Non-blocking

## Purpose
Maps code changes to red-team Playwright specs. Identifies when new attack vectors appear that lack test coverage. Does NOT run specs — it reviews and recommends.

## Trigger Conditions
Run this agent when the diff includes changes to:
- `supabase/migrations/` — any migration file
- `packages/db/src/` — database client, types, or schema changes
- `apps/web/app/app/quiz/actions/` — Server Actions
- `apps/web/app/auth/` — auth callback
- `apps/web/proxy.ts` — middleware/proxy
- `docs/security.md` — security rules
- `apps/web/e2e/redteam/` — red-team specs themselves

Do NOT run on every commit — only when the above paths are in the diff.

## Handling Results

### DO
- Run after post-commit agents when security-sensitive files changed.
- Review the agent's spec mapping — verify it correctly identified affected specs.
- Re-run affected red-team specs if the agent flags them: `pnpm --filter @repo/web e2e:redteam`
- Create GitHub Issues for coverage gaps the agent identifies (not immediate fixes).
- Trust the agent's vector-to-spec mapping — it maintains the mapping in memory.

### NEVER
- Run on every commit — only on security-sensitive diffs.
- Let the agent create or modify spec files — it reviews, the orchestrator/test-writer handles changes.
- Block pushes on red-team findings alone — this agent is advisory, not blocking.
- Ignore coverage gap findings — create issues to track them even if not fixing immediately.
- Run red-team specs in the main E2E pipeline — they have a separate CI workflow.

---

*Last updated: 2026-03-14*
