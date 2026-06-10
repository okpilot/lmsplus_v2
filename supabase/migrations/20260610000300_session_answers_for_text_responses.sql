-- Migration 095: quiz_session_answers + student_responses schema shift for text/per-blank answers (VFR RT, #697).
--
-- The VFR RT mock exam introduces short_answer (free text) and dialog_fill
-- (one row per blank) question types. Both answer tables gain response_text +
-- blank_index, selected_option_id becomes nullable, and the
-- UNIQUE (session_id, question_id) constraints widen to
-- UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index) so a
-- dialog_fill submission can write one row per blank while MC/short_answer
-- rows (blank_index NULL) keep the old one-row-per-question semantics
-- (NULL = NULL under NULLS NOT DISTINCT; Postgres 17 per supabase/config.toml).
--
-- RELEASE COUPLING: 095, 095b, and 095c MUST apply in the same release.
-- Dropping the old UNIQUE constraints orphans the
-- ON CONFLICT (session_id, question_id) clauses inside submit_quiz_answer
-- (re-created in 095b) and batch_submit_quiz (re-created in 095c). Because
-- those clauses live in plpgsql bodies, ON CONFLICT inference is validated at
-- EXECUTION time, not apply time (code-style.md §5): `db reset` applies clean
-- and the failure surfaces as 42P10 the first time a student submits.
--
-- complete_quiz_session needs NO companion update: its latest body
-- (supabase/migrations/20260406000004_populate_last_active_at.sql, lines
-- 21-94) only SELECT-counts from quiz_session_answers — it contains no
-- INSERT/ON CONFLICT on the table. (The design doc's "catch-up INSERT at
-- line ~259" of that file is inside the batch_submit_quiz body the same
-- file also redefines, superseded by 20260601000001 → 095c.)

-- ============================================================
-- quiz_session_answers
-- ============================================================

-- NULL is now valid: text-response rows carry response_text instead.
-- The existing CHECK (selected_option_id IN ('a','b','c','d')) is kept —
-- NULL evaluates to UNKNOWN which passes, and it still protects MC rows
-- from invalid option letters.
ALTER TABLE public.quiz_session_answers
  ALTER COLUMN selected_option_id DROP NOT NULL;

ALTER TABLE public.quiz_session_answers
  ADD COLUMN response_text TEXT NULL,
  ADD COLUMN blank_index   INT  NULL;

-- Discriminator (ADDED alongside the existing CHECK, not replacing it):
-- exactly one of (selected_option_id, response_text) must be set per row.
-- blank_index is non-null only for dialog_fill (response_text set,
-- selected_option_id NULL). Existing rows satisfy the first branch.
ALTER TABLE public.quiz_session_answers
  ADD CONSTRAINT quiz_session_answers_answer_shape_check CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL)
  );

-- Drop the UNIQUE (session_id, question_id) from mig 001. It was declared
-- inline without a name, so resolve the auto-generated name by column set
-- instead of hardcoding it.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname
  INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.quiz_session_answers'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(c.conkey) AS k
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
    ) = ARRAY['question_id', 'session_id'];

  IF v_conname IS NULL THEN
    RAISE EXCEPTION 'UNIQUE (session_id, question_id) constraint on quiz_session_answers not found';
  END IF;

  EXECUTE format('ALTER TABLE public.quiz_session_answers DROP CONSTRAINT %I', v_conname);
END;
$$;

-- The backing unique index also serves resume reads on
-- (session_id, question_id, blank_index) — no separate index needed.
ALTER TABLE public.quiz_session_answers
  ADD CONSTRAINT quiz_session_answers_session_question_blank_uniq
  UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index);

-- ============================================================
-- student_responses (same shift — without it, every dialog_fill
-- submission with 2+ blanks would fail at the second INSERT)
-- ============================================================

ALTER TABLE public.student_responses
  ALTER COLUMN selected_option_id DROP NOT NULL;

ALTER TABLE public.student_responses
  ADD COLUMN response_text TEXT NULL,
  ADD COLUMN blank_index   INT  NULL;

ALTER TABLE public.student_responses
  ADD CONSTRAINT student_responses_answer_shape_check CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL)
  );

-- Named by supabase/migrations/20260313000020_fix_student_responses_unique.sql.
ALTER TABLE public.student_responses
  DROP CONSTRAINT student_responses_session_question_unique;

-- Legacy callers (batch_submit_quiz) omit blank_index from their
-- student_responses column list, so their rows land with blank_index = NULL
-- and conflict exactly as under the old (session_id, question_id) constraint.
-- Their bare ON CONFLICT DO NOTHING has no column list and matches any
-- constraint — no function update needed for this table.
ALTER TABLE public.student_responses
  ADD CONSTRAINT student_responses_session_question_blank_uniq
  UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index);
