-- Issue #554: enforce DB-layer column-immutability on quiz_sessions.
--
-- RLS policy `students_update_sessions` (mig 20260313000023) allows students to UPDATE
-- their own active sessions but does not column-restrict. Without this trigger, a student
-- could `UPDATE quiz_sessions SET config = '{"question_ids":[...]}'` to inject question IDs
-- and then call batch_submit_quiz, scoring against the substituted set.
--
-- Mirrors `protect_users_sensitive_columns` (mig 20260316000041): BEFORE UPDATE OF
-- column-list trigger with `current_role = 'service_role'` exemption. Not declared
-- SECURITY DEFINER on purpose — the guard relies on the *caller's* role, which
-- SECURITY DEFINER would mask by always reporting the function owner.
--
-- Mutable columns (NOT in BEFORE UPDATE OF list): id (PK), ended_at, correct_count,
-- score_percentage, passed, deleted_at. These cover all SECURITY DEFINER UPDATE paths
-- (complete_quiz_session, complete_overdue_exam_session, complete_empty_exam_session,
-- batch_submit_quiz completion, soft-delete on discard).

CREATE OR REPLACE FUNCTION quiz_sessions_protect_immutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service-role (superuser) connections to modify anything
  IF current_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to write-once columns for authenticated connections
  IF NEW.config IS DISTINCT FROM OLD.config THEN
    RAISE EXCEPTION 'Cannot modify config — quiz_sessions.config is immutable after row creation';
  END IF;

  IF NEW.total_questions IS DISTINCT FROM OLD.total_questions THEN
    RAISE EXCEPTION 'Cannot modify total_questions — quiz_sessions.total_questions is immutable after row creation';
  END IF;

  IF NEW.mode IS DISTINCT FROM OLD.mode THEN
    RAISE EXCEPTION 'Cannot modify mode — quiz_sessions.mode is immutable after row creation';
  END IF;

  IF NEW.time_limit_seconds IS DISTINCT FROM OLD.time_limit_seconds THEN
    RAISE EXCEPTION 'Cannot modify time_limit_seconds — quiz_sessions.time_limit_seconds is immutable after row creation';
  END IF;

  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Cannot modify started_at — quiz_sessions.started_at is immutable after row creation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cannot modify organization_id — quiz_sessions.organization_id is immutable after row creation';
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'Cannot modify student_id — quiz_sessions.student_id is immutable after row creation';
  END IF;

  IF NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    RAISE EXCEPTION 'Cannot modify subject_id — quiz_sessions.subject_id is immutable after row creation';
  END IF;

  IF NEW.topic_id IS DISTINCT FROM OLD.topic_id THEN
    RAISE EXCEPTION 'Cannot modify topic_id — quiz_sessions.topic_id is immutable after row creation';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify created_at — quiz_sessions.created_at is immutable after row creation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

CREATE TRIGGER trg_quiz_sessions_immutable_columns
  BEFORE UPDATE OF config, total_questions, mode, time_limit_seconds,
                   started_at, organization_id, student_id, subject_id,
                   topic_id, created_at
  ON quiz_sessions
  FOR EACH ROW
  EXECUTE FUNCTION quiz_sessions_protect_immutable_columns();

COMMENT ON TRIGGER trg_quiz_sessions_immutable_columns ON quiz_sessions IS
  'Defense-in-depth: blocks UPDATE of write-once columns for non-service-role connections. Closes the exam-question-swap vector where a student injected question_ids into their own active session via direct PostgREST UPDATE. See #554.';
