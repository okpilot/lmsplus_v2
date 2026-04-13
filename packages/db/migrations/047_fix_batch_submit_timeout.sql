-- Fix #522: Graceful timeout handling in batch_submit_quiz
-- 1. Remove RAISE EXCEPTION on time limit exceeded — allow late submissions
--    within grace period, auto-end session if past grace period
-- 2. Remove RAISE EXCEPTION on partial exam answers — allow auto-submit
--    with fewer answers (incomplete exam auto-fails)
-- Score denominator = total questions (not answered), so unanswered = wrong.

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
  v_config          jsonb;
  v_mode            text;
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
  v_session_question_ids uuid[];
  v_qid_text        text;
  v_rt_text         text;
  v_ended_at        timestamptz;
  v_options         jsonb;
  v_passed          boolean;
  v_pass_mark       int;
  v_time_limit      int;
  v_started_at      timestamptz;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Step 1: Fetch session row (allow already-completed sessions for idempotent replay)
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.score_percentage, qs.mode,
         qs.time_limit_seconds, qs.started_at, qs.passed
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_score, v_mode,
       v_time_limit, v_started_at, v_passed
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;

  -- Idempotent replay: if session already completed, return existing results
  IF v_ended_at IS NOT NULL THEN
    SELECT count(*)::int INTO v_answered
    FROM quiz_session_answers WHERE session_id = p_session_id;

    SELECT jsonb_agg(jsonb_build_object(
      'question_id', qsa.question_id,
      'is_correct', qsa.is_correct,
      'correct_option_id', (
        SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt
        WHERE (opt->>'correct')::boolean LIMIT 1
      ),
      'explanation_text', q.explanation_text,
      'explanation_image_url', q.explanation_image_url
    ))
    INTO v_results
    FROM quiz_session_answers qsa
    JOIN questions q ON q.id = qsa.question_id
    WHERE qsa.session_id = p_session_id;

    RETURN jsonb_build_object(
      'results', COALESCE(v_results, '[]'::jsonb),
      'total_questions', v_total,
      'answered_count', v_answered,
      'correct_count', v_correct_count,
      'score_percentage', v_score,
      'passed', v_passed
    );
  END IF;

  -- *** SERVER-SIDE TIME LIMIT ENFORCEMENT ***
  -- Grace period of 30 seconds accounts for network latency.
  -- Beyond grace period: reject submission entirely (session is too stale).
  -- Within grace period or no time limit: allow submission to proceed.
  IF v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      -- Session is far past deadline — end it with zero score
      UPDATE quiz_sessions
      SET ended_at = now(), correct_count = 0, score_percentage = 0, passed = false
      WHERE id = p_session_id;

      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (
        v_org_id, v_student_id,
        (SELECT role FROM users WHERE id = v_student_id),
        'exam.expired', 'quiz_session', p_session_id,
        jsonb_build_object('total_questions', v_total, 'reason', 'submission past grace period')
      );

      RETURN jsonb_build_object(
        'results', '[]'::jsonb,
        'total_questions', v_total,
        'answered_count', 0,
        'correct_count', 0,
        'score_percentage', 0,
        'passed', false,
        'expired', true
      );
    END IF;
  END IF;

  -- Step 2: Guard against malformed config
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  -- Step 3: Extract question_ids
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  -- Validate p_answers is a non-null JSON array
  IF p_answers IS NULL
     OR jsonb_typeof(p_answers) <> 'array'
     OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must be a non-empty JSON array';
  END IF;

  -- Reject duplicate question_id entries in payload
  IF (
    SELECT count(*) <> count(DISTINCT lower(e->>'question_id'))
    FROM jsonb_array_elements(p_answers) AS e
  ) THEN
    RAISE EXCEPTION 'duplicate question_id in answers payload';
  END IF;

  -- *** EXAM MODE: ALLOW PARTIAL SUBMISSION ***
  -- Timer expiry may cause auto-submit with fewer answers than total.
  -- Incomplete exam auto-fails (v_passed = false set after scoring).
  -- No RAISE — process whatever answers were provided.

  -- Bulk-fetch all questions for this session into a temp table
  DROP TABLE IF EXISTS _batch_questions;
  CREATE TEMP TABLE _batch_questions ON COMMIT DROP AS
  SELECT
    q.id,
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt
     WHERE (opt->>'correct')::boolean LIMIT 1) AS correct_option,
    q.explanation_text,
    q.explanation_image_url,
    q.options
  FROM questions q
  WHERE q.id = ANY(v_session_question_ids);

  -- Process each provided answer
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_qid_text        := v_answer->>'question_id';
    v_selected_option := v_answer->>'selected_option';
    v_rt_text         := v_answer->>'response_time_ms';

    IF v_qid_text IS NULL OR v_qid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid question_id format: %', coalesce(v_qid_text, 'NULL');
    END IF;
    IF v_selected_option IS NULL OR v_selected_option = '' THEN
      RAISE EXCEPTION 'answer for question % has empty selected_option', v_qid_text;
    END IF;
    IF v_rt_text IS NULL OR v_rt_text !~ '^\d{1,9}$' THEN
      RAISE EXCEPTION 'answer for question % has invalid response_time_ms', v_qid_text;
    END IF;

    v_question_id   := v_qid_text::uuid;
    v_response_time := v_rt_text::int;

    IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
      RAISE EXCEPTION 'question % does not belong to session %', v_question_id, p_session_id;
    END IF;

    SELECT bq.correct_option, bq.explanation_text, bq.explanation_image_url, bq.options
    INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
    FROM _batch_questions bq
    WHERE bq.id = v_question_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'question not found: %', v_question_id;
    END IF;

    IF v_correct_option IS NULL THEN
      RAISE EXCEPTION 'question % has no correct option', v_question_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_options) opt
      WHERE opt->>'id' = v_selected_option
    ) THEN
      RAISE EXCEPTION 'selected option % does not belong to question %', v_selected_option, v_question_id;
    END IF;

    v_is_correct := (v_selected_option = v_correct_option);

    INSERT INTO quiz_session_answers
      (session_id, question_id, selected_option_id, is_correct, response_time_ms)
    VALUES
      (p_session_id, v_question_id, v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT (session_id, question_id) DO NOTHING;

    INSERT INTO student_responses
      (organization_id, student_id, question_id, session_id,
       selected_option_id, is_correct, response_time_ms)
    VALUES
      (v_org_id, v_student_id, v_question_id, p_session_id,
       v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT DO NOTHING;

    INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
    VALUES (v_student_id, v_question_id, v_is_correct, now())
    ON CONFLICT (student_id, question_id)
    DO UPDATE SET
      last_was_correct = EXCLUDED.last_was_correct,
      updated_at = now();

    v_results := v_results || jsonb_build_object(
      'question_id', v_question_id,
      'is_correct', v_is_correct,
      'correct_option_id', v_correct_option,
      'explanation_text', v_expl_text,
      'explanation_image_url', v_expl_image_url
    );
  END LOOP;

  -- Count answered and correct
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_answered, v_correct_count
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  -- Score: correct / total (not correct / answered)
  -- Unanswered questions count as wrong in exam mode
  IF v_mode = 'mock_exam' THEN
    v_score := CASE WHEN v_total > 0 THEN round((v_correct_count::numeric / v_total) * 100, 2) ELSE 0 END;
  ELSE
    v_score := CASE WHEN v_answered > 0 THEN round((v_correct_count::numeric / v_answered) * 100, 2) ELSE 0 END;
  END IF;

  -- *** PASSED COMPUTATION (exam mode only) ***
  IF v_mode = 'mock_exam' THEN
    v_pass_mark := (v_config->>'pass_mark')::int;
    IF v_pass_mark IS NOT NULL THEN
      v_passed := (v_score >= v_pass_mark);
    END IF;
    -- Incomplete exam: if not all questions answered, auto-fail regardless of score
    IF v_answered < v_total THEN
      v_passed := false;
    END IF;
  END IF;

  -- Complete session
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = v_correct_count,
    score_percentage = v_score,
    passed           = v_passed
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    CASE WHEN v_mode = 'mock_exam' THEN 'exam.completed' ELSE 'quiz_session.batch_submitted' END,
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered', v_answered,
      'correct', v_correct_count,
      'score', v_score,
      'passed', v_passed
    )
  );

  RETURN jsonb_build_object(
    'results', v_results,
    'total_questions', v_total,
    'answered_count', v_answered,
    'correct_count', v_correct_count,
    'score_percentage', v_score,
    'passed', v_passed
  );
END;
$$;
