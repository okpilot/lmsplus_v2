-- Fix #565-followup: complete_empty_exam_session actor_role subquery
-- omitted AND deleted_at IS NULL on the users lookup, violating
-- security.md rule #10 (audit-row subqueries are independent SELECTs and
-- must enforce soft-delete on every FK lookup, even when an outer guard
-- already covers the calling student). Rule #10 was promoted to a hard
-- rule in this same branch (pattern hit count=3) and explicitly rejects
-- the "outer guard already covers it" rationale this function relied on.
--
-- Migrations are immutable, so we REPLACE the function in a new file
-- rather than editing 049.

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
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM users
  WHERE id = v_student_id AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

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

  -- Audit row subqueries are independent SELECTs (security.md §10).
  -- The outer guard above proves the student is not soft-deleted, but the
  -- subquery must enforce it directly to satisfy the rule.
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
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
    'session_id',       p_session_id,
    'score_percentage', 0,
    'passed',           false,
    'total_questions',  v_total,
    'answered_count',   0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_empty_exam_session(uuid) TO authenticated;
