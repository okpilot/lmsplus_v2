-- 021_draft_limit_trigger.sql
-- Enforce the 20-draft-per-student limit atomically inside Postgres.
-- The previous approach (count in saveDraft action, then insert) was a TOCTOU race:
-- two concurrent saves could both see count=19 and create drafts 20 and 21.
-- A BEFORE INSERT trigger makes the check and the insert one atomic operation.

CREATE OR REPLACE FUNCTION enforce_draft_limit() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM quiz_drafts WHERE student_id = NEW.student_id) >= 20 THEN
    RAISE EXCEPTION 'Maximum 20 saved quizzes reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_draft_limit
  BEFORE INSERT ON quiz_drafts
  FOR EACH ROW EXECUTE FUNCTION enforce_draft_limit();
