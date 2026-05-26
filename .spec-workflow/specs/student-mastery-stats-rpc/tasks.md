# Tasks — Student Mastery Stats RPC

- [x] Write migration `20260521000005_student_mastery_stats_rpc.sql` (SECURITY INVOKER + RLS)
- [x] Apply + functionally verify the RPC against local DB (orphan/draft case under RLS)
- [x] Hand-add `get_student_mastery_stats` to `packages/db/src/types.ts`
- [x] Rewire `dashboard.ts` to the RPC; update `dashboard.test.ts` (+#540 regression, +RPC-error)
- [x] Rewire `progress.ts` to the RPC; update `progress.test.ts` (+#540 regression, +RPC-error)
- [x] `pnpm test` (3383 pass) + `pnpm check-types` green
- [x] implementation-critic on staged diff (added docs/database.md entry, removed dead param)
- [x] Commit (NO `Closes #540`) — 3bb0b957
- [x] Post-commit agents: code-reviewer (clean), semantic-reviewer (1 doc ISSUE → fixed),
      doc-updater (clean), test-writer (+6 tests, d4d58940); then red-team
- [x] red-team: found BW3 (instructor/admin numerator leak) → fixed in bf756480
      (sr.student_id = auth.uid()); E2E coverage gaps filed as #673
- [x] PR-level semantic sweep (master...HEAD): clean
- [x] learner synthesis: promoted security.md §11 (multi-policy RLS → explicit auth.uid()
      scope); sweep clean repo-wide; coderabbit-sync mirrored §11 into .coderabbit.yaml
- [x] /fullpush gates: lint (0 errors), check-types, 3388 tests, build, clean migration reset
- [x] CR-local (/crlocal) review loop — round 1 clean (0 findings) after PR #674 CR + PR-sweep fixes
- [ ] security-auditor runs on pre-push (Lefthook) — pending push
- [ ] Push (on user approval) + verify deployed RPC against affected student before closing #540
