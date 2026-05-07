-- Hardens start_quiz_session input validation (issue #622).
--
-- Bug: start_quiz_session accepted empty/null p_question_ids, which made
-- array_length(...) NULL and tripped the NOT NULL constraint on
-- quiz_sessions.total_questions (SQLSTATE 23502). It also accepted arbitrary
-- UUIDs without verifying they referenced real, active, non-deleted questions
-- belonging to the caller's organization (and matching p_subject_id /
-- p_topic_id when provided), and accepted duplicate UUIDs which created an
-- inconsistent session: total_questions counted duplicates while downstream
-- get_quiz_questions() collapses them and quiz_session_answers' unique
-- constraint blocks all-but-one answer attempts.
--
-- Fix: after the active-user gate, reject null/empty arrays with
-- 'no_questions_provided', reject any duplicate UUID with 'invalid_question_ids'
-- (set-based COUNT(DISTINCT ...) check), then verify every UUID resolves to an
-- active, in-org, non-deleted question matching the (subject, topic) scope —
-- raising 'invalid_question_ids' on any mismatch. smart_review mode passes
-- both subject_id and topic_id as NULL, so the scope filter is conditional.

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
  v_org_id uuid;
  v_role text;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id, role
  INTO v_org_id, v_role
  FROM users
  WHERE id = v_uid
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_provided';
  END IF;

  -- Reject duplicate UUIDs. unnest + JOIN below would silently double-count
  -- and pass the COUNT equality check, then create an inconsistent session.
  SELECT count(DISTINCT qid) INTO v_count
  FROM unnest(p_question_ids) AS qid;
  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Verify every UUID resolves to an active, in-org, non-deleted question
  -- matching the (subject, topic) scope. NULL p_subject_id / p_topic_id =>
  -- smart_review; corresponding match is skipped, org + active + soft-delete
  -- always apply.
  SELECT count(*) INTO v_count
  FROM unnest(p_question_ids) AS qid
  JOIN public.questions q ON q.id = qid
  WHERE q.organization_id = v_org_id
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_topic_id   IS NULL OR q.topic_id   = p_topic_id)
    AND q.status = 'active'
    AND q.deleted_at IS NULL;

  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    v_org_id,
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
    v_org_id,
    v_uid,
    v_role,
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;
