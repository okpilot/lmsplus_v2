# Requirements — Student Mastery Stats RPC (#540, umbrella #668)

## Problem
Student dashboard (`/app/dashboard`) and progress (`/app/progress`) pages show zero/wrong
per-subject mastery for high-volume students. Root cause (confirmed against prod): the mastery
**numerator** (correct `student_responses`) and **denominator** (active `questions`) are fetched
as raw, unpaginated reads and aggregated in JS. PostgREST silently truncates any unpaginated read
at `max_rows=1000`, so both sides are computed from arbitrary first-1000-row subsets. Issue #540:
student with 8,395 responses / org with 1,366 active questions → a completed subject answered
"late" falls outside the window and shows 0%.

This is instance #1 of the truncation bug **class** tracked under umbrella #668.

## Scope
**In:** per-subject and per-topic mastery aggregation (dashboard + progress).
**Out (deferred to #668 follow-up P0):** `dashboard-stats.ts` streak (`getStreakData`) and
last-practiced (`applyLastPracticed`) — both still truncated; the `questionSubjectMap` residual
read remains row-capped but reproduces legacy behavior exactly.

## Functional requirements
1. Per-subject and per-topic `total`/`correct` counts come from a Postgres aggregation, not a
   client-side row scan — never truncated.
2. **Preserve PR #665 (commit d1cd4770) semantics exactly** (behavior-preserving; #664
   mastery-semantics stays a separate open decision):
   - `total` = active (`status='active'`), non-deleted questions, by the question's own subject/topic.
   - `correct` = distinct correct responses to non-deleted questions of **any** status (draft/orphan
     retained) — so `correct` can exceed `total`.
   - mastery = `total>0 ? min(round(correct/total*100),100) : 0` (clamp in TS).
   - include subject/topic if `total>0 OR correct>0` (orphan retention; filter in TS).
   - callers continue to read raw unclamped `answeredCorrectly`.
3. Org + own-responses scoping enforced (no cross-org / cross-student leakage).
4. Return shapes of `getDashboardData`/`SubjectProgress` and `getProgressData`/`SubjectDetail`/
   `TopicDetail` unchanged — no caller edits.

## Non-functional / security
- RPC is `SECURITY INVOKER` + RLS (user-confirmed deviation from initial DEFINER draft) — matches
  `get_question_counts` (#614, same bug class). `tenant_isolation` scopes `questions`;
  `student_responses` RLS scopes the numerator. No answer data exposed (counts only).
- New migration + new RPC → red-team + security-auditor review required.

## Acceptance
- Unit regression test proving a subject whose responses sit past row 1000 is counted in full.
- `pnpm test` + `pnpm check-types` green.
- #540 stays OPEN until the deployed RPC is verified against the affected student's real data.
