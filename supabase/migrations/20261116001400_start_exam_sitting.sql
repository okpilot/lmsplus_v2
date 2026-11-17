-- start_exam_sitting (admin-only in slice 2). Prunes passed entries, lazy-closes other sittings.
CREATE OR REPLACE FUNCTION public.start_exam_sitting(p_sitting_id uuid)
RETURNS TABLE(started_at timestamptz, codes_restamped int, invigilator_active boolean, entries_without_code int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_now timestamptz := now();
  v_restamped int;
  v_inv_active boolean;
  v_nocode int;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);
  IF v_s.status <> 'scheduled' THEN RAISE EXCEPTION 'sitting_not_scheduled'; END IF;
  IF (v_now AT TIME ZONE 'UTC')::date < (v_s.scheduled_at AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'sitting_not_due';
  END IF;

  PERFORM private.close_expired_sittings(v_g.org_id);
  PERFORM private.prune_passed_entries(v_g.org_id, p_sitting_id, v_g.admin_id, v_g.admin_role);

  SELECT EXISTS (SELECT 1 FROM public.users u
                  WHERE u.id = v_s.invigilator_id AND u.deleted_at IS NULL
                    AND u.role IN ('admin', 'instructor')) INTO v_inv_active;

  UPDATE public.exam_sittings s SET started_at = v_now, started_by = v_g.admin_id, updated_at = v_now
   WHERE s.id = p_sitting_id;

  UPDATE public.internal_exam_codes c
     SET expires_at = private.sitting_code_expiry(v_s.scheduled_at)
    FROM public.exam_sitting_entries e
   WHERE c.sitting_entry_id = e.id AND e.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id
     AND c.consumed_at IS NULL AND c.voided_at IS NULL AND c.deleted_at IS NULL;
  GET DIAGNOSTICS v_restamped = ROW_COUNT;

  SELECT count(*) INTO v_nocode FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                      WHERE c.sitting_entry_id = e.id AND c.deleted_at IS NULL
                        AND (c.voided_at IS NULL OR c.consumed_at IS NOT NULL));

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.started', 'exam_sitting', p_sitting_id,
    jsonb_build_object('codes_restamped', v_restamped, 'invigilator_active', v_inv_active,
                       'entries_without_code', v_nocode));

  RETURN QUERY SELECT v_now, v_restamped, v_inv_active, v_nocode;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.start_exam_sitting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_sitting(uuid) TO authenticated;
