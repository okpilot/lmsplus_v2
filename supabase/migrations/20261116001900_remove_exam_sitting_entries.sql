-- remove_exam_sitting_entries: all-or-nothing; refused when an entry has an attempt. The candidate stays.
CREATE OR REPLACE FUNCTION public.remove_exam_sitting_entries(p_sitting_id uuid, p_entry_ids uuid[])
RETURNS TABLE(removed int, codes_voided int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_ids uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_entry_ids) x), '{}');
  v_found int;
  v_voided int;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF cardinality(v_ids) = 0 OR cardinality(v_ids) > 2000 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);

  SELECT count(*) INTO v_found FROM public.exam_sitting_entries e
   WHERE e.id = ANY(v_ids) AND e.sitting_id = p_sitting_id AND e.organization_id = v_g.org_id
     AND e.deleted_at IS NULL;
  IF v_found <> cardinality(v_ids) THEN RAISE EXCEPTION 'entry_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.internal_exam_codes c
              WHERE c.sitting_entry_id = ANY(v_ids) AND c.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'entry_has_attempt';
  END IF;

  v_voided := private.void_unused_sitting_codes(p_sitting_id, v_ids, 'entry_removed', v_g.admin_id, v_g.admin_role, v_g.org_id);
  UPDATE public.exam_sitting_entries e SET deleted_at = now(), deleted_by = v_g.admin_id
   WHERE e.id = ANY(v_ids);

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.entries_removed', 'exam_sitting', p_sitting_id,
    jsonb_build_object('entry_ids', v_ids, 'removed', cardinality(v_ids), 'codes_voided', v_voided));

  RETURN QUERY SELECT cardinality(v_ids), v_voided;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_exam_sitting_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_exam_sitting_entries(uuid, uuid[]) TO authenticated;
