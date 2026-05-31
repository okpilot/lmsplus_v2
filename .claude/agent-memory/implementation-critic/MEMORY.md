# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> This index holds durable recurring-deviation knowledge. Per-commit narrative lives in `git log`.

## Recurring-deviation tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 4 | 2026-05-07 | PROMOTED → code-style.md §5. Recurs in prod (toggleExamConfig) AND test helpers (#622 afterEach, backdateSession). Still flag in new code. |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. queries.test.ts `buildChain`; PR-C `buildAnswersClient` (147 lines). Grep call sites for any large test helper before approving — delete if only self-referenced. |
| Error message refactor breaks paired test assertion regex | 2026-05-06 | 1 | 2026-05-06 | WATCHING. #628 `pickSubjectWithQuestions` dropped "in org" suffix; seed.test.ts:152 regex stale. Grep test files for old message substring when context strings (orgId, table name, filter clause) change. Note: #709 helper extraction kept error message byte-identical across all 4 call sites — no recurrence. |
| TRANSPORT_LAYER/payload-group loop applied to fewer RPCs than plan states | 2026-05-07 | 1 | 2026-05-07 | WATCHING. #108 `void_internal_exam_code` got DB_LAYER only. When plan documents a payload group across N RPCs, count loops in each describe block before approving. |
| Conditional redirect regression when helper return value discarded | 2026-04-14 | 1 | 2026-04-14 | WATCHING. `handleSubmitSession` discarded `discardQuizSession` result; `router.push` fires only on success → stranded user. Check callers of helpers that made an unconditional side-effect conditional. |
| Too-lenient INSERT rejection assertion in red-team specs | 2026-05-31 | 1 | 2026-05-31 | WATCHING. #314 flag-idor + server-action-unauthenticated used `expect(error !== null \|\| (data?.length ?? 0) === 0).toBe(true)` instead of established `expect(error).not.toBeNull()`. RLS WITH CHECK violations always produce a non-null error in PostgREST; the OR-branch allows vacuous pass if RLS is misconfigured. Pattern observed in 2 places simultaneously. |

## Durable knowledge

