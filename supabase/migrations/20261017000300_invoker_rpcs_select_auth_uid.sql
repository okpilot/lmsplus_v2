-- #1414: wrap auth.uid() in (select ...) so Postgres plans it as an InitPlan evaluated once
-- per statement, not once per row (Supabase lint 0003 auth_rls_initplan).
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- CREATE OR REPLACE keeps existing GRANTs; COMMENTs are re-issued at the end. Only the auth.uid() comparisons change.
-- Bodies copied from their latest definitions: get_student_mastery_stats 20260521000005,
-- get_student_streak / get_student_last_practiced 20260521000006, get_student_profile_stats
-- 20260529000001, get_daily_subjects 20261002000100. The 'auth.uid() IS NULL' guards stay bare.

CREATE OR REPLACE FUNCTION public.get_student_mastery_stats()
RETURNS TABLE (
  subject_id uuid,
  topic_id   uuid,
  total      bigint,
  correct    bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH
  -- DENOMINATOR: active questions visible to the caller (RLS = org + non-deleted).
  active_q AS (
    SELECT q.id, q.subject_id, q.topic_id
    FROM questions q
    WHERE q.status = 'active'
  ),
  -- NUMERATOR: distinct questions the caller answered correctly, attributed to the
  -- question's own subject/topic; any status (the questions JOIN is org + non-deleted via RLS).
  -- The explicit `sr.student_id = (select auth.uid())` is REQUIRED, not redundant: student_responses
  -- has a second SELECT policy (instructors_read_students) that lets an instructor/admin read
  -- ALL responses in their org, so RLS alone would aggregate org-wide for those roles. This
  -- self-scope keeps the numerator per-caller for every role (matches the legacy client read's
  -- .eq('student_id', userId)). Unauthenticated → auth.uid() NULL → zero rows.
  correct_q AS (
    SELECT DISTINCT q.id, q.subject_id, q.topic_id
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE sr.student_id = (select auth.uid())
      AND sr.is_correct = true
  ),
  subj_total AS (
    SELECT aq.subject_id, COUNT(*)::bigint AS total
    FROM active_q aq
    GROUP BY aq.subject_id
  ),
  subj_correct AS (
    SELECT cq.subject_id, COUNT(*)::bigint AS correct
    FROM correct_q cq
    GROUP BY cq.subject_id
  ),
  topic_total AS (
    SELECT aq.subject_id, aq.topic_id, COUNT(*)::bigint AS total
    FROM active_q aq
    GROUP BY aq.subject_id, aq.topic_id
  ),
  topic_correct AS (
    SELECT cq.subject_id, cq.topic_id, COUNT(*)::bigint AS correct
    FROM correct_q cq
    GROUP BY cq.subject_id, cq.topic_id
  )
  -- Subject-level rows (topic_id = NULL sentinel). FULL JOIN keeps a subject present on
  -- either side: active-only (correct absent -> 0) AND orphan correct-only (total absent
  -- -> 0, the #540/#664 retention case). LEFT JOIN would drop pure-orphan subjects.
  SELECT
    COALESCE(st.subject_id, sc.subject_id) AS subject_id,
    NULL::uuid                             AS topic_id,
    COALESCE(st.total, 0)                  AS total,
    COALESCE(sc.correct, 0)                AS correct
  FROM subj_total st
  FULL JOIN subj_correct sc ON sc.subject_id = st.subject_id

  UNION ALL

  -- Topic-level rows.
  SELECT
    COALESCE(tt.subject_id, tc.subject_id) AS subject_id,
    COALESCE(tt.topic_id, tc.topic_id)     AS topic_id,
    COALESCE(tt.total, 0)                  AS total,
    COALESCE(tc.correct, 0)                AS correct
  FROM topic_total tt
  FULL JOIN topic_correct tc
    ON tc.subject_id = tt.subject_id
   AND tc.topic_id = tt.topic_id;
$$;

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
    WHERE sr.student_id = (select auth.uid())
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
  -- question is excluded from attribution exactly as before. Explicit sr.student_id = (select auth.uid())
  -- keeps it per-caller despite the second permissive SELECT policy (docs/security.md §3 Multiple Permissive SELECT Policies).
  SELECT q.subject_id, MAX(sr.created_at) AS last_practiced_at
  FROM student_responses sr
  JOIN questions q ON q.id = sr.question_id
  WHERE sr.student_id = (select auth.uid())
  GROUP BY q.subject_id;
$$;

CREATE OR REPLACE FUNCTION public.get_student_profile_stats()
RETURNS TABLE (
  total_sessions bigint,
  avg_score      numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint          AS total_sessions,
    AVG(qs.score_percentage)  AS avg_score
  FROM quiz_sessions qs
  WHERE qs.student_id = (select auth.uid())
    AND qs.ended_at IS NOT NULL
    AND qs.deleted_at IS NULL
    AND qs.score_percentage IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_subjects(p_days int)
RETURNS TABLE (day date, subject_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM 1 FROM users u WHERE u.id = (select auth.uid()) AND u.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found or inactive'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 365';
  END IF;
  RETURN QUERY
    SELECT DISTINCT sr.created_at::date, q.subject_id
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE sr.student_id = (select auth.uid())
      AND sr.created_at::date >= CURRENT_DATE - (p_days - 1)
      AND sr.created_at::date <= CURRENT_DATE
    ORDER BY 1, 2;
END;
$$;

-- Comments re-issued: the scoping predicate is (select auth.uid()); the section is docs/security.md §3.
COMMENT ON FUNCTION public.get_daily_subjects(p_days integer) IS
  'Distinct (day, subject_id) pairs the calling student answered in the last p_days days (1-365). SECURITY INVOKER; explicit sr.student_id = (select auth.uid()) per docs/security.md §3 (student_responses has 2 permissive SELECT policies). Active-user gate raises ''user not found or inactive''. The questions JOIN is org + non-deleted via RLS, so a soft-deleted question drops out.';

COMMENT ON FUNCTION public.get_student_last_practiced() IS
  'Most recent response timestamp per subject for the calling student, over ALL responses (any correctness). The questions JOIN is org + non-deleted via RLS (tenant_isolation), reproducing the legacy questionSubjectMap. SECURITY INVOKER; explicit sr.student_id = (select auth.uid()) per docs/security.md §3 (student_responses has 2 permissive SELECT policies). Replaces client-side applyLastPracticed over a .limit(5000) read that truncated at the PostgREST 1000-row cap (#668).';

COMMENT ON FUNCTION public.get_student_profile_stats() IS
  'Completed-session count (total_sessions) and average score (avg_score, raw numeric) for the calling student. Counts only sessions with ended_at IS NOT NULL, deleted_at IS NULL, and score_percentage IS NOT NULL (single-row aggregate; avg_score NULL when none). SECURITY INVOKER + explicit student_id = (select auth.uid()) self-scope (quiz_sessions is multi-permissive, docs/security.md §3). Replaces a client-side read that truncated at the PostgREST 1000-row cap (#668 P2, profile.ts).';

COMMENT ON FUNCTION public.get_student_streak() IS
  'Current and best daily-practice streak (in days) for the calling student, all-time, computed in Postgres via gaps-and-islands over DISTINCT UTC response dates. current_streak = length of the run ending today or yesterday (UTC), else 0; best_streak = longest consecutive run. SECURITY INVOKER; explicit sr.student_id = (select auth.uid()) per docs/security.md §3 (student_responses has 2 permissive SELECT policies). Replaces client-side computeStreaks over a .limit(10000) read that truncated at the PostgREST 1000-row cap (#668).';
