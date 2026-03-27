-- 002_rpc_functions.sql
-- Core RPC functions for atomic operations and answer stripping

-- ============================================================
-- get_quiz_questions — strips correct answers from options
-- ============================================================
CREATE OR REPLACE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_text         text,
  question_image_url    text,
  options               jsonb,
  subject_code          text,
  topic_name            text,
  subtopic_name         text,
  lo_reference          text,
  difficulty            text,
  explanation_text      text,
  explanation_image_url text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    jsonb_agg(
      jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
      ORDER BY random()
    ) AS options,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.lo_reference,
    q.difficulty,
    NULL::text AS explanation_text,
    NULL::text AS explanation_image_url
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active'
  GROUP BY q.id, q.question_text, q.question_image_url,
           s.code, t.name, st.name, q.lo_reference, q.difficulty;
END;
$$;

-- ============================================================
-- submit_quiz_answer — atomic answer submission
-- ============================================================
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
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_correct_option  text;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_session_ended   boolean;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student and is still active
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL
  INTO v_org_id, v_session_ended
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
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

-- ============================================================
-- start_quiz_session — locks question set atomically
-- ============================================================
CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode         text,
  p_subject_id   uuid,
  p_topic_id     uuid,
  p_question_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    (SELECT organization_id FROM users WHERE id = auth.uid()),
    auth.uid(),
    p_mode,
    p_subject_id,
    p_topic_id,
    jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
    array_length(p_question_ids, 1)
  )
  RETURNING id INTO v_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    (SELECT organization_id FROM users WHERE id = auth.uid()),
    auth.uid(),
    (SELECT role FROM users WHERE id = auth.uid()),
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;

-- ============================================================
-- complete_quiz_session — ends session, calculates score
-- ============================================================
CREATE OR REPLACE FUNCTION complete_quiz_session(p_session_id uuid)
RETURNS TABLE (
  total_questions  int,
  correct_count    int,
  score_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_org_id     uuid;
  v_total      int;
  v_correct    int;
  v_score      numeric(5,2);
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student
  SELECT qs.organization_id
  INTO v_org_id
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or already completed';
  END IF;

  -- Calculate score
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_total, v_correct
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  v_score := CASE WHEN v_total > 0 THEN round((v_correct::numeric / v_total) * 100, 2) ELSE 0 END;

  -- Update session
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = v_correct,
    score_percentage = v_score
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'quiz_session.completed',
    'quiz_session',
    p_session_id,
    jsonb_build_object('total', v_total, 'correct', v_correct, 'score', v_score)
  );

  RETURN QUERY SELECT v_total, v_correct, v_score;
END;
$$;
