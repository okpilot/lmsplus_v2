-- start_quiz_session: raise not_enrolled before any subject-scoped read; a hidden question counts
-- as invalid (red-team KR). #1637 (Decision 162)
-- Body copied from the latest definition; only the enrolment pre-gate and count filter are added.
CREATE OR REPLACE FUNCTION public.start_quiz_session(p_mode text, p_subject_id uuid, p_topic_id uuid, p_question_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Enrolment pre-gate: raise before any subject-scoped read or side effect, so a non-enrolled
  -- caller learns nothing about the hidden subject. trg_quiz_sessions_enforce_enrolment stays the
  -- INSERT backstop. NULL p_subject_id falls through unless the
  -- caller has no accessible subject (NULL NOT IN <empty set> is TRUE).
  IF p_subject_id NOT IN (SELECT private.accessible_subject_ids()) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  -- Single-active-session invariant (#1011, mig 136): at most one active session
  -- per student across all modes.
  -- (1) An abandoned ephemeral Discovery row never blocks — auto-clear it.
  UPDATE quiz_sessions SET deleted_at = now()
   WHERE student_id = v_uid AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  -- (2) Practice never resumes server-side, so block on ANY other active
  -- session (no self-exclusion).
  IF EXISTS (
    SELECT 1 FROM quiz_sessions qs
     WHERE qs.student_id = v_uid
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_provided';
  END IF;

  -- Reject a multidimensional array (e.g. Nx1): it passes array_length(.., 1),
  -- the distinct-count, and unnest checks, but to_jsonb() would persist nested
  -- JSON in config.question_ids. Practice ids must be a flat uuid[]
  -- (parity with start_discovery_session, mig 137).
  IF array_ndims(p_question_ids) <> 1 THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- DB-level cap: reject arrays larger than 500. Mirrors the Zod max in the
  -- Server Action (count: z.number().int().min(1).max(500)). Runs before the
  -- expensive unnest/DISTINCT/JOIN operations so the guard is O(1).
  IF array_length(p_question_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_questions';
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
    AND q.deleted_at IS NULL
    -- A question outside the caller's enrolment counts as missing: same error as a random id.
    AND q.subject_id IN (SELECT private.accessible_subject_ids());

  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Insert the practice session. Race backstop: the new global index
  -- uq_one_active_session_per_student (mig 136) catches a concurrent start that
  -- both passed the pre-check guard above; the handler maps it to the same
  -- single-active error.
  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'another_session_active';
  END;

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
$function$;
