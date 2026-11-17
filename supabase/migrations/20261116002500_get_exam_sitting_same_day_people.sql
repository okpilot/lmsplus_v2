-- people of this sitting who also hold a live entry in another scheduled/open sitting on the same UTC day.
-- p_user_ids NULL = every live candidate (<=500); explicit: no NULL element, <=100 distinct ids, non-candidates dropped; none a candidate → invalid_input.
CREATE OR REPLACE FUNCTION public.get_exam_sitting_same_day_people(p_sitting_id uuid, p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(user_id uuid, full_name text, sitting_id uuid, scheduled_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_users uuid[];
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF private.sitting_day_ended(v_s.scheduled_at) THEN RAISE EXCEPTION 'sitting_day_ended'; END IF;
  IF p_user_ids IS NOT NULL AND (array_position(p_user_ids, NULL) IS NOT NULL OR cardinality(p_user_ids) = 0) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  IF p_user_ids IS NOT NULL AND (SELECT count(DISTINCT x) FROM unnest(p_user_ids) x) > 100 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  v_users := private.sitting_resolve_user_ids(v_g.org_id, p_sitting_id, p_user_ids, 100);
  RETURN QUERY
  SELECT DISTINCT ON (c.user_id) c.user_id, COALESCE(u.full_name, u.email, ''), s2.id, s2.scheduled_at
    FROM public.exam_sitting_candidates c
    -- security.md §15 exception (f)
    JOIN public.users u ON u.id = c.user_id AND u.organization_id = v_g.org_id
    JOIN public.exam_sitting_entries e2 ON e2.user_id = c.user_id AND e2.deleted_at IS NULL AND e2.sitting_id <> p_sitting_id
    JOIN public.exam_sittings s2 ON s2.id = e2.sitting_id AND s2.organization_id = v_g.org_id
   WHERE c.sitting_id = p_sitting_id AND c.deleted_at IS NULL AND c.user_id = ANY(v_users)
     AND s2.status IN ('scheduled', 'open') AND NOT private.sitting_day_ended(s2.scheduled_at)
     AND (s2.scheduled_at AT TIME ZONE 'UTC')::date = (v_s.scheduled_at AT TIME ZONE 'UTC')::date
   ORDER BY c.user_id, s2.scheduled_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_sitting_same_day_people(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_sitting_same_day_people(uuid, uuid[]) TO authenticated;
