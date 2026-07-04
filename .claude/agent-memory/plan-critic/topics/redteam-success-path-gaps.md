---
name: redteam-success-path-gaps
description: Recurring gaps in red-team success-path grading-coverage plans: numeric-field type-only specs, audit-tracker registration, pool-seed idempotency.
metadata:
  type: project
---

## Red-team success-path (test-only) plan gaps

Relocated verbatim from plan-critic MEMORY.md (curated to stay under the 25 KB native-injection cap). Recurring gaps in red-team success-path grading-coverage plans: numeric-field type-only specs, audit-tracker registration, pool-seed idempotency.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Red-team SUCCESS-PATH plans (test-only, e.g. #873+#825 VFR-RT E2E grading coverage) have 3 recurring gaps: (1) §7 NUMERIC FIELDS TYPE-ONLY: plan labels `correct_count int` / `part1_pct numeric` without specifying expected values — §7 zero-case (p2=0 for part2-fail fixture, correct_count=16) must be exact-asserted; boolean derivatives (`passed_per_part.part2=false`) catch threshold regressions but NOT formula regressions. Specify each expected numeric value from first principles. (2) AUDIT-SPEC TRACKER REGISTRATION: when a VFR-RT test in audit-completeness.spec.ts calls `start_vfr_rt_exam_session` (session ends up active with ended_at=NULL), that session id MUST be added to the fixture tracker immediately after start so afterEach `cleanupFixtures` soft-deletes it — plan must name this explicitly or the implementer skips it → single-active-session invariant violation on the next test. (3) POOL-SEED IDEMPOTENCY: `seedVfrRtPool` that does a plain `INSERT INTO exam_configs` will 23505 on re-run if afterAll cleanup failed (non-deleted config still present under partial-unique WHERE deleted_at IS NULL); must use check-first pattern (ensureExamConfig idiom: select-if-exists→reuse/update, else insert + handle 23505 race). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
