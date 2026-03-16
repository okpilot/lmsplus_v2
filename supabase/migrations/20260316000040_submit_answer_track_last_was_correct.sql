-- 040_submit_answer_track_last_was_correct.sql
-- Add last_was_correct tracking to submit_quiz_answer RPC.
-- Previously this was handled by the TypeScript FSRS layer after the RPC
-- returned. Moving it into the RPC makes it atomic (same as batch_submit_quiz
-- since migration 022) and allows removal of the ts-fsrs dependency.
--
-- Only change vs migration 036: added INSERT INTO fsrs_cards ... ON CONFLICT
-- block before the RETURN QUERY, matching the pattern in batch_submit_quiz.

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
  ON CONFLICT (session_id, question_id) DO NOTHING;

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
