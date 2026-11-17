-- add_exam_sitting_candidates. Groups are expanded server-side as a snapshot.
CREATE OR REPLACE FUNCTION public.add_exam_sitting_candidates(
  p_sitting_id uuid, p_user_ids uuid[] DEFAULT '{}', p_group_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE(added int, skipped_existing int, skipped_deactivated int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_users uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_user_ids) x), '{}');
  v_groups uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_group_ids) x), '{}');
  v_added int;
  v_ok int;
  v_deact int;
  v_live int;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF cardinality(v_users) > 500 OR cardinality(v_groups) > 50
     OR cardinality(v_users) + cardinality(v_groups) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  v_s := private.sitting_lock(v_g.org_id, p_sitting_id, true);

  WITH r AS (SELECT * FROM private.resolve_sitting_students(v_g.org_id, v_users, v_groups)),
  ins AS (
    INSERT INTO public.exam_sitting_candidates (organization_id, sitting_id, user_id)
    SELECT v_g.org_id, p_sitting_id, r.user_id FROM r WHERE r.kind = 'ok'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins)::int,
         (SELECT count(*) FROM r WHERE r.kind = 'ok')::int,
         (SELECT count(*) FROM r WHERE r.kind = 'deactivated')::int
    INTO v_added, v_ok, v_deact;

  SELECT count(*) INTO v_live FROM public.exam_sitting_candidates c
   WHERE c.sitting_id = p_sitting_id AND c.deleted_at IS NULL;
  IF v_live > 500 THEN RAISE EXCEPTION 'too_many_candidates'; END IF;

  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.candidates_added', 'exam_sitting', p_sitting_id,
    jsonb_build_object('added', v_added, 'skipped_existing', v_ok - v_added, 'skipped_deactivated', v_deact,
                       'group_ids', v_groups));
  RETURN QUERY SELECT v_added, v_ok - v_added, v_deact;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_exam_sitting_candidates(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_exam_sitting_candidates(uuid, uuid[], uuid[]) TO authenticated;
