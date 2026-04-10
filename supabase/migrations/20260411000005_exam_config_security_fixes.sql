-- Security fixes for exam config tables
-- 1. Remove hard DELETE policy on exam_configs (soft-delete only)
-- 2. Add server-side time limit enforcement to batch_submit_quiz
-- 3. Add duplicate active exam session guard to start_exam_session

-- ============================================================
-- Fix 1: Remove hard DELETE policy on exam_configs
-- exam_configs has deleted_at, so only soft-delete via UPDATE is allowed.
-- The admin_update_exam_configs policy already permits setting deleted_at.
-- ============================================================
DROP POLICY IF EXISTS admin_delete_exam_configs ON exam_configs;

-- ============================================================
-- Fix 2: Add server-side time limit enforcement to batch_submit_quiz
-- Prevents students from bypassing the client-side countdown timer.
-- ============================================================
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
  -- Prevents bypassing client-side countdown by delaying submission
  -- Grace period of 30 seconds accounts for network latency
  IF v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      RAISE EXCEPTION 'exam time limit exceeded';
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

  -- *** EXAM MODE GUARD (#260) ***
  IF v_mode = 'mock_exam' THEN
    IF jsonb_array_length(p_answers) <> v_total THEN
      RAISE EXCEPTION 'exam mode requires all questions answered (got %, expected %)',
        jsonb_array_length(p_answers), v_total;
    END IF;
  END IF;

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

  -- Score over answered questions (for exam: answered = total, so this = correct/total)
  v_score := CASE WHEN v_answered > 0 THEN round((v_correct_count::numeric / v_answered) * 100, 2) ELSE 0 END;

  -- *** PASSED COMPUTATION (exam mode only) ***
  IF v_mode = 'mock_exam' THEN
    v_pass_mark := (v_config->>'pass_mark')::int;
    IF v_pass_mark IS NOT NULL THEN
      v_passed := (v_score >= v_pass_mark);
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

-- ============================================================
-- Fix 3: Add duplicate active exam session guard
-- Prevents network retries from creating multiple active exams
-- ============================================================
CREATE OR REPLACE FUNCTION start_exam_session(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id       uuid := auth.uid();
  v_org_id           uuid;
  v_config_id        uuid;
  v_total_questions   int;
  v_time_limit       int;
  v_pass_mark        int;
  v_dist             record;
  v_selected_ids     uuid[] := '{}';
  v_topic_ids        uuid[];
  v_session_id       uuid;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Get student's org
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Guard: prevent duplicate active exam sessions for same student+subject
  IF EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE student_id = v_student_id
      AND subject_id = p_subject_id
      AND mode = 'mock_exam'
      AND ended_at IS NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'an exam session is already in progress for this subject';
  END IF;

  -- Fetch exam config for this subject + org
  SELECT ec.id, ec.total_questions, ec.time_limit_seconds, ec.pass_mark
  INTO v_config_id, v_total_questions, v_time_limit, v_pass_mark
  FROM exam_configs ec
  WHERE ec.organization_id = v_org_id
    AND ec.subject_id = p_subject_id
    AND ec.enabled = true
    AND ec.deleted_at IS NULL;

  IF v_config_id IS NULL THEN
    RAISE EXCEPTION 'no exam configuration found for this subject';
  END IF;

  -- Select questions per distribution
  FOR v_dist IN
    SELECT ecd.topic_id, ecd.subtopic_id, ecd.question_count
    FROM exam_config_distributions ecd
    WHERE ecd.exam_config_id = v_config_id
    ORDER BY ecd.topic_id, ecd.subtopic_id NULLS FIRST
  LOOP
    v_topic_ids := ARRAY(
      SELECT q.id
      FROM questions q
      WHERE q.subject_id = p_subject_id
        AND q.topic_id = v_dist.topic_id
        AND (v_dist.subtopic_id IS NULL OR q.subtopic_id = v_dist.subtopic_id)
        AND q.status = 'active'
        AND q.deleted_at IS NULL
        AND q.organization_id = v_org_id
        AND q.id != ALL(v_selected_ids)
      ORDER BY random()
      LIMIT v_dist.question_count
    );

    IF array_length(v_topic_ids, 1) IS NULL OR array_length(v_topic_ids, 1) < v_dist.question_count THEN
      RAISE EXCEPTION 'not enough active questions for topic % (subtopic %). Need %, found %',
        v_dist.topic_id,
        COALESCE(v_dist.subtopic_id::text, 'any'),
        v_dist.question_count,
        COALESCE(array_length(v_topic_ids, 1), 0);
    END IF;

    v_selected_ids := v_selected_ids || v_topic_ids;
  END LOOP;

  IF array_length(v_selected_ids, 1) != v_total_questions THEN
    RAISE EXCEPTION 'distribution total (%) does not match configured total_questions (%)',
      array_length(v_selected_ids, 1), v_total_questions;
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id,
     config, total_questions, time_limit_seconds)
  VALUES (
    v_org_id,
    v_student_id,
    'mock_exam',
    p_subject_id,
    jsonb_build_object(
      'question_ids', to_jsonb(v_selected_ids),
      'exam_config_id', v_config_id,
      'pass_mark', v_pass_mark
    ),
    v_total_questions,
    v_time_limit
  )
  RETURNING id INTO v_session_id;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'exam.started',
    'quiz_session',
    v_session_id,
    jsonb_build_object(
      'subject_id', p_subject_id,
      'total_questions', v_total_questions,
      'time_limit_seconds', v_time_limit,
      'pass_mark', v_pass_mark
    )
  );

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'question_ids', to_jsonb(v_selected_ids),
    'time_limit_seconds', v_time_limit,
    'total_questions', v_total_questions,
    'pass_mark', v_pass_mark
  );
END;
$$;
