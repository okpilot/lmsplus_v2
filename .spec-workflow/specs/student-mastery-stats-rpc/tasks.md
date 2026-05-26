# Tasks — Student Mastery Stats RPC

- [x] Write migration `20260521000005_student_mastery_stats_rpc.sql` (SECURITY INVOKER + RLS)
- [x] Apply + functionally verify the RPC against local DB (orphan/draft case under RLS)
- [x] Hand-add `get_student_mastery_stats` to `packages/db/src/types.ts`
- [x] Rewire `dashboard.ts` to the RPC; update `dashboard.test.ts` (+#540 regression, +RPC-error)
- [x] Rewire `progress.ts` to the RPC; update `progress.test.ts` (+#540 regression, +RPC-error)
- [x] `pnpm test` (3383 pass) + `pnpm check-types` green
- [ ] implementation-critic on staged diff
- [ ] Commit (NO `Closes #540`)
- [ ] Post-commit agents: code-reviewer, semantic-reviewer, doc-updater (docs/database.md RPC
      tables), test-writer; then red-team + security-auditor (migration touched); then learner
- [ ] Push (on user approval) + verify deployed RPC against affected student before closing #540
