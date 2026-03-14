-- 035_complete_session_softdelete_guard.sql
-- Add soft-delete guard to complete_quiz_session.
-- The WHERE clause now excludes sessions with deleted_at IS NOT NULL,
-- preventing a discarded (soft-deleted) session from being completed.
-- All other logic is unchanged from migration 002.

CREATE OR REPLACE FUNCTION complete_quiz_session(p_session_id uuid)
RETURNS TABLE (
  total_questions  int,
  correct_count    int,
  score_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_org_id     uuid;
  v_total      int;
  v_correct    int;
  v_score      numeric(5,2);
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student, is still active, and not soft-deleted
  SELECT qs.organization_id
  INTO v_org_id
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or already completed';
  END IF;

  -- Calculate score
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_total, v_correct
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  v_score := CASE WHEN v_total > 0 THEN round((v_correct::numeric / v_total) * 100, 2) ELSE 0 END;

  -- Update session
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = v_correct,
    score_percentage = v_score
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'quiz_session.completed',
    'quiz_session',
    p_session_id,
    jsonb_build_object('total', v_total, 'correct', v_correct, 'score', v_score)
  );

  RETURN QUERY SELECT v_total, v_correct, v_score;
END;
$$;