- **CREATE OR REPLACE trace before flagging.** Before flagging a missing pattern (guard, search_path, auth check) on a Postgres function, trace the full `CREATE OR REPLACE FUNCTION` chain to the LATEST migration definition — the guard may already exist in a prior migration. Required pre-flag step per `agent-critic.md`. (Verified correct on #622 mig 076→077, #629 080→081, #108 void_internal_exam_code.)
- **Dual-directory migration invariant.** Numerically-numbered migrations (e.g. `081_*.sql`) must have a byte-identical copy in BOTH `packages/db/migrations/` and `supabase/migrations/`. EXCEPTION: timestamp-format migrations (`20260521000005_*` etc.) live in `supabase/migrations/` ONLY — confirmed across mastery RPC, dashboard-stats RPCs, filtered-pool RPCs, profile-stats RPC. Don't flag a missing packages/db counterpart for timestamp-format files.
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs reading `student_responses` / `quiz_sessions` / `exam_configs` / `audit_events` must carry an explicit `<owner> = auth.uid()` predicate even when SECURITY INVOKER + RLS is present — RLS ORs the broader instructor/admin policy. The `auth.uid()` predicate is correct, not redundant; do not suggest removing it.
- **types.ts nullable-SQL-column convention.** Admin/student RPC entries in `packages/db` `types.ts` may type nullable SQL columns as non-nullable (e.g. `avg_score: number`) — this matches the established `get_admin_student_stats` pattern. Production query files use the `authRpc`/`rpc` wrapper with their own local Row type that captures nullability. Not a deviation; flag at most as SUGGESTION.
- **`rpc`/`authRpc` wrapper contract.** Returns `{ data, error }` and never throws on query errors. `Promise.all([rpc(...), supabase.from(...)])` carries no unhandled-rejection risk. `fetchAllRows` return type guarantees `data: T[]` (never null) — `?? []` fallback after it is redundant.
- **Count/page filter symmetry (pagination).** When a read is split into a count query + paginated page query, the WHERE filters must be byte-identical between the two — a mismatch fetches wrong/excess rows. Verified clean repeatedly across #668 instances; keep it a checklist item.
- **Test title impl-detail leakage (code-style §7).** `it(...)` titles must not name internal helpers/types/validator branches (`forwards X to fetchAllRows`, `from FooOpts`, `typeof guard`). Public props, public SDK methods, and integration-boundary RPC names ARE permitted (they're contracts). Audit inline comments after a title rename — they often go stale.

## Durable knowledge — tooling/config

- **knip `ignoreDependencies` is workspace-scoped.** The correct knip schema uses `ignoreDependencies` inside the workspace key (not at top level) for per-workspace suppressions; `ignoreBinaries` + `ignore` live at top level. Verified clean on #325. Don't flag this pattern as incorrect.
- **`@repo/ui` is listed as a dep in `apps/web/package.json` even though no `@repo/ui` import exists in TypeScript source** — `packages/ui/src/index.ts` exports `{}` (Phase 5 placeholder). Ignoring it in knip is intentional; it is a forward-declared workspace dep. Do not flag as a dead dep.
- **Broad grep for component names (e.g. "Separator", "Progress", "Tooltip") returns false-positive file matches** when sibling components use same-named primitives from `@base-ui/react` directly (e.g., `SelectSeparator` in `select.tsx` uses `SelectPrimitive.Separator`, not the deleted `components/ui/separator.tsx`). Always verify import path, not just symbol name.
- **Tailwind v4 `@plugin` directive placement** — place after all `@import` lines, before `@custom-variant`/`@theme`. Verified correct on #325 (globals.css lines 1–6).

## False positives (do not re-raise)

- **Probe-gate keyed on allRows (pre-filter) is correct.** After the reports.ts probe-gate fix, `probeOutOfRangeTotal` is triggered only when `allRows.length === 0 && page > 1`. When `allRows` is non-empty but `rows` (post-filter) is empty, the code returns `totalCount: 0` without probing — this is correct (filtered page, not out-of-range). Do not flag `rows.length === 0 → totalCount: 0` path as "missing probe". Verified clean 2026-06-01.
- **Fix 1 probe + `count(*) OVER()` window function** — `p_limit: 1` on the probe RPC still returns the correct `total_count` because PostgreSQL evaluates the window function `count(*) OVER()` before applying the `LIMIT`/`OFFSET` clause; it counts all rows matching the WHERE predicate. Verified by reading migration `20260429000011_get_session_reports_exclude_internal_exam.sql` line 64. Do not flag probe-limit as "may return wrong total".
- **Fix 1 probe fires on page=2 empty** — `toHaveBeenCalledWith` in the "passes correct RPC parameters for page 2" test still passes because it asserts the first call's args; the probe's second call is unmocked (returns `{ data: [], error: null }`) and resolves with `totalCount: 0`. The test doesn't assert the result value, so no failure. Not a test correctness issue.
- **`getSessionReports` remaining body ~39 non-blank lines after `probeOutOfRangeTotal` extraction** — pre-existing auth/RPC/filter preamble (lines 59-92) cannot be meaningfully split further without artificial helpers; the extraction moved ~14 lines out. The code-reviewer BLOCKING finding was about the inline probe bloat; that bloat is now gone. Accept the residual >30 body lines as an orchestrator-pattern exception (auth + RPC call + filter + branch = one cohesive flow). Do not re-flag.



- `avg_score` / mastery RPCs return NULL (no COALESCE) for students with no sessions — intentional; app type is `number | null`, UI guards `!== null`.
- Hard DELETE on `exam_config_distributions` inside `upsert_exam_config` — intentional, documented in migration 043 + docs/database.md (ephemeral config table, same precedent as `quiz_drafts`).
- Adjacent conditional JSX guard blocks (`{canDismiss && (`) are not "duplicate buttons" — one state-driven trigger + one prop-guarded confirm-panel button are distinct.
- `_userId` / dropped-param on caller-scoped RPCs — the RPC is scoped via RLS + `auth.uid()`, so an unused student-id param is dead but harmless (SUGGESTION at most).
- Red-team seed `selected_option_id: 'a'` with `is_correct: true` — intentional; `get_student_mastery_stats` reads `sr.is_correct` directly, never re-derives correctness from `selected_option_id` vs the question's correct option. 'a' is cosmetic (#673 confirmed).
