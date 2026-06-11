-- Migration 096: extend quiz_sessions.mode CHECK to allow 'vfr_rt_exam' (#697).
--
-- The VFR Radiotelephony (Slovenia) mock exam runs as a fifth session mode.
-- Mig 058 already replaced the historically renamed anonymous constraint with
-- a canonical-named one (quiz_sessions_mode_check), so a plain DROP + ADD
-- suffices — no DO-block predicate lookup needed. Pre-Flag verified: no
-- migration after 058 renames or redefines this constraint in either
-- migration dir (packages/db/migrations + supabase/migrations).

ALTER TABLE public.quiz_sessions DROP CONSTRAINT quiz_sessions_mode_check;

ALTER TABLE public.quiz_sessions
  ADD CONSTRAINT quiz_sessions_mode_check
  CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam', 'vfr_rt_exam'));

-- Schema-level guard against concurrent active vfr_rt_exam sessions.
-- The idempotent-resume SELECT in start_vfr_rt_exam_session (mig 099 step 5)
-- is racy on the FIRST call: two concurrent callers can both observe no
-- active session, both INSERT into quiz_sessions, and both succeed —
-- producing two simultaneous active vfr_rt_exam sessions for one student.
-- The partial unique index enforces the invariant at the schema level
-- (PG serialises unique-index check + insert). Siblings:
-- uq_active_exam_session (mock_exam, mig 088) and
-- uq_internal_exam_session_active (internal_exam, mig 069). The companion
-- EXCEPTION WHEN unique_violation handler in mig 099 re-reads and returns
-- the winner's session (idempotent-resume contract — not raise-only).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vfr_rt_exam_session_active
  ON public.quiz_sessions (student_id, organization_id, subject_id)
  WHERE mode = 'vfr_rt_exam' AND ended_at IS NULL AND deleted_at IS NULL;
