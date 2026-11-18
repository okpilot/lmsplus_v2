-- "Add whole group" counts. Members of the live same-org group who are not live candidates of this sitting.
CREATE OR REPLACE FUNCTION public.get_exam_sitting_group_add_counts(p_sitting_id uuid, p_group_id uuid)
RETURNS TABLE(active_new int, deactivated_new int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF private.sitting_day_ended(v_s.scheduled_at) THEN RAISE EXCEPTION 'sitting_day_ended'; END IF;
  PERFORM 1 FROM public.student_groups g
   WHERE g.id = p_group_id AND g.organization_id = v_g.org_id AND g.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;
  RETURN QUERY
  SELECT (count(*) FILTER (WHERE u.deleted_at IS NULL))::int,
         (count(*) FILTER (WHERE u.deleted_at IS NOT NULL))::int
    FROM (SELECT DISTINCT m.user_id AS uid FROM public.student_group_members m
           WHERE m.group_id = p_group_id AND m.organization_id = v_g.org_id AND m.deleted_at IS NULL) mm
    -- security.md §15 exception (f)
    JOIN public.users u ON u.id = mm.uid AND u.organization_id = v_g.org_id AND u.role = 'student'
   WHERE NOT EXISTS (SELECT 1 FROM public.exam_sitting_candidates c
                      WHERE c.sitting_id = p_sitting_id AND c.user_id = mm.uid AND c.deleted_at IS NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_sitting_group_add_counts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_sitting_group_add_counts(uuid, uuid) TO authenticated;
