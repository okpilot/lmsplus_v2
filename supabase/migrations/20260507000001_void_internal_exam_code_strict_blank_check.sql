-- Migration: tighten void_internal_exam_code blank-reason check.
-- Red-team finding (issue #108, OWASP A05 SQL fuzzing): the current
-- guard `btrim(p_reason) = ''` only rejects empty strings and
-- spaces-only — Postgres `btrim(text)` defaults to a space charset
-- and does NOT trim tabs (\t), newlines (\n), CR (\r), form feed
-- (\f), or vertical tab (\v). So `'\t\t\t'` survives and gets
-- written as a "valid" void_reason.
--
-- The Server Action `voidInternalExamCode` validates length only
-- (`z.string().min(1).max(500)`), not non-whitespace content, so
-- the RPC is the only line of defense. Tighten the check to
-- POSIX `^[[:space:]]*$`, which matches the empty string AND any
-- string consisting entirely of whitespace.
--
-- Function body otherwise byte-for-byte identical to migration
-- `20260430000006_void_internal_exam_code_org_scope_session.sql`.

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
  v_session_updated int;
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_reason IS NULL OR p_reason ~ '^[[:space:]]*$' THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  SELECT u.organization_id INTO v_admin_org
  FROM public.users u
  WHERE u.id = v_admin_id AND u.deleted_at IS NULL;
  IF v_admin_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  SELECT iec.organization_id, iec.consumed_at, iec.voided_at, iec.consumed_session_id
  INTO v_code_org, v_code_consumed, v_code_voided, v_code_session_id
  FROM public.internal_exam_codes iec
  WHERE iec.id = p_code_id
    AND iec.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  IF v_code_org <> v_admin_org THEN
    RAISE EXCEPTION 'code_not_found';
  END IF;

  IF v_code_voided IS NOT NULL THEN
    RAISE EXCEPTION 'code_voided';
  END IF;

  IF v_code_consumed IS NOT NULL AND v_code_session_id IS NOT NULL THEN
    -- Defense-in-depth: scope both the SELECT and the UPDATE to the admin's
    -- org. The code-org guard above (v_code_org = v_admin_org) makes a foreign
    -- session unreachable today, but a SECURITY DEFINER write that depends on
    -- a single upstream invariant is the wrong shape for cross-org safety.
    SELECT qs.ended_at, qs.total_questions, qs.config
    INTO v_session_ended, v_session_total, v_session_config
    FROM public.quiz_sessions qs
    WHERE qs.id = v_code_session_id
      AND qs.organization_id = v_admin_org
      AND qs.deleted_at IS NULL
    FOR UPDATE;

    IF FOUND AND v_session_ended IS NOT NULL THEN
      RAISE EXCEPTION 'cannot_void_finished_attempt';
    END IF;

    IF FOUND AND v_session_ended IS NULL THEN
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
      WHERE id = v_code_session_id
        AND organization_id = v_admin_org
        AND deleted_at IS NULL;
      GET DIAGNOSTICS v_session_updated = ROW_COUNT;
      IF v_session_updated = 0 THEN
        -- A concurrent writer ended/deleted the session between SELECT and
        -- UPDATE, or org guard rejected it. Fail loudly rather than silently
        -- proceed to audit a write that didn't happen.
        RAISE EXCEPTION 'session_state_changed';
      END IF;

      v_session_done := true;

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
          'score',            v_score,
          'answered_count',   v_answered,
          'correct_count',    v_correct_count,
          'total_questions',  v_session_total,
          'pass_mark',        v_pass_mark,
          'passed',           false
        )
      );
    END IF;
  END IF;

  UPDATE public.internal_exam_codes
  SET voided_at   = now(),
      voided_by   = v_admin_id,
      void_reason = p_reason
  WHERE id = p_code_id;

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
