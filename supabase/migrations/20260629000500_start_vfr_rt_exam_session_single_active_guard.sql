-- Migration 140: start_vfr_rt_exam_session — add the single-active-session
-- guard (#1011). At most one active session per student across ALL modes (mig
-- 136).
--
-- Source body: start_vfr_rt_exam_session LATEST = mig 099 (no later
-- redefinition, confirmed by grep). Copied VERBATIM; the ONLY change is the new
-- guard block inserted AFTER the idempotent-resume SELECT/RETURN block (step 5)
-- — so resuming the student's OWN active vfr_rt_exam is never blocked — and
-- after the auto-complete-overdue step. Self-exclusion = same-subject
-- vfr_rt_exam (already returned by the resume block above; the exclusion keeps
-- the guard correct regardless). A DIFFERENT active session yields
-- 'another_session_active'. The existing uq_vfr_rt_exam_session_active
-- unique_violation handler (idempotent re-read) is preserved. SECURITY DEFINER
-- + search_path kept.

CREATE OR REPLACE FUNCTION public.start_vfr_rt_exam_session(p_subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id     uuid := auth.uid();
  v_org_id         uuid;
  v_student_role   text;
  v_config_id      uuid;
  v_parts_config   jsonb;
  v_old_session_id uuid;
  v_resume         record;
  v_p1_need        int;
  v_p2_need        int;
  v_p3_need        int;
  v_p1_topic_code  text;
  v_p2_topic_code  text;
  v_p3_topic_code  text;
  v_p1_topic_id    uuid;
  v_p2_topic_id    uuid;
  v_p3_topic_id    uuid;
  v_p1_ids         uuid[];
  v_p2_ids         uuid[];
  v_p3_ids         uuid[];
  v_p1_have        int;
  v_p2_have        int;
  v_p3_have        int;
  v_all_ids        uuid[];
  v_total          int;
  v_parts          jsonb;
  v_session_id     uuid;
  v_started_at     timestamptz;
BEGIN
  -- 1. Auth (security.md rule 7).
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 2. Resolve org AND cache role in one deleted_at-filtered read at authz
  -- time (security.md rules 9, 10). The cached role is reused in the audit
  -- INSERT below so a mid-call soft-delete of the student row cannot
  -- NULL-abort an already-authorised session start (audit_events.actor_role
  -- is NOT NULL) — mirrors migs 078/084/087/088.
  SELECT u.organization_id, u.role INTO v_org_id, v_student_role
  FROM public.users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- 3. Fetch the enabled VFR RT exam config for (org, subject). The
  -- deleted_at filter is mandatory (security.md rule 9). Error code is
  -- intentionally shared with start_internal_exam_session /
  -- issue_internal_exam_code so the Server Action error mapping stays
  -- consistent across exam modes.
  SELECT ec.id, ec.parts_config INTO v_config_id, v_parts_config
  FROM public.exam_configs ec
  WHERE ec.organization_id = v_org_id
    AND ec.subject_id = p_subject_id
    AND ec.enabled = true
    AND ec.deleted_at IS NULL;
  IF v_config_id IS NULL THEN
    RAISE EXCEPTION 'exam_config_required';
  END IF;

  -- 4. Auto-complete any same-subject vfr_rt_exam past +30s grace (mirrors
  -- mig 087). All quiz_sessions columns qualified as qs.* (PG 42702 lesson,
  -- mig 071). complete_overdue_exam_session accepts mode = 'vfr_rt_exam'
  -- from mig 102 onward; both ship in the same release and no vfr_rt_exam
  -- session can exist before mig 096 widens the mode CHECK.
  SELECT qs.id INTO v_old_session_id
  FROM public.quiz_sessions qs
  WHERE qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.subject_id = p_subject_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL
    AND qs.time_limit_seconds IS NOT NULL
    AND qs.started_at IS NOT NULL
    AND now() > qs.started_at + ((qs.time_limit_seconds + 30) || ' seconds')::interval
  LIMIT 1;
  IF v_old_session_id IS NOT NULL THEN
    PERFORM public.complete_overdue_exam_session(v_old_session_id);
  END IF;

  -- 5. Idempotent resume: an in-flight (not overdue) vfr_rt_exam for this
  -- student/subject is returned as-is instead of raising — the question set
  -- is frozen in config at start, so re-calling the RPC is safe.
  SELECT qs.id, qs.config, qs.time_limit_seconds, qs.started_at
  INTO v_resume
  FROM public.quiz_sessions qs
  WHERE qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.subject_id = p_subject_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL
  LIMIT 1;
  IF v_resume.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'session_id',         v_resume.id,
      'question_ids',       v_resume.config->'question_ids',
      'time_limit_seconds', v_resume.time_limit_seconds,
      'parts',              v_resume.config->'parts',
      'started_at',         v_resume.started_at
    );
  END IF;

  -- 5b. Single-active-session invariant (#1011, mig 136): at most one active
  -- session per student across all modes. Runs AFTER the idempotent-resume
  -- block above, so a same-subject vfr_rt_exam resume already returned; this
  -- only blocks a DIFFERENT active session.
  -- (1) An abandoned ephemeral Discovery row never blocks — auto-clear it.
  UPDATE public.quiz_sessions SET deleted_at = now()
   WHERE student_id = v_student_id AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  -- (2) Block on any OTHER active session this call will not itself resume.
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions qs
     WHERE qs.student_id = v_student_id
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND NOT (qs.mode = 'vfr_rt_exam' AND qs.subject_id = p_subject_id)
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- 6/7. Per-part counts + topic codes from parts_config (mig 098), falling
  -- back to the briefing-package defaults. A missing topic row leaves the
  -- topic id NULL, so the matching pool samples empty and step 8 reports the
  -- shortfall. easa_topics has no deleted_at column (mig 001).
  v_p1_need := COALESCE((v_parts_config->'part1'->>'count')::int, 8);
  v_p2_need := COALESCE((v_parts_config->'part2'->>'count')::int, 9);
  v_p3_need := COALESCE((v_parts_config->'part3'->>'count')::int, 8);
  v_p1_topic_code := COALESCE(v_parts_config->'part1'->>'topic_code', 'P1_ACRONYMS');
  v_p2_topic_code := COALESCE(v_parts_config->'part2'->>'topic_code', 'P2_DIALOG');
  v_p3_topic_code := COALESCE(v_parts_config->'part3'->>'topic_code', 'P3_MC');

  SELECT t.id INTO v_p1_topic_id FROM public.easa_topics t
  WHERE t.subject_id = p_subject_id AND t.code = v_p1_topic_code;
  SELECT t.id INTO v_p2_topic_id FROM public.easa_topics t
  WHERE t.subject_id = p_subject_id AND t.code = v_p2_topic_code;
  SELECT t.id INTO v_p3_topic_id FROM public.easa_topics t
  WHERE t.subject_id = p_subject_id AND t.code = v_p3_topic_code;

  v_p1_ids := ARRAY(
    SELECT q.id FROM public.questions q
    WHERE q.subject_id = p_subject_id
      AND q.topic_id = v_p1_topic_id
      AND q.question_type = 'short_answer'
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND q.organization_id = v_org_id
    ORDER BY random()
    LIMIT v_p1_need
  );
  v_p2_ids := ARRAY(
    SELECT q.id FROM public.questions q
    WHERE q.subject_id = p_subject_id
      AND q.topic_id = v_p2_topic_id
      AND q.question_type = 'dialog_fill'
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND q.organization_id = v_org_id
    ORDER BY random()
    LIMIT v_p2_need
  );
  v_p3_ids := ARRAY(
    SELECT q.id FROM public.questions q
    WHERE q.subject_id = p_subject_id
      AND q.topic_id = v_p3_topic_id
      AND q.question_type = 'multiple_choice'
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND q.organization_id = v_org_id
    ORDER BY random()
    LIMIT v_p3_need
  );

  v_p1_have := COALESCE(array_length(v_p1_ids, 1), 0);
  v_p2_have := COALESCE(array_length(v_p2_ids, 1), 0);
  v_p3_have := COALESCE(array_length(v_p3_ids, 1), 0);

  -- 8. Fail fast with a per-pool shortfall DETAIL (logged server-side only
  -- by the Server Action; never surfaced to the client).
  IF v_p1_have < v_p1_need OR v_p2_have < v_p2_need OR v_p3_have < v_p3_need THEN
    RAISE EXCEPTION 'insufficient_questions_for_vfr_rt_exam'
      USING DETAIL = jsonb_build_object(
        'p1_have', v_p1_have,
        'p2_have', v_p2_have,
        'p3_have', v_p3_have
      )::text;
  END IF;

  -- 9. Freeze the flat ID array in Part-1, Part-2, Part-3 order; parts
  -- boundaries let the UI slice without re-deriving counts.
  v_all_ids := v_p1_ids || v_p2_ids || v_p3_ids;
  v_total   := v_p1_need + v_p2_need + v_p3_need;
  v_parts   := jsonb_build_object(
    'p1_end', v_p1_need,
    'p2_end', v_p1_need + v_p2_need,
    'p3_end', v_total
  );

  -- 10. Insert the session. 1800s = fixed 30-minute timer (design.md).
  -- Sub-block handler: two concurrent FIRST calls can both pass the step-5
  -- idempotent-resume SELECT; uq_vfr_rt_exam_session_active (mig 096) makes
  -- the loser's INSERT raise unique_violation. Unlike the raise-only handlers
  -- in start_exam_session (mig 088) / start_internal_exam_session (mig 070),
  -- the loser re-reads and RETURNs the winner's session — preserving this
  -- RPC's idempotent-resume contract. The RETURN exits here, so the audit
  -- INSERT below never runs on this path (this caller created no session).
  BEGIN
    INSERT INTO public.quiz_sessions
      (organization_id, student_id, mode, subject_id,
       config, total_questions, time_limit_seconds)
    VALUES (
      v_org_id, v_student_id, 'vfr_rt_exam', p_subject_id,
      jsonb_build_object(
        'question_ids', to_jsonb(v_all_ids),
        'parts',        v_parts
      ),
      v_total, 1800
    )
    RETURNING id, quiz_sessions.started_at
    INTO v_session_id, v_started_at;
  EXCEPTION WHEN unique_violation THEN
    SELECT qs.id, qs.config, qs.time_limit_seconds, qs.started_at
    INTO v_resume
    FROM public.quiz_sessions qs
    WHERE qs.student_id = v_student_id
      AND qs.organization_id = v_org_id
      AND qs.subject_id = p_subject_id
      AND qs.mode = 'vfr_rt_exam'
      AND qs.ended_at IS NULL
      AND qs.deleted_at IS NULL
    LIMIT 1;
    IF v_resume.id IS NULL THEN
      -- A different active session won the global single-active race
      -- (uq_one_active_session_per_student, mig 136): there is no same-subject
      -- vfr_rt_exam row to resume, so the conflict came from another mode/subject.
      RAISE EXCEPTION 'another_session_active';
    END IF;
    RETURN jsonb_build_object(
      'session_id',         v_resume.id,
      'question_ids',       v_resume.config->'question_ids',
      'time_limit_seconds', v_resume.time_limit_seconds,
      'parts',              v_resume.config->'parts',
      'started_at',         v_resume.started_at
    );
  END;

  -- 11. Audit. Cached v_student_role from the deleted_at-filtered authz read
  -- (security.md rule 10; cached-role pattern per mig 087).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    v_student_role,
    'vfr_rt_exam.started',
    'quiz_session',
    v_session_id,
    jsonb_build_object(
      'subject_id',      p_subject_id,
      'total_questions', v_total,
      'parts',           v_parts
    )
  );

  -- 12. Return the frozen exam state.
  RETURN jsonb_build_object(
    'session_id',         v_session_id,
    'question_ids',       to_jsonb(v_all_ids),
    'time_limit_seconds', 1800,
    'parts',              v_parts,
    'started_at',         v_started_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_vfr_rt_exam_session(uuid) TO authenticated;
