-- 1. Add ORDER BY to DISTINCT ON for deterministic row selection when a
--    question has multiple correct options in JSONB (matches LIMIT 1 in
--    other RPCs by picking the first option by array position).
-- 2. Remove q.deleted_at IS NULL — soft-deleted questions must still appear
--    in historical reports for completed sessions. The session's answers
--    already constrain the question set.
CREATE OR REPLACE FUNCTION get_report_correct_options(p_session_id uuid)
RETURNS TABLE (question_id uuid, correct_option_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND student_id = auth.uid()
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;

  -- Ownership verified above via EXISTS on quiz_sessions.
  -- This SECURITY DEFINER function bypasses RLS — do not remove the guard.
  RETURN QUERY
  SELECT DISTINCT ON (sa.question_id)
    sa.question_id,
    (opt.value->>'id')::text AS correct_option_id
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.options) WITH ORDINALITY AS opt(value, ord)
  WHERE sa.session_id = p_session_id
    AND (opt.value->>'correct')::boolean = true
  ORDER BY sa.question_id, opt.ord;
END;
$$;
