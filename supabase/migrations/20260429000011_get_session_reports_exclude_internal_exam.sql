-- Migration 066: get_session_reports excludes internal_exam at the SQL level.
-- Without this, count(*) OVER() includes internal_exam rows in total_count even
-- though the TypeScript filter in lib/queries/reports.ts excludes them from the
-- returned rows, causing pagination drift on mixed-mode student histories.

CREATE OR REPLACE FUNCTION public.get_session_reports(
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
  answered_count   BIGINT,
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
       (SELECT count(*) FROM quiz_session_answers qsa WHERE qsa.session_id = qs.id) AS answered_count,
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
