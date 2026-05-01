-- Add explicit search_path = public to enforce_draft_limit trigger function (advisor: function_search_path_mutable, closes #588)
CREATE OR REPLACE FUNCTION enforce_draft_limit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM quiz_drafts WHERE student_id = NEW.student_id) >= 20 THEN
    RAISE EXCEPTION 'Maximum 20 saved quizzes reached';
  END IF;
  RETURN NEW;
END;
$$;
