# Agent Rules — red-team
> Model: sonnet | Trigger: on diffs touching auth/RLS/RPCs | Non-blocking

## Purpose
Maps code changes to red-team Playwright specs. Identifies attack vectors lacking test coverage. Does NOT run specs — it reviews and recommends.

## Trigger Conditions
Run when the diff includes changes to either: the canonical security-path set (`agent-workflow.md § Red-Team Agent Trigger`) OR `apps/web/e2e/redteam/` (spec changes trigger this agent specifically). The full path list:
- `supabase/migrations/**` — any migration file
- `packages/db/src/**` — database client, types, or schema changes
- `apps/web/app/app/quiz/actions/**` — Server Actions
- `apps/web/app/auth/**` — auth callback
- `apps/web/proxy.ts` — middleware/proxy
- `docs/security.md` — security rules
- `apps/web/e2e/redteam/` — red-team specs themselves (this agent's extra path — not part of the canonical set)

Do NOT run on every commit — only when the above paths are in the diff.

## Handling Results
### DO
- Run after post-commit agents when security-sensitive files changed.
- Review the agent's spec mapping — verify it correctly identified affected specs.
- Re-run affected red-team specs if flagged: `pnpm --filter @repo/web e2e:redteam`
- Create GitHub Issues for coverage gaps identified (not immediate fixes). These COUNT toward the `filed >= closed` defer budget; list them in the PR body's `## Deferred` section marked `red-team-gap`, naming the spec or vector each covers (`agent-workflow.md § Apply-vs-Defer Discipline`). A PR whose filings are ALL red-team gaps passes; mixed with ordinary deferrals, it is judged on the ordinary ones alone.
- Trust the agent's vector-to-spec mapping — maintained in memory.
- **Read the actual migration before writing any column filter, table assertion, or schema-derived value in a red-team spec — never author one from memory of the schema.** Verify the column exists by scanning EVERY `ALTER TABLE <table>` in `supabase/migrations/` chronologically to HEAD, not just `CREATE TABLE` plus one latest `ALTER`: a column can be ADDED, RENAMED and DROPPED across separate migrations, so one match only proves it existed at some point. Trace the supersession chain — EVERY form (`agent-workflow.md` § "name EVERY supersession form"), reaching beyond the function body to `ALTER FUNCTION <fn>(<arg types>)`, `DROP TRIGGER` + `CREATE TRIGGER`, and the constraint/index forms — to the latest definition, for the MATCHING SIGNATURE, for RPC/trigger assertions.
- The soft-delete **column-existence guard** (`.claude/hooks/check-soft-delete-guard.mjs`, code-style.md §5) mechanically blocks `.is('<column>')` on any table when `<column>` is not a real column (schema-derived from `packages/db/src/types.ts`) in PRODUCTION code — known base tables in string-literal query chains only, unknown/dynamic tables skipped — but red-team spec files are NOT covered, so "read the migration" still applies there.
- **Before allocating new vector IDs in `attack-surface.md`, take the highest existing ID from BOTH the `origin/master` matrix (`git fetch origin master` then `git show origin/master:.claude/agent-memory/red-team/topics/attack-surface.md`) AND the current working-tree matrix, then start at max+1 — never trust a max-ID (or a "spec count") computed by Explore/plan-critic against the feature branch.** Cut the work branch off `origin/master` and take the max across BOTH refs BEFORE allocating — a stale branch silently understates both. **FAIL CLOSED:** if the fetch, either `git show`/working-tree read, or the max-ID parse fails, ABORT the allocation — never fall back to whichever read succeeded, since a partial read is exactly how a collision gets created. BOTH reads are required: `origin/master` catches sibling PRs merged after your branch was cut; the WORKING TREE catches IDs this branch's own earlier commits already allocated. Read `origin/master`, NOT the bare local `master` (`agent-workflow.md § Always diff against origin/master, never the bare local master`). When re-lettering a spec's self-labels, grep ALL cross-reference forms — `Vector X`, `(mirror of X)`, `vs X`, bare `(X)` — not just `Vector X`; a narrow grep leaves stale labels.

### NEVER
- Run on every commit — only on security-sensitive diffs.
- Let the agent create or modify spec files — it reviews, the orchestrator/test-writer handles changes.
- Block pushes on red-team findings alone — advisory, not blocking.
- Ignore coverage gap findings — create issues to track them even if not fixing immediately.
- Run red-team specs in the main E2E pipeline — separate CI workflow.
