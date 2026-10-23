# Agent Rules — red-team
> Model: opus | Trigger: once per branch, after the review loop ends, when the branch diff matches § Trigger Conditions | Blocking on a PROVEN exploit; advisory on an unproven gap

## Purpose
Opus attacker. Exploits the local app past the branch diff's entry points, proves an exploit by
writing and running a failing red-team Playwright spec, maps changes to existing red-team specs.

## Trigger Conditions
Run when the branch diff includes changes to either: the canonical security-path set (`agent-workflow.md § Red-Team Agent Trigger`) OR `apps/web/e2e/redteam/` (spec changes trigger this agent specifically). The full path list:
- `supabase/migrations/**` — any migration file
- `packages/db/src/**` — database client, types, or schema changes
- `apps/web/app/app/quiz/actions/**` — Server Actions
- `apps/web/app/auth/**` — auth callback
- `apps/web/app/**/route.ts` — Route Handlers
- `apps/web/proxy.ts` — middleware/proxy
- `docs/security.md` — security rules
- `apps/web/e2e/redteam/` — red-team specs themselves (this agent's extra path — not part of the canonical set)

Runs ONCE per branch, after the review loop ends — and only when the above paths are in the branch diff.

## Handling Results
### DO
- Run after the review loop has stopped, when security-sensitive files are in the branch diff.
- Review the agent's spec mapping — verify it correctly identified affected existing specs.
- Read every proven exploit's `EVIDENCE:` (spec path + pasted failing output) before acting on it (`agent-workflow.md § Finding Validation`).
- **A proven exploit → the orchestrator fixes production code.** The spec + fix land in ONE commit — the fix is that round's FIXUP.
- The fix re-enters the review loop: the review round set runs on the re-diffed branch.
- A proven exploit fixed on this branch: write its row as `BLOCKED` in the fix commit, no issue filed.
- A proven exploit blocks the push until its fix lands on this branch — never pushed as a `GAP` row with an issue filed.
- `/fullpush` step 7b (`e2e:redteam`) confirms the exploit's spec now passes — no red-team re-run. The fix commit un-skips the spec; `attack-surface.test.ts` rejects a row past `GAP` whose spec file holds a static skip.
- Create GitHub Issues for unproven coverage gaps (not immediate fixes). Each issue names the spec or vector it covers (`agent-workflow.md § Apply-vs-Defer Discipline`).
- A run with no proven exploit: commit any new specs and rows as a fixup; the review round set re-runs on the re-diffed branch. No new files: no fixup, no re-run.
- Red-team's own specs and rows, and a proven exploit's fix, never re-trigger red-team.
- After each red-team run, check `git status --porcelain --untracked-files=all` and reject any path under `apps/web/e2e/redteam/` other than `*.spec.ts`, `helpers/**` and `attack-surface.md`, or outside it — the agent's write scope is brief-enforced, not hook-enforced.
- A security bug found downstream of a PASSED red-team run (by CodeRabbit, security-auditor, CI, or in production) gets a `MISSED` row plus a spec, filed in the PR that fixes it.
- **Read the actual migration before writing any column filter, table assertion, or schema-derived value in a red-team spec — never author one from memory of the schema.** Verify the column exists by scanning EVERY `ALTER TABLE <table>` in `supabase/migrations/` chronologically to HEAD, not just `CREATE TABLE` plus one latest `ALTER`: a column can be ADDED, RENAMED and DROPPED across separate migrations, so one match only proves it existed at some point. Trace the supersession chain — EVERY form (`agent-workflow.md` § "name EVERY supersession form"), reaching beyond the function body to `ALTER FUNCTION <fn>(<arg types>)`, `DROP TRIGGER` + `CREATE TRIGGER`, and the constraint/index forms — to the latest definition, for the MATCHING SIGNATURE, for RPC/trigger assertions.
- The soft-delete **column-existence guard** (`.claude/hooks/check-soft-delete-guard.mjs`, code-style.md §5) mechanically blocks `.is('<column>')` on any table when `<column>` is not a real column (schema-derived from `packages/db/src/types.ts`) in PRODUCTION code — known base tables in string-literal query chains only, unknown/dynamic tables skipped — but red-team spec files are NOT covered, so "read the migration" still applies there.
- **Allocate new vector IDs via `pnpm --filter @repo/web exec tsx e2e/redteam/next-vector-id.ts <IDs this run already allocated>`; non-zero exit → ABORT the allocation** — never trust a max-ID (or a "spec count") computed by Explore/plan-critic against the feature branch. When re-lettering a spec's self-labels, grep ALL cross-reference forms — `Vector X`, `(mirror of X)`, `vs X`, bare `(X)` — not just `Vector X`; a narrow grep leaves stale labels.

### NEVER
- Run inside the review loop, or more than once per branch.
- Let the agent write outside `apps/web/e2e/redteam/` — `*.spec.ts`, `helpers/**`, `attack-surface.md` only.
- Let the agent touch production code, migrations, seed scripts, `.env*`.
- Let the agent target `.env.remote`, `--force-remote`, a `supabase.co` URL, or any prod credential.
- Let the agent run `git commit`, `git add`, `git reset`, `git checkout`, `git stash`, `git restore`, `git clean`, `git switch`, `git rm`.
- Block pushes on an unproven gap alone — advisory, not blocking. A PROVEN exploit (a spec that fails against current code) IS blocking.
- Ignore an unproven coverage gap finding — create an issue to track it even if not fixing immediately.
- Run red-team specs in the main E2E pipeline — separate CI workflow.
