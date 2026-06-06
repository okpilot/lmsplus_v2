-- Migration 087: Cache actor_role at authz time in start_internal_exam_session
-- and issue_internal_exam_code (#734).
--
-- Both RPCs populated audit_events.actor_role (NOT NULL) via an inline
-- (SELECT u.role FROM public.users u WHERE u.id = … AND u.deleted_at IS NULL)
-- subquery inside the audit INSERT, executed after the authz lookup.  If the
-- acting user is soft-deleted between authz and audit, the subquery returns
-- NULL and the NOT NULL constraint aborts an already-authorised action.
--
-- Fix: capture role together with organization_id in the single authz SELECT
-- that already filters deleted_at IS NULL, store in a local text variable, and
-- reuse the cached value in the audit INSERT.  Mirrors the pattern introduced
-- in mig 084 (void_internal_exam_code) and mig 078 (batch_submit_quiz).
--
-- Latest source bodies:
--   start_internal_exam_session — mig 071
--   issue_internal_exam_code    — mig 067
-- No later mig redefines either function (confirmed by grep).

-- ─── start_internal_exam_session ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_internal_exam_session(p_code text)
RETURNS TABLE(
  session_id uuid,
  question_ids uuid[],
  time_limit_seconds int,
  total_questions int,
  pass_mark int,
  started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_student_role    text;
  v_code_id         uuid;
  v_code_subject    uuid;
  v_code_student    uuid;
  v_code_org        uuid;
  v_code_expires    timestamptz;
  v_code_consumed   timestamptz;
  v_code_voided     timestamptz;
  v_old_session_id  uuid;
  v_config_id       uuid;
  v_total_questions int;
  v_time_limit      int;
  v_pass_mark       int;
  v_dist            record;
  v_selected_ids    uuid[] := '{}';
  v_topic_ids       uuid[];
  v_session_id      uuid;
  v_started_at      timestamptz;
  v_consumed_rows   int;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT iec.id, iec.subject_id, iec.student_id, iec.organization_id,
         iec.expires_at, iec.consumed_at, iec.voided_at
  INTO v_code_id, v_code_subject, v_code_student, v_code_org,
       v_code_expires, v_code_consumed, v_code_voided
  FROM public.internal_exam_codes iec
  WHERE iec.code = p_code
    AND iec.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  IF v_code_student <> v_student_id THEN
    RAISE EXCEPTION 'code_not_yours';
  END IF;
  IF v_code_voided IS NOT NULL THEN
    RAISE EXCEPTION 'code_voided';
  END IF;
  IF v_code_consumed IS NOT NULL THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;
  IF v_code_expires <= now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  -- Capture org AND role in one deleted_at-filtered read at authz time.
  -- The cached role is reused in the audit INSERT below so a mid-call
  -- soft-delete of the student row cannot NULL-abort an already-authorised
  -- session start (audit_events.actor_role is NOT NULL).
  SELECT u.organization_id, u.role INTO v_org_id, v_student_role
  FROM public.users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF v_code_org IS NULL OR v_code_org <> v_org_id THEN
    RAISE EXCEPTION 'code_not_yours';
  END IF;

  -- Auto-complete any same-subject internal_exam past +30s grace.
  -- All quiz_sessions columns aliased as qs.* — the function's RETURNS TABLE
  -- exposes time_limit_seconds and started_at as bare names too, so any
  -- unqualified reference here is ambiguous (PG 42702).
  SELECT qs.id INTO v_old_session_id
  FROM public.quiz_sessions qs
  WHERE qs.student_id = v_student_id
    AND qs.organization_id = v_org_id
    AND qs.subject_id = v_code_subject
    AND qs.mode = 'internal_exam'
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL
    AND qs.time_limit_seconds IS NOT NULL
    AND qs.started_at IS NOT NULL
    AND now() > qs.started_at + ((qs.time_limit_seconds + 30) || ' seconds')::interval
  LIMIT 1;
  IF v_old_session_id IS NOT NULL THEN
    PERFORM public.complete_overdue_exam_session(v_old_session_id);
  END IF;

  -- Pre-INSERT guard. Concurrency-safe source of truth is the partial unique
  -- index on (student_id, organization_id, subject_id) WHERE mode='internal_exam'
  -- AND ended_at IS NULL AND deleted_at IS NULL (mig 069) caught by the
  -- EXCEPTION handler around the INSERT below.
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions qs
    WHERE qs.student_id = v_student_id
      AND qs.organization_id = v_org_id
      AND qs.subject_id = v_code_subject
      AND qs.mode = 'internal_exam'
      AND qs.ended_at IS NULL
      AND qs.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_session_exists';
  END IF;

  SELECT ec.id, ec.total_questions, ec.time_limit_seconds, ec.pass_mark
  INTO v_config_id, v_total_questions, v_time_limit, v_pass_mark
  FROM public.exam_configs ec
  WHERE ec.organization_id = v_org_id
    AND ec.subject_id = v_code_subject
    AND ec.enabled = true
    AND ec.deleted_at IS NULL;
  IF v_config_id IS NULL THEN
    RAISE EXCEPTION 'exam_config_required';
  END IF;

  FOR v_dist IN
    SELECT ecd.topic_id, ecd.subtopic_id, ecd.question_count
    FROM public.exam_config_distributions ecd
    WHERE ecd.exam_config_id = v_config_id
    ORDER BY ecd.topic_id, ecd.subtopic_id NULLS LAST
  LOOP
    v_topic_ids := ARRAY(
      SELECT q.id
      FROM public.questions q
      WHERE q.subject_id = v_code_subject
        AND q.topic_id = v_dist.topic_id
        AND (v_dist.subtopic_id IS NULL OR q.subtopic_id = v_dist.subtopic_id)
        AND q.status = 'active'
        AND q.deleted_at IS NULL
        AND q.organization_id = v_org_id
        AND q.id != ALL(v_selected_ids)
      ORDER BY random()
      LIMIT v_dist.question_count
    );
    IF array_length(v_topic_ids, 1) IS NULL OR array_length(v_topic_ids, 1) < v_dist.question_count THEN
      RAISE EXCEPTION 'insufficient_questions_for_exam';
    END IF;
    v_selected_ids := v_selected_ids || v_topic_ids;
  END LOOP;

  IF array_length(v_selected_ids, 1) IS NULL
     OR array_length(v_selected_ids, 1) <> v_total_questions THEN
    RAISE EXCEPTION 'insufficient_questions_for_exam';
  END IF;

  BEGIN
    INSERT INTO public.quiz_sessions
      (organization_id, student_id, mode, subject_id,
       config, total_questions, time_limit_seconds)
    VALUES (
      v_org_id, v_student_id, 'internal_exam', v_code_subject,
      jsonb_build_object(
        'question_ids',   to_jsonb(v_selected_ids),
        'exam_config_id', v_config_id,
        'pass_mark',      v_pass_mark
      ),
      v_total_questions, v_time_limit
    )
    RETURNING id, quiz_sessions.started_at
    INTO v_session_id, v_started_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active_session_exists';
  END;

  UPDATE public.internal_exam_codes
  SET consumed_at = now(),
      consumed_session_id = v_session_id
  WHERE id = v_code_id
    AND consumed_at IS NULL;
  GET DIAGNOSTICS v_consumed_rows = ROW_COUNT;
  IF v_consumed_rows = 0 THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    v_student_role,
    'internal_exam.started',
    'quiz_session',
    v_session_id,
    jsonb_build_object(
      'code_id',         v_code_id,
      'subject_id',      v_code_subject,
      'total_questions', v_total_questions,
      'pass_mark',       v_pass_mark
    )
  );

  RETURN QUERY SELECT
    v_session_id,
    v_selected_ids,
    v_time_limit,
    v_total_questions,
    v_pass_mark,
    v_started_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_internal_exam_session(text) TO authenticated;

-- ─── issue_internal_exam_code ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_internal_exam_code(
  p_subject_id uuid,
  p_student_id uuid
)
RETURNS TABLE(code_id uuid, code text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_admin_org  uuid;
  v_admin_role text;
  v_student_org uuid;
  v_charset    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_charset_len int  := length('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  v_code       text;
  v_new_id     uuid;
  v_new_expiry timestamptz;
  v_attempt    int := 0;
  v_inserted   boolean := false;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Capture the admin's org AND role in one deleted_at-filtered read at
  -- authorization time.  The cached role is reused in the audit INSERT below
  -- so a mid-call soft-delete of the admin row cannot NULL-abort an
  -- already-authorised code issuance (audit_events.actor_role is NOT NULL).
  SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
  FROM public.users u
  WHERE u.id = v_admin_id
    AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Verify student exists in same org with role='student'.
  SELECT u.organization_id INTO v_student_org
  FROM public.users u
  WHERE u.id = p_student_id
    AND u.role = 'student'
    AND u.deleted_at IS NULL;
  IF v_student_org IS NULL OR v_student_org <> v_admin_org THEN
    RAISE EXCEPTION 'student_not_found';
  END IF;

  -- Verify subject exists. easa_subjects has no deleted_at column.
  IF NOT EXISTS (
    SELECT 1 FROM public.easa_subjects s
    WHERE s.id = p_subject_id
  ) THEN
    RAISE EXCEPTION 'subject_not_found';
  END IF;

  -- Verify an enabled exam_config exists for (admin_org, subject).
  IF NOT EXISTS (
    SELECT 1 FROM public.exam_configs ec
    WHERE ec.organization_id = v_admin_org
      AND ec.subject_id = p_subject_id
      AND ec.enabled = true
      AND ec.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'exam_config_required';
  END IF;

  v_new_expiry := now() + interval '24 hours';

  -- Generate + insert with up-to-5 retry on unique-violation.
  WHILE v_attempt < 5 AND NOT v_inserted LOOP
    v_attempt := v_attempt + 1;
    v_code := array_to_string(
      ARRAY(
        SELECT substr(v_charset, 1 + floor(random() * v_charset_len)::int, 1)
        FROM generate_series(1, 8)
      ),
      ''
    );
    BEGIN
      INSERT INTO public.internal_exam_codes
        (code, subject_id, student_id, issued_by, expires_at, organization_id)
      VALUES
        (v_code, p_subject_id, p_student_id, v_admin_id, v_new_expiry, v_admin_org)
      RETURNING id INTO v_new_id;
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      -- Retry with a fresh code.
      v_inserted := false;
    END;
  END LOOP;

  IF NOT v_inserted THEN
    RAISE EXCEPTION 'code_generation_failed';
  END IF;

  -- Audit. Cached v_admin_role reused; no inline subquery (security.md rule 10).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org,
    v_admin_id,
    v_admin_role,
    'internal_exam.code_issued',
    'internal_exam_code',
    v_new_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'subject_id', p_subject_id,
      'expires_at', v_new_expiry
    )
  );

  RETURN QUERY SELECT v_new_id, v_code, v_new_expiry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_internal_exam_code(uuid, uuid) TO authenticated;
