-- complete_empty_exam_session: closes a mock_exam session that timed out with
-- zero answers. Records 0% / FAIL so the student lands on the report page
-- instead of being silently redirected away. Idempotent: safe to call twice.
--
-- Parameters:
--   p_session_id: the quiz session to complete
--
-- Security: SECURITY DEFINER with auth.uid() check + org-scope ownership guard

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
  v_correct_count   int;
  v_score           numeric;
  v_passed          boolean;
  v_answered        int;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Get student org
  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Fetch and lock session row (ownership + org-scope)
  SELECT qs.ended_at, qs.total_questions, qs.mode
  INTO v_ended_at, v_total, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;

  -- Only applies to exam sessions
  IF v_mode <> 'mock_exam' THEN
    RAISE EXCEPTION 'session is not a mock exam';
  END IF;

  -- Idempotent: already completed — return the real stored result.
  -- FOR UPDATE lock already holds the row; SELECT is safe and single-statement.
  IF v_ended_at IS NOT NULL THEN
    SELECT qs.correct_count, qs.score_percentage, qs.passed,
           (SELECT count(*)::int FROM quiz_session_answers WHERE session_id = p_session_id)
    INTO v_correct_count, v_score, v_passed, v_answered
    FROM quiz_sessions qs
    WHERE qs.id = p_session_id;
    RETURN jsonb_build_object(
      'session_id',      p_session_id,
      'score_percentage', COALESCE(v_score, 0),
      'passed',           COALESCE(v_passed, false),
      'total_questions',  v_total,
      'answered_count',   COALESCE(v_answered, 0)
    );
  END IF;

  -- Complete the session with 0% / FAIL
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = 0,
    score_percentage = 0,
    passed           = false
  WHERE id = p_session_id;

  -- Audit log
  -- #550: actor_role subquery omits AND deleted_at IS NULL — outer users.deleted_at
  -- guard at top of function already ensures the student is not soft-deleted.
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'exam.expired',
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered_count', 0,
      'reason', 'timed out with no answers'
    )
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'score_percentage', 0,
    'passed', false,
    'total_questions', v_total,
    'answered_count', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_empty_exam_session(uuid) TO authenticated;
