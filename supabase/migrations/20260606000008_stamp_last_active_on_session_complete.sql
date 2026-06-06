-- Migration 092: stamp users.last_active_at when a student completes a quiz/exam (#532).
--
-- BUG: the admin dashboard "Last Active" column froze at the 2026-04 backfill date
-- (mig 20260406000004) for every student, even ones completing hundreds of quizzes.
-- Root cause: that backfill only added the last_active_at stamp to the DEPRECATED
-- complete_quiz_session RPC. The LIVE submission paths — batch_submit_quiz,
-- complete_overdue_exam_session, complete_empty_exam_session — never stamped it, so
-- completing a quiz/exam did not update activity.
--
-- FIX: an AFTER UPDATE OF ended_at trigger that stamps last_active_at on the
-- ended_at NULL -> NOT NULL transition, GUARDED to the student who owns the session
-- (auth.uid() = NEW.student_id). Five functions set quiz_sessions.ended_at:
--   * batch_submit_quiz, complete_overdue_exam_session, complete_empty_exam_session,
--     and the deprecated complete_quiz_session — student-initiated (auth.uid() = student)
--   * void_internal_exam_code — admin-invoked (auth.uid() = admin)
-- The auth.uid() = NEW.student_id guard stamps on the four student completions and
-- SKIPS the admin void, matching the product decision (issue #532): activity = the
-- student completing their own quiz/exam — not admin actions, not login, and no
-- backfill (stale rows self-heal on each student's next completion). A future
-- service-role sweeper would run with auth.uid() = NULL and likewise not stamp.
--
-- One trigger covers every present/future student-completion path, avoiding by-hand
-- edits to the 150-line batch_submit_quiz hot-path body (and the other RPC bodies).
--
-- SECURITY INVOKER (matching the existing protect_* triggers): every ended_at
-- transition originates inside a SECURITY DEFINER RPC owned by postgres, so the
-- trigger body runs as postgres and the write succeeds despite the authenticated
-- last_active_at column-UPDATE revoke (mig 090). The write touches only
-- last_active_at, so protect_users_sensitive_columns (role/org/deleted_at) is a no-op.

CREATE OR REPLACE FUNCTION public.stamp_last_active_on_session_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only the student completing their own session counts as activity. auth.uid() is
  -- the original request's JWT subject and persists through the SECURITY DEFINER
  -- completion RPCs, so an admin void (auth.uid() = admin) or a future service-role
  -- sweeper (auth.uid() = NULL) is correctly skipped.
  IF auth.uid() = NEW.student_id THEN
    -- deleted_at IS NULL: the trigger runs as postgres (RLS bypassed), so the
    -- soft-delete filter is manual, per docs/security.md §9 and the prior stamp
    -- site in complete_quiz_session.
    UPDATE users SET last_active_at = now() WHERE id = NEW.student_id AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_last_active_on_session_complete ON quiz_sessions;
CREATE TRIGGER trg_stamp_last_active_on_session_complete
AFTER UPDATE OF ended_at ON quiz_sessions
FOR EACH ROW
WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
EXECUTE FUNCTION public.stamp_last_active_on_session_complete();
