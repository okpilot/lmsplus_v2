-- resolve picked students + group members. kind: ok | deactivated (group member, inactive).
CREATE OR REPLACE FUNCTION private.resolve_sitting_students(p_org uuid, p_user_ids uuid[], p_group_ids uuid[])
RETURNS TABLE(user_id uuid, kind text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n int;
BEGIN
  IF cardinality(p_user_ids) > 0 THEN
    SELECT count(*) INTO v_n FROM (
      SELECT u.id FROM public.users u
       WHERE u.id = ANY(p_user_ids) AND u.organization_id = p_org
         AND u.role = 'student' AND u.deleted_at IS NULL FOR SHARE) t;
    IF v_n <> cardinality(p_user_ids) THEN RAISE EXCEPTION 'student_not_found'; END IF;
  END IF;

  IF cardinality(p_group_ids) > 0 THEN
    SELECT count(*) INTO v_n FROM (
      SELECT g.id FROM public.student_groups g
       WHERE g.id = ANY(p_group_ids) AND g.organization_id = p_org AND g.deleted_at IS NULL FOR SHARE) t;
    IF v_n <> cardinality(p_group_ids) THEN RAISE EXCEPTION 'group_not_found'; END IF;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT DISTINCT m.user_id AS uid, (u.deleted_at IS NULL) AS active
      FROM public.student_group_members m
      JOIN public.users u ON u.id = m.user_id
     WHERE m.group_id = ANY(p_group_ids) AND m.organization_id = p_org AND m.deleted_at IS NULL
       AND u.organization_id = p_org AND u.role = 'student'
  ),
  picked AS (
    SELECT DISTINCT x AS uid FROM unnest(p_user_ids) x
  ),
  ok AS (
    SELECT uid FROM picked UNION SELECT uid FROM members WHERE active
  )
  SELECT ok.uid, 'ok'::text FROM ok
  UNION ALL
  SELECT mm.uid, 'deactivated'::text FROM members mm WHERE NOT mm.active;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.resolve_sitting_students(uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
