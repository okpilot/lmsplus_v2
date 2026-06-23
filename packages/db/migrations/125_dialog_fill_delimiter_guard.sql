-- Migration 125: forbid the dialog_fill token delimiters { } | ; inside
-- dialog_fill answer values, so the student-facing strip regex in
-- get_quiz_questions (mig 118) and get_vfr_rt_exam_questions (mig 105) can
-- never leak a partial answer key (#951).
--
-- Root cause: the dialog_fill token grammar is {{n|canonical;syn1;syn2}}.
-- The strip regex rewrites every token to a plain {{n}} marker before the
-- template reaches a student. The OLD value class [^}]* stops at the FIRST
-- '}', so a canonical/synonym containing '}' (e.g. {{0|sta}ll}}) left a
-- partial key in the student-facing dialog_template. '{ } | ;' are structural
-- delimiters that a value simply cannot represent; a regex cannot recover an
-- ambiguous value, so the fix forbids these chars at the data layer.
--
-- Two CHECK constraints (dialog_fill rows only — every clause is gated on
-- question_type = 'dialog_fill'; the existing type-discriminator CHECK
-- questions_question_type_columns_check, mig 094, guarantees non-dialog_fill
-- rows hold NULL dialog_template / empty blanks_config):
--
--   1. questions_dialog_fill_blanks_delimiter_free — every canonical and every
--      synonym in blanks_config is free of { } | ;. This is an authoring-
--      hygiene / consistency invariant (keeps template tokens and blanks_config
--      delimiter-free in lockstep); it is NOT itself a student-leak path, since
--      get_quiz_questions / get_vfr_rt_exam_questions emit blanks_safe as
--      index-only (canonicals + synonyms stripped).
--
--   2. questions_dialog_fill_template_wellformed — the STUDENT-LEAK guard. After
--      removing every well-formed token {{n|value}} (value region [^{}|]* —
--      allows ';' synonym separators, forbids { } |), no stray brace may remain.
--      A '}' or '|' inside a token value breaks the token shape, leaving a
--      brace that fails this check. ';' inside a value is permitted here (it is
--      NOT a leak vector — the token still strips cleanly to {{n}}); constraint
--      (1) is what bans ';' in the authoring values.
--
-- Coordination invariant: this template CHECK is a SUPERSET of the hardened
-- strip's residue — every input the strip (migs 126/127) cannot fully clean is
-- rejected at INSERT here, so it can never be stored. The CHECK and the strip
-- are co-dependent; do NOT weaken either independently.
--
-- Prod safety: zero dialog_fill rows exist on prod (VFR RT question data not
-- imported), and `supabase db reset` applies this migration before any seed, so
-- the ADD CONSTRAINT validates against an empty table. All integration-test
-- fixtures use delimiter-free values (S5-ABC, S5-XYZ, ...), so none trip it.
--
-- security.md rule 1 (answer-key stripping). Not SECURITY DEFINER (no auth /
-- search_path concern); the helper reads only its jsonb argument via
-- pg_catalog built-ins.

-- IMMUTABLE PARALLEL SAFE: depends only on its argument, no table reads — same
-- shape as normalize_answer (mig 101). NB: jsonb_array_elements_text raises
-- 22023 on a non-array scalar, so the synonyms SRF argument is wrapped in a
-- CASE that substitutes '[]'::jsonb when synonyms is absent or not an array.
-- Without it a malformed synonyms value would abort an INSERT as 22023 instead
-- of the constraint-violation 23514 the tests assert. Delimiter scope only:
-- a non-array synonyms is treated as "no synonyms to scan", not rejected here
-- (the type-discriminator CHECK + future authoring own full shape enforcement).
CREATE OR REPLACE FUNCTION dialog_fill_blanks_delimiter_free(p_blanks jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_blanks, '[]'::jsonb)) AS e
    WHERE (e->>'canonical') ~ '[{}|;]'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(e->'synonyms') = 'array'
                     THEN e->'synonyms'
                     ELSE '[]'::jsonb
                END
              ) AS syn
         WHERE syn ~ '[{}|;]'
       )
  );
$$;

ALTER TABLE questions
  ADD CONSTRAINT questions_dialog_fill_blanks_delimiter_free CHECK (
    question_type <> 'dialog_fill'
    OR dialog_fill_blanks_delimiter_free(blanks_config)
  );

ALTER TABLE questions
  ADD CONSTRAINT questions_dialog_fill_template_wellformed CHECK (
    question_type <> 'dialog_fill'
    OR regexp_replace(dialog_template, '\{\{\d+\|[^{}|]*\}\}', '', 'g') !~ '[{}]'
  );
