-- Migration 091: drop the unused answered_count column from get_session_reports.
--
-- answered_count was computed by a per-row correlated subquery
-- (SELECT count(*) FROM quiz_session_answers WHERE session_id = qs.id), but the
-- reports UI never renders it — the practice/quiz reports list shows
-- correct_count / total_questions only (verified: no consumer of
-- SessionReport.answeredCount in apps/web). On a heavy student that subquery cost
-- ~12 ms per page (EXPLAIN ANALYZE, issue #471). The issue originally proposed a
-- "set-based aggregate", but the planner already defers the correlated subquery
-- past the LIMIT (runs once per output row, not per matched session), so a JOIN/
-- GROUP BY over all matched sessions would be strictly MORE work. The correct fix
-- is therefore to delete the unused computation rather than restructure it.
--
-- Removing a column from RETURNS TABLE changes the function's return type, which
-- CREATE OR REPLACE cannot do — DROP + CREATE is required. Re-grant EXECUTE after.

DROP FUNCTION IF EXISTS public.get_session_reports(TEXT, TEXT, INT, INT);

CREATE FUNCTION public.get_session_reports(
  p_sort  TEXT DEFAULT 'started_at',
  p_dir   TEXT DEFAULT 'desc',
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  mode             TEXT,
  total_questions  INT,
  correct_count    INT,
  score_percentage NUMERIC,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  subject_id       UUID,
  subject_name     TEXT,
  total_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_sort TEXT;
  v_dir  TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  CASE p_sort
    WHEN 'started_at'       THEN v_sort := 'qs.started_at';
    WHEN 'score_percentage'  THEN v_sort := 'qs.score_percentage';
    WHEN 'subject_name'      THEN v_sort := 'es.name';
    ELSE v_sort := 'qs.started_at';
  END CASE;

  IF lower(p_dir) = 'asc' THEN
    v_dir := 'ASC';
  ELSE
    v_dir := 'DESC';
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT
       qs.id,
       qs.mode::TEXT,
       qs.total_questions,
       qs.correct_count,
       qs.score_percentage,
       qs.started_at,
       qs.ended_at,
       qs.subject_id,
       es.name AS subject_name,
       count(*) OVER() AS total_count
     FROM quiz_sessions qs
     LEFT JOIN easa_subjects es ON es.id = qs.subject_id
     WHERE qs.student_id = $1
       AND qs.ended_at IS NOT NULL
       AND qs.deleted_at IS NULL
       AND qs.mode <> ''internal_exam''
     ORDER BY %s %s NULLS LAST, qs.id ASC
     LIMIT $2 OFFSET $3',
    v_sort, v_dir
  )
  USING v_uid, p_limit, p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_session_reports(TEXT, TEXT, INT, INT) TO authenticated;
