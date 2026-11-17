-- the only close path. Manual Close and lazy close both call the core.
-- Open sitting: void unused codes, set closed_at, audit counts. Scheduled + automatic: auto-cancel.
CREATE OR REPLACE FUNCTION private.close_exam_sitting_core(
  p_sitting_id uuid, p_actor uuid, p_role text, p_automatic boolean
)
RETURNS TABLE(outcome text, closed_at timestamptz, codes_voided int, attempts_running int, absent_count int)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_s public.exam_sittings;
  v_actor uuid := p_actor;
  v_role text := p_role;
  v_closed timestamptz;
  v_voided int := 0;
  v_running int := 0;
  v_absent int := 0;
  v_emailed int := 0;
BEGIN
  SELECT * INTO v_s FROM public.exam_sittings s WHERE s.id = p_sitting_id FOR UPDATE;
  IF NOT FOUND OR v_s.status IN ('closed', 'cancelled') THEN
    RETURN QUERY SELECT 'noop'::text, NULL::timestamptz, 0, 0, 0;
    RETURN;
  END IF;

  IF v_s.status = 'open' THEN
    IF p_automatic THEN v_actor := v_s.started_by; END IF;
    IF v_role IS NULL THEN
      -- security.md §15 exception (f)
      SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_actor;
    END IF;
    PERFORM private.prune_passed_entries(v_s.organization_id, p_sitting_id, v_actor, v_role);
    v_voided := private.void_unused_sitting_codes(p_sitting_id, NULL, 'sitting_closed', v_actor, v_role, v_s.organization_id);
    v_closed := CASE WHEN p_automatic THEN private.sitting_day_end(v_s.scheduled_at) - interval '1 microsecond' ELSE now() END;
    UPDATE public.exam_sittings s SET closed_at = v_closed, closed_by = v_actor, updated_at = now(),
           ended_automatically = p_automatic
     WHERE s.id = p_sitting_id;

    SELECT count(*) INTO v_running
      FROM public.internal_exam_codes c
      JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
      JOIN public.quiz_sessions qs ON qs.id = c.consumed_session_id
     WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
       AND c.deleted_at IS NULL;
    SELECT count(*) INTO v_absent
      FROM public.exam_sitting_entries e
     WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                        WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL
                           AND c.deleted_at IS NULL);

    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (v_s.organization_id, v_actor, v_role, 'exam_sitting.closed', 'exam_sitting', p_sitting_id,
      jsonb_build_object('codes_voided', v_voided, 'attempts_running', v_running,
                         'absent_count', v_absent, 'automatic', p_automatic));
    RETURN QUERY SELECT 'closed'::text, v_closed, v_voided, v_running, v_absent;
    RETURN;
  END IF;

  -- scheduled
  IF NOT p_automatic THEN
    RETURN QUERY SELECT 'noop'::text, NULL::timestamptz, 0, 0, 0;
    RETURN;
  END IF;
  v_actor := v_s.created_by;
  -- security.md §15 exception (f)
  SELECT u.role INTO v_role FROM public.users u WHERE u.id = v_actor;
  SELECT count(*) INTO v_emailed
    FROM public.internal_exam_codes c
    JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
   WHERE e.sitting_id = p_sitting_id AND c.consumed_at IS NULL AND c.voided_at IS NULL
     AND c.deleted_at IS NULL AND c.emailed_at IS NOT NULL;
  UPDATE public.exam_sittings s SET deleted_at = now(), deleted_by = v_actor, updated_at = now(),
         ended_automatically = true
   WHERE s.id = p_sitting_id;
  v_voided := private.void_unused_sitting_codes(p_sitting_id, NULL, 'sitting_cancelled', v_actor, v_role, v_s.organization_id);
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_s.organization_id, v_actor, v_role, 'exam_sitting.cancelled', 'exam_sitting', p_sitting_id,
    jsonb_build_object('codes_voided', v_voided, 'automatic', true, 'reason', 'never_started',
                       'emailed_codes_pending_notice', v_emailed));
  RETURN QUERY SELECT 'cancelled'::text, NULL::timestamptz, v_voided, 0, 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.close_exam_sitting_core(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- Lazy close: at most 3 day-ended scheduled/open sittings per call, ordered by id, SKIP LOCKED.
CREATE OR REPLACE FUNCTION private.close_expired_sittings(p_org uuid)
RETURNS int
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_n int := 0;
BEGIN
  FOR v_id IN
    SELECT s.id FROM public.exam_sittings s
     WHERE s.organization_id = p_org AND s.status IN ('scheduled', 'open')
       AND private.sitting_day_ended(s.scheduled_at)
     ORDER BY s.id LIMIT 3 FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM 1 FROM private.close_exam_sitting_core(v_id, NULL, NULL, true);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.close_expired_sittings(uuid) FROM PUBLIC, anon, authenticated;
