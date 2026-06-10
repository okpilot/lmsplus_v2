-- Migration 104: complete_quiz_session — legacy-mode whitelist guard (#838).
--
-- Body copied VERBATIM from the latest definition
-- (supabase/migrations/20260406000004_populate_last_active_at.sql, L21-94).
-- Two changes:
--   1. The session SELECT also fetches qs.mode, and non-legacy modes
--      (vfr_rt_exam) are rejected with 'unsupported_session_mode' — a vfr_rt
--      session ended via this MC path would bypass per-part grading (mig 100)
--      and emit the wrong audit event. Fail-closed NOT IN whitelist so future
--      modes must opt in explicitly.
--   2. The audit-event actor_role subquery gains the deleted_at IS NULL
--      filter required by security.md rule 10 (audit-event INSERT subqueries)
--      — absent in the copy source, fixed here rather than replicating the
--      violation. actor_role is NOT NULL, so a soft-deleted caller fails
--      closed at the INSERT.

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
  v_mode       text;
  v_total      int;
  v_correct    int;
  v_score      numeric(5,2);
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student, is still active, and not soft-deleted
  SELECT qs.organization_id, qs.mode
  INTO v_org_id, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or already completed';
  END IF;

  IF v_mode NOT IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
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

  -- Stamp last_active_at on the student (Fixes #479)
  UPDATE users
  SET last_active_at = now()
  WHERE id = v_student_id AND deleted_at IS NULL;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id AND deleted_at IS NULL),
    'quiz_session.completed',
    'quiz_session',
    p_session_id,
    jsonb_build_object('total', v_total, 'correct', v_correct, 'score', v_score)
  );

  RETURN QUERY SELECT v_total, v_correct, v_score;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_quiz_session(uuid) TO authenticated;
