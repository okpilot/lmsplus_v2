-- cancel_exam_sitting: scheduled or open; refused when any attempt exists.
CREATE OR REPLACE FUNCTION public.cancel_exam_sitting(p_sitting_id uuid)
RETURNS TABLE(codes_voided int, notify_code_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_voided int;
  v_notify uuid[];
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, false);

  IF EXISTS (SELECT 1 FROM public.internal_exam_codes c
               JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
              WHERE e.sitting_id = p_sitting_id AND c.consumed_at IS NOT NULL
                AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'sitting_has_attempts';
  END IF;

  SELECT COALESCE(array_agg(c.id), '{}') INTO v_notify
    FROM public.internal_exam_codes c
    JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
   WHERE e.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id AND c.consumed_at IS NULL
     AND c.voided_at IS NULL AND c.deleted_at IS NULL AND c.emailed_at IS NOT NULL;

  UPDATE public.exam_sittings s SET deleted_at = now(), deleted_by = v_g.admin_id, updated_at = now()
   WHERE s.id = p_sitting_id;
  v_voided := private.void_unused_sitting_codes(p_sitting_id, NULL, 'sitting_cancelled', v_g.admin_id, v_g.admin_role, v_g.org_id);

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.cancelled', 'exam_sitting', p_sitting_id,
    jsonb_build_object('codes_voided', v_voided));

  RETURN QUERY SELECT v_voided, v_notify;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_exam_sitting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_exam_sitting(uuid) TO authenticated;
