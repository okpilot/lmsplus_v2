-- get_student_groups_with_counts: admin-only org-scoped read of active student groups with active/deactivated member counts. #1776

CREATE OR REPLACE FUNCTION public.get_student_groups_with_counts()
RETURNS TABLE (
  id                uuid,
  name              text,
  description       text,
  created_at        timestamptz,
  active_count      integer,
  deactivated_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id  uuid := auth.uid();
  v_caller_org uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  SELECT u.organization_id INTO v_caller_org
  FROM public.users u
  WHERE u.id = v_caller_id AND u.deleted_at IS NULL;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;

  RETURN QUERY
  SELECT g.id, g.name, g.description, g.created_at,
         -- docs/security.md §15 (e): users.deleted_at deliberately not filtered; counts deactivated members, no user columns returned.
         (count(u.id) FILTER (WHERE u.deleted_at IS NULL))::int,
         (count(u.id) FILTER (WHERE u.deleted_at IS NOT NULL))::int
  FROM public.student_groups g
  LEFT JOIN public.student_group_members m
    ON m.group_id = g.id AND m.organization_id = g.organization_id AND m.deleted_at IS NULL
  LEFT JOIN public.users u
    ON u.id = m.user_id AND u.role = 'student' AND u.organization_id = g.organization_id
  WHERE g.organization_id = v_caller_org
    AND g.deleted_at IS NULL
  GROUP BY g.id
  ORDER BY g.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_groups_with_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_groups_with_counts() TO authenticated;
