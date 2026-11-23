-- update_exam_sitting. NULL = unchanged; materials '' = clear. Past UTC day and day-ended sitting refused.
CREATE OR REPLACE FUNCTION public.update_exam_sitting(
  p_sitting_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_mode text DEFAULT NULL,
  p_invigilator_id uuid DEFAULT NULL,
  p_permitted_materials text DEFAULT NULL
)
RETURNS TABLE(changed boolean, codes_restamped int, notify_code_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_materials text;
  v_time_chg boolean;
  v_mode_chg boolean;
  v_mat_chg boolean;
  v_inv_chg boolean;
  v_restamped int := 0;
  v_notify uuid[] := '{}';
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();

  v_materials := CASE WHEN p_permitted_materials IS NULL THEN NULL ELSE NULLIF(btrim(p_permitted_materials), '') END;
  IF (p_mode IS NOT NULL AND p_mode NOT IN ('remote', 'in_person'))
     OR (v_materials IS NOT NULL AND char_length(v_materials) > 1000) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);

  v_time_chg := p_scheduled_at IS NOT NULL AND p_scheduled_at IS DISTINCT FROM v_s.scheduled_at;
  v_mode_chg := p_mode IS NOT NULL AND p_mode IS DISTINCT FROM v_s.mode;
  v_mat_chg  := p_permitted_materials IS NOT NULL AND v_materials IS DISTINCT FROM v_s.permitted_materials;
  v_inv_chg  := p_invigilator_id IS NOT NULL AND p_invigilator_id IS DISTINCT FROM v_s.invigilator_id;

  IF NOT (v_time_chg OR v_mode_chg OR v_mat_chg OR v_inv_chg) THEN
    RETURN QUERY SELECT false, 0, '{}'::uuid[];
    RETURN;
  END IF;

  IF v_time_chg AND (p_scheduled_at AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'scheduled_in_past';
  END IF;
  IF (v_time_chg OR v_mode_chg OR v_mat_chg) AND v_s.status <> 'scheduled' THEN
    RAISE EXCEPTION 'sitting_not_editable';
  END IF;

  IF v_inv_chg THEN
    PERFORM 1 FROM public.users u
     WHERE u.id = p_invigilator_id AND u.organization_id = v_g.org_id
       AND u.role IN ('admin', 'instructor') AND u.deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invigilator_not_found'; END IF;
  END IF;

  UPDATE public.exam_sittings s SET
    scheduled_at = CASE WHEN v_time_chg THEN p_scheduled_at ELSE s.scheduled_at END,
    mode = CASE WHEN v_mode_chg THEN p_mode ELSE s.mode END,
    permitted_materials = CASE WHEN v_mat_chg THEN v_materials ELSE s.permitted_materials END,
    invigilator_id = CASE WHEN v_inv_chg THEN p_invigilator_id ELSE s.invigilator_id END,
    updated_at = now()
   WHERE s.id = p_sitting_id;

  IF v_time_chg THEN
    UPDATE public.internal_exam_codes c
       SET expires_at = private.sitting_code_expiry(p_scheduled_at)
      FROM public.exam_sitting_entries e
     WHERE c.sitting_entry_id = e.id AND e.sitting_id = p_sitting_id AND e.deleted_at IS NULL
       AND c.organization_id = v_g.org_id
       AND c.consumed_at IS NULL AND c.voided_at IS NULL AND c.deleted_at IS NULL;
    GET DIAGNOSTICS v_restamped = ROW_COUNT;
  END IF;

  IF v_time_chg OR v_mode_chg THEN
    SELECT COALESCE(array_agg(c.id), '{}') INTO v_notify
      FROM public.internal_exam_codes c
      JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
     WHERE e.sitting_id = p_sitting_id AND e.deleted_at IS NULL AND c.organization_id = v_g.org_id
       AND c.consumed_at IS NULL
       AND c.voided_at IS NULL AND c.deleted_at IS NULL AND c.emailed_at IS NOT NULL;
  END IF;

  IF v_time_chg OR v_mode_chg OR v_mat_chg THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.updated', 'exam_sitting', p_sitting_id,
      jsonb_build_object(
        'scheduled_at', jsonb_build_object('old', v_s.scheduled_at, 'new', CASE WHEN v_time_chg THEN p_scheduled_at ELSE v_s.scheduled_at END),
        'mode', jsonb_build_object('old', v_s.mode, 'new', CASE WHEN v_mode_chg THEN p_mode ELSE v_s.mode END),
        'permitted_materials_changed', v_mat_chg,
        'codes_restamped', v_restamped));
  END IF;
  IF v_inv_chg THEN
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.invigilator_reassigned', 'exam_sitting', p_sitting_id,
      jsonb_build_object('from', v_s.invigilator_id, 'to', p_invigilator_id));
  END IF;

  RETURN QUERY SELECT true, v_restamped, v_notify;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_exam_sitting(uuid, timestamptz, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_exam_sitting(uuid, timestamptz, text, uuid, text) TO authenticated;
