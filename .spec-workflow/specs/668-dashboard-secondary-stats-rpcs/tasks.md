# Tasks — #668 phase 2: dashboard secondary-stats RPCs

- [x] 1. Write migration `20260521000006_dashboard_secondary_stats_rpcs.sql` (get_student_streak + get_student_last_practiced)
- [x] 2. Rewrite `dashboard-stats.ts` (getStreakData + applyLastPracticed → RPCs; delete computeStreaks + ResponseDateRow)
- [x] 3. Rewire `dashboard.ts` (getSubjectProgress; drop map + questions read)
- [x] 4. Update tests (`dashboard-stats.test.ts` + `dashboard.test.ts`)
- [x] 5. Update `docs/database.md` (RPC summary + 2 signature sections)
- [x] 6. Verify SQL via read-only prod probes (synthetic 8/8 edge cases PASS; real student: best streak 13 vs truncated 2; last-practiced 5 subjects vs truncated 2 / 3 falsely-null) — `scripts/probe-668-streak-verify.py`
- [x] 7. Extend issue #673 + append BX1–BX6 to `attack-surface.md` (red-team follow-up, non-blocking)

## Status
Committed on branch `fix/668-dashboard-secondary-stats-rpcs`: a6dc7a9c (feature), 7e9197c1 (test), af987c1d (docs/comment). All review gates clean (plan-critic, impl-critic 0 findings; code-reviewer clean; semantic-reviewer 1 ISSUE resolved via real-SQL probe; doc-updater + test-writer + learner done). NOT YET DEPLOYED / NOT PUSHED — awaiting user approval to push. Deploy note: migration is idempotent CREATE OR REPLACE; if Actions still degraded, apply via scripts/apply-mig pattern + reconcile schema_migrations (incl. pending 20260521000005).
