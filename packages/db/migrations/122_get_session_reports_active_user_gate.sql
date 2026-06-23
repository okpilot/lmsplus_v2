-- Migration 122: add the active-user (soft-deleted-caller) gate to get_session_reports (#883).
--
-- get_session_reports (mig 091) had the auth.uid() null-check + per-session
-- deleted_at filter, but NOT the active-user gate that all its newer SECURITY
-- DEFINER siblings enforce (check_quiz_answer mig 117, get_report_correct_options
-- mig 114, submit_quiz_answer mig 095c/110). A student soft-deleted via
-- toggle-student-status (users.deleted_at = now()) holding a still-valid JWT
-- (up to ~1h until expiry) could keep reading their historical session list —
-- deactivation does not cascade to quiz_sessions, so the per-session ownership
-- filter still matches. This gate closes that window: a soft-deleted caller
-- fails closed before the session read.
--
-- The return type is unchanged, so CREATE OR REPLACE suffices (no DROP). The gate
-- aliases `users u` and references `u.id`: the RETURNS TABLE declares an `id` OUT
-- param, so an unqualified `id` in the gate would be ambiguous (42702 at execution
-- — code-style.md §5(c) deferred-validation). Re-grant EXECUTE for explicitness.

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

  -- Active-user gate (#883): a soft-deleted account with a live JWT must not keep
  -- reading its historical session reports. Mirrors check_quiz_answer (mig 117) and
  -- get_report_correct_options (mig 114). Alias `users u` — the RETURNS TABLE declares
  -- an `id` OUT param, so an unqualified `id` here would be ambiguous (42702, §5(c)).
  PERFORM 1 FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
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
