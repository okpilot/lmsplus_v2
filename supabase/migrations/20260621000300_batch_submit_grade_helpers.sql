-- Migration 120: Internal helper functions for batch_submit_quiz per-type grading.
-- Extracted from batch_submit_quiz (mig 112b) to reduce the dispatcher body
-- below the 300-line cap and make it type-aware (#697, Phase 2 — short_answer
-- + dialog_fill support).
--
-- SECURITY NOTE — REVOKE FROM PUBLIC (new pattern).
-- CREATE [OR REPLACE] FUNCTION grants EXECUTE to PUBLIC by default. Helpers
-- prefixed with "_" are internal and must NOT be callable by authenticated
-- users via PostgREST — a direct call would bypass batch_submit_quiz's
-- auth/owner/mode guards, allowing a student to forge graded rows for any
-- question. Each helper therefore carries REVOKE EXECUTE ... FROM PUBLIC
-- immediately after its CREATE. The owning postgres role retains EXECUTE and
-- the dispatcher (also SECURITY DEFINER owned by postgres) can still call them.
-- DO NOT add GRANT EXECUTE ... TO authenticated on any helper in this file.
--
-- Depends on:
--   mig 094  (question_type, canonical_answer, accepted_synonyms, blanks_config)
--   mig 095  (quiz_session_answers / student_responses schema: response_text,
--             blank_index, UNIQUE NULLS NOT DISTINCT on 3-col key)
--   mig 101  (normalize_answer)
--   mig 111  (correct_option_id column on questions)

-- ============================================================
-- 1. _grade_record_mc
--    Grades one MC answer, writes quiz_session_answers + student_responses +
--    fsrs_cards. Returns 1.0 if correct, 0.0 if not.
-- ============================================================
CREATE OR REPLACE FUNCTION _grade_record_mc(
  p_session_id     uuid,
  p_student_id     uuid,
  p_org_id         uuid,
  p_question_id    uuid,
  p_selected       text,
  p_correct_option text,
  p_options        jsonb,
  p_response_time  int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_correct boolean;
BEGIN
  -- Per-type correctness guards (dispatcher already verified auth/ownership/mode).
  IF p_selected IS NULL OR p_selected = '' THEN
    RAISE EXCEPTION 'answer for question % has empty selected_option', p_question_id;
  END IF;
  IF p_correct_option IS NULL THEN
    RAISE EXCEPTION 'question % has no correct option', p_question_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_options) opt
    WHERE opt->>'id' = p_selected
  ) THEN
    RAISE EXCEPTION 'selected option % does not belong to question %',
      p_selected, p_question_id;
  END IF;

  v_is_correct := (p_selected = p_correct_option);

  INSERT INTO quiz_session_answers
    (session_id, question_id, selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_selected, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_selected, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
  VALUES (p_student_id, p_question_id, v_is_correct, now())
  ON CONFLICT (student_id, question_id)
  DO UPDATE SET
    last_was_correct = EXCLUDED.last_was_correct,
    updated_at       = now();

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke direct PostgREST access — only postgres (owner) may call.
-- See file-header note.
REVOKE EXECUTE ON FUNCTION _grade_record_mc(uuid,uuid,uuid,uuid,text,text,jsonb,int) FROM PUBLIC;

-- ============================================================
-- 2. _grade_record_short_answer
--    Grades one short_answer, writes quiz_session_answers + student_responses.
--    Returns 1.0 if correct, 0.0 if not.
-- ============================================================
CREATE OR REPLACE FUNCTION _grade_record_short_answer(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_response_text text,
  p_canonical     text,
  p_synonyms      text[],
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm       text;
  v_is_correct boolean;
BEGIN
  -- Per-type correctness guard.
  IF p_canonical IS NULL THEN
    RAISE EXCEPTION 'question % has no canonical answer', p_question_id;
  END IF;

  v_norm := normalize_answer(p_response_text);
  v_is_correct := (v_norm <> '' AND (
    v_norm = COALESCE(normalize_answer(p_canonical), '')
    OR EXISTS (SELECT 1 FROM unnest(p_synonyms) AS s WHERE normalize_answer(s) = v_norm)
  ));

  -- blank_index NULL for short_answer (one row per question).
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke direct PostgREST access — only postgres (owner) may call.
REVOKE EXECUTE ON FUNCTION _grade_record_short_answer(uuid,uuid,uuid,uuid,text,text,text[],int) FROM PUBLIC;

-- ============================================================
-- 3. _grade_record_dialog_fill
--    Grades ONE blank of a dialog_fill question. The dispatcher fans out
--    per-blank entries from the answers payload and calls this once per blank.
--    Returns 1.0 if this blank is correct, 0.0 if not.
-- ============================================================
CREATE OR REPLACE FUNCTION _grade_record_dialog_fill(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_blank_index   int,
  p_response_text text,
  p_blanks_config jsonb,
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blank_canonical text;
  v_blank_synonyms  text[];
  v_norm            text;
  v_is_correct      boolean;
BEGIN
  -- Per-type correctness guard: blank_index must exist in blanks_config.
  IF p_blank_index IS NULL OR p_blank_index < 0 THEN
    RAISE EXCEPTION 'invalid_blank_index for question %', p_question_id;
  END IF;

  SELECT b->>'canonical', ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
  INTO v_blank_canonical, v_blank_synonyms
  FROM jsonb_array_elements(p_blanks_config) AS b
  WHERE (b->>'index')::int = p_blank_index;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_blank_index % not in blanks_config of question %',
      p_blank_index, p_question_id;
  END IF;

  v_norm := normalize_answer(p_response_text);
  v_is_correct := (v_norm <> '' AND (
    v_norm = COALESCE(normalize_answer(v_blank_canonical), '')
    OR EXISTS (SELECT 1 FROM unnest(v_blank_synonyms) AS s WHERE normalize_answer(s) = v_norm)
  ));

  -- One row per blank — blank_index is the differentiator in the 3-col UNIQUE.
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke direct PostgREST access — only postgres (owner) may call.
REVOKE EXECUTE ON FUNCTION _grade_record_dialog_fill(uuid,uuid,uuid,uuid,int,text,jsonb,int) FROM PUBLIC;
