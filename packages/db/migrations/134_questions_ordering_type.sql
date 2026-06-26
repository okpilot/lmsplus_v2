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
-- 2b) Shape guard for ordering_items (defense-in-depth — #998 CR #452/#472).
-- ------------------------------------------------------------------
-- The length-only branch in section 3 (>= 2 items) is too weak: a row with duplicate
-- item ids, a blank id, or blank text still satisfies it, but get_quiz_questions
-- (mig 136) and the ordering grader (mig 138) use `id` as the stable key and `text` as
-- the rendered label — a malformed row is ambiguous to grade and impossible to render.
-- This helper requires every element to be an object whose `id` and `text` are both
-- JSON STRINGS that are non-blank after trimming, with all `id`s DISTINCT (the array
-- order is the answer key, so a duplicate id is a non-permutation). The string-type
-- check matters because `->>` coerces a JSON number/boolean/object to text, so a row
-- like {"id":42,"text":{"label":"x"}} would otherwise pass even though the app layer
-- treats ordering_items ids/text as strings throughout (#998 CR). `IS DISTINCT FROM
-- 'string'` (not `<> 'string'`) also rejects a MISSING id/text key, whose jsonb_typeof
-- is NULL. TOTAL function: a non-array input (or a non-object element) returns false →
-- a clean 23514 CHECK reject, never a 22023 abort — the SRF argument is CASE-wrapped
-- exactly like mig 125 dialog_fill_blanks_delimiter_free.
-- IMMUTABLE PARALLEL SAFE (argument-only, pg_catalog built-ins) so it is usable inside a
-- table CHECK; not SECURITY DEFINER, so no SET search_path. Declared BEFORE the
-- columns_check re-add in section 3, which references it.
CREATE OR REPLACE FUNCTION is_valid_ordering_items(p_items jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p_items) = 'array'
    AND (
      SELECT count(*) FILTER (
               WHERE jsonb_typeof(e) <> 'object'
                  OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string'
                  OR jsonb_typeof(e->'text') IS DISTINCT FROM 'string'
                  OR btrim(e->>'id') = ''
                  OR btrim(e->>'text') = ''
             ) = 0
         AND count(*) = count(DISTINCT e->>'id')
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
           ) AS e
    );
$$;

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
       AND jsonb_array_length(ordering_items) >= 2
       AND is_valid_ordering_items(ordering_items))
  );
