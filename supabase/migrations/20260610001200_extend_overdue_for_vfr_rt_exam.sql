-- Migration 102: extend overdue/empty exam helpers for 'vfr_rt_exam' (#697, A.9).
-- Bodies copied VERBATIM from mig 063 — the LATEST definition of BOTH functions per
-- Pre-Flag Verification. Per design.md's EXTEND table (mode guards 063 L54 + L191;
-- v_event_type CASEs L112/L228/L234 — i.e. BOTH functions in that file): widen the
-- guards + CASEs, and add a vfr_rt_exam per-part grading override inside
-- complete_overdue_exam_session (mig 100 formulas). Every other line is identical.

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

  -- vfr_rt_exam: per-part grading (mig 100 formulas); missing answers score 0;
  -- pass = ALL parts >= 75 (no config pass_mark). config.question_ids is write-once;
  -- soft-deleted questions intentionally included (immutable write-once exception,
  -- docs/security.md §15; docs/database.md §3 "Scoring Soft-Deleted Questions").
  IF v_mode = 'vfr_rt_exam' THEN
    SELECT COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'short_answer'), 2), 0),
           COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'dialog_fill'), 2), 0),
           COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'multiple_choice'), 2), 0)
      INTO v_p1, v_p2, v_p3
      FROM (SELECT q.question_type AS qt,
                   LEAST((SELECT count(*) FROM quiz_session_answers qsa
                          WHERE qsa.session_id = p_session_id
                            AND qsa.question_id = q.id AND qsa.is_correct)::numeric
                         / CASE WHEN q.question_type = 'dialog_fill'
                                THEN GREATEST(jsonb_array_length(q.blanks_config), 1)
                                ELSE 1 END, 1) AS ts
            FROM jsonb_array_elements_text(v_config->'question_ids') AS cfg(qid)
            JOIN questions q ON q.id = cfg.qid::uuid) per_q;
    v_passed := (v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75);
    v_score  := round((v_p1 + v_p2 + v_p3) / 3, 2);
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
  IF v_mode NOT IN ('mock_exam', 'internal_exam', 'vfr_rt_exam') THEN
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
                      WHEN 'vfr_rt_exam' THEN 'vfr_rt_exam.expired'
                      ELSE 'exam.expired'
                    END;
    v_reason := 'timed out with no answers';
  ELSE
    v_event_type := CASE v_mode
                      WHEN 'internal_exam' THEN 'internal_exam.completed'
                      WHEN 'vfr_rt_exam' THEN 'vfr_rt_exam.completed'
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
