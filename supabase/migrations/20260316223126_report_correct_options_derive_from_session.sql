-- Drop p_question_ids param — derive question set from quiz_session_answers
-- to prevent arbitrary question ID probing via the REST API.
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

  RETURN QUERY
  SELECT
    sa.question_id,
    (opt->>'id')::text AS correct_option_id
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.options) AS opt
  WHERE sa.session_id = p_session_id
    AND q.deleted_at IS NULL
    AND (opt->>'correct')::boolean = true;
END;
$$;
