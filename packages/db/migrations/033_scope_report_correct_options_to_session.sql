-- Scope get_report_correct_options to a completed session owned by the caller.
-- Prevents arbitrary question ID probing by unauthenticated or non-owning students.
CREATE OR REPLACE FUNCTION get_report_correct_options(p_session_id uuid, p_question_ids uuid[])
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

  RETURN QUERY
  SELECT
    q.id AS question_id,
    (opt->>'id')::text AS correct_option_id
  FROM questions q,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND (opt->>'correct')::boolean = true;
END;
$$;
