-- create_exam_sitting. Details only (no people, no entries). Past UTC day refused.
CREATE OR REPLACE FUNCTION public.create_exam_sitting(
  p_scheduled_at timestamptz,
  p_mode text,
  p_invigilator_id uuid,
  p_permitted_materials text DEFAULT NULL
)
RETURNS TABLE(sitting_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_materials text := NULLIF(btrim(p_permitted_materials), '');
  v_sid uuid;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_scheduled_at IS NULL OR p_mode IS NULL OR p_mode NOT IN ('remote', 'in_person')
     OR p_invigilator_id IS NULL
     OR (v_materials IS NOT NULL AND char_length(v_materials) > 1000) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF (p_scheduled_at AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'scheduled_in_past';
  END IF;

  PERFORM 1 FROM public.users u
   WHERE u.id = p_invigilator_id AND u.organization_id = v_g.org_id
     AND u.role IN ('admin', 'instructor') AND u.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invigilator_not_found'; END IF;

  INSERT INTO public.exam_sittings
    (organization_id, scheduled_at, mode, invigilator_id, permitted_materials, created_by)
  VALUES (v_g.org_id, p_scheduled_at, p_mode, p_invigilator_id, v_materials, v_g.admin_id)
  RETURNING id INTO v_sid;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.created', 'exam_sitting', v_sid,
    jsonb_build_object('scheduled_at', p_scheduled_at, 'mode', p_mode, 'invigilator_id', p_invigilator_id,
      'permitted_materials_set', v_materials IS NOT NULL));

  RETURN QUERY SELECT v_sid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_exam_sitting(timestamptz, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_exam_sitting(timestamptz, text, uuid, text) TO authenticated;
