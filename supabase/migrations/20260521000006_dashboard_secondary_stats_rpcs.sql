-- Dashboard secondary stats — daily-practice streak + per-subject last-practiced (umbrella #668).
--
-- Replaces two client-side computations in lib/queries/dashboard-stats.ts that fetched
-- student_responses as raw, unpaginated row sets:
--   getStreakData       — .limit(10000) (ignored above the PostgREST 1000-row cap): bestStreak/
--                         currentStreak undercounted for students with >1000 responses, seeing
--                         only the most-recent ~1000 response dates.
--   applyLastPracticed  — .limit(5000) (ignored): lastPracticedAt was falsely NULL for any
--                         subject not represented in the most-recent ~1000 responses, and was
--                         coupled to a truncated questions read (the questionSubjectMap).
-- Both aggregations now run inside Postgres, so they are correct regardless of response volume.
--
-- SECURITY INVOKER + RLS (same model as get_student_mastery_stats / 20260521000005). Both
-- functions self-scope with an explicit `sr.student_id = auth.uid()`: student_responses has a
-- second SELECT policy (instructors_read_students) that would otherwise let an instructor/admin
-- aggregate org-wide, so RLS alone is NOT enough to keep these per-caller (security.md §11). No
-- auth preamble is needed — an unauthenticated caller resolves auth.uid() to NULL, the filter
-- matches zero rows, and the function returns an empty set (streak: a single {0,0} row).

-- Current + best daily-practice streak (in days), all-time, computed via gaps-and-islands.
CREATE OR REPLACE FUNCTION public.get_student_streak()
RETURNS TABLE (current_streak int, best_streak int)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH days AS (
    -- DISTINCT calendar dates the caller answered on, in UTC. UTC matches the legacy TS
    -- computeStreaks, which derived dates from created_at.toISOString().slice(0,10) — using
    -- the session timezone here would shift dates near midnight and change streak lengths.
    SELECT DISTINCT (sr.created_at AT TIME ZONE 'UTC')::date AS d
    FROM student_responses sr
    WHERE sr.student_id = auth.uid()
  ),
  islands AS (
    -- Gaps-and-islands: consecutive dates share (d - row_number) because both increment by 1.
    SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp
    FROM days
  ),
  runs AS (
    SELECT COUNT(*)::int AS len, MAX(d) AS run_end
    FROM islands
    GROUP BY grp
  )
  -- Scalar subqueries with no FROM always yield exactly one row, so the function returns a
  -- single {0,0} row even when the caller has no responses (the TS wrapper reads data[0]).
  SELECT
    -- currentStreak: length of the run ending today or yesterday (UTC), else 0 — mirrors the
    -- legacy `anchoredToNow` guard. Runs are disjoint, so at most one run qualifies.
    COALESCE((
      SELECT r.len FROM runs r
      WHERE r.run_end >= (now() AT TIME ZONE 'UTC')::date - 1
      ORDER BY r.run_end DESC
      LIMIT 1
    ), 0) AS current_streak,
    COALESCE((SELECT MAX(r.len) FROM runs r), 0) AS best_streak;
$$;

-- Both functions grant EXECUTE only to `authenticated` (same as get_student_mastery_stats).
-- Supabase's platform defaults ALSO implicitly grant EXECUTE to `anon` on new functions — this
-- migration does not add that, and it is safe to leave: an anon caller resolves auth.uid() to
-- NULL and the RLS policies on student_responses/questions yield an empty set. RLS — not the
-- EXECUTE grant — is the access boundary here.
GRANT EXECUTE ON FUNCTION public.get_student_streak() TO authenticated;

COMMENT ON FUNCTION public.get_student_streak() IS
  'Current and best daily-practice streak (in days) for the calling student, all-time, computed in Postgres via gaps-and-islands over DISTINCT UTC response dates. current_streak = length of the run ending today or yesterday (UTC), else 0; best_streak = longest consecutive run. SECURITY INVOKER; explicit sr.student_id = auth.uid() per security.md §11 (student_responses has 2 permissive SELECT policies). Replaces client-side computeStreaks over a .limit(10000) read that truncated at the PostgREST 1000-row cap (#668).';

-- Most recent response timestamp per subject, over ALL responses (correct or not).
CREATE OR REPLACE FUNCTION public.get_student_last_practiced()
RETURNS TABLE (subject_id uuid, last_practiced_at timestamptz)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  -- All responses (no is_correct filter) matches the legacy applyLastPracticed. The questions
  -- JOIN is org + deleted_at IS NULL via the tenant_isolation RLS policy, reproducing the
  -- legacy questionSubjectMap (built from non-deleted questions) — a response to a deleted
  -- question is excluded from attribution exactly as before. Explicit sr.student_id = auth.uid()
  -- keeps it per-caller despite the second permissive SELECT policy (security.md §11).
  SELECT q.subject_id, MAX(sr.created_at) AS last_practiced_at
  FROM student_responses sr
  JOIN questions q ON q.id = sr.question_id
  WHERE sr.student_id = auth.uid()
  GROUP BY q.subject_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_last_practiced() TO authenticated;

COMMENT ON FUNCTION public.get_student_last_practiced() IS
  'Most recent response timestamp per subject for the calling student, over ALL responses (any correctness). The questions JOIN is org + non-deleted via RLS (tenant_isolation), reproducing the legacy questionSubjectMap. SECURITY INVOKER; explicit sr.student_id = auth.uid() per security.md §11 (student_responses has 2 permissive SELECT policies). Replaces client-side applyLastPracticed over a .limit(5000) read that truncated at the PostgREST 1000-row cap (#668).';
