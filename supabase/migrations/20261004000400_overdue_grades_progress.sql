-- complete_overdue_exam_session: completes an overdue exam by grading its saved answers
-- (quiz_session_progress) and scoring with _score_graded_session. Signature and return keys unchanged. Never raises on an unusable config.question_ids (the start RPCs
-- PERFORM it): such a session completes with score 0 and reason overdue_config_unusable.

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
  v_answered       int;
  v_correct_count  int;
  v_score          numeric(5,2);
  v_passed         boolean;
  v_reason         text;
  v_event_type     text;
  v_p1             numeric;
  v_p2             numeric;
  v_p3             numeric;
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
  IF v_mode NOT IN ('mock_exam', 'internal_exam', 'vfr_rt_exam') THEN
    RAISE EXCEPTION 'session is not an exam';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(DISTINCT qsa.question_id)::int FROM quiz_session_answers qsa WHERE qsa.session_id = p_session_id)
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

  BEGIN
    PERFORM _grade_session_progress(p_session_id, v_student_id, v_org_id, v_mode);
    SELECT s.answered_n, s.correct_n, s.score_pct, s.passed_flag, s.p1, s.p2, s.p3
    INTO v_answered, v_correct_count, v_score, v_passed, v_p1, v_p2, v_p3
    FROM _score_graded_session(p_session_id, v_mode, v_config, v_total) s;
    v_reason := CASE WHEN v_answered > 0 THEN 'overdue_with_answers' ELSE 'overdue_zero_answers' END;
  EXCEPTION WHEN raise_exception OR data_exception THEN
    RAISE WARNING '[complete_overdue_exam_session] session % not graded: %', p_session_id, SQLERRM;
    v_answered := 0; v_correct_count := 0; v_score := 0; v_passed := false;
    v_p1 := 0; v_p2 := 0; v_p3 := 0;
    v_reason := 'overdue_config_unusable';
  END;

  UPDATE quiz_sessions
  SET ended_at = now(),
      correct_count = v_correct_count,
      score_percentage = v_score,
      passed = v_passed
  WHERE id = p_session_id;

  v_event_type := CASE v_mode
                    WHEN 'internal_exam' THEN 'internal_exam.expired'
                    WHEN 'vfr_rt_exam' THEN 'vfr_rt_exam.expired'
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
    ) || CASE WHEN v_mode = 'vfr_rt_exam'
              THEN jsonb_build_object('part1_pct', v_p1, 'part2_pct', v_p2, 'part3_pct', v_p3)
              ELSE '{}'::jsonb END
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
