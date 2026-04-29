-- Migration 069: Schema-level guard against concurrent active internal_exam sessions
-- CodeRabbit PR #576 finding #33 (CRITICAL — race condition).
-- The EXISTS guard in start_internal_exam_session (mig 065 lines 104-114) is
-- racy: two concurrent transactions with two different codes for the same
-- (student, subject) can both observe no active session, both INSERT into
-- quiz_sessions, and both succeed — producing two simultaneous active
-- internal_exam sessions for one student.
-- Fix: a partial unique index that enforces the invariant at the schema level.
-- This is concurrency-safe because PG serialises unique-index check + insert.
-- The companion function-body update (with EXCEPTION WHEN unique_violation)
-- ships in migration 070, which also fixes the missing org check (#36).
-- This migration ships only the index — it does NOT modify the function.

CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_exam_session_active
ON public.quiz_sessions (student_id, organization_id, subject_id)
WHERE mode = 'internal_exam' AND ended_at IS NULL AND deleted_at IS NULL;
