-- Migration 134: questions.ordering_items column + question_type widening for the
-- VFR RT Training `ordering` question type (Part 3 sequencing — #697, Phase 5).
--
-- The `ordering` type presents a shuffled list of items (radio/phraseology steps)
-- that the student drags into the correct sequence. The canonical sequence is
-- stored as the ARRAY ORDER of ordering_items: [{ "id": <opaque>, "text": <label> }, ...].
-- There is no separate answer-key string — the array position IS the key, so
-- get_quiz_questions (mig 136) delivers the items SHUFFLED to hide it.
--
-- SECURITY — ordering_items is an answer key (its array order). mig 094 REVOKEd the
-- blanket SELECT on questions FROM authenticated and re-GRANTed an EXPLICIT column
-- list (094 L130-154). A column added AFTER that grant is NOT in the list, so
-- `authenticated` cannot SELECT ordering_items via PostgREST — auto-gated by omission
-- (spec note N6). DO NOT add ordering_items to any GRANT SELECT expansion. The
-- SECURITY DEFINER delivery/grading RPCs (owned by postgres) bypass the column grant.

-- ------------------------------------------------------------------
-- 1) New column — canonical-order array of { id, text }.
-- ------------------------------------------------------------------
ALTER TABLE questions
  ADD COLUMN ordering_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------------
-- 2) Widen the question_type IN-list to include 'ordering'.
-- ------------------------------------------------------------------
-- The IN(...) CHECK is mig 094's INLINE column constraint (094 L62-63), so it was
-- auto-named by Postgres. Resolve the generated name via pg_constraint by its
-- column set rather than hardcoding it (mirrors mig 095 L56-77).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname
  INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.questions'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%question_type%'
    AND pg_get_constraintdef(c.oid) ILIKE '%multiple_choice%'
    AND pg_get_constraintdef(c.oid) ILIKE '%dialog_fill%'
    AND pg_get_constraintdef(c.oid) NOT ILIKE '%canonical_answer%';  -- exclude the columns_check
  IF v_conname IS NULL THEN
    RAISE EXCEPTION 'inline question_type IN(...) CHECK on questions not found';
  END IF;
  EXECUTE format('ALTER TABLE public.questions DROP CONSTRAINT %I', v_conname);
END;
$$;

ALTER TABLE questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('multiple_choice', 'short_answer', 'dialog_fill', 'ordering'));

-- ------------------------------------------------------------------
-- 3) Type <-> column population discriminator (4 branches).
-- ------------------------------------------------------------------
-- Every branch now positively states ordering_items emptiness: non-ordering types
-- must have length 0; ordering must have >= 2 items (a 1-item "ordering" is
-- degenerate — always trivially correct). mig 125's two dialog_fill constraints are
-- gated on `question_type <> 'dialog_fill'` so they pass vacuously for ordering rows
-- (no change needed there). Existing rows backfill ordering_items = '[]' (length 0),
-- so every existing MC/short/dialog row satisfies its branch's new `= 0` clause.
ALTER TABLE questions
  DROP CONSTRAINT questions_question_type_columns_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_question_type_columns_check CHECK (
    (question_type = 'multiple_choice'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND jsonb_array_length(ordering_items) = 0)
    OR (question_type = 'short_answer'
       AND canonical_answer IS NOT NULL
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND jsonb_array_length(ordering_items) = 0)
    OR (question_type = 'dialog_fill'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NOT NULL
       AND jsonb_array_length(blanks_config) > 0
       AND jsonb_array_length(ordering_items) = 0)
    OR (question_type = 'ordering'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0
       AND jsonb_array_length(ordering_items) >= 2)
  );
