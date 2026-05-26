# Tasks — #668 phase 2: dashboard secondary-stats RPCs

- [ ] 1. Write migration `20260521000006_dashboard_secondary_stats_rpcs.sql` (get_student_streak + get_student_last_practiced)
- [ ] 2. Rewrite `dashboard-stats.ts` (getStreakData + applyLastPracticed → RPCs; delete computeStreaks + ResponseDateRow)
- [ ] 3. Rewire `dashboard.ts` (getSubjectProgress; drop map + questions read)
- [ ] 4. Update tests (`dashboard-stats.test.ts` + `dashboard.test.ts`)
- [ ] 5. Update `docs/database.md` (RPC summary + 2 signature sections)
- [ ] 6. Verify SQL via read-only prod probes (synthetic edge cases + real high-volume student)
- [ ] 7. Extend issue #673 + append BX1–BX6 to `attack-surface.md` (red-team follow-up, non-blocking)
