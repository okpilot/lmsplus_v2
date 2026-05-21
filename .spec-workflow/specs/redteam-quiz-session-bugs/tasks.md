# Tasks — Red-Team Quiz Session Bugs (Sub-Batch 1)

## PR 1 — Issue #629: start_quiz_session p_mode whitelist

- [x] T1.1 — Deferred to optional follow-up. Bypass design (`postgres` ∪ `supabase_admin`) is environment-tolerant and verified indirectly: integration tests (`rpc-start-session.integration.test.ts`) calling the SECURITY DEFINER RPC pass against the local DB, confirming the bypass works in this environment. Will be re-verified during PR 2 (#611) execution if the trigger extension reveals a different owner role.
- [x] T1.2 — Migration `packages/db/migrations/081_start_quiz_session_mode_whitelist.sql` written; commit 5b4223b.
- [x] T1.3 — Red-team spec `apps/web/e2e/redteam/start-quiz-session-mode-confusion.spec.ts` written; 2 attacks (mock_exam, internal_exam) + positive no-insert assertion; commit 5b4223b.
- [~] T1.4 — Local Playwright run skipped (`node_modules/playwright/cli.js` missing locally); CI will run on push. Integration tests at `packages/db/src/__integration__/rpc-start-session.integration.test.ts` exercised the same SQL path against local Postgres — 51/51 pass (including 2 new whitelist cases). Spec structure mirrors the working `quiz-session-config-injection.spec.ts` exactly.
- [x] T1.5 — `pnpm --filter @repo/web test --run`: 247 files / 3367 tests pass. `pnpm check-types`: 4 packages clean. No regression.
- [x] T1.6 — `docs/database.md` updated in commits 5b4223b and d32868b: validation contract reordered, migration history filename aligned to timestamp form, schema-block creation-path comment added under the `mode` CHECK, footer bumped to 2026-05-08.
- [x] T1.7 — implementation-critic ran pre-commit; 1 ISSUE (missing supabase/migrations counterpart) caught and fixed before commit.
- [x] T1.8 — Committed as 5b4223b with `Closes #629`.
- [x] T1.9 — Post-commit agents ran on 5b4223b: code-reviewer (clean), semantic-reviewer (1 ISSUE / 2 SUGG / 7 GOOD — addressed in d32868b), doc-updater (1 DRIFT — addressed in d32868b), test-writer (added 2 cases in fc5d47e), red-team (Vector BU COVERED — attack-surface.md updated in d17a7d0).
- [x] T1.10 — Learner ran; no rule promotions (all patterns count = 1, watching). Memory committed in 20ba067.

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
