-- Migration 071: Qualify quiz_sessions columns in start_internal_exam_session
-- CodeRabbit PR #576 round-2 + CI red-team failure.
--
-- Bug (PG 42702 "column reference \"time_limit_seconds\" is ambiguous"):
-- The function RETURNS TABLE(... time_limit_seconds int, ..., started_at timestamptz)
-- exposes those names as variables in the function body. The auto-complete SELECT
-- in mig 070 lines 103-114 referenced them unqualified:
--
--   AND time_limit_seconds IS NOT NULL
--   AND started_at IS NOT NULL
--   AND now() > started_at + ((time_limit_seconds + 30) || ' seconds')::interval
--
-- Postgres cannot distinguish the RETURNS column from the quiz_sessions column
-- and raises 42702. The bug was latent until the red-team spec exercised the
-- "active session past its grace window" code path.
--
-- Fix: alias public.quiz_sessions AS qs and qualify every reference. Function
-- body otherwise unchanged from mig 070.

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

  SELECT u.organization_id INTO v_org_id
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
