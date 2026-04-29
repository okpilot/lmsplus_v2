-- Migration 070: Org-scope check + race-safe INSERT on start_internal_exam_session
-- CodeRabbit PR #576 finding #36 (CRITICAL — missing org check) +
-- function-body half of finding #33 (race condition; the index ships in 069).
--
-- Issue #36: The SELECT from internal_exam_codes (mig 065 lines 50-57) loaded
--   id, subject_id, student_id, expires_at, consumed_at, voided_at
-- but NOT organization_id. The code's org is never compared to the resolving
-- student's org, so a code for a student moved cross-org (or any future
-- corruption that drifts iec.organization_id from u.organization_id) would
-- silently start a session in the wrong org.
-- Fix: SELECT iec.organization_id INTO v_code_org and verify v_code_org = v_org_id
-- after the student's org is resolved. Use the unified `code_not_yours` error
-- to avoid leaking cross-org existence.
--
-- Issue #33 (function-body): wrap the INSERT INTO quiz_sessions in
-- EXCEPTION WHEN unique_violation -> 'active_session_exists'. The pre-INSERT
-- EXISTS guard is kept (cheap, gives clean error in normal flow), but the
-- catch-handler is now the source of truth for the invariant — it is the only
-- one that is concurrency-safe (relies on the partial unique index from 069).
-- security.md rules 7, 9, 10 (audit subquery keeps deleted_at IS NULL).

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

  -- Lock + validate the code (now also reads organization_id for cross-org check).
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

  -- Resolve student's org.
  SELECT u.organization_id INTO v_org_id
  FROM public.users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Cross-org check: the code's org must match the resolving student's org.
  -- Unified error message — never reveal cross-org existence.
  IF v_code_org IS NULL OR v_code_org <> v_org_id THEN
    RAISE EXCEPTION 'code_not_yours';
  END IF;

  -- Auto-complete any same-subject internal_exam past +30s grace
  -- (mirrors start_exam_session in mig 054).
  SELECT id INTO v_old_session_id
  FROM public.quiz_sessions
  WHERE student_id = v_student_id
    AND organization_id = v_org_id
    AND subject_id = v_code_subject
    AND mode = 'internal_exam'
    AND ended_at IS NULL
    AND deleted_at IS NULL
    AND time_limit_seconds IS NOT NULL
    AND started_at IS NOT NULL
    AND now() > started_at + ((time_limit_seconds + 30) || ' seconds')::interval
  LIMIT 1;
  IF v_old_session_id IS NOT NULL THEN
    PERFORM public.complete_overdue_exam_session(v_old_session_id);
  END IF;

  -- Pre-INSERT guard: cheap fast path that yields a clean error in normal flow.
  -- The schema-level partial unique index (mig 069) is the concurrency-safe
  -- source of truth — see the EXCEPTION handler around the INSERT below.
  IF EXISTS (
    SELECT 1 FROM public.quiz_sessions
    WHERE student_id = v_student_id
      AND organization_id = v_org_id
      AND subject_id = v_code_subject
      AND mode = 'internal_exam'
      AND ended_at IS NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_session_exists';
  END IF;

  -- Fetch the exam config for this subject in the student's org.
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

  -- Sample questions per distribution (matches mig 054 algorithm).
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

  -- Insert session. Race-safe: the partial unique index on
  -- (student_id, organization_id, subject_id) WHERE mode='internal_exam'
  -- AND ended_at IS NULL AND deleted_at IS NULL (mig 069) catches concurrent
  -- INSERTs that both passed the EXISTS guard above.
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

  -- Mark code consumed (race-safe: requires consumed_at IS NULL).
  UPDATE public.internal_exam_codes
  SET consumed_at = now(),
      consumed_session_id = v_session_id
  WHERE id = v_code_id
    AND consumed_at IS NULL;
  GET DIAGNOSTICS v_consumed_rows = ROW_COUNT;
  IF v_consumed_rows = 0 THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;

  -- Audit. Subquery on users filters deleted_at (security.md rule 10).
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT u.role FROM public.users u
     WHERE u.id = v_student_id AND u.deleted_at IS NULL),
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
