# Tasks — Red-Team Quiz Session Bugs (Sub-Batch 1)

## PR 1 — Issue #629: start_quiz_session p_mode whitelist

- [ ] T1.1 — (Optional verification — bypass design is environment-tolerant) After local Supabase reset, query `SELECT proname, pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'start_quiz_session';`. Record result for future reference. PR 2 will tolerate either `postgres` or `supabase_admin` owner; if a third role appears, add it to the bypass list during T2.5.
- [ ] T1.2 — Write migration `packages/db/migrations/081_start_quiz_session_mode_whitelist.sql` adding the whitelist guard immediately after the auth check.
- [ ] T1.3 — Write red-team spec `apps/web/e2e/redteam/start-quiz-session-mode-confusion.spec.ts` with 2 attack cases (mock_exam, internal_exam) and post-rejection insert verification.
- [ ] T1.4 — Run migration locally (Supabase reset) and verify `pnpm --filter @repo/web e2e:redteam start-quiz-session-mode-confusion` passes.
- [ ] T1.5 — Run full unit suite (`pnpm test`) and existing E2E (`pnpm --filter @repo/web e2e`) to confirm no regression.
- [ ] T1.6 — Update `docs/database.md` RPC summary row for `start_quiz_session` (add p_mode whitelist note).
- [ ] T1.7 — Run implementation-critic on staged diff. Address findings.
- [ ] T1.8 — Commit with `Closes #629` in message.
- [ ] T1.9 — Run post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer in parallel) + red-team agent (security-sensitive diff). Address findings.
- [ ] T1.10 — Run learner.

## PR 2 — Issue #611: extend quiz_sessions immutability trigger

- [ ] T2.1 — Re-read `apps/web/app/app/quiz/actions/discard.ts` to confirm only `deleted_at` is written (planned assumption).
- [ ] T2.2 — Write migration `packages/db/migrations/082_quiz_sessions_immutable_score_columns.sql`:
  - Extend bypass: `current_role IN ('service_role', 'postgres')` (or whatever T1.1 revealed).
  - Add 4 IS DISTINCT checks for correct_count, score_percentage, passed, ended_at.
  - Update the trigger's BEFORE UPDATE OF column list (DROP + CREATE).
- [ ] T2.3 — Update `apps/web/e2e/redteam/quiz-session-config-injection.spec.ts`:
  - Extend `FROZEN_COLUMNS_SELECT` constant with the 4 new columns.
  - Extend `FrozenColumnsRow` type.
- [ ] T2.4 — Write red-team spec `apps/web/e2e/redteam/quiz-session-mutable-columns.spec.ts` with:
  - 4 attack cases (one per new frozen column).
  - 1 regression case: `batch_submit_quiz` round-trip writes all 4 columns successfully.
- [ ] T2.5 — Run migration locally and verify:
  - New spec passes (4 attacks blocked, 1 regression succeeds).
  - Existing config-injection spec passes (extended FROZEN_COLUMNS coverage).
  - All other E2E tests pass (catches regression in completion flows).
- [ ] T2.6 — Update `docs/database.md` if it lists trigger-frozen columns.
- [ ] T2.7 — Run implementation-critic on staged diff. Address findings.
- [ ] T2.8 — Commit with `Closes #611` in message.
- [ ] T2.9 — Run post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer in parallel) + red-team agent. Address findings.
- [ ] T2.10 — Run learner.
- [ ] T2.11 — Run coderabbit-sync if any rules changed (unlikely for this PR).

## Cross-PR

- [ ] CB.1 — After both PRs merged, update umbrella issue #640 to check off Sub-Batch 1 items (#611, #629).
- [ ] CB.2 — Re-plan Sub-Batches 2-5 of Group A based on what was learned (fixture patterns, helper reuse, RPC owner role) — separate `/plan` invocation.
- [ ] CB.3 — Move both project-board items to Done (auto via `Closes #N` if board automation is wired; verify).
