-- Migration: remove the 4 scoring columns from authenticated's UPDATE grant on
-- quiz_sessions, closing the exam-score-forgery vector (#611).
--
-- #611 (HIGH). The `students_update_sessions` RLS policy (mig 20260313000023) scopes
-- ROWS (student_id = auth.uid() AND ended_at IS NULL) but not COLUMNS, and
-- `trg_quiz_sessions_immutable_columns` (mig 20260502000001) freezes only the 10
-- config-type columns. That left the scoring columns (correct_count, score_percentage,
-- passed, ended_at) writable by a student's own authenticated PostgREST connection —
-- so a student could forge a perfect score with a direct UPDATE on their active
-- session, bypassing batch_submit_quiz scoring:
--
--   UPDATE quiz_sessions
--   SET correct_count = 100, score_percentage = 100, passed = true, ended_at = now()
--   WHERE id = <own active session>;
--
-- Fix at the privilege layer (defense-in-depth precedent: mig 20260521000004 revoked
-- UPDATE on internal_exam_codes). Postgres cannot REVOKE a single column from a
-- table-level grant, so we REVOKE the blanket UPDATE and re-GRANT every column EXCEPT
-- the four scoring columns (and the `id` primary key, which students never write):
--
--   * The 10 config columns are re-granted so the existing immutability trigger
--     (mig 079) keeps firing its 'immutable' message for frozen-column attacks —
--     the #554 defense and its red-team coverage are unchanged. authenticated's
--     effective privilege on these columns is identical to before (trigger-blocked).
--   * `deleted_at` is re-granted — the only column a student writes directly, via the
--     discardQuiz Server Action (apps/web/app/app/quiz/actions/discard.ts, user client).
--   * The four scoring columns are intentionally OMITTED, so a student-direct UPDATE
--     touching any of them now fails with 42501 (permission denied for column …) at
--     the privilege layer, before RLS — a non-vacuous rejection.
--
-- Completion stays intact: batch_submit_quiz / complete_quiz_session /
-- complete_overdue_exam_session / complete_empty_exam_session are SECURITY DEFINER,
-- owned by postgres, which is not subject to the authenticated column grant.

REVOKE UPDATE ON quiz_sessions FROM authenticated;
GRANT UPDATE (
  organization_id,
  student_id,
  mode,
  subject_id,
  topic_id,
  config,
  started_at,
  total_questions,
  time_limit_seconds,
  created_at,
  deleted_at
) ON quiz_sessions TO authenticated;
