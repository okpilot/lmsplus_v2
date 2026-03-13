-- 017_batch_submit_allow_partial.sql
-- Allow partial answer submission: students can skip questions in training mode.
-- Score is calculated as correct / total_answered (not total_questions).
-- All other logic (FSRS, audit, immutable logs) is unchanged.

CREATE OR REPLACE FUNCTION batch_submit_quiz(
  p_session_id uuid,
  p_answers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_answer          jsonb;
  v_correct_option  text;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_question_id     uuid;
  v_selected_option text;
  v_response_time   int;
  v_results         jsonb := '[]'::jsonb;
  v_total           int;
  v_answered        int;
  v_correct_count   int;
  v_score           numeric(5,2);
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student and is still active (FOR UPDATE prevents race)
  SELECT qs.organization_id, qs.total_questions
  INTO v_org_id, v_total
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or already completed';
  END IF;

  -- Guard against empty submission
  IF jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must not be empty';
  END IF;

  -- Process each provided answer (partial submission is allowed — students may skip questions)
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_question_id     := (v_answer->>'question_id')::uuid;
    v_selected_option := v_answer->>'selected_option';
    v_response_time   := (v_answer->>'response_time_ms')::int;

    -- Get correct answer and explanation
    SELECT
      (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt WHERE (opt->>'correct')::boolean LIMIT 1),
      q.explanation_text,
      q.explanation_image_url
    INTO v_correct_option, v_expl_text, v_expl_image_url
    FROM questions q
    WHERE q.id = v_question_id
      AND q.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'question not found: %', v_question_id;
    END IF;

    v_is_correct := (v_selected_option = v_correct_option);

    -- Insert answer (idempotent)
    INSERT INTO quiz_session_answers
      (session_id, question_id, selected_option_id, is_correct, response_time_ms)
    VALUES
      (p_session_id, v_question_id, v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT (session_id, question_id) DO NOTHING;

    -- Insert to immutable response log (idempotent)
    INSERT INTO student_responses
      (organization_id, student_id, question_id, session_id,
       selected_option_id, is_correct, response_time_ms)
    VALUES
      (v_org_id, v_student_id, v_question_id, p_session_id,
       v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT DO NOTHING;

    -- Accumulate result
    v_results := v_results || jsonb_build_object(
      'question_id', v_question_id,
      'is_correct', v_is_correct,
      'correct_option_id', v_correct_option,
      'explanation_text', v_expl_text,
      'explanation_image_url', v_expl_image_url
    );
  END LOOP;

  -- Count answered and correct from this session (idempotent ON CONFLICT means re-runs are safe)
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_answered, v_correct_count
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  -- Score over answered questions only (unanswered questions are excluded from the denominator)
  v_score := CASE WHEN v_answered > 0 THEN round((v_correct_count::numeric / v_answered) * 100, 2) ELSE 0 END;

  -- Complete session
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = v_correct_count,
    score_percentage = v_score
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'quiz_session.batch_submitted',
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered', v_answered,
      'correct', v_correct_count,
      'score', v_score
    )
  );

  RETURN jsonb_build_object(
    'results', v_results,
    'total_questions', v_total,
    'answered_count', v_answered,
    'correct_count', v_correct_count,
    'score_percentage', v_score
  );
END;
$$;
