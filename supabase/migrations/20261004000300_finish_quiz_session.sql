-- finish_quiz_session: ends the caller's own session by grading its saved answers
-- (quiz_session_progress); a session past deadline+30s is graded and flagged expired.
-- A finished session returns its stored result.

CREATE OR REPLACE FUNCTION finish_quiz_session(p_session_id uuid, p_device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor_role text;
  v_row        quiz_sessions;
  v_s          record;
  v_answered   int;
  v_correct    int;
  v_score      numeric;
  v_passed     boolean;
  v_p1         numeric;
  v_p2         numeric;
  v_p3         numeric;
  v_expired    boolean := false;
  v_event      text;
  v_results    jsonb;
  v_meta       jsonb;
  v_out        jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT u.role INTO v_actor_role
  FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- quiz_sessions has multiple permissive SELECT policies: student_id predicate is mandatory (security.md rule 11).
  SELECT qs.* INTO v_row
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id AND qs.student_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  IF v_row.saved_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_saved';
  END IF;
  IF v_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'session_discarded';
  END IF;

  IF v_row.ended_at IS NOT NULL THEN
    SELECT count(DISTINCT qsa.question_id)::int INTO v_answered
    FROM quiz_session_answers qsa WHERE qsa.session_id = p_session_id;
    v_correct := COALESCE(v_row.correct_count, 0);
    v_score   := COALESCE(v_row.score_percentage, 0);
    v_passed  := v_row.passed;
    SELECT EXISTS (
      SELECT 1 FROM audit_events ae
      WHERE ae.resource_type = 'quiz_session' AND ae.resource_id = p_session_id
        AND ae.event_type LIKE '%.expired'
    ) INTO v_expired;
    IF v_row.mode = 'vfr_rt_exam' THEN
      v_passed := COALESCE(v_passed, false);
      SELECT (ae.metadata->>'part1_pct')::numeric,
             (ae.metadata->>'part2_pct')::numeric,
             (ae.metadata->>'part3_pct')::numeric
      INTO v_p1, v_p2, v_p3
      FROM audit_events ae
      WHERE ae.resource_type = 'quiz_session' AND ae.resource_id = p_session_id
        AND ae.event_type IN ('vfr_rt_exam.completed', 'vfr_rt_exam.expired')
      ORDER BY ae.created_at DESC
      LIMIT 1;
      IF v_p1 IS NULL OR v_p2 IS NULL OR v_p3 IS NULL THEN
        SELECT s.p1, s.p2, s.p3 INTO v_p1, v_p2, v_p3
        FROM public._vfr_rt_exam_part_scores(p_session_id, v_row.config) s;
      END IF;
    END IF;
  ELSE
    IF v_row.mode NOT IN ('quick_quiz', 'smart_review', 'mock_exam', 'internal_exam', 'vfr_rt_exam') THEN
      RAISE EXCEPTION 'unsupported_session_mode';
    END IF;
    IF v_row.active_device_id IS NOT NULL
       AND p_device_id IS DISTINCT FROM v_row.active_device_id THEN
      RAISE EXCEPTION 'session_taken_over';
    END IF;
    -- 30 s grace, parity with batch_submit_quiz (20260702000600).
    v_expired := COALESCE(
      now() > v_row.started_at + (v_row.time_limit_seconds + 30) * interval '1 second', false);

    PERFORM _grade_session_progress(p_session_id, v_uid, v_row.organization_id, v_row.mode);
    SELECT * INTO v_s
    FROM _score_graded_session(p_session_id, v_row.mode, v_row.config, v_row.total_questions);
    v_answered := v_s.answered_n;
    v_correct  := v_s.correct_n;
    v_score    := v_s.score_pct;
    v_passed   := v_s.passed_flag;
    v_p1 := v_s.p1;
    v_p2 := v_s.p2;
    v_p3 := v_s.p3;

    UPDATE quiz_sessions
    SET ended_at = now(), correct_count = v_correct, score_percentage = v_score, passed = v_passed
    WHERE id = p_session_id;

    IF v_expired THEN
      v_event := CASE v_row.mode
        WHEN 'internal_exam' THEN 'internal_exam.expired'
        WHEN 'vfr_rt_exam'   THEN 'vfr_rt_exam.expired'
        ELSE 'exam.expired' END;
      v_meta := jsonb_build_object(
        'total_questions', v_row.total_questions, 'answered_count', v_answered,
        'correct_count', v_correct, 'score', v_score, 'passed', v_passed,
        'reason', 'submission past grace period');
    ELSE
      v_event := CASE v_row.mode
        WHEN 'mock_exam'     THEN 'exam.completed'
        WHEN 'internal_exam' THEN 'internal_exam.completed'
        WHEN 'vfr_rt_exam'   THEN 'vfr_rt_exam.completed'
        ELSE 'quiz_session.batch_submitted' END;
      v_meta := jsonb_build_object(
        'total_questions', v_row.total_questions, 'answered_count', v_answered,
        'correct_count', v_correct, 'score', v_score, 'passed', v_passed);
    END IF;
    IF v_row.mode = 'vfr_rt_exam' THEN
      v_meta := v_meta || jsonb_build_object(
        'part1_pct', v_p1, 'part2_pct', v_p2, 'part3_pct', v_p3, 'passed_overall', v_passed);
    END IF;

    -- actor_role cached from the deleted_at-filtered users read above (security.md rule 10).
    INSERT INTO audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (v_row.organization_id, v_uid, v_actor_role, v_event, 'quiz_session', p_session_id, v_meta);
  END IF;

  -- §15 carve-out: no deleted_at filter — reads questions via the immutable, append-only quiz_session_answers.question_id write-once FK; docs/security.md §15, docs/database.md §3.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id',           qsa.question_id,
    'is_correct',            qsa.is_correct,
    'correct_option_id',     q.correct_option_id,
    'explanation_text',      q.explanation_text,
    'explanation_image_url', q.explanation_image_url
  )), '[]'::jsonb) INTO v_results
  FROM quiz_session_answers qsa
  JOIN questions q ON q.id = qsa.question_id
  WHERE qsa.session_id = p_session_id;

  v_out := jsonb_build_object(
    'results', v_results, 'total_questions', v_row.total_questions,
    'answered_count', v_answered, 'correct_count', v_correct,
    'score_percentage', v_score, 'passed', v_passed);
  IF v_row.mode = 'vfr_rt_exam' THEN
    v_out := v_out || jsonb_build_object(
      'session_id', p_session_id, 'part1_pct', v_p1, 'part2_pct', v_p2,
      'part3_pct', v_p3, 'passed_overall', v_passed);
  END IF;
  IF v_expired THEN
    v_out := v_out || jsonb_build_object('expired', true);
  END IF;
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION finish_quiz_session(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finish_quiz_session(uuid, uuid) TO authenticated;
