-- Fix: add SECURITY DEFINER to start_quiz_session()
-- Without it, the function runs as the calling role (anon/authenticated)
-- and cannot INSERT into quiz_sessions due to RLS policies.
-- This matches submit_quiz_answer() and complete_quiz_session().

CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode         text,
  p_subject_id   uuid,
  p_topic_id     uuid,
  p_question_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    (SELECT organization_id FROM users WHERE id = v_uid),
    v_uid,
    p_mode,
    p_subject_id,
    p_topic_id,
    jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
    array_length(p_question_ids, 1)
  )
  RETURNING id INTO v_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    (SELECT organization_id FROM users WHERE id = v_uid),
    v_uid,
    (SELECT role FROM users WHERE id = v_uid),
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;
