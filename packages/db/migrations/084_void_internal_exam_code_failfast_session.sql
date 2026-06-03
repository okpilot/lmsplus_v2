-- Migration: void_internal_exam_code — fail fast when the consumed code's
-- linked session is missing (#638).
--
-- For a consumed code, the RPC locks the linked quiz_sessions row with an
-- org-scoped, soft-delete-filtered SELECT ... FOR UPDATE. If that returns NO
-- row (the session was soft-deleted between consume and void, or its
-- organization_id drifted cross-org), both `IF FOUND AND ...` branches
-- previously no-op'd and the code was still voided silently. That violates
-- the loud-fail-on-invariant philosophy already enforced a few lines below
-- (the ROW_COUNT = 0 guard raises session_state_changed). Add an explicit
-- `IF NOT FOUND THEN RAISE session_state_changed` immediately after the lock,
-- then drop the now-redundant FOUND check from the two following branches.
--
-- Function body otherwise tracks the canonical latest definition,
-- `20260507000001_void_internal_exam_code_strict_blank_check.sql` (the strict
-- POSIX blank-reason check), with one further hardening: the admin role is
-- captured once at authorization time and reused in both audit inserts, rather
-- than re-queried inline (which would NULL-abort the void on a mid-call admin
-- soft-delete — audit_events.actor_role is NOT NULL). This migration also
-- converges the packages/db mirror, whose previous latest (072) predates the
-- strict-blank check.

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
  v_admin_role      text;
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

  -- Capture the admin's org AND role once, at authorization time, from a
  -- single deleted_at-filtered read. The two audit inserts below reuse the
  -- cached role instead of re-querying users.role — a re-query would return
  -- NULL (and abort the whole RPC on audit_events.actor_role NOT NULL) if the
  -- admin row is soft-deleted mid-call, rolling back an already-authorized
  -- void. Mirrors the cached-role pattern in mig 078 (batch_submit).
  SELECT u.organization_id, u.role INTO v_admin_org, v_admin_role
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

    IF NOT FOUND THEN
      -- The consumed code points at a session that is gone (soft-deleted
      -- after consume, or cross-org). Distinct root cause from the ROW_COUNT
      -- guard below (concurrent writer between SELECT and UPDATE), but reuse
      -- session_state_changed so the caller gets the same "please refresh"
      -- signal instead of a silent void on a phantom session.
      RAISE EXCEPTION 'session_state_changed';
    END IF;

    IF v_session_ended IS NOT NULL THEN
      RAISE EXCEPTION 'cannot_void_finished_attempt';
    END IF;

    IF v_session_ended IS NULL THEN
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
        v_admin_role,
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
    v_admin_role,
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
