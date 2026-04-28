-- Fix #566 (CR round 8 / id 3152048907): complete_empty_exam_session backs both
-- the timer-expiry path AND the manual finish-with-zero-answers path (single
-- branch in apps/web/app/app/quiz/session/_hooks/quiz-submit.ts:113), but
-- migration 049/051 hard-coded event_type='exam.expired' + reason='timed out
-- with no answers'. Manual finishes were being audited as expirations.
--
-- Root-cause fix: branch on the actual session state inside the RPC. The RPC
-- already has v_started_at and v_time_limit and is therefore in the best
-- position to know whether the deadline has passed. Above the +30s grace
-- (matching mig 052 / batch_submit_quiz) → 'exam.expired' / 'timed out…'.
-- Below the grace → neutral 'exam.completed' / 'completed with no answers'.
-- Migrations are immutable, so this is a CREATE OR REPLACE in a new file.

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
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(*)::int FROM quiz_session_answers WHERE session_id = p_session_id)
    INTO v_correct_count, v_score, v_passed, v_answered
    FROM quiz_sessions qs
    WHERE qs.id = p_session_id;
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
