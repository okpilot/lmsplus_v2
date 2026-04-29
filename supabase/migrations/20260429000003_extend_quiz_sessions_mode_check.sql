-- Extend quiz_sessions.mode CHECK constraint to allow 'internal_exam'.
-- The constraint name varies across environments (it was renamed at least
-- once historically). Look it up by predicate text, drop it, and re-add a
-- canonical-named replacement covering all four modes.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.quiz_sessions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%mode%mock_exam%';
  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'Could not locate mode CHECK constraint on quiz_sessions';
  END IF;
  EXECUTE format('ALTER TABLE public.quiz_sessions DROP CONSTRAINT %I', v_constraint_name);
END $$;

ALTER TABLE public.quiz_sessions
  ADD CONSTRAINT quiz_sessions_mode_check
  CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam'));
