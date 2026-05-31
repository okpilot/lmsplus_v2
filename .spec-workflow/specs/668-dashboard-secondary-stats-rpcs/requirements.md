# Requirements — #668 phase 2: dashboard secondary-stats RPCs

## Problem
`apps/web/lib/queries/dashboard-stats.ts` computes two secondary dashboard stats client-side over unpaginated `student_responses` reads:
- `getStreakData` — `.limit(10000)` (ignored above PostgREST `max_rows=1000`). `bestStreak`/`currentStreak` undercount for students with >1000 responses.
- `applyLastPracticed` — `.limit(5000)` (ignored). `lastPracticedAt` falsely NULL for any subject absent from the most-recent ~1000 responses. Coupled to `questionSubjectMap` (built from a `questions` read at `dashboard.ts:103`, also truncated for orgs with >1000 active questions — the read deferred from PR #674).

This is instance #2 of the umbrella truncation class #668 (instance #1 = `get_student_mastery_stats`, PR #674).

## Goal
Move both computations into Postgres aggregation RPCs so results are correct regardless of response volume, mirroring the established `get_student_mastery_stats` pattern.

## Confirmed decisions (user, 2026-05-26)
1. **Best streak = all-time** (matches current intent; cheap in Postgres over DISTINCT dates).
2. **Two dedicated RPCs** (`get_student_streak`, `get_student_last_practiced`) — leave the prod-verified `get_student_mastery_stats` untouched.
3. **Last-practiced over ALL responses** (not correct-only) — behavior-preserving.

## Acceptance criteria
- `bestStreak`/`currentStreak` correct for a student with >1000 responses (verified vs old truncated values on prod).
- `lastPracticedAt` correct for a subject answered only outside the most-recent 1000 responses.
- `currentStreak` still anchors to today/yesterday (UTC), else 0 — behavior-preserving vs legacy `computeStreaks`.
- `questionSubjectMap` and the `dashboard.ts:103` `questions` read are retired.
- Both RPCs scope per-caller with explicit `sr.student_id = auth.uid()` (security.md §11).
- No answer data exposed; anon caller → empty/zero; cross-org isolated.
- `pnpm check-types`, `pnpm lint`, `pnpm test` green.

## Out of scope
- Other #668 P0 sites (quiz.ts counts, admin roster, GDPR export).
- E2E red-team specs for the new RPCs → tracked by extending #673 (vectors BX1–BX6).
