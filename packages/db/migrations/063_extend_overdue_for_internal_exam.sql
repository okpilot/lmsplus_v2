-- Extend Layer 1 overdue helpers to recognise 'internal_exam' alongside
-- 'mock_exam'. Bodies forked from migs 052 (complete_overdue_exam_session)
-- and 055 (complete_empty_exam_session). Mode guard widens to IN (...);
-- audit event_type maps via CASE so internal_exam emits 'internal_exam.expired'
-- / 'internal_exam.completed' while mock_exam keeps 'exam.expired' / 'exam.completed'.

CREATE OR REPLACE FUNCTION complete_overdue_exam_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id     uuid := auth.uid();
  v_org_id         uuid;
  v_ended_at       timestamptz;
  v_total          int;
  v_mode           text;
  v_started_at     timestamptz;
  v_time_limit     int;
  v_config         jsonb;
  v_pass_mark      int;
  v_answered       int;
  v_correct_count  int;
  v_score          numeric(5,2);
  v_passed         boolean;
  v_reason         text;
  v_event_type     text;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  SELECT qs.ended_at, qs.total_questions, qs.mode,
         qs.started_at, qs.time_limit_seconds, qs.config
  INTO v_ended_at, v_total, v_mode, v_started_at, v_time_limit, v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;
  IF v_mode NOT IN ('mock_exam', 'internal_exam') THEN
    RAISE EXCEPTION 'session is not an exam';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(*)::int FROM quiz_session_answers WHERE session_id = p_session_id)
    INTO v_correct_count, v_score, v_passed, v_answered
    FROM quiz_sessions qs
    WHERE qs.id = p_session_id
      AND qs.student_id = v_student_id
      AND qs.organization_id = v_org_id
      AND qs.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'session_id',       p_session_id,
      'score_percentage', COALESCE(v_score, 0),
      'passed',           COALESCE(v_passed, false),
      'total_questions',  v_total,
      'answered_count',   COALESCE(v_answered, 0)
    );
  END IF;

  IF v_time_limit IS NULL OR v_started_at IS NULL THEN
    RAISE EXCEPTION 'session has no deadline to enforce';
  END IF;
  IF now() <= v_started_at + ((v_time_limit + 30) || ' seconds')::interval THEN
    RAISE EXCEPTION 'session is not overdue';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_answered, v_correct_count
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  v_score := CASE WHEN v_total > 0
                  THEN round((v_correct_count::numeric / v_total) * 100, 2)
                  ELSE 0 END;

  v_pass_mark := (v_config->>'pass_mark')::int;
  v_passed := COALESCE(v_pass_mark IS NOT NULL AND v_score >= v_pass_mark, false);
  -- mock_exam requires all answered; internal_exam allows partial submits.
  IF v_mode = 'mock_exam' AND v_answered < v_total THEN
    v_passed := false;
  END IF;

  UPDATE quiz_sessions
  SET ended_at = now(),
      correct_count = v_correct_count,
      score_percentage = v_score,
      passed = v_passed
  WHERE id = p_session_id;

  v_reason := CASE WHEN v_answered > 0
                   THEN 'overdue_with_answers'
                   ELSE 'overdue_zero_answers' END;

  v_event_type := CASE v_mode
                    WHEN 'internal_exam' THEN 'internal_exam.expired'
                    ELSE 'exam.expired'
                  END;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
    v_event_type, 'quiz_session', p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered_count',  v_answered,
      'correct_count',   v_correct_count,
      'score',           v_score,
      'passed',          v_passed,
      'reason',          v_reason
    )
  );

  RETURN jsonb_build_object(
    'session_id',       p_session_id,
    'score_percentage', v_score,
    'passed',           v_passed,
    'total_questions',  v_total,
    'answered_count',   v_answered
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_overdue_exam_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION complete_empty_exam_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_ended_at        timestamptz;
  v_total           int;
  v_mode            text;
  v_started_at      timestamptz;
  v_time_limit      int;
  v_correct_count   int;
  v_score           numeric;
  v_passed          boolean;
  v_answered        int;
  v_overdue         boolean;
  v_event_type      text;
  v_reason          text;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  SELECT qs.ended_at, qs.total_questions, qs.mode,
         qs.started_at, qs.time_limit_seconds
  INTO v_ended_at, v_total, v_mode, v_started_at, v_time_limit
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;
  IF v_mode NOT IN ('mock_exam', 'internal_exam') THEN
    RAISE EXCEPTION 'session is not an exam';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(*)::int FROM quiz_session_answers WHERE session_id = p_session_id)
    INTO v_correct_count, v_score, v_passed, v_answered
    FROM quiz_sessions qs
    WHERE qs.id = p_session_id
      AND qs.student_id = v_student_id
      AND qs.organization_id = v_org_id
      AND qs.deleted_at IS NULL;
    RETURN jsonb_build_object(
      'session_id',       p_session_id,
      'score_percentage', COALESCE(v_score, 0),
      'passed',           COALESCE(v_passed, false),
      'total_questions',  v_total,
      'answered_count',   COALESCE(v_answered, 0)
    );
  END IF;

  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = 0,
    score_percentage = 0,
    passed           = false
  WHERE id = p_session_id;

  -- 30s grace mirrors batch_submit_quiz / mig 052: a session within grace was
  -- not "timed out" — the student was just early.
  v_overdue := v_time_limit IS NOT NULL
               AND v_started_at IS NOT NULL
               AND now() > v_started_at + ((v_time_limit + 30) || ' seconds')::interval;

  IF v_overdue THEN
    v_event_type := CASE v_mode
                      WHEN 'internal_exam' THEN 'internal_exam.expired'
                      ELSE 'exam.expired'
                    END;
    v_reason := 'timed out with no answers';
  ELSE
    v_event_type := CASE v_mode
                      WHEN 'internal_exam' THEN 'internal_exam.completed'
                      ELSE 'exam.completed'
                    END;
    v_reason := 'completed with no answers';
  END IF;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
    v_event_type,
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered_count', 0,
      'correct_count', 0,
      'score', 0,
      'passed', false,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'session_id',       p_session_id,
    'score_percentage', 0,
    'passed',           false,
    'total_questions',  v_total,
    'answered_count',   0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_empty_exam_session(uuid) TO authenticated;
