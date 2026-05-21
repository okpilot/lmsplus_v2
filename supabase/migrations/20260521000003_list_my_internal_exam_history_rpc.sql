-- list_my_internal_exam_history()
-- Returns the current student's internal_exam quiz session history. Per-subject
-- attempt_number is computed via row_number() OVER ALL sessions (before the
-- LIMIT) so it remains stable when total attempts exceed the returned slice.
-- Closes issue #579 (TS-side counter restart at row 200).

CREATE OR REPLACE FUNCTION public.list_my_internal_exam_history()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  started_at timestamptz,
  ended_at timestamptz,
  score_percentage numeric,
  passed boolean,
  total_questions int,
  answered_count int,
  attempt_number int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  WITH numbered AS (
    SELECT
      qs.id,
      qs.subject_id,
      qs.started_at,
      qs.ended_at,
      qs.score_percentage,
      qs.passed,
      qs.total_questions,
      row_number() OVER (PARTITION BY qs.subject_id ORDER BY qs.started_at)::int AS attempt_number
    FROM public.quiz_sessions qs
    WHERE qs.student_id = v_user_id
      AND qs.mode = 'internal_exam'
      AND qs.deleted_at IS NULL
  ),
  answers AS (
    SELECT
      qsa.session_id,
      count(*)::int AS answered_count
    FROM public.quiz_session_answers qsa
    WHERE qsa.session_id IN (SELECT n.id FROM numbered n)
    GROUP BY qsa.session_id
  )
  SELECT
    n.id,
    n.subject_id,
    s.name,
    s.short,
    n.started_at,
    n.ended_at,
    n.score_percentage,
    n.passed,
    n.total_questions,
    COALESCE(a.answered_count, 0),
    n.attempt_number
  FROM numbered n
  LEFT JOIN public.easa_subjects s
    ON s.id = n.subject_id
    AND s.deleted_at IS NULL
  LEFT JOIN answers a
    ON a.session_id = n.id
  ORDER BY n.started_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_internal_exam_history() TO authenticated;
