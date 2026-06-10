-- Migration 095b: submit_quiz_answer — widen ON CONFLICT for blank_index (VFR RT, #697).
--
-- CRITICAL companion to mig 095. RELEASE COUPLING: 095, 095b, and 095c MUST
-- apply in the same release. Mig 095 dropped UNIQUE (session_id, question_id)
-- on quiz_session_answers, so the old ON CONFLICT (session_id, question_id)
-- clause in this function no longer matches any constraint. Because the
-- clause lives inside a plpgsql body, ON CONFLICT inference is validated at
-- EXECUTION time, not apply time (code-style.md §5): `db reset` applies clean
-- and the failure surfaces as a deferred 42P10 the first time a student
-- submits an answer.
--
-- Body copied VERBATIM from the latest definition
-- (supabase/migrations/20260316000040_submit_answer_track_last_was_correct.sql).
-- The ONLY change is the quiz_session_answers conflict target:
--   ON CONFLICT (session_id, question_id) -> ON CONFLICT (session_id, question_id, blank_index)
-- This function inserts only MC rows (blank_index NULL); with NULLS NOT
-- DISTINCT semantics, (session, question, NULL) conflicts exactly as the old
-- (session, question) did — re-submit idempotency is preserved.
-- Untouched on purpose:
--   * student_responses bare ON CONFLICT DO NOTHING — no column list, matches
--     any constraint (including 095's widened one).
--   * fsrs_cards ON CONFLICT (student_id, question_id) — different table,
--     its constraint is not changed by mig 095.
--
-- batch_submit_quiz gets the same treatment in mig 095c (its ~300-line body
-- would push a combined file past the code-style.md §1 migration cap).
-- complete_quiz_session needs NO update — see the mig 095 header.

CREATE OR REPLACE FUNCTION submit_quiz_answer(
  p_session_id        uuid,
  p_question_id       uuid,
  p_selected_option   text,
  p_response_time_ms  int
)
RETURNS TABLE (
  is_correct            boolean,
  explanation_text      text,
  explanation_image_url text,
  correct_option_id     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id           uuid := auth.uid();
  v_org_id               uuid;
  v_correct_option       text;
  v_is_correct           boolean;
  v_expl_text            text;
  v_expl_image_url       text;
  v_session_ended        boolean;
  v_config               jsonb;
  v_session_question_ids uuid[];
  v_options              jsonb;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student, is still active, and not soft-deleted
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL,
    qs.config
  INTO v_org_id, v_session_ended, v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
  END IF;

  -- Question membership check: p_question_id must be in session config.question_ids
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  v_session_question_ids := ARRAY(
    SELECT jsonb_array_elements_text(v_config->'question_ids')
  )::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question does not belong to this session';
  END IF;

  -- Get correct answer, explanation, and full options array (service-level access).
  -- deleted_at filter applied: active sessions should only reference active questions.
  SELECT
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt WHERE (opt->>'correct')::boolean LIMIT 1),
    q.explanation_text,
    q.explanation_image_url,
    q.options
  INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_correct_option IS NULL THEN
    RAISE EXCEPTION 'question has no correct option';
  END IF;

  -- Validate selected option belongs to this question's options array
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options) opt
    WHERE opt->>'id' = p_selected_option
  ) THEN
    RAISE EXCEPTION 'selected option does not belong to this question';
  END IF;

  v_is_correct := (p_selected_option = v_correct_option);

  -- Insert answer (idempotent: ignore duplicate on retry)
  INSERT INTO quiz_session_answers
    (session_id, question_id, selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_selected_option, v_is_correct, p_response_time_ms)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  -- Insert to immutable response log (idempotent)
  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     selected_option_id, is_correct, response_time_ms)
  VALUES
    (v_org_id, v_student_id, p_question_id, p_session_id,
     p_selected_option, v_is_correct, p_response_time_ms)
  ON CONFLICT DO NOTHING;

  -- Update last_was_correct atomically within this transaction.
  INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
  VALUES (v_student_id, p_question_id, v_is_correct, now())
  ON CONFLICT (student_id, question_id)
  DO UPDATE SET
    last_was_correct = EXCLUDED.last_was_correct,
    updated_at = now();

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
