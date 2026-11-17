-- remove_exam_sitting_candidates. Soft-deletes the candidate and entries without an attempt.
CREATE OR REPLACE FUNCTION public.remove_exam_sitting_candidates(p_sitting_id uuid, p_user_ids uuid[])
RETURNS TABLE(removed int, entries_removed int, codes_voided int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_users uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_user_ids) x), '{}');
  v_found int;
  v_entry_ids uuid[];
  v_voided int;
  v_entries int := 0;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF cardinality(v_users) = 0 OR cardinality(v_users) > 500 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);

  SELECT count(*) INTO v_found FROM public.exam_sitting_candidates c
   WHERE c.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id AND c.deleted_at IS NULL
     AND c.user_id = ANY(v_users);
  IF v_found <> cardinality(v_users) THEN RAISE EXCEPTION 'candidate_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.internal_exam_codes c
               JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
              WHERE e.sitting_id = p_sitting_id AND e.user_id = ANY(v_users) AND c.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'candidate_has_attempt';
  END IF;

  SELECT COALESCE(array_agg(e.id), '{}') INTO v_entry_ids FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.user_id = ANY(v_users) AND e.deleted_at IS NULL;
  v_voided := private.void_unused_sitting_codes(p_sitting_id, v_entry_ids, 'entry_removed', v_g.admin_id, v_g.admin_role, v_g.org_id);
  UPDATE public.exam_sitting_entries e SET deleted_at = now(), deleted_by = v_g.admin_id
   WHERE e.id = ANY(v_entry_ids);
  GET DIAGNOSTICS v_entries = ROW_COUNT;
  UPDATE public.exam_sitting_candidates c SET deleted_at = now(), deleted_by = v_g.admin_id
   WHERE c.sitting_id = p_sitting_id AND c.user_id = ANY(v_users) AND c.deleted_at IS NULL;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.candidates_removed', 'exam_sitting', p_sitting_id,
    jsonb_build_object('removed', cardinality(v_users), 'entries_removed', v_entries, 'codes_voided', v_voided));
  RETURN QUERY SELECT cardinality(v_users), v_entries, v_voided;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.remove_exam_sitting_candidates(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_exam_sitting_candidates(uuid, uuid[]) TO authenticated;
