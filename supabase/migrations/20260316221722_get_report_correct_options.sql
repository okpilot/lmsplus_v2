-- Returns correct option IDs for a set of questions.
-- Used by quiz-report (completed sessions only) so the TypeScript layer
-- never sees the raw `correct` boolean on options JSONB.
CREATE OR REPLACE FUNCTION get_report_correct_options(p_question_ids uuid[])
RETURNS TABLE (question_id uuid, correct_option_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
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
