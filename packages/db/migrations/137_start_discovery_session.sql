-- Migration 137: start_discovery_session — create a real ephemeral 'discovery'
-- quiz_sessions row for Study/Discovery mode (#1011).
--
-- Discovery was fully ephemeral (no server-side row). #1011 makes it a real
-- session so the single-active-session invariant (mig 136) can enforce that a
-- student cannot run Discovery (which reveals answer keys via
-- get_study_questions) concurrently with an exam graded from the same MC pool.
--
-- Blueprint: start_quiz_session — LATEST body mig 086 (lineage 002 → 074 → 076
-- → 080 → 081 → 086; no later redefinition, confirmed by grep of both migration
-- dirs). Full guard-set parity (security.md rule 12): auth.uid() null-check
-- (rule 7); active-user gate via a deleted_at-filtered users read (rule 9), org
-- AND role resolved in ONE read so the cached role populates the audit
-- actor_role without an inline mid-call-soft-delete-racy subquery (rule 10,
-- the mig 087 cached-role pattern); the single-active-session guard (mig 136);
-- audit-event soft-delete safety via the cached role; SET search_path = public.
--
-- PARAMS (p_subject_id, p_question_ids): the app flow (apps/web/.../actions/
-- study.ts) resolves the MC-only id set server-side via getRandomQuestionIds
-- THEN reads keys via getStudyQuestions(ids); start_discovery_session sits
-- between them, persisting that frozen id set in config.question_ids and the
-- subject. No topic_id and no time_limit_seconds — Discovery is untimed and
-- topic scope is already baked into the resolved ids.

CREATE OR REPLACE FUNCTION public.start_discovery_session(
  p_subject_id   uuid,
  p_question_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_org_id     uuid;
  v_role       text;
  v_count      int;
  v_session_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Active-user + tenant gate: resolve org AND cache role in one
  -- deleted_at-filtered read. Alias users u + qualify columns (no 42702 risk
  -- here without a RETURNS TABLE, but kept consistent with the sibling RPCs).
  SELECT u.organization_id, u.role
  INTO v_org_id, v_role
  FROM public.users u
  WHERE u.id = v_student_id
    AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Validate the caller-supplied id array (mirrors start_quiz_session, mig 086).
  -- This RPC is GRANTed to authenticated, so a direct caller bypassing the
  -- Server Action's Zod cap could otherwise store junk / oversized arrays.
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_provided';
  END IF;
  -- Reject a multidimensional array (e.g. Nx1): it passes array_length(.., 1),
  -- the distinct-count, and unnest checks, but to_jsonb() would persist nested
  -- JSON in config.question_ids. Discovery ids must be a flat uuid[].
  IF array_ndims(p_question_ids) <> 1 THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;
  IF array_length(p_question_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_questions';
  END IF;
  SELECT count(DISTINCT qid) INTO v_count FROM unnest(p_question_ids) AS qid;
  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;
  -- Every id must resolve to an active, in-org, non-deleted question in scope.
  SELECT count(*) INTO v_count
  FROM unnest(p_question_ids) AS qid
  JOIN public.questions q ON q.id = qid
  WHERE q.organization_id = v_org_id
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND q.status = 'active'
    AND q.deleted_at IS NULL;
  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Single-active-session invariant (#1011, mig 136).
  -- (1) Replace this student's own prior abandoned Discovery row so a re-start
  --     never blocks itself (Discovery is ephemeral — the old one is dead).
  UPDATE public.quiz_sessions SET deleted_at = now()
   WHERE student_id = v_student_id AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  -- (2) Block on any OTHER active session (discovery self-excluded — step 1
  --     already cleared the student's discovery rows).
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions qs
     WHERE qs.student_id = v_student_id
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND qs.mode <> 'discovery'
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- Insert the ephemeral discovery session. Race backstop: two concurrent
  -- discovery starts both pass the guard above; uq_one_active_session_per_student
  -- (mig 136) makes the loser's INSERT raise unique_violation. The loser
  -- re-reads the winner's active discovery row — but RETURNs it ONLY when the
  -- winner's frozen inputs (subject_id + config.question_ids) match this
  -- caller's request. Idempotent ONLY for an identical concurrent request: two
  -- starts with the same payload may safely share the one surviving session
  -- (the id set is frozen in config). A different-payload concurrent start must
  -- NOT receive the winner's id — study.ts scopes orphan-teardown to the id this
  -- RPC returns, so handing back the winner's id would let the loser soft-delete
  -- the winner's session. The RETURN exits here, so the audit INSERT below never
  -- runs on that path (this caller created no session). If the re-read finds NO
  -- payload-matching active discovery row, a different request's session is
  -- active — surface the single-active error.
  BEGIN
    INSERT INTO public.quiz_sessions
      (organization_id, student_id, mode, subject_id, config, total_questions)
    VALUES (
      v_org_id,
      v_student_id,
      'discovery',
      p_subject_id,
      jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
      array_length(p_question_ids, 1)
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT qs.id INTO v_session_id
    FROM public.quiz_sessions qs
    WHERE qs.student_id = v_student_id
      AND qs.organization_id = v_org_id
      AND qs.mode = 'discovery'
      AND qs.ended_at IS NULL
      AND qs.deleted_at IS NULL
      AND qs.subject_id IS NOT DISTINCT FROM p_subject_id
      AND qs.config->'question_ids' = to_jsonb(p_question_ids)
    LIMIT 1;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'another_session_active';
    END IF;
    RETURN v_session_id;
  END;

  -- Audit. Cached v_role from the deleted_at-filtered authz read (security.md
  -- rule 10) — no inline subquery that a mid-call soft-delete could NULL.
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    v_org_id,
    v_student_id,
    v_role,
    'discovery.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_discovery_session(uuid, uuid[]) TO authenticated;
