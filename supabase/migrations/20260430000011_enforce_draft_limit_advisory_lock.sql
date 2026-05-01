-- Add per-student advisory lock to enforce_draft_limit trigger to serialize the 20-draft cap check
-- (root cause fix for CR #599 comment 2 — read-then-write race could allow >20 drafts under concurrency).
CREATE OR REPLACE FUNCTION enforce_draft_limit() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Serialize per-student inserts so the 20-draft cap can't be bypassed under concurrency.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.student_id::text));

  IF (SELECT count(*) FROM quiz_drafts WHERE student_id = NEW.student_id) >= 20 THEN
    RAISE EXCEPTION 'Maximum 20 saved quizzes reached';
  END IF;
  RETURN NEW;
END;
$$;
