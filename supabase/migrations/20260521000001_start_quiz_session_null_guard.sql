-- Bug: mig 20260508000001 whitelist guard `IF p_mode NOT IN ('smart_review',
-- 'quick_quiz')` does not reject NULL. Postgres 3-valued logic evaluates
-- `NULL NOT IN (...)` to NULL, and `IF NULL THEN` is false, so a NULL p_mode
-- skips the RAISE and falls through to the active-user gate. The active-user
-- gate runs a different query, so a NULL p_mode leaks a different timing /
-- error signal than an invalid p_mode — defeating the timing-oracle closure
-- that mig 20260508000001 specifically aimed for.
--
-- CodeRabbit flagged this on PR #641; the in-place edit was prepared on
-- 2026-05-08 but never pushed. PR #641 merged on 2026-05-21 as a
-- history-reconciliation of the prod-deployed body (without the NULL guard),
-- so this migration re-creates the function with the corrected guard.

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

  -- Whitelist: only student-facing practice modes are permitted here.
  -- mock_exam => start_exam_session; internal_exam => start_internal_exam_session.
  -- NULL must be rejected explicitly: Postgres 3-valued logic returns NULL for
  -- `NULL NOT IN (...)`, and `IF NULL THEN` is false, so omitting the IS NULL
  -- check would let a NULL p_mode bypass the guard and reach the active-user
  -- gate — leaking an auth-passed timing/error signal before failing at INSERT.
  IF p_mode IS NULL OR p_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'mode_not_allowed';
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
