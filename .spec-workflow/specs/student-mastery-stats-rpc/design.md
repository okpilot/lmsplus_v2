# Design — Student Mastery Stats RPC

## RPC: `public.get_student_mastery_stats()`
Migration `supabase/migrations/20260521000005_student_mastery_stats_rpc.sql`.

- No args (caller is always self). `RETURNS TABLE (subject_id uuid, topic_id uuid, total bigint,
  correct bigint)`. `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public`. GRANT to
  `authenticated`. Mirrors `get_question_counts` (#614).
- **Row shape:** `topic_id IS NULL` ⇒ subject-level aggregate; `topic_id NOT NULL` ⇒ topic-level.
  Unambiguous because `questions.topic_id` is `NOT NULL` (initial_schema.sql:110).
- **Scoping:** RLS + an explicit numerator predicate. `tenant_isolation` on `questions`
  = org + `deleted_at IS NULL` (any status). The numerator (`correct_q`) additionally
  self-scopes with an explicit `sr.student_id = auth.uid()` — `student_responses` has a
  second SELECT policy (`instructors_read_students`) that would otherwise let an
  instructor/admin aggregate org-wide, so RLS alone is not enough to keep it per-caller
  (security.md §11). No auth preamble needed: unauthenticated → `auth.uid()` NULL → zero
  rows → empty result.
- **Aggregation:** CTE `active_q` (`status='active'`) = denominator; CTE `correct_q`
  (`DISTINCT` correct responses joined to questions, any status) = numerator. Subject-level and
  topic-level counts each combined with **`FULL JOIN`** + `COALESCE` zero-fill (FULL, not LEFT,
  to retain orphan subjects/topics where `correct>0, total=0`), `UNION ALL`'d.

Verified end-to-end locally under `SET ROLE authenticated`: a correct response to a question
flipped to `draft` is counted in `correct` (2) but excluded from `total` (19) — proving the
numerator/denominator divergence holds under real RLS.

## TS wiring
- `apps/web/lib/queries/dashboard.ts` (`getSubjectProgressWithMap`): replaced the three truncating
  reads + in-memory maps with `rpc<MasteryRow[]>(supabase, 'get_student_mastery_stats', {})` (helper
  `apps/web/lib/supabase-rpc.ts`); subject-level rows → count map. Kept `easa_subjects` metadata
  read and a single residual `questions.select('id, subject_id').is('deleted_at', null)` (any-status)
  read solely for `questionSubjectMap` (last-practiced; deferred #668). Formula/filter unchanged.
- `apps/web/lib/queries/progress.ts` (`getProgressData`): four-element `Promise.all` → three-element
  (`easa_subjects`, `easa_topics`, RPC); partition rows into subject/topic count maps; formula/filters
  unchanged at both levels.
- `packages/db/src/types.ts`: hand-added `get_student_mastery_stats` (`Args: never`, Returns rows).

## Tests
- `dashboard.test.ts` / `progress.test.ts`: added `vi.mock('@/lib/supabase-rpc')` + hoisted `mockRpc`
  (kept `from: mockFrom`); migrated mastery assertions to drive via `mockRpc`; removed the
  `questionsCallCount` ordinal pattern; added a #540 regression test (subject past the 1000-row
  window counted in full) and an RPC-error test.

## Deferred (#668 follow-up)
`dashboard-stats.ts` streak/last-practiced reads (`.limit(10000)`/`.limit(5000)` — ignored above
cap) and the residual `questionSubjectMap` read remain truncated.
