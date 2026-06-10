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
