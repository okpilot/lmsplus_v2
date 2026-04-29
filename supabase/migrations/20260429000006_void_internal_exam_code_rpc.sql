-- void_internal_exam_code(p_code_id, p_reason)
-- Admin-only. Voids an internal exam code. If the code was consumed and the
-- linked session is still active, terminate the session with passed=false and
-- a computed score (unanswered = wrong). Refuses if the linked session has
-- already ended (do not retroactively change a finished attempt).
-- security.md rules 7, 9, 10.

CREATE OR REPLACE FUNCTION public.void_internal_exam_code(
  p_code_id uuid,
  p_reason  text
)
RETURNS TABLE(code_id uuid, session_id uuid, session_ended boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        uuid := auth.uid();
  v_admin_org       uuid;
  v_code_org        uuid;
  v_code_consumed   timestamptz;
  v_code_voided     timestamptz;
  v_code_session_id uuid;
  v_session_ended   timestamptz;
  v_session_total   int;
  v_session_config  jsonb;
  v_pass_mark       int;
  v_answered        int;
  v_correct_count   int;
  v_score           numeric(5,2);
  v_session_done    boolean := false;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  -- Resolve admin's org (deleted_at filter).
  SELECT u.organization_id INTO v_admin_org
  FROM public.users u
  WHERE u.id = v_admin_id AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  -- Lock the code row.
  SELECT iec.organization_id, iec.consumed_at, iec.voided_at, iec.consumed_session_id
  INTO v_code_org, v_code_consumed, v_code_voided, v_code_session_id
  FROM public.internal_exam_codes iec
  WHERE iec.id = p_code_id
    AND iec.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  -- Org-scope check: admin can only void codes in their own org.
  IF v_code_org <> v_admin_org THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  IF v_code_voided IS NOT NULL THEN
    -- Already voided — idempotent no-op for the void itself, but still surface.
    RAISE EXCEPTION 'code_voided';
  END IF;

  -- If the code was consumed, look at the linked session.
  IF v_code_consumed IS NOT NULL AND v_code_session_id IS NOT NULL THEN
    SELECT qs.ended_at, qs.total_questions, qs.config
    INTO v_session_ended, v_session_total, v_session_config
    FROM public.quiz_sessions qs
    WHERE qs.id = v_code_session_id
      AND qs.deleted_at IS NULL
    FOR UPDATE;

    IF FOUND AND v_session_ended IS NOT NULL THEN
      -- Refuse to retroactively change a finished attempt.
      RAISE EXCEPTION 'cannot_void_finished_attempt';
    END IF;

    IF FOUND AND v_session_ended IS NULL THEN
      -- Compute the score from existing answers; unanswered = wrong.
      SELECT
        count(*)::int,
        count(*) FILTER (WHERE qsa.is_correct)::int
      INTO v_answered, v_correct_count
      FROM public.quiz_session_answers qsa
      WHERE qsa.session_id = v_code_session_id;

      v_score := CASE WHEN v_session_total > 0
                      THEN round((v_correct_count::numeric / v_session_total) * 100, 2)
                      ELSE 0 END;

      v_pass_mark := (v_session_config->>'pass_mark')::int;

      UPDATE public.quiz_sessions
      SET ended_at         = now(),
          correct_count    = v_correct_count,
          score_percentage = v_score,
          passed           = false
      WHERE id = v_code_session_id;

      v_session_done := true;

      -- Audit the session expiry (subquery filters deleted_at).
      INSERT INTO public.audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (
        v_admin_org,
        v_admin_id,
        (SELECT u.role FROM public.users u
         WHERE u.id = v_admin_id AND u.deleted_at IS NULL),
        'internal_exam.expired',
        'quiz_session',
        v_code_session_id,
        jsonb_build_object(
          'reason',           'admin_voided',
          'score_percentage', v_score,
          'answered_count',   v_answered,
          'correct_count',    v_correct_count,
          'total_questions',  v_session_total,
          'pass_mark',        v_pass_mark,
          'passed',           false
        )
      );
    END IF;
  END IF;

  -- Mark the code voided.
  UPDATE public.internal_exam_codes
  SET voided_at   = now(),
      voided_by   = v_admin_id,
      void_reason = p_reason
  WHERE id = p_code_id;

  -- Audit the void event.
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_admin_org,
    v_admin_id,
    (SELECT u.role FROM public.users u
     WHERE u.id = v_admin_id AND u.deleted_at IS NULL),
    'internal_exam.code_voided',
    'internal_exam_code',
    p_code_id,
    jsonb_build_object(
      'reason',       p_reason,
      'was_consumed', (v_code_consumed IS NOT NULL),
      'session_ended', v_session_done
    )
  );

  RETURN QUERY SELECT p_code_id, v_code_session_id, v_session_done;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_internal_exam_code(uuid, text) TO authenticated;
