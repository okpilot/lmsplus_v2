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

### RETURNS TABLE widened + sibling RPC added to a family (e.g. migs 118–121 Phase 2)
1. RPC naming/summary table — update the changed RPC's one-liner to mention the new column count and new behavior; add the new sibling RPC as a separate entry.
2. RPC detail section (changed RPC) — replace the `RETURNS TABLE` signature block; explain the structural reason for DROP+CREATE (RETURNS TABLE is not signature-compatible with CREATE OR REPLACE); document new columns + stripping guarantees; document any new security gate added (active-user gate, etc.).
3. Insert a new RPC detail section for the sibling (new RPC) after its closest family member; include guard set, §15 carve-out if applicable, parameter list, return shape, and signature (no full body needed).
4. §3 carve-out list ("Other functions sharing this carve-out") — add the new sibling to the list.
5. Bulk dispatcher refactored (per-type helpers) — update the dispatcher's key-behavior bullets and SQL body; document internal helpers with REVOKE EXECUTE FROM PUBLIC in the key-behavior section; note Decision reference.
6. Footer timestamp — prepend the new update entry.
- Do NOT edit `.spec-workflow/steering/*.md` directly; flag any drift as DRIFT finding.

### Playwright E2E tests added
1. `docs/plan.md` — mark the relevant phase complete; list the new specs, helpers (Mailpit, Supabase), and scripts (`pnpm e2e`, `e2e:ui`, `e2e:headed`); update the status line and footer.
2. `MEMORY.md` — keep the Tests summary count accurate (unit + integration + E2E); note any newly configured tooling (e.g. `@playwright/test`).
3. Files to check: `apps/web/playwright.config.ts`, `apps/web/e2e/`, `apps/web/package.json` (new scripts), `pnpm-lock.yaml` (new dep).
