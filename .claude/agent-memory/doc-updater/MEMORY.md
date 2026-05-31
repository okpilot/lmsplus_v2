# Agent Memory — doc-updater

> Recipe library for keeping `docs/*.md` and `MEMORY.md` in sync with code changes.
> Index only — see `.claude/rules/agent-memory.md` for the governance format.

## Durable knowledge

- No tracker table yet — doc-updater adds one only once a doc-drift pattern recurs ≥2× (per `.claude/rules/agent-memory.md`).
- The binding scope rules (cross-reference audit, steering drift, severity escalation) live in `.claude/rules/agent-doc-updater.md` — this file holds only the doc-sync recipes.

## Recipes

### Migration reveals an undocumented structural constraint
1. Add it to `docs/database.md` § Migration Rules as a numbered rule with a clear explanation; include example syntax where relevant (e.g. `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE` when the return type changes).
2. No changes to `plan.md`, `decisions.md`, or `security.md` if the migration itself was already documented as complete.
3. Bump the `docs/database.md` footer timestamp.

### RPC superseded / deprecated by a newer one
1. `docs/database.md` § RPC summary table — mark the old RPC `(DEPRECATED — use <new_rpc>)`; list the new RPC separately with its purpose.
2. RPC detail sections — add a deprecation header to the old RPC's section; document the new RPC in full (parameters, behavior, atomicity guarantees).
3. `docs/decisions.md` — record the deprecation as a CONFIRMED DECISION section, explaining the problem the new RPC solves (atomicity, partial-failure risk, etc.).
4. Bump footer timestamps in both `docs/database.md` and `docs/decisions.md`, noting the reason.

### Internal hook / utility extraction (not a breaking API change)
- No doc updates needed when the hook/util is an internal implementation detail.
- Document only if it becomes public API or is reused across multiple features.

### Playwright E2E tests added
1. `docs/plan.md` — mark the relevant phase complete; list the new specs, helpers (Mailpit, Supabase), and scripts (`pnpm e2e`, `e2e:ui`, `e2e:headed`); update the status line and footer.
2. `MEMORY.md` — keep the Tests summary count accurate (unit + integration + E2E); note any newly configured tooling (e.g. `@playwright/test`).
3. Files to check: `apps/web/playwright.config.ts`, `apps/web/e2e/`, `apps/web/package.json` (new scripts), `pnpm-lock.yaml` (new dep).
