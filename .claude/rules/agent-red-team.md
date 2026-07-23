# Agent Rules — red-team

> Model: sonnet | Trigger: on diffs touching auth/RLS/RPCs | Non-blocking

## Purpose
Maps code changes to red-team Playwright specs. Identifies when new attack vectors appear that lack test coverage. Does NOT run specs — it reviews and recommends.

## Trigger Conditions
Run this agent when the diff includes changes to either: the canonical security-path set (`agent-workflow.md § Red-Team Agent Trigger`) OR `apps/web/e2e/redteam/` (spec changes trigger this agent specifically). The full path list:
- `supabase/migrations/**` — any migration file
- `packages/db/src/**` — database client, types, or schema changes
- `apps/web/app/app/quiz/actions/**` — Server Actions
- `apps/web/app/auth/**` — auth callback
- `apps/web/proxy.ts` — middleware/proxy
- `docs/security.md` — security rules
- `apps/web/e2e/redteam/` — red-team specs themselves (this agent's extra path, by design — not part of the canonical set)

Do NOT run on every commit — only when the above paths are in the diff.

## Handling Results

### DO
- Run after post-commit agents when security-sensitive files changed.
- Review the agent's spec mapping — verify it correctly identified affected specs.
- Re-run affected red-team specs if the agent flags them: `pnpm --filter @repo/web e2e:redteam`
- Create GitHub Issues for coverage gaps the agent identifies (not immediate fixes).
- Trust the agent's vector-to-spec mapping — it maintains the mapping in memory.
- **Read the actual migration before writing any column filter, table assertion, or schema-derived value in a red-team spec — never author one from memory of the schema.**
  - Promoted at count=3 (PR #769: `quiz-draft-injection.spec.ts` soft-deleted via a `deleted_at` column `quiz_drafts` does not have; two prior in-session occurrences f278d5c, a396438).
  - The first two were caught by CI before merge; the third reached production because Red Team Specs was non-required.
  - Verify the column exists (`grep` the `CREATE TABLE` / latest `ALTER`/`CREATE OR REPLACE`), and trace the `CREATE OR REPLACE FUNCTION` chain to the latest definition for RPC/trigger assertions.
- The soft-delete **column-existence guard** (`.claude/hooks/check-soft-delete-guard.mjs`, code-style.md §5) mechanically blocks `.is('<column>')` on any table when `<column>` is not a real column of that table (schema-derived from `packages/db/src/types.ts`, #933) in PRODUCTION code — but red-team spec files are NOT covered by it, so the "read the migration" rule above still applies when authoring a spec that asserts soft-delete behavior.
- **Before allocating new vector IDs in `attack-surface.md`, take the highest existing ID from BOTH the `origin/master` matrix (`git fetch origin master` then `git show origin/master:.claude/agent-memory/red-team/topics/attack-surface.md`) AND the current working-tree matrix, then start at max+1 — never trust a max-ID (or a "spec count") computed by Explore/plan-critic against the feature branch.**
  - Promoted at count=3 (#793 renamed BL/BM/BN→CU/CV/CW on a matrix ID collision; #802 reassigned 10 internal-exam self-labels to CX–DG; #326 allocated CX–DC against a pre-#802 branch where the matrix max still read CW, corrected to DH–DM at execution time).
  - The matrix is a high-churn shared file: sibling PRs (#796/#802/#817) can merge between a branch's cut and the work, advancing both the max ID and the red-team spec-count literal. Cut the work branch off `origin/master` and take the max across BOTH refs BEFORE allocating — a stale branch silently understates both. BOTH reads are required and neither alone is sufficient: `origin/master` catches sibling PRs that merged after your branch was cut, while the WORKING TREE catches IDs this branch's own earlier commits already allocated (a `/automerge` batch carries 3-8 spec issues, so second-batch allocations collide with first-batch ones if you read only the merged baseline). Read `origin/master`, NOT the bare local `master`: the local ref is routinely stale and must not be fast-forwarded as a workaround (see `agent-workflow.md § Always diff against origin/master, never the bare local master`, #1134).
  - When re-lettering a spec's self-labels, grep ALL cross-reference forms — `Vector X`, `(mirror of X)`, `vs X`, bare `(X)` — not just `Vector X`; a narrow grep leaves stale labels (#326 missed a `(mirror of BI)` title).

### NEVER
- Run on every commit — only on security-sensitive diffs.
- Let the agent create or modify spec files — it reviews, the orchestrator/test-writer handles changes.
- Block pushes on red-team findings alone — this agent is advisory, not blocking.
- Ignore coverage gap findings — create issues to track them even if not fixing immediately.
- Run red-team specs in the main E2E pipeline — they have a separate CI workflow.

---

*Last updated: 2026-07-23 (vector-ID allocation now reads the matrix from `origin/master`, not a fast-forwarded local `master`; #1134. Prior: 2026-06-09 vector-ID allocation rule, #820/count=3.)*
