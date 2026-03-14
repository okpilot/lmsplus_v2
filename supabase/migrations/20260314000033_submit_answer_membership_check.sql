-- Vector A fix: Add question membership check to submit_quiz_answer
-- Prevents submitting answers for questions not in the session's question set.
-- Pattern matches check_quiz_answer (migration 032) and batch_submit_quiz (migration 031).

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
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student and is still active
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL,
    qs.config
  INTO v_org_id, v_session_ended, v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
  END IF;

  -- Question membership check: p_question_id must be in session config.question_ids
  IF v_config IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  v_session_question_ids := ARRAY(
    SELECT jsonb_array_elements_text(v_config->'question_ids')
  )::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question does not belong to this session';
  END IF;

  -- Get correct answer and explanation (service-level access)
  SELECT
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt WHERE (opt->>'correct')::boolean LIMIT 1),
    q.explanation_text,
    q.explanation_image_url
  INTO v_correct_option, v_expl_text, v_expl_image_url
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
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

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
