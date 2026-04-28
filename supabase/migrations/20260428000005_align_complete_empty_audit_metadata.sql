-- Fix CR ids 3153755354 + 3153755389: complete_empty_exam_session (mig 053)
-- diverged from the canonical 'exam.expired' audit schema, and its replay
-- branch read lacked defence-in-depth ownership/soft-delete filters.
--
--   Fix A (CR 3153755354) — audit metadata schema split. Mig 052 emits
--     {total_questions, answered_count, correct_count, score, passed, reason}
--     for 'exam.expired'. Mig 053 emitted only
--     {total_questions, answered_count, reason}. Same lifecycle event, same
--     event_type — schema must align. Add correct_count=0, score=0,
--     passed=false. Key is 'score' (mig 052 line 127), not 'score_percentage'.
--
--   Fix B (CR 3153755389) — replay-branch SELECT (mig 053 lines 67-71) is a
--     SECURITY DEFINER read with no student_id / organization_id / deleted_at
--     filter. The earlier SELECT FOR UPDATE already validates ownership, but
--     docs/security.md rule 9 requires soft-delete + ownership filters on
--     every SECURITY DEFINER SELECT (defence in depth).
--
-- Function body otherwise identical to mig 053; mirror in supabase/migrations.

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

  IF v_mode <> 'mock_exam' THEN
    RAISE EXCEPTION 'session is not a mock exam';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    -- Fix B (CR 3153755389): defence-in-depth filters on the replay-branch
    -- SECURITY DEFINER read. The FOR UPDATE above already validated ownership,
    -- but security.md rule 9 requires soft-delete + ownership on every
    -- SECURITY DEFINER SELECT.
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

  -- Distinguish timeout-expiry from manual-finish based on actual deadline state.
  -- 30s grace mirrors batch_submit_quiz / mig 052: a session within grace was not
  -- "timed out" — the student was just early.
  v_overdue := v_time_limit IS NOT NULL
               AND v_started_at IS NOT NULL
               AND now() > v_started_at + ((v_time_limit + 30) || ' seconds')::interval;
  v_event_type := CASE WHEN v_overdue THEN 'exam.expired' ELSE 'exam.completed' END;
  v_reason     := CASE WHEN v_overdue THEN 'timed out with no answers'
                                      ELSE 'completed with no answers' END;

  -- Audit row subqueries are independent SELECTs (security.md §10).
  -- Fix A (CR 3153755354): metadata schema aligns with mig 052's 'exam.expired'
  -- payload — adds correct_count, score, passed for cross-RPC consistency.
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
